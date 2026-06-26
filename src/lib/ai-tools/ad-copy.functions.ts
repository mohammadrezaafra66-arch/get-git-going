import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const MODEL = "anthropic/claude-sonnet-4-5";

export const generateAdCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("محدودیت تعداد درخواست. لطفاً کمی بعد تلاش کنید.");
      if (res.status === 402) throw new Error("اعتبار هوش مصنوعی به پایان رسیده است.");
      throw new Error(`خطای سرویس هوش مصنوعی (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";

    let parsed: { variations?: AdCopyVariation[] };
    try {
      parsed = JSON.parse(content);
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
        generated_variations: variations as unknown as Record<string, unknown>,
        created_by: context.userId,
      },
    ]);
    if (insertErr) {
      console.error("ai_generated_content insert failed", insertErr);
    }

    return { variations };
  });
