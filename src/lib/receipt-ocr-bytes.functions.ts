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
import { aiVision } from "@/lib/ai/client.server";

export type OcrBytesMethod = "text" | "image_ocr" | "pdf_text" | "unsupported";

export interface OcrBytesResult {
  raw_text: string;
  method: OcrBytesMethod;
  warnings: string[];
  /** SH-RA.2B: explicit disabled discriminator for self-host operators. */
  ok?: boolean;
  disabled?: boolean;
  reason?: string;
}

const ALLOWED_ROLES = new Set(["admin", "accountant"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/** SH-RA.2B: read at runtime so each request reflects live env. */
function isExternalOcrEnabled(): boolean {
  const raw = process.env.EXTERNAL_OCR_ENABLED ?? process.env.OCR_ENABLED ?? "true";
  return String(raw).toLowerCase() === "true";
}
function externalApiTimeoutMs(): number {
  const raw = Number(process.env.EXTERNAL_API_TIMEOUT_MS ?? "15000");
  if (!Number.isFinite(raw) || raw < 15000) return 15000;
  return Math.floor(raw);
}

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
            warnings: result.totalPages > 2 ? [`PDF شامل ${result.totalPages} صفحه است.`] : [],
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
      // SH-RA.2B: self-host gating. Default OFF in production. Read at request time.
      if (!isExternalOcrEnabled()) {
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: [
            "OCR در نسخه self-host غیرفعال است. مدیر باید OCR_ENABLED=true را در سرور فعال کند.",
          ],
          ok: false,
          disabled: true,
          reason: "ocr_disabled",
        } satisfies OcrBytesResult;
      }
      // Shared client, which only ever picks a provider that DECLARES vision.
      // The LAN Ollama deliberately does not: the 2026-07-24 probe showed
      // qwen3.6 reads Persian prose perfectly but misreads Persian digits
      // reproducibly (45,000,000 read as 25,000,000). Receipt OCR therefore
      // stays on a keyed provider, enforced by the registry, not by a branch.
      //
      // The safety property is unchanged either way: this output is only ever
      // a SUGGESTION. PaymentReceiptForm fills empty fields with it, leaves
      // anything the accountant typed alone, and nothing is written to a
      // financial record until the accountant submits the form.
      const vision = await aiVision({
        prompt: OCR_PROMPT,
        imageBase64: data.base64,
        mimeType: mime,
        timeoutMs: externalApiTimeoutMs(),
      });

      if (!vision.ok) {
        if (vision.reason === "no_provider") {
          return {
            raw_text: "",
            method: "unsupported" as const,
            warnings: ["موتور OCR تصویری در این محیط فعال نیست."],
            ok: false,
            disabled: true,
            reason: "ocr_disabled",
          } satisfies OcrBytesResult;
        }
        return {
          raw_text: "",
          method: "image_ocr" as const,
          warnings: [vision.messageFa],
          ok: false,
          reason: vision.reason === "timeout" ? "ocr_timeout" : "ocr_network_error",
        } satisfies OcrBytesResult;
      }

      return {
        raw_text: vision.value,
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
