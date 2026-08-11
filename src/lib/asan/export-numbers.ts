/**
 * ASAN M4 — reading Asan numbers that were already assigned.
 *
 * Every export needs this and none of them should own it: the preview shows a document's Asan
 * number so the accountant can cross-check a re-export against what she already imported.
 *
 * This only ever **reads**. Numbers are minted on download, by
 * `asan_assign_document_numbers` (migration 291), because only an exported document consumes a
 * number. `asan_export_numbers` has no INSERT/UPDATE/DELETE policy at all, so this file could
 * not mint one even if it tried.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AsanDocType } from "@/lib/asan/export-types";

export async function existingAsanNumbers(
  docType: AsanDocType,
  sourceIds: string[],
): Promise<Map<string, number>> {
  if (sourceIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("asan_export_numbers")
    .select("source_id, asan_number")
    .eq("doc_type", docType)
    .in("source_id", sourceIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.source_id as string, r.asan_number as number]));
}
