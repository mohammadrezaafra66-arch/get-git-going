/**
 * Server function: OCR/extract a payment receipt from raw bytes BEFORE the
 * receipt is saved. Mirrors `extractReceiptDocumentOcr` but accepts a
 * base64-encoded payload instead of an existing storage object.
 *
 * Used by the create-receipt form to auto-fill amount, date, tracking number,
 * and bank names the moment the user picks a file.
 *
 * Auth: requires a signed-in user with role admin/accountant.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OcrBytesMethod =
  | "text"
  | "image_ocr"
  | "pdf_text"
  | "unsupported";

export interface OcrBytesResult {
  raw_text: string;
  method: OcrBytesMethod;
  warnings: string[];
}

const ALLOWED_ROLES = new Set(["admin", "accountant"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const OCR_PROMPT = [
  "Extract only visible text from this payment receipt.",
  "Do not guess values.",
  "Return raw text only.",
  "Do not invent bank names, amounts, dates, or tracking numbers.",
  "Preserve original line breaks and Persian/Arabic digits as-is.",
  "Do not add explanations or commentary.",
].join(" ");

const InputSchema = z.object({
  file_name: z.string().min(1).max(300),
  mime: z.string().min(1).max(150),
  base64: z.string().min(4).max(40_000_000), // ~30MB base64 → 20MB binary
});

export const extractReceiptFromBytes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Role check
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) {
      console.error("[ocr-bytes] role check failed:", roleErr.message);
      throw new Response("Internal server error", { status: 500 });
    }
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
      throw new Response("Forbidden: only admin or accountant can run OCR", {
        status: 403,
      });
    }

    // Decode bytes once (used for multiple branches).
    let bytes: Uint8Array;
    try {
      const bin = atob(data.base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      throw new Response("Invalid base64 payload", { status: 400 });
    }
    if (bytes.byteLength > MAX_BYTES) {
      throw new Response("File too large", { status: 413 });
    }

    const mime = (data.mime || "").toLowerCase();

    // text/* → decode as UTF-8
    if (mime.startsWith("text/")) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      return {
        raw_text: text,
        method: "text" as const,
        warnings: [],
      } satisfies OcrBytesResult;
    }

    // application/pdf → unpdf (embedded text only)
    if (mime === "application/pdf") {
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(bytes);
        const result = await extractText(pdf, { mergePages: true });
        const t: unknown = result.text;
        const raw = typeof t === "string" ? t : Array.isArray(t) ? (t as string[]).join("\n") : "";
        if (raw.trim().length > 0) {
          return {
            raw_text: raw,
            method: "pdf_text" as const,
            warnings:
              result.totalPages > 2
                ? [`PDF شامل ${result.totalPages} صفحه است.`]
                : [],
          } satisfies OcrBytesResult;
        }
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: ["PDF بدون متن embed (احتمالاً اسکن‌شده) — استخراج خودکار ممکن نیست."],
        } satisfies OcrBytesResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: [`خواندن PDF ناموفق بود: ${msg.slice(0, 200)}`],
        } satisfies OcrBytesResult;
      }
    }

    // image/* → vision OCR
    if (mime.startsWith("image/")) {
      // Default ON (Lovable hosted). Self-host operators can opt out by
      // setting OCR_ENABLED=false explicitly on the server.
      const ocrEnabled = (process.env.OCR_ENABLED ?? "true").toLowerCase() === "true";
      if (!ocrEnabled) {
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: [
            "OCR در نسخه self-host غیرفعال است. مدیر باید OCR_ENABLED=true را در سرور فعال کند.",
          ],
        } satisfies OcrBytesResult;
      }
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: ["LOVABLE_API_KEY در سرور تنظیم نشده."],
        } satisfies OcrBytesResult;
      }

      const dataUrl = `data:${mime};base64,${data.base64}`;
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: "You are an OCR engine. Output only raw visible text from the image.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: OCR_PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });

      if (aiResp.status === 429) {
        return {
          raw_text: "",
          method: "image_ocr" as const,
          warnings: ["محدودیت نرخ موتور OCR — بعد دوباره تلاش کنید."],
        } satisfies OcrBytesResult;
      }
      if (aiResp.status === 402) {
        return {
          raw_text: "",
          method: "image_ocr" as const,
          warnings: ["اعتبار موتور OCR کافی نیست."],
        } satisfies OcrBytesResult;
      }
      if (!aiResp.ok) {
        const body = await aiResp.text().catch(() => "");
        console.error(`[ocr-bytes] AI gateway error ${aiResp.status}:`, body.slice(0, 500));
        throw new Response("OCR engine unavailable", { status: 502 });
      }
      const ai = (await aiResp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = ai.choices?.[0]?.message?.content ?? "";
      return {
        raw_text: typeof text === "string" ? text : "",
        method: "image_ocr" as const,
        warnings: [],
      } satisfies OcrBytesResult;
    }

    return {
      raw_text: "",
      method: "unsupported" as const,
      warnings: ["نوع فایل برای استخراج پشتیبانی نمی‌شود."],
    } satisfies OcrBytesResult;
  });