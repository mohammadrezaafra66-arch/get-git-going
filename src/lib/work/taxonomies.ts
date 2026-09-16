import { supabase } from "@/integrations/supabase/client";

/**
 * Calm Mind managed taxonomies — mirrors
 * supabase/migrations/20260916150000_551_work_taxonomies.sql
 * Soft-delete via deleted_at; not public.tasks.
 */

export type WorkTaxonomyKind = "group" | "section" | "kind_label";

export interface WorkTaxonomy {
  id: string;
  kind: WorkTaxonomyKind;
  name: string;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkTaxonomyInput {
  kind: WorkTaxonomyKind;
  name: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateWorkTaxonomyPatch {
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}

const taxonomiesTable = () => (supabase as any).from("work_taxonomies");

export async function listActiveTaxonomies(
  kind?: WorkTaxonomyKind,
): Promise<WorkTaxonomy[]> {
  let q = taxonomiesTable()
    .select("*")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WorkTaxonomy[];
}

export async function listTaxonomies(filters?: {
  kind?: WorkTaxonomyKind;
  includeInactive?: boolean;
}): Promise<WorkTaxonomy[]> {
  let q = taxonomiesTable()
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (filters?.kind) q = q.eq("kind", filters.kind);
  if (!filters?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WorkTaxonomy[];
}

export async function createTaxonomy(
  input: CreateWorkTaxonomyInput,
): Promise<WorkTaxonomy> {
  const name = input.name.trim();
  if (!name) throw new Error("نام الزامی است.");

  const row: Record<string, unknown> = {
    kind: input.kind,
    name,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await taxonomiesTable()
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkTaxonomy;
}

export async function updateTaxonomy(
  id: string,
  patch: UpdateWorkTaxonomyPatch,
): Promise<WorkTaxonomy> {
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("نام الزامی است.");
    next.name = name;
  }
  if (patch.sort_order !== undefined) next.sort_order = patch.sort_order;
  if (patch.is_active !== undefined) next.is_active = patch.is_active;

  const { data, error } = await taxonomiesTable()
    .update(next)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkTaxonomy;
}

/** Soft-delete: set deleted_at (preferred over hard DELETE per RLS). */
export async function softDeleteTaxonomy(id: string): Promise<void> {
  // Do not .select() after soft-delete — SELECT RLS requires deleted_at IS NULL.
  const { error, count } = await taxonomiesTable()
    .update(
      { deleted_at: new Date().toISOString(), is_active: false },
      { count: "exact" },
    )
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw error;
  if (count === 0) throw new Error("آیتم یافت نشد یا قبلاً حذف شده است.");
}
