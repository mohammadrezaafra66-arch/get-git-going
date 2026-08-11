import { supabase } from "@/integrations/supabase/client";
import { calculateSalePrice, PricingError } from "./engine";
import { fetchLatestPurchasePrice } from "./queries";

type SbClient = typeof supabase;

export interface PublishOnePriceResult {
  sale_price_type_id: string;
  sale_price_type_title: string;
  ok: boolean;
  old_price: number | null;
  new_price: number | null;
  changed: boolean;
  error: string | null;
}

export interface PublishProductResult {
  product_id: string;
  product_name: string;
  sku: string | null;
  total_types: number;
  succeeded: number;
  failed: number;
  results: PublishOnePriceResult[];
}

/**
 * محاسبه و انتشار قیمت فروش یک محصول برای همهٔ نوع‌قیمت‌های فروش فعال:
 *  - upsert در product_computed_prices
 *  - درج snapshot در price_calculation_snapshots
 *  - درج تغییر در product_sale_price_history (فقط در صورت تغییر یا اولین بار)
 */
export async function publishProductPrices(
  opts: {
    productId: string;
    source?: string;
    /** Optional override for SECURITY DEFINER / service-role server runs */
    actingUserId?: string | null;
  },
  db: SbClient = supabase,
): Promise<PublishProductResult> {
  const { productId, source = "manual_publish" } = opts;
  if (!productId) throw new Error("شناسه محصول الزامی است.");

  const { data: product, error: pErr } = await db
    .from("products")
    .select("id, name, sku")
    .eq("id", productId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!product) throw new Error("محصول یافت نشد.");

  const { data: spts, error: sptErr } = await db
    .from("sale_price_types")
    .select("id, title")
    .eq("is_active", true)
    .order("sort_order");
  if (sptErr) throw sptErr;

  const list = spts ?? [];

  // ترم‌های تسویهٔ فعال — برای تولید یک قیمت مستقل به‌ازای هر (نوع‌قیمت × ترم تسویه).
  const { data: setts, error: settErr } = await db
    .from("settlement_types")
    .select("id, title, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (settErr) throw settErr;
  const settlementList = setts ?? [];
  let uid: string | null = opts.actingUserId ?? null;
  if (uid === null) {
    try {
      const { data: userData } = await db.auth.getUser();
      uid = userData.user?.id ?? null;
    } catch {
      uid = null;
    }
  }

  const results: PublishOnePriceResult[] = [];
  const purchase = await fetchLatestPurchasePrice(productId, db);
  if (!purchase) {
    return {
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      total_types: list.length,
      succeeded: 0,
      failed: 1,
      results: [
        {
          sale_price_type_id: "missing-purchase-price",
          sale_price_type_title: "قیمت خرید",
          ok: false,
          old_price: null,
          new_price: null,
          changed: false,
          error:
            "برای این محصول قیمت خرید معتبر ثبت نشده است. ابتدا قیمت خرید را با تاریخ مؤثر امروز یا قبل‌تر و تاریخ انقضای آینده ثبت کنید.",
        },
      ],
    };
  }

  for (const spt of list) {
    try {
      // محاسبه + ساخت snapshot/history (force_snapshot=true تاریخچه را هم پر می‌کند)
      const res = await calculateSalePrice(
        {
          product_id: productId,
          sale_price_type_id: spt.id,
          force_snapshot: true,
          acting_user_id: uid,
        },
        db,
      );

      const b = res.breakdown;

      // upsert ردیفِ پایه (settlement = NULL) در product_computed_prices تا /sales/search ببیند.
      // این همان قیمتی است که امروز محاسبه می‌شود؛ رفتارش تغییر نکرده.
      const { error: upErr } = await db.from("product_computed_prices").upsert(
        {
          product_id: productId,
          sale_price_type_id: spt.id,
          settlement_type_id: null,
          purchase_price_id: b.purchase_price_id,
          pricing_rule_id: b.pricing_rule_id,
          input_purchase_price: b.input_purchase_price,
          input_currency: b.input_currency,
          currency_rate: b.currency_rate,
          purchase_price_toman: b.purchase_price_toman,
          shipping_cost: b.shipping_cost,
          margin_amount: b.margin_amount,
          final_sale_price: b.final_sale_price,
          rounded_sale_price: b.rounded_sale_price,
          computed_at: new Date().toISOString(),
          computed_by: uid,
          source,
        },
        { onConflict: "product_id,sale_price_type_id,settlement_type_id" },
      );
      if (upErr) throw upErr;

      // قیمت به‌ازای هر ترم تسویه: یک ردیف محاسبه‌شده به‌ازای هر
      // (محصول، نوع‌قیمت، ترم تسویه). snapshot/history فقط برای ردیف پایه ثبت می‌شود
      // (force_snapshot=false) تا حجم تاریخچه چند برابر نشود.
      for (const st of settlementList) {
        try {
          const resS = await calculateSalePrice(
            {
              product_id: productId,
              sale_price_type_id: spt.id,
              settlement_type_id: st.id,
              force_snapshot: false,
              acting_user_id: uid,
            },
            db,
          );
          const bs = resS.breakdown;
          const { error: upSErr } = await db.from("product_computed_prices").upsert(
            {
              product_id: productId,
              sale_price_type_id: spt.id,
              settlement_type_id: st.id,
              purchase_price_id: bs.purchase_price_id,
              pricing_rule_id: bs.pricing_rule_id,
              input_purchase_price: bs.input_purchase_price,
              input_currency: bs.input_currency,
              currency_rate: bs.currency_rate,
              purchase_price_toman: bs.purchase_price_toman,
              shipping_cost: bs.shipping_cost,
              margin_amount: bs.margin_amount,
              final_sale_price: bs.final_sale_price,
              rounded_sale_price: bs.rounded_sale_price,
              computed_at: new Date().toISOString(),
              computed_by: uid,
              source,
            },
            { onConflict: "product_id,sale_price_type_id,settlement_type_id" },
          );
          if (upSErr) throw upSErr;
        } catch {
          // یک ترم شکست‌خورده نباید کل انتشار را متوقف کند.
        }
      }

      results.push({
        sale_price_type_id: spt.id,
        sale_price_type_title: spt.title,
        ok: true,
        old_price: res.old_sale_price,
        new_price: b.rounded_sale_price,
        changed: res.old_sale_price === null || res.old_sale_price !== b.rounded_sale_price,
        error: null,
      });
    } catch (e) {
      const msg =
        e instanceof PricingError ? e.message : ((e as Error)?.message ?? "خطای ناشناخته");
      results.push({
        sale_price_type_id: spt.id,
        sale_price_type_title: spt.title,
        ok: false,
        old_price: null,
        new_price: null,
        changed: false,
        error: msg,
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return {
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    total_types: results.length,
    succeeded,
    failed,
    results,
  };
}

export interface PublishAllSummary {
  total_products: number;
  processed: number;
  total_prices_written: number;
  total_failed: number;
  per_product: PublishProductResult[];
}

/**
 * انتشار قیمت فروش برای تمام محصولات فعال (یا منتخب).
 * - sequential تا فشار روی DB کنترل شود.
 * - onProgress برای نمایش پیشرفت در UI.
 */
export async function publishAllProductsPrices(opts?: {
  productIds?: string[];
  onlyActiveAvailable?: boolean;
  onProgress?: (done: number, total: number, last: PublishProductResult) => void;
}): Promise<PublishAllSummary> {
  const onlyActiveAvailable = opts?.onlyActiveAvailable ?? true;

  let productIds = opts?.productIds ?? null;
  if (!productIds) {
    let q = supabase.from("products").select("id");
    if (onlyActiveAvailable) {
      q = q.eq("status", "active").in("stock_status", ["available", "limited"]);
    }
    const { data, error } = await q;
    if (error) throw error;
    productIds = (data ?? []).map((r) => r.id);
  }

  const total = productIds.length;
  const per_product: PublishProductResult[] = [];
  let processed = 0;
  let total_prices_written = 0;
  let total_failed = 0;

  for (const pid of productIds) {
    try {
      const r = await publishProductPrices({ productId: pid, source: "batch_publish" });
      per_product.push(r);
      total_prices_written += r.succeeded;
      total_failed += r.failed;
    } catch (e) {
      total_failed += 1;
      per_product.push({
        product_id: pid,
        product_name: "—",
        sku: null,
        total_types: 0,
        succeeded: 0,
        failed: 1,
        results: [
          {
            sale_price_type_id: "",
            sale_price_type_title: "",
            ok: false,
            old_price: null,
            new_price: null,
            changed: false,
            error: (e as Error)?.message ?? "خطای ناشناخته",
          },
        ],
      });
    }
    processed += 1;
    opts?.onProgress?.(processed, total, per_product[per_product.length - 1]);
  }

  return {
    total_products: total,
    processed,
    total_prices_written,
    total_failed,
    per_product,
  };
}
