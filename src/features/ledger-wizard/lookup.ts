import { supabase } from "@/integrations/supabase/client";
import { readPersonMirrors } from "@/lib/persons/dual-role";

import type { LookupState, PartyHit, PartyKind } from "./types";

const MISSING_ASAN = (name: string) =>
  `کد آسان برای ${name} ثبت نشده است. لطفاً ابتدا کد را ثبت کنید.`;

interface IdentifierHit {
  person_id: string;
}

async function identifierPerson(kind: string, value: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("person_identifiers")
    .select("person_id")
    .eq("kind", kind)
    .eq("value_raw", value)
    .maybeSingle();
  if (error) throw error;
  return (data as IdentifierHit | null)?.person_id ?? null;
}

async function findByIdentifiers(kind: string, value: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("person_find_by_identifiers", {
    p_identifiers: [{ kind, value_raw: value }],
  });
  if (error) throw error;
  const hit = data as unknown as { person_id: string | null } | null;
  return hit?.person_id ?? null;
}

async function asanFor(personId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("person_identifiers")
    .select("value_raw")
    .eq("person_id", personId)
    .eq("kind", "asan_person_code")
    .maybeSingle();
  if (error) throw error;
  return (data as { value_raw: string } | null)?.value_raw ?? null;
}

async function externalPartyId(personId: string): Promise<string | null> {
  const { data } = await supabase
    .from("external_parties")
    .select("id")
    .eq("person_id" as never, personId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export const PARTY_KIND_LABEL_FA: Record<PartyKind, string> = {
  customer: "مشتری",
  supplier: "تأمین‌کننده",
  external_party: "طرف حساب",
};

export interface PartyFile {
  kind: PartyKind;
  roleId: string;
}

/**
 * Every file the person actually holds, in a fixed, documented order:
 * customer, supplier, external party. The order is presentation only — nothing
 * downstream may treat position 0 as "the answer" (see `pickPartyFile`).
 */
export function partyFiles(
  customerId: string | null,
  supplierId: string | null,
  externalPartyIdValue: string | null,
): PartyFile[] {
  const files: PartyFile[] = [];
  if (customerId) files.push({ kind: "customer", roleId: customerId });
  if (supplierId) files.push({ kind: "supplier", roleId: supplierId });
  if (externalPartyIdValue) {
    files.push({ kind: "external_party", roleId: externalPartyIdValue });
  }
  return files;
}

export type PickOutcome =
  /** Exactly one file is usable for this branch — no judgement was made. */
  | { outcome: "picked"; file: PartyFile }
  /** D-3: several usable files. The OPERATOR chooses; this code refuses to. */
  | { outcome: "choose"; options: PartyFile[] }
  /** No usable file. `available` is what the person DOES hold, so the message can name it. */
  | { outcome: "none"; available: PartyFile[] };

/**
 * D-1 / D-3 — which file a document is booked against.
 *
 * Before: `required === "customer"` returned the customer file or `null`, and
 * `required === "any"` walked `supplier -> external_party -> customer` and took
 * the first hit. That second rule silently booked every dual-role person
 * against their SUPPLIER file (15 people hold both today), which is exactly the
 * "wizard picks a role on the owner's behalf" that OG-16 forbids.
 *
 * Now:
 *   - `"customer"` (the receipt branch) still needs the customer file, because
 *     `create_receipt(p_customer_id uuid)` is keyed to `customers.id` and the
 *     owner has NOT approved re-keying it or auto-creating a mirror (D-2 is an
 *     investigation, not a change). What changed is the refusal: it now reports
 *     the true condition — no customer file — together with the files the
 *     person does hold, instead of asserting the policy «دریافت فقط از مشتری
 *     ثبت می‌شود», which contradicts OG-16.
 *   - `"any"` (payment / dual) never guesses. One file is used; two or three
 *     are handed back for the operator to choose between.
 */
export function pickPartyFile(
  required: PartyKind | "any",
  customerId: string | null,
  supplierId: string | null,
  externalPartyIdValue: string | null,
): PickOutcome {
  const available = partyFiles(customerId, supplierId, externalPartyIdValue);

  if (required !== "any") {
    const match = available.find((f) => f.kind === required);
    return match ? { outcome: "picked", file: match } : { outcome: "none", available };
  }

  if (available.length === 0) return { outcome: "none", available };
  if (available.length === 1) return { outcome: "picked", file: available[0] };
  return { outcome: "choose", options: available };
}

/**
 * The refusal copy for `outcome: "none"`. It states the condition that actually
 * fired and the remedy, and it never claims a policy the owner has not set.
 */
export function noFileMessage(
  name: string,
  required: PartyKind | "any",
  available: PartyFile[],
): string {
  const held =
    available.length > 0
      ? `پروندهٔ فعلی این شخص: ${available.map((f) => PARTY_KIND_LABEL_FA[f.kind]).join("، ")}.`
      : "برای این شخص هیچ پرونده‌ای (مشتری، تأمین‌کننده یا طرف حساب) ثبت نشده است.";

  if (required === "customer") {
    return `${name}: پروندهٔ مشتری ندارد. ${held} ثبت دریافت فعلاً به پروندهٔ مشتری نیاز دارد؛ برای همین شخص یک پروندهٔ مشتری بسازید و دوباره جستجو کنید.`;
  }
  if (required !== "any") {
    return `${name}: پروندهٔ ${PARTY_KIND_LABEL_FA[required]} ندارد. ${held}`;
  }
  return `${name}: ${held}`;
}

/**
 * Exact-match lookup (OG-4 unanswered). Also tries `person_find_by_identifiers`
 * so a number that already lives in value_normalized can still resolve.
 * Three-format canonicalisation is NOT claimed until OG-4 is answered.
 */
export async function lookupParty(raw: string, required: PartyKind | "any"): Promise<LookupState> {
  const query = raw.trim();
  if (!query) {
    return { status: "idle", query, party: null, options: [], missingName: null, message: null };
  }

  let personId =
    (await identifierPerson("asan_person_code", query)) ??
    (await identifierPerson("mobile_e164", query)) ??
    (await findByIdentifiers("asan_person_code", query)) ??
    (await findByIdentifiers("mobile_e164", query));

  // OG-66(c). The identifier paths above are exact and resolve at most one person. They also
  // cannot find anyone by NAME, so a party visible on /persons was simply unfindable here —
  // the "built but never wired" shape: `search_visible_persons` already backs the persons
  // page and was never reachable from this wizard, which pushes an operator toward creating a
  // duplicate person.
  //
  // It runs only as a FALLBACK, after every exact path has missed, and it is accepted only on
  // a UNIQUE hit. `pickPartyFile` below resolves one party; handing it an ambiguous name match
  // would make the wizard silently choose between two people, which is worse than finding
  // nobody.
  //
  // Visibility measured per role BEFORE wiring, because widening what this wizard can reach
  // is the real risk here — not narrowing it:
  //   role                          identifier paths    search_visible_persons
  //   admin/accountant/manager/viewer      36                    84
  //   sales                                11                    18
  // The function is SECURITY INVOKER, so RLS applies to the caller, and those are the same
  // numbers the persons PAGE already shows that role. This aligns two surfaces rather than
  // granting new access; `anon` is refused outright (`permission denied for function`).
  if (!personId) {
    const { data: byName, error: nameError } = await supabase.rpc("search_visible_persons", {
      p_query: query,
      p_limit: 2, // 2, not 1: enough to DETECT ambiguity, never enough to hide it
      p_offset: 0,
    });
    if (nameError) throw nameError;
    const hits = (byName ?? []) as { id: string }[];
    if (hits.length === 1) personId = hits[0].id;
    else if (hits.length > 1) {
      return {
        status: "not_found",
        query,
        party: null,
        options: [],
        missingName: null,
        message: "بیش از یک شخص با این نام پیدا شد. کد آسان یا شمارهٔ موبایل را وارد کنید.",
      };
    }
  }

  if (!personId) {
    return {
      status: "not_found",
      query,
      party: null,
      options: [],
      missingName: null,
      message: "شخصی با این کد، شماره یا نام پیدا نشد.",
    };
  }

  const { data: personRow, error: personError } = await supabase
    .from("persons")
    .select("id, display_name")
    .eq("id", personId)
    .maybeSingle();
  if (personError) throw personError;
  const person = personRow as { id: string; display_name: string } | null;
  if (!person) {
    return {
      status: "not_found",
      query,
      party: null,
      options: [],
      missingName: null,
      message: "شخصی با این کد یا شماره پیدا نشد.",
    };
  }

  const asanCode = await asanFor(person.id);
  if (!asanCode) {
    return {
      status: "missing_asan",
      query,
      party: null,
      options: [],
      missingName: person.display_name,
      message: MISSING_ASAN(person.display_name),
    };
  }

  const mirrors = await readPersonMirrors(person.id);
  const extId = await externalPartyId(person.id);
  const picked = pickPartyFile(required, mirrors.customer_id, mirrors.supplier_id, extId);

  const hitFor = (file: PartyFile): PartyHit => ({
    personId: person.id,
    displayName: person.display_name,
    asanCode,
    kind: file.kind,
    roleId: file.roleId,
    customerId: mirrors.customer_id,
    supplierId: mirrors.supplier_id,
    externalPartyId: extId,
  });

  if (picked.outcome === "none") {
    return {
      status: "wrong_role",
      query,
      party: null,
      options: [],
      missingName: person.display_name,
      message: noFileMessage(person.display_name, required, picked.available),
    };
  }

  // D-3. Two or three files, and nothing here is entitled to choose between
  // them: booking a payment against the supplier file rather than the customer
  // file is a different document. The operator picks, on the same step.
  if (picked.outcome === "choose") {
    return {
      status: "choose_role",
      query,
      party: null,
      options: picked.options.map(hitFor),
      missingName: person.display_name,
      message: `${person.display_name} بیش از یک پرونده دارد. سند روی کدام پرونده ثبت شود؟`,
    };
  }

  return {
    status: "ok",
    query,
    party: hitFor(picked.file),
    options: [],
    missingName: null,
    message: null,
  };
}

/**
 * Resolves a `"choose_role"` state once the operator has picked. Anything else
 * is returned untouched, so a stray click can never fabricate a party.
 */
export function selectPartyFile(state: LookupState, roleId: string): LookupState {
  if (state.status !== "choose_role") return state;
  const chosen = state.options.find((o) => o.roleId === roleId);
  if (!chosen) return state;
  return { ...state, status: "ok", party: chosen, missingName: null, message: null };
}

export function missingAsanMessage(name: string): string {
  return MISSING_ASAN(name);
}
