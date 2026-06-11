import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type StockStatus = Database["public"]["Enums"]["stock_status"];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  available: "موجود",
  limited: "محدود",
  unavailable: "ناموجود",
  unknown: "نامشخص",
};

export const STOCK_STATUS_OPTIONS: { value: StockStatus; label: string }[] = [
  { value: "available", label: "موجود" },
  { value: "limited", label: "محدود" },
  { value: "unavailable", label: "ناموجود" },
];

function addMonthsIso(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export interface WorkbenchRow {
  id: string;
  name: string;
  sku: string | null;
  brand_name: string | null;
  stock_status: StockStatus;
  base_currency: string;
  current_price: number | null;
  current_price_id: string | null;
  current_supplier_id: string | null;
  current_currency: Database["public"]["Enums"]["currency_code"] | string | null;
}

/** بازگرداندن لیست محصولات تحت مسئولیت کاربر فعلی + آخرین قیمت خرید فعال هرکدام. */
export async function fetchMyWorkbenchRows(opts: {
  userId: string;
  search: string;
  brandId: string;
  stockStatus: "all" | StockStatus;
  showAll: boolean;
  page: number;
  pageSize: number;
}): Promise<{ rows: WorkbenchRow[]; total: number }> {
  const { userId, search, brandId, stockStatus, showAll, page, pageSize } = opts;

  // 1) شناسه محصولات تحت مسئولیت کاربر (مگر showAll=true)
  let ownedIds: string[] | null = null;
  if (!showAll) {
    const { data: assigns, error } = await supabase
      .from("product_owner_assignments")
      .select("product_id")
      .eq("user_id", userId);
    if (error) throw error;
    ownedIds = (assigns ?? []).map((r) => r.product_id);
    if (ownedIds.length === 0) return { rows: [], total: 0 };
  }

  // 2) محصولات با فیلترها
  let q = supabase
    .from("products")
    .select("id, name, sku, base_currency, stock_status, brand:brands(name)", { count: "exact" })
    .order("name", { ascending: true });

  if (ownedIds) q = q.in("id", ownedIds);
  if (brandId !== "all") q = q.eq("brand_id", brandId);
  if (stockStatus !== "all") q = q.eq("stock_status", stockStatus);
  if (search.trim()) {
    const safe = search.trim().replace(/[%_]/g, "");
    q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
  }

  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data: products, error: pErr, count } = await q;
  if (pErr) throw pErr;

  const productIds = (products ?? []).map((p) => p.id);
  if (productIds.length === 0) return { rows: [], total: count ?? 0 };

  // 3) آخرین قیمت خرید فعال برای هر محصول
  const nowIso = new Date().toISOString();
  const { data: prices, error: prErr } = await supabase
    .from("purchase_prices")
    .select("id, product_id, supplier_id, purchase_price, currency, effective_at, expires_at")
    .in("product_id", productIds)
    .eq("is_active", true)
    .lte("effective_at", nowIso)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("effective_at", { ascending: false });
  if (prErr) throw prErr;

  // اولین رکورد per product = آخرین فعال
  const latestByProduct = new Map<string, (typeof prices extends (infer T)[] ? T : never)>();
  (prices ?? []).forEach((p) => {
    if (!latestByProduct.has(p.product_id)) latestByProduct.set(p.product_id, p as never);
  });

  const rows: WorkbenchRow[] = (products ?? []).map((p) => {
    const lp = latestByProduct.get(p.id) as
      | { id: string; supplier_id: string; purchase_price: number; currency: WorkbenchRow["current_currency"] }
      | undefined;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      brand_name: (p.brand as { name: string } | null)?.name ?? null,
      stock_status: p.stock_status as StockStatus,
      base_currency: p.base_currency,
      current_price: lp ? Number(lp.purchase_price) : null,
      current_price_id: lp?.id ?? null,
      current_supplier_id: lp?.supplier_id ?? null,
      current_currency: lp?.currency ?? p.base_currency,
    };
  });

  return { rows, total: count ?? 0 };
}

/** آیا کاربر فعلی هیچ محصول تحت مسئولیت دارد یا نه؟ (برای نمایش آیتم منو) */
export async function userHasAssignedProducts(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("product_owner_assignments")
    .select("product_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** به‌روزرسانی وضعیت موجودی محصول. */
export async function updateProductStock(productId: string, status: StockStatus, actorId: string, prev: StockStatus) {
  const { error } = await supabase.from("products").update({ stock_status: status }).eq("id", productId);
  if (error) throw error;
  await supabase.from("audit_logs").insert({
    action: "workbench_stock_update",
    entity_type: "product",
    entity_id: productId,
    actor_id: actorId,
    diff: { from: prev, to: status } as never,
  });
}

/**
 * ثبت قیمت خرید جدید برای یک محصول:
 *  - رکورد فعال قبلی (در صورت وجود) را expire می‌کند
 *  - یک رکورد جدید فعال می‌سازد
 *  - اگر تأمین‌کننده‌ای از قبل ثبت نشده، باید supplier_id داده شود
 */
export async function upsertPurchasePrice(opts: {
  productId: string;
  newPrice: number;
  currency: Database["public"]["Enums"]["currency_code"];
  supplierId: string | null;
  previousPriceId: string | null;
  previousPrice: number | null;
  actorId: string;
}): Promise<void> {
  const { productId, newPrice, currency, supplierId, previousPriceId, previousPrice, actorId } = opts;

  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    throw new Error("قیمت معتبر نیست.");
  }

  const nowIso = new Date().toISOString();
  const expiresIso = addMonthsIso(new Date(), 6);

  // expire previous active row
  if (previousPriceId) {
    const { error: upErr } = await supabase
      .from("purchase_prices")
      .update({ is_active: false, expires_at: nowIso })
      .eq("id", previousPriceId);
    if (upErr) throw upErr;
  }

  const { error: insErr } = await supabase.from("purchase_prices").insert({
    product_id: productId,
    supplier_id: supplierId ?? null,
    purchase_price: newPrice,
    currency,
    effective_at: nowIso,
    expires_at: expiresIso,
    is_active: true,
    registered_by: actorId,
  });
  if (insErr) throw insErr;

  await supabase.from("audit_logs").insert({
    action: "workbench_price_update",
    entity_type: "product",
    entity_id: productId,
    actor_id: actorId,
    diff: {
      from: previousPrice,
      to: newPrice,
      currency,
      supplier_id: supplierId,
      change_pct:
        previousPrice && previousPrice > 0
          ? Number((((newPrice - previousPrice) / previousPrice) * 100).toFixed(2))
          : null,
    } as never,
  });
}