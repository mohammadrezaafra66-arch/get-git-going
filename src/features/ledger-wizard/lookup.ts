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

function pickKind(
  required: PartyKind | "any",
  customerId: string | null,
  supplierId: string | null,
  externalPartyIdValue: string | null,
): { kind: PartyKind; roleId: string } | null {
  if (required === "customer") {
    return customerId ? { kind: "customer", roleId: customerId } : null;
  }
  if (supplierId) return { kind: "supplier", roleId: supplierId };
  if (externalPartyIdValue) return { kind: "external_party", roleId: externalPartyIdValue };
  if (customerId) return { kind: "customer", roleId: customerId };
  return null;
}

/**
 * Exact-match lookup (OG-4 unanswered). Also tries `person_find_by_identifiers`
 * so a number that already lives in value_normalized can still resolve.
 * Three-format canonicalisation is NOT claimed until OG-4 is answered.
 */
export async function lookupParty(raw: string, required: PartyKind | "any"): Promise<LookupState> {
  const query = raw.trim();
  if (!query) {
    return { status: "idle", query, party: null, missingName: null, message: null };
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
  // a UNIQUE hit. `pickKind` below resolves one party; handing it an ambiguous name match
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
      missingName: person.display_name,
      message: MISSING_ASAN(person.display_name),
    };
  }

  const mirrors = await readPersonMirrors(person.id);
  const extId = await externalPartyId(person.id);
  const picked = pickKind(required, mirrors.customer_id, mirrors.supplier_id, extId);
  if (!picked) {
    const roleMsg =
      required === "customer"
        ? "این شخص مشتری نیست. دریافت فقط از مشتری ثبت می‌شود."
        : "این شخص نقش قابل ثبت (مشتری، تأمین‌کننده یا طرف حساب) ندارد.";
    return {
      status: "wrong_role",
      query,
      party: null,
      missingName: person.display_name,
      message: roleMsg,
    };
  }

  const party: PartyHit = {
    personId: person.id,
    displayName: person.display_name,
    asanCode,
    kind: picked.kind,
    roleId: picked.roleId,
    customerId: mirrors.customer_id,
    supplierId: mirrors.supplier_id,
    externalPartyId: extId,
  };

  return { status: "ok", query, party, missingName: null, message: null };
}

export function missingAsanMessage(name: string): string {
  return MISSING_ASAN(name);
}
