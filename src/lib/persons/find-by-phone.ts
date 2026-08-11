import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { readPersonMirrors } from "./dual-role";
import type { PersonContextKind } from "./context-links.schemas";

/**
 * UNIFY P1.2 — "is there already a person with this phone number?"
 *
 * Why this exists
 *   `uq_person_identifiers_contact_global` makes a mobile number unique across
 *   every non-revoked identifier. So entering a number that is already on file
 *   made `person_create_inline` fail with «این شناسه قبلاً در سیستم ثبت شده
 *   است: 09…» and the user had nowhere to go — even though the right answer is
 *   almost always "that is the same person, give them the supplier role too".
 *   This module turns that dead end into an offer.
 *
 * Built on what already exists (rule 14)
 *   `person_find_by_identifiers` does the matching and migration 314's trigger
 *   creates the suppliers/customers mirror behind the new context link. No new
 *   RPC — the corrected UNIFY plan calls this path (الف).
 *
 * Visibility
 *   `person_find_by_identifiers` is SECURITY INVOKER and `person_identifiers`
 *   SELECT is gated by `can_read_person`, so a user who may not see the person
 *   gets no match and still meets the raw uniqueness error. That is a UX gap,
 *   not a hole: the database rejects the duplicate either way, and leaking
 *   "someone you cannot see owns this number" would be worse.
 */

/** Context kinds that own a legacy mirror table — the roles this flow can add. */
export const MIRRORED_CONTEXT_KINDS = ["customer", "supplier"] as const;
export type MirroredContextKind = (typeof MIRRORED_CONTEXT_KINDS)[number];

export const CONTEXT_KIND_LABELS: Partial<Record<PersonContextKind, string>> = {
  customer: "مشتری",
  supplier: "تأمین‌کننده",
  driver: "راننده",
  sender: "فرستنده",
  receiver: "گیرنده",
  referrer: "معرف",
  marketer: "بازاریاب",
  representative: "نماینده",
  complainant: "شاکی",
  returner: "مرجوع‌کننده",
  staff_link: "کارمند",
  credit_party: "طرف اعتبار",
  accounting_party: "طرف حساب",
  delivery_party: "طرف تحویل",
  purchase_owner: "مسئول خرید",
  sales_expert: "کارشناس فروش",
  warehouse_owner: "مسئول انبار",
  other: "سایر",
};

export interface ExistingPersonMatch {
  person_id: string;
  display_name: string;
  kind: string;
  is_active: boolean;
  /** Last time the identity record itself changed — NOT transaction activity. */
  updated_at: string | null;
  /** Active context kinds this person already holds. */
  roles: PersonContextKind[];
  /** Read off whichever mirror row is visible; null when none is. */
  city: string | null;
  /** Mirror rows behind this person, when this user may read them. */
  supplier_id: string | null;
  customer_id: string | null;
}

interface FindByIdentifiersResult {
  person_id: string | null;
  conflict: boolean;
  matched_on: string | null;
}

/**
 * Returns the person already holding this mobile number, or null.
 * An unreadable person reads as "no match" rather than an error.
 */
export async function findPersonByPhone(phone: string): Promise<ExistingPersonMatch | null> {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.rpc("person_find_by_identifiers", {
    p_identifiers: [{ kind: "mobile_e164", value_raw: trimmed }],
  });
  if (error) throw error;

  const hit = data as unknown as FindByIdentifiersResult | null;
  if (!hit?.person_id) return null;
  const personId = hit.person_id;

  const { data: personRow, error: personError } = await supabase
    .from("persons")
    .select("id, display_name, kind, is_active, updated_at")
    .eq("id", personId)
    .maybeSingle();
  if (personError) throw personError;
  if (!personRow) return null; // matched an identifier we may not resolve

  const person = personRow as unknown as {
    id: string;
    display_name: string;
    kind: string;
    is_active: boolean;
    updated_at: string | null;
  };

  const { data: linkRows } = await supabase
    .from("person_context_links")
    .select("context_kind")
    .eq("person_id", personId)
    .is("ended_at", null);

  const roles = Array.from(
    new Set(
      ((linkRows ?? []) as unknown as { context_kind: PersonContextKind }[]).map(
        (r) => r.context_kind,
      ),
    ),
  );

  const mirrors = await readPersonMirrors(personId);

  return {
    person_id: person.id,
    display_name: person.display_name,
    kind: person.kind,
    is_active: person.is_active,
    updated_at: person.updated_at,
    roles,
    city: mirrors.city,
    supplier_id: mirrors.supplier_id,
    customer_id: mirrors.customer_id,
  };
}

/**
 * Give an existing person one more role. The context link is all this writes —
 * migration 314's trigger creates the suppliers/customers row behind it, so the
 * two creation paths cannot drift apart.
 */
export async function addRoleToPerson(
  personId: string,
  contextKind: MirroredContextKind,
): Promise<void> {
  const { error } = await supabase.from("person_context_links").insert({
    person_id: personId,
    context_kind: contextKind,
  } as never);
  if (error) throw error;
}

/**
 * Debounce-friendly lookup for create forms. Only runs once the number looks
 * complete enough to be worth a round trip.
 */
export function usePersonByPhone(phone: string | undefined, enabled = true) {
  const trimmed = (phone ?? "").trim();
  const looksComplete = /^0\d{9,10}$/.test(trimmed);

  return useQuery({
    queryKey: ["person-by-phone", trimmed],
    enabled: enabled && looksComplete,
    queryFn: () => findPersonByPhone(trimmed),
    staleTime: 30_000,
    retry: false,
  });
}
