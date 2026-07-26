import { supabase } from "@/integrations/supabase/client";

/**
 * ۱۷۷ — سند انتقال بین‌انباری.
 * اثر موجودی فقط هنگام گذار status به 'confirmed' اعمال می‌شود (تریگر
 * `trg_stock_transfers_confirm` در migration 210). سند draft هیچ اثری ندارد،
 * پس تا لحظهٔ قطعی‌کردن قابل ویرایش است.
 */

export type TransferStatus = "draft" | "confirmed";

export type StockTransfer = {
  id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: TransferStatus;
  note: string | null;
  created_at: string;
  confirmed_at: string | null;
  from_warehouse_name: string | null;
  to_warehouse_name: string | null;
  item_count: number;
};

export type TransferItem = {
  id: string;
  product_id: string;
  quantity: number;
  product_name: string | null;
};

export async function fetchTransfers(limit = 100): Promise<StockTransfer[]> {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(
      `id, from_warehouse_id, to_warehouse_id, status, note, created_at, confirmed_at,
       from_wh:warehouses!stock_transfers_from_warehouse_id_fkey(name),
       to_wh:warehouses!stock_transfers_to_warehouse_id_fkey(name),
       items:stock_transfer_items(id)`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      from_warehouse_id: string;
      to_warehouse_id: string;
      status: TransferStatus;
      note: string | null;
      created_at: string;
      confirmed_at: string | null;
      from_wh: { name: string } | null;
      to_wh: { name: string } | null;
      items: { id: string }[] | null;
    }>
  ).map((r) => ({
    id: r.id,
    from_warehouse_id: r.from_warehouse_id,
    to_warehouse_id: r.to_warehouse_id,
    status: r.status,
    note: r.note,
    created_at: r.created_at,
    confirmed_at: r.confirmed_at,
    from_warehouse_name: r.from_wh?.name ?? null,
    to_warehouse_name: r.to_wh?.name ?? null,
    item_count: r.items?.length ?? 0,
  }));
}

export async function fetchTransferItems(transferId: string): Promise<TransferItem[]> {
  const { data, error } = await supabase
    .from("stock_transfer_items")
    .select("id, product_id, quantity, product:products(name)")
    .eq("transfer_id", transferId);
  if (error) throw error;
  return (
    (data ?? []) as unknown as Array<{
      id: string;
      product_id: string;
      quantity: number;
      product: { name: string } | null;
    }>
  ).map((r) => ({
    id: r.id,
    product_id: r.product_id,
    quantity: Number(r.quantity ?? 0),
    product_name: r.product?.name ?? null,
  }));
}

export async function createTransfer(input: {
  fromWarehouseId: string;
  toWarehouseId: string;
  note?: string | null;
}): Promise<string> {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new Error("انبار مبدأ و مقصد نمی‌توانند یکی باشند.");
  }
  const { data, error } = await supabase
    .from("stock_transfers")
    .insert({
      from_warehouse_id: input.fromWarehouseId,
      to_warehouse_id: input.toWarehouseId,
      note: input.note?.trim() || null,
      status: "draft",
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function addTransferItem(input: {
  transferId: string;
  productId: string;
  quantity: number;
}): Promise<void> {
  if (input.quantity <= 0) throw new Error("مقدار انتقال باید بزرگ‌تر از صفر باشد.");
  const { error } = await supabase.from("stock_transfer_items").insert({
    transfer_id: input.transferId,
    product_id: input.productId,
    quantity: input.quantity,
  } as never);
  if (error) {
    // UNIQUE(transfer_id, product_id) — a product may appear once per document.
    if (/duplicate key|stock_transfer_items_transfer_id_product_id_key/i.test(error.message)) {
      throw new Error("این محصول از قبل در همین سند انتقال هست؛ مقدارش را ویرایش کنید.");
    }
    throw error;
  }
}

export async function removeTransferItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("stock_transfer_items").delete().eq("id", itemId);
  if (error) throw error;
}

/**
 * قطعی‌کردن سند. تریگر DB موجودی مبدأ را کم و مقصد را زیاد می‌کند و دو ردیف
 * کاردکس می‌سازد. اگر موجودی مبدأ کافی نباشد، DB با پیام فارسی رد می‌کند و
 * سند در حالت draft می‌ماند.
 */
export async function confirmTransfer(transferId: string): Promise<void> {
  const { error } = await supabase
    .from("stock_transfers")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() } as never)
    .eq("id", transferId)
    .eq("status", "draft");
  if (error) throw error;
}

export async function deleteTransfer(transferId: string): Promise<void> {
  // Only drafts may be removed; a confirmed transfer already moved stock and its
  // kardex rows are the audit trail.
  const { error } = await supabase
    .from("stock_transfers")
    .delete()
    .eq("id", transferId)
    .eq("status", "draft");
  if (error) throw error;
}
