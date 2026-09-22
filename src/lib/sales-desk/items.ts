/**
 * Deal line items on sales_interaction_items (migration 568).
 */
import { supabase } from "@/integrations/supabase/client";

export type SalesInteractionItemInput = {
  productId: string;
  quantity?: number;
  note?: string | null;
};

export type SalesInteractionItemRow = {
  id: string;
  interaction_id: string;
  product_id: string;
  quantity: number;
  note: string | null;
  created_at: string;
  product?: { id: string; name: string; sku: string | null } | null;
};

export async function insertSalesInteractionItems(
  interactionId: string,
  items: SalesInteractionItemInput[],
): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((it) => ({
    interaction_id: interactionId,
    product_id: it.productId,
    quantity: it.quantity ?? 1,
    note: it.note?.trim() || null,
  }));
  const { error } = await supabase
    .from("sales_interaction_items" as never)
    .insert(rows as never);
  if (error) throw new Error(error.message);
}

export async function listSalesInteractionItems(
  interactionId: string,
): Promise<SalesInteractionItemRow[]> {
  const { data, error } = await supabase
    .from("sales_interaction_items" as never)
    .select(
      "id, interaction_id, product_id, quantity, note, created_at, product:products(id, name, sku)" as never,
    )
    .eq("interaction_id" as never, interactionId as never)
    .order("created_at" as never, { ascending: true } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SalesInteractionItemRow[];
}
