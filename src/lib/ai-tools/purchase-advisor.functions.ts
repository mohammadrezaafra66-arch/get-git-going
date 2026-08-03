import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChat } from "@/lib/ai/client.server";
import {
  getWhatsappProductSellersSnapshot,
  getWhatsappTopProductsSnapshot,
} from "@/lib/management/whatsapp-top-products.functions";

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

function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fa-IR");
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

    const topProducts = await getWhatsappTopProductsSnapshot({ range: 30, limit: 150 });
    const normalizedProductName = normalizeSearchText(product.name as string);
    const whatsappMatch =
      topProducts.ok && topProducts.products.length > 0
        ? (topProducts.products.find((p) => p.product_id === data.productId) ??
          topProducts.products.find(
            (p) => normalizeSearchText(p.product_name) === normalizedProductName,
          ) ??
          topProducts.products.find((p) => {
            const n = normalizeSearchText(p.product_name);
            return n.includes(normalizedProductName) || normalizedProductName.includes(n);
          }) ??
          null)
        : null;

    const whatsappSellers = whatsappMatch
      ? await getWhatsappProductSellersSnapshot({
          productName: whatsappMatch.product_name,
          range: 30,
          limit: 10,
        })
      : null;

    const whatsappDemandLines = whatsappMatch
      ? [
          `- رتبه در جدول واتساپ: ${whatsappMatch.rank.toLocaleString("fa-IR")}`,
          `- تعداد تکرار در ۳۰ روز: ${whatsappMatch.mention_count.toLocaleString("fa-IR")}`,
          `- تعداد گروه: ${whatsappMatch.group_count.toLocaleString("fa-IR")}`,
          `- تعداد فرستنده: ${whatsappMatch.sender_count.toLocaleString("fa-IR")}`,
          `- وضعیت در دستیار: ${
            whatsappMatch.assistant_status ??
            (whatsappMatch.in_assistant ? "در دستیار داریم" : "خارج از دستیار")
          }`,
          `- آخرین ذکر: ${whatsappMatch.last_mentioned_shamsi ?? "نامشخص"}`,
        ].join("\n")
      : topProducts.ok
        ? "— این محصول در جدول محصولات پرتکرار واتساپ ۳۰ روز اخیر پیدا نشد."
        : `— اتصال به گزارش واتساپ برقرار نشد: ${topProducts.reason}`;

    const whatsappSellerLines =
      whatsappSellers && whatsappSellers.ok && whatsappSellers.mentioners.length > 0
        ? whatsappSellers.mentioners
            .slice(0, 10)
            .map((s, i) => {
              const contacts =
                s.all_contacts.length > 0
                  ? s.all_contacts
                  : [s.sender_phone, s.sender_phone_secondary].filter(Boolean);
              return `${i + 1}. فروشنده/فرستنده: ${s.sender_display_name ?? "نامشخص"} — گروه: ${s.group_name ?? "نامشخص"} — تماس: ${contacts.join(" / ") || "نامشخص"} — زمان: ${s.timestamp_shamsi ?? "نامشخص"}${s.message_preview ? ` — نمونه پیام: ${s.message_preview}` : ""}`;
            })
            .join("\n")
        : whatsappSellers && whatsappSellers.ok
          ? "— برای این محصول فروشنده/فرستنده اخیر در گزارش واتساپ پیدا نشد."
          : whatsappSellers && !whatsappSellers.ok
            ? `— دریافت فروشندگان واتساپ ناموفق بود: ${whatsappSellers.reason}`
            : "— چون محصول در جدول واتساپ پیدا نشد، فروشنده‌ای از واتساپ هم بازیابی نشد.";

    const whatsappSellerAppendix =
      whatsappSellers && whatsappSellers.ok && whatsappSellers.mentioners.length > 0
        ? [
            "",
            "",
            "فروشندگان اخیر واتساپ برای این محصول:",
            ...whatsappSellers.mentioners.slice(0, 5).map((s, i) => {
              const contacts =
                s.all_contacts.length > 0
                  ? s.all_contacts
                  : [s.sender_phone, s.sender_phone_secondary].filter(Boolean);
              return `${i + 1}. ${s.sender_display_name ?? "نامشخص"} — گروه: ${s.group_name ?? "نامشخص"} — تماس: ${contacts.join(" / ") || "نامشخص"}`;
            }),
          ].join("\n")
        : "";

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

تقاضای واقعی مشتریان در واتساپ برای همین محصول:
${whatsappDemandLines}

فروشندگان/فرستندگان اخیر همین محصول در گزارش واتساپ:
${whatsappSellerLines}

لطفاً توصیه‌ی خرید کاملی شامل موارد زیر ارائه بده:
۱. تامین‌کننده پیشنهادی و دلیل
۲. زمان‌بندی خرید (اکنون یا صبر)
۳. تحلیل روند قیمت
۴. ریسک‌های احتمالی
۵. فروشندگان یا فرستندگان اخیر واتساپ را اگر داده معتبر وجود دارد نام ببر و بگو از کدام گروه/شماره آمده‌اند
۶. جمع‌بندی نهایی`;

    const result = await aiChat({
      usageKey: "purchase_advisor.chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    // The shared client already separates 429 (busy, retry) from 402 (credit
    // exhausted) and carries the right Persian message for each.
    if (!result.ok) throw new Error(result.messageFa);

    const advice = `${result.value.trim()}${whatsappSellerAppendix}`;
    if (!advice) throw new Error("پاسخی از سرویس هوش مصنوعی دریافت نشد.");

    return { advice, productName: product.name as string };
  });
