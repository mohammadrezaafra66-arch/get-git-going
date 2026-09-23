import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve profile display names for work item creator/assignee/actor ids.
 * Pattern mirrors CreateWorkWizard staff profiles (id + full_name).
 */
export async function resolveProfileNames(
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(ids.filter((id): id is string => Boolean(id))),
  );
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{
    id: string;
    full_name: string | null;
  }>) {
    const name = row.full_name?.trim();
    map.set(row.id, name || row.id.slice(0, 8));
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, id.slice(0, 8));
  }
  return map;
}

export function profileDisplayName(
  names: Map<string, string>,
  id: string | null | undefined,
): string {
  if (!id) return "—";
  return names.get(id) ?? id.slice(0, 8);
}
