import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChat } from "@/lib/ai/client.server";
import { stripJsonFence } from "@/lib/ai/json";

const InputSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  category: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  price: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  audience: z.enum(["wholesale", "retail", "general"]).default("general"),
});

export type AdCopyVariation = {
  headline: string;
  body: string;
  cta: string;
};

export const generateAdCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const audienceFa =
      data.audience === "wholesale"
        ? "عمده‌فروشی"
        : data.audience === "retail"
          ? "خرده‌فروشی"
          : "عمومی";

    const systemPrompt = `شما یک کپی‌رایتر حرفه‌ای تبلیغات فارسی هستید.
همیشه پاسخ را فقط به صورت JSON معتبر برگردانید، بدون متن اضافه یا markdown.
ساختار خروجی دقیقاً: {"variations":[{"headline":"...","body":"...","cta":"..."}, ...]}
سه نسخه متفاوت تولید کنید: ۱) رسمی و حرفه‌ای، ۲) دوستانه و گرم، ۳) فوری و متقاعدکننده.
headline حداکثر ۸ کلمه، body حداکثر ۳ جمله کوتاه، cta حداکثر ۵ کلمه.`;

    const userPrompt = `محصول: ${data.productName}
${data.brand ? `برند: ${data.brand}` : ""}
${data.category ? `دسته: ${data.category}` : ""}
${data.price ? `قیمت: ${data.price.toLocaleString("fa-IR")} تومان` : ""}
${data.description ? `توضیحات: ${data.description}` : ""}
مخاطب هدف: ${audienceFa}`;

    const result = await aiChat({
      usageKey: "product_ad_copy.chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    if (!result.ok) {
      // The shared client already distinguishes 429 (busy) from 402 (credit
      // exhausted) and carries the right Persian message for each.
      throw new Error(result.messageFa);
    }

    const content = result.value;

    let parsed: { variations?: AdCopyVariation[] };
    try {
      parsed = JSON.parse(stripJsonFence(content));
    } catch {
      throw new Error("پاسخ نامعتبر از سرویس هوش مصنوعی دریافت شد.");
    }
    const variations = (parsed.variations ?? []).slice(0, 3).map((v) => ({
      headline: String(v.headline ?? "").trim(),
      body: String(v.body ?? "").trim(),
      cta: String(v.cta ?? "").trim(),
    }));
    if (variations.length === 0) {
      throw new Error("هیچ نسخه‌ای تولید نشد. دوباره تلاش کنید.");
    }

    const { error: insertErr } = await context.supabase.from("ai_generated_content").insert([
      {
        tool_type: "ad_copy",
        input_data: {
          product_id: data.productId,
          product_name: data.productName,
          audience: data.audience,
        },
        generated_variations: variations as any,
        created_by: context.userId,
      },
    ]);
    if (insertErr) {
      console.error("ai_generated_content insert failed", insertErr);
    }

    return { variations };
  });
