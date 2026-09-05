import { supabase } from "@/integrations/supabase/client";

/**
 * Set, change or clear a person's Asan code.
 *
 * The code is stored once, on `person_identifiers`, and mirrored onto
 * `suppliers.accounting_code` / `customers.accounting_code` by database triggers
 * (migrations 308/310) — so this never writes the mirror itself. The identifier
 * is what actually matters: `asan_list_purchase_export` reads it directly, the
 * ledger wizard looks a party up by it, and `require_asan_code` (migration 340)
 * refuses a document when it is absent, deliberately without falling back to the
 * mirror columns.
 *
 * Moved here verbatim from `SupplierForm.tsx` (migration 437's UI half) so the
 * customer form can call the same code instead of growing a second copy.
 * Writing it requires admin or manager: `person_identifiers_update_admin_manager`
 * gates UPDATE, while INSERT also allows sales and accountant
 * (`person_identifiers_insert_identity_authors`, migration 226).
 */
export async function upsertAsanCode(personId: string, code: string | null) {
  const { data: existing, error: readError } = await supabase
    .from("person_identifiers")
    .select("id, value_raw, is_primary")
    .eq("person_id", personId)
    .eq("kind", "asan_person_code")
    .neq("status", "revoked")
    .maybeSingle();
  if (readError) throw readError;

  const row = existing as { id: string; value_raw: string | null; is_primary: boolean } | null;

  if (!code) {
    if (!row) return;
    // validate_person_identifier() refuses to revoke a row while it is primary
    // ("A revoked identifier cannot be primary"), so primary comes off first.
    // Found by the migration 308 dry run, not by reading the code.
    if (row.is_primary) {
      const { error } = await supabase
        .from("person_identifiers")
        .update({ is_primary: false } as never)
        .eq("id", row.id);
      if (error) throw error;
    }
    const { error } = await supabase
      .from("person_identifiers")
      .update({ status: "revoked" } as never)
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  if (row) {
    if (row.value_raw === code) return;
    const { error } = await supabase
      .from("person_identifiers")
      .update({ value_raw: code } as never)
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("person_identifiers").insert({
    person_id: personId,
    kind: "asan_person_code",
    value_raw: code,
    is_primary: true,
    status: "provisional",
  } as never);
  if (error) throw error;
}
