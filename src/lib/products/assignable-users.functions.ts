import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuthNode20 } from "@/integrations/supabase/messenger-auth-middleware";

const InputSchema = z.object({
  search: z.string().trim().max(100).optional(),
});

export interface AssignableUser {
  id: string;
  full_name: string | null;
}

/**
 * Lists registered users for the «انتساب مسئول محصول» picker.
 *
 * `profiles` RLS only lets a non-admin read their OWN row, so the picker
 * previously showed just the caller. This server function runs with the
 * service-role client and returns ONLY non-sensitive fields (id, full_name) —
 * never email / phone / role. The assign action itself is unchanged and stays
 * RLS-gated on `product_owner_assignments`; this only widens the selection list.
 */
export const listAssignableUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<AssignableUser[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .order("full_name", { ascending: true })
      .limit(50);
    const term = (data.search ?? "").trim().replace(/[%_]/g, "");
    if (term) q = q.ilike("full_name", `%${term}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      full_name: (r.full_name as string | null) ?? null,
    }));
  });
