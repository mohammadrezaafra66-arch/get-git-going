import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChat } from "@/lib/ai/client.server";

const InputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  urgency: z.enum(["normal", "urgent", "critical"]),
  note: z.string().max(1000).optional().nullable(),
});

const URGENCY_FA: Record<string, string> = {
  normal: "عادی",
  urgent: "فوری",
  critical: "بحرانی",
};

function formatDateFa(iso: string | null | undefined): string {
  if (!iso) return "نامشخص";
  try {
    return new Date(iso).toLocaleDateString("fa-IR");
  } catch {
    return String(iso);
  }
}

export const generatePurchaseAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("id, name, sku, model, capacity")
      .eq("id", data.productId)
      .maybeSingle();
    if (productErr) throw new Error(productErr.message);
    if (!product) throw new Error("محصول یافت نشد");

    const { data: prices, error: pricesErr } = await supabase
      .from("purchase_prices")
      .select("supplier_id, purchase_price, currency, effective_at")
      .eq("product_id", data.productId)
      .order("effective_at", { ascending: false })
      .limit(5);
    if (pricesErr) throw new Error(pricesErr.message);

    const supplierIds = Array.from(
      new Set((prices ?? []).map((p) => p.supplier_id).filter(Boolean)),
    ) as string[];
    const supplierMap = new Map<string, string>();
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, name")
        .in("id", supplierIds);
      for (const s of suppliers ?? []) supplierMap.set(s.id as string, s.name as string);
    }

    const { data: rates } = await supabase
      .from("currency_rates")
      .select("currency, rate_to_toman, effective_at")
      .in("currency", ["USD", "EUR"])
      .eq("is_active", true)
      .order("effective_at", { ascending: false })
      .limit(20);
    const latestRate = (code: string) =>
      (rates ?? []).find((r) => (r.currency as string) === code) ?? null;
    const usd = latestRate("USD");
    const eur = latestRate("EUR");

    const priceLines = (prices ?? []).length
      ? (prices ?? [])
          .map((p, i) => {
            const supplierName =
              (p.supplier_id && supplierMap.get(p.supplier_id as string)) || "نامشخص";
            const priceNum = Number(p.purchase_price ?? 0);
            return `${i + 1}. تامین‌کننده: ${supplierName} — قیمت: ${priceNum.toLocaleString("fa-IR")} ${p.currency} — تاریخ: ${formatDateFa(p.effective_at as string | null)}`;
          })
          .join("\n")
      : "— سابقه خریدی ثبت نشده است.";

    const rateLines = [
      usd
        ? `USD: ${Number(usd.rate_to_toman).toLocaleString("fa-IR")} تومان (${formatDateFa(usd.effective_at as string | null)})`
        : "USD: نامشخص",
      eur
        ? `EUR: ${Number(eur.rate_to_toman).toLocaleString("fa-IR")} تومان (${formatDateFa(eur.effective_at as string | null)})`
        : "EUR: نامشخص",
    ].join(" | ");

    const systemPrompt =
      "تو یک مشاور خرید هوشمند برای یک شرکت وارداتی ایرانی هستی. بر اساس داده‌های زیر توصیه کن.";

    const userPrompt = `اطلاعات محصول:
- نام: ${product.name}
- SKU: ${product.sku ?? "—"}
${product.model ? `- مدل: ${product.model}` : ""}
${product.capacity ? `- ظرفیت: ${product.capacity}` : ""}

تعداد مورد نیاز: ${data.quantity.toLocaleString("fa-IR")}
فوریت: ${URGENCY_FA[data.urgency]}
${data.note ? `یادداشت مدیر: ${data.note}` : ""}

تاریخچه ۵ خرید اخیر:
${priceLines}

نرخ ارز فعلی:
${rateLines}

لطفاً توصیه‌ی خرید کاملی شامل موارد زیر ارائه بده:
۱. تامین‌کننده پیشنهادی و دلیل
۲. زمان‌بندی خرید (اکنون یا صبر)
۳. تحلیل روند قیمت
۴. ریسک‌های احتمالی
۵. جمع‌بندی نهایی`;

    const result = await aiChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    // The shared client already separates 429 (busy, retry) from 402 (credit
    // exhausted) and carries the right Persian message for each.
    if (!result.ok) throw new Error(result.messageFa);

    const advice = result.value.trim();
    if (!advice) throw new Error("پاسخی از سرویس هوش مصنوعی دریافت نشد.");

    return { advice, productName: product.name as string };
  });
