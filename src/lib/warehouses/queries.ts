import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 8 — چندانباره (۱۷۳–۱۷۹، ۱۸۳).
 * لایهٔ دسترسی داده. نوشتن موجودی هرگز مستقیم انجام نمی‌شود؛ همیشه از
 * توابع `apply_stock_movement` / `adjust_warehouse_stock` رد می‌شود تا موجودی و
 * کاردکس هم‌زمان و یکسان بمانند (قاعدهٔ migration 210).
 */

export type Warehouse = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
  created_at: string;
};

export type WarehouseStockRow = {
  warehouse_id: string;
  product_id: string;
  quantity: number;
};

export type MovementType = "in" | "out" | "transfer_in" | "transfer_out" | "adjust";

export const MOVEMENT_TYPE_FA: Record<MovementType, string> = {
  in: "ورود",
  out: "خروج",
  transfer_in: "ورود انتقالی",
  transfer_out: "خروج انتقالی",
  adjust: "تعدیل",
};

export const REF_TYPE_FA: Record<string, string> = {
  purchase: "خرید",
  sale_quote_confirm: "قطعی‌کردن پیش‌فاکتور",
  transfer: "انتقال بین‌انباری",
  manual: "دستی",
};

export type StockMovement = {
  id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: MovementType;
  quantity: number;
  delta: number | null;
  ref_type: string | null;
  ref_id: string | null;
  related_warehouse_id: string | null;
  note: string | null;
  created_at: string;
};

/** RPC not in the generated types yet — same cast pattern used elsewhere in the app. */
type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc as unknown as RpcFn;

export async function fetchWarehouses(includeInactive = true): Promise<Warehouse[]> {
  let q = supabase
    .from("warehouses")
    .select("id, name, code, is_active, is_default, notes, created_at")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Warehouse[];
}

export async function createWarehouse(input: {
  name: string;
  code?: string | null;
  notes?: string | null;
  is_default?: boolean;
}): Promise<string> {
  const { data, error } = await supabase
    .from("warehouses")
    .insert({
      name: input.name.trim(),
      code: input.code?.trim() || null,
      notes: input.notes?.trim() || null,
      is_default: input.is_default ?? false,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateWarehouse(
  id: string,
  patch: {
    name?: string;
    code?: string | null;
    notes?: string | null;
    is_active?: boolean;
    is_default?: boolean;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.code !== undefined) payload.code = patch.code?.trim() || null;
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;
  if (patch.is_default !== undefined) payload.is_default = patch.is_default;
  const { error } = await supabase
    .from("warehouses")
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;
}

/**
 * A warehouse holding stock or carrying movements must not be hard-deleted: the
 * FKs are ON DELETE RESTRICT, so the DB would reject it anyway. This reports the
 * blocking counts so the UI can offer deactivation instead (۸.۶ در پلن).
 */
export async function getWarehouseDeleteBlockers(
  id: string,
): Promise<{ stockRows: number; stockQuantity: number; movements: number; transfers: number }> {
  const [stockRes, movRes, fromRes, toRes] = await Promise.all([
    supabase.from("warehouse_stock").select("quantity").eq("warehouse_id", id),
    supabase
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", id),
    supabase
      .from("stock_transfers")
      .select("id", { count: "exact", head: true })
      .eq("from_warehouse_id", id),
    supabase
      .from("stock_transfers")
      .select("id", { count: "exact", head: true })
      .eq("to_warehouse_id", id),
  ]);
  if (stockRes.error) throw stockRes.error;
  if (movRes.error) throw movRes.error;
  if (fromRes.error) throw fromRes.error;
  if (toRes.error) throw toRes.error;

  const rows = (stockRes.data ?? []) as { quantity: number }[];
  return {
    stockRows: rows.length,
    stockQuantity: rows.reduce((s, r) => s + Number(r.quantity ?? 0), 0),
    movements: movRes.count ?? 0,
    transfers: (fromRes.count ?? 0) + (toRes.count ?? 0),
  };
}

export async function deleteWarehouse(id: string): Promise<void> {
  const { error } = await supabase.from("warehouses").delete().eq("id", id);
  if (error) throw error;
}

/** Per-warehouse stock for one product (۱۷۶ — نمایش موجودی به تفکیک انبار). */
export async function fetchProductStockByWarehouse(
  productId: string,
): Promise<Array<{ warehouse_id: string; warehouse_name: string; quantity: number }>> {
  const { data, error } = await supabase
    .from("warehouse_stock")
    .select("warehouse_id, quantity, warehouse:warehouses(name)")
    .eq("product_id", productId);
  if (error) throw error;
  return (
    (data ?? []) as unknown as Array<{
      warehouse_id: string;
      quantity: number;
      warehouse: { name: string } | null;
    }>
  )
    .map((r) => ({
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouse?.name ?? "—",
      quantity: Number(r.quantity ?? 0),
    }))
    .sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name, "fa"));
}

/** Manual stock correction — goes through the SECURITY DEFINER function. */
export async function adjustWarehouseStock(input: {
  productId: string;
  warehouseId: string;
  newQuantity: number;
  note?: string | null;
}): Promise<number> {
  const { data, error } = await rpc("adjust_warehouse_stock", {
    _product_id: input.productId,
    _warehouse_id: input.warehouseId,
    _new_quantity: input.newQuantity,
    _note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export type QuoteStockCheckRow = {
  product_id: string;
  product_name: string;
  /**
   * D8-8 (274): availability is now reported per (product, warehouse), because
   * one proforma may draw its lines from several warehouses. A quote whose
   * lines all sit in one warehouse still returns one row per product, exactly
   * as before.
   */
  warehouse_id: string | null;
  warehouse_name: string | null;
  required: number;
  available: number;
  is_sufficient: boolean;
};

/** ۱۷۵ — pre-confirm availability preview. Reports, never throws on shortage. */
export async function checkQuoteStockAvailability(
  quoteId: string,
  warehouseId?: string | null,
): Promise<QuoteStockCheckRow[]> {
  const { data, error } = await rpc("check_quote_stock_availability", {
    _quote_id: quoteId,
    _warehouse_id: warehouseId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as QuoteStockCheckRow[] | null) ?? [];
}

/** ۱۸۳ — kardex rows with optional warehouse / product / date-range filters. */
export async function fetchStockMovements(filters: {
  warehouseId?: string | null;
  productId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
}): Promise<
  Array<
    StockMovement & {
      product_name: string | null;
      warehouse_name: string | null;
      related_warehouse_name: string | null;
    }
  >
> {
  let q = supabase
    .from("stock_movements")
    .select(
      `id, product_id, warehouse_id, movement_type, quantity, delta, ref_type, ref_id,
       related_warehouse_id, note, created_at,
       product:products(name), warehouse:warehouses!stock_movements_warehouse_id_fkey(name),
       related:warehouses!stock_movements_related_warehouse_id_fkey(name)`,
    )
    // Tie-break on id: rows created inside one transaction share created_at.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.warehouseId) q = q.eq("warehouse_id", filters.warehouseId);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.fromDate) q = q.gte("created_at", `${filters.fromDate}T00:00:00`);
  if (filters.toDate) q = q.lte("created_at", `${filters.toDate}T23:59:59.999`);

  const { data, error } = await q;
  if (error) throw error;

  return (
    (data ?? []) as unknown as Array<
      StockMovement & {
        product: { name: string } | null;
        warehouse: { name: string } | null;
        related: { name: string } | null;
      }
    >
  ).map((r) => ({
    ...r,
    product_name: r.product?.name ?? null,
    warehouse_name: r.warehouse?.name ?? null,
    related_warehouse_name: r.related?.name ?? null,
  }));
}
