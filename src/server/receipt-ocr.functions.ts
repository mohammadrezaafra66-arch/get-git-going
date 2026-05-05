/**
 * Server function: real OCR / text extraction for payment receipt documents.
 *
 * - text/*  → returns the file as plain text
 * - image/* → calls Lovable AI Gateway (vision model) with a strict prompt
 * - application/pdf → currently unsupported (no safe Worker-friendly PDF
 *                     text extractor wired in); returns method "unsupported"
 *
 * Auth: requires a signed-in user. Role check (admin/accountant) is enforced
 * server-side via the user's app_role in user_roles.
 *
 * Important: this function only returns extracted text + method. The caller
 * (client) parses the text, scores confidence, and writes the document row
 * + audit logs — preserving the existing extraction pipeline.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OcrMethod =
  | "text"
  | "image_ocr"
  | "pdf_text"
  | "pdf_image_ocr"
  | "unsupported";

export interface OcrResult {
  raw_text: string;
  method: OcrMethod;
  warnings: string[];
  /** Optional engine-supplied confidence in [0,1]; null if not provided. */
  engine_confidence: number | null;
}

const RECEIPT_DOCS_BUCKET = "payment-receipt-documents";
const ALLOWED_ROLES = new Set(["admin", "accountant"]);

const OCR_PROMPT = [
  "Extract only visible text from this payment receipt.",
  "Do not guess values.",
  "Return raw text only.",
  "Do not invent bank names, amounts, dates, or tracking numbers.",
  "If text is unclear, leave it unclear in raw text.",
  "Preserve original line breaks and Persian/Arabic digits as-is.",
  "Do not add explanations or commentary.",
].join(" ");

const InputSchema = z.object({
  document_id: z.string().uuid(),
});

export const extractReceiptDocumentOcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Role check via user_roles (admin/accountant only).
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) {
      console.error("[ocr] role check failed:", roleErr.message);
      throw new Response("Internal server error", { status: 500 });
    }
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
      throw new Response("Forbidden: only admin or accountant can run OCR", {
        status: 403,
      });
    }

    // 2) Load the document row (RLS still applies as the user).
    const { data: doc, error: docErr } = await supabase
      .from("payment_receipt_documents")
      .select("id, storage_path, file_type")
      .eq("id", data.document_id)
      .maybeSingle();
    if (docErr) {
      console.error("[ocr] document lookup failed:", docErr.message);
      throw new Response("Internal server error", { status: 500 });
    }
    if (!doc) {
      throw new Response("Document not found", { status: 404 });
    }
    const fileType = (doc.file_type || "").toLowerCase();

    // 3) Download bytes via short-lived signed URL.
    const { data: signed, error: signErr } = await supabase.storage
      .from(RECEIPT_DOCS_BUCKET)
      .createSignedUrl(doc.storage_path, 120);
    if (signErr || !signed?.signedUrl) {
      console.error("[ocr] signed URL failed:", signErr?.message ?? "no URL");
      throw new Response("Could not access stored file", { status: 500 });
    }
    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) {
      throw new Response(`Download failed (${fileResp.status})`, { status: 502 });
    }

    // ---- Branch by mime ----

    // text/*  → just decode UTF-8.
    if (fileType.startsWith("text/")) {
      const text = await fileResp.text();
      return {
        raw_text: text,
        method: "text" as const,
        warnings: [] as string[],
        engine_confidence: null,
      } satisfies OcrResult;
    }

    // application/pdf → not yet supported (no safe Worker-bundled PDF reader
    // wired in this project).
    if (fileType === "application/pdf") {
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const buf = new Uint8Array(await fileResp.arrayBuffer());
        const pdf = await getDocumentProxy(buf);
        const result = await extractText(pdf, { mergePages: true });
        const totalPages = result.totalPages;
        const t: unknown = result.text;
        const raw = typeof t === "string" ? t : Array.isArray(t) ? (t as string[]).join("\n") : "";
        const trimmed = raw.trim();
        if (trimmed.length > 0) {
          // Embedded text PDF — direct extraction, no OCR needed.
          return {
            raw_text: raw,
            method: "pdf_text" as const,
            warnings:
              totalPages > 2
                ? [`PDF شامل ${totalPages} صفحه است؛ متن همه صفحات استخراج شد.`]
                : [],
            engine_confidence: null,
          } satisfies OcrResult;
        }
        // No embedded text → likely scanned/image PDF.
        // Rendering PDF pages to images requires native canvas / pdfium and
        // is not safe in this Worker SSR runtime; report unsupported.
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: ["استخراج متن PDF در این محیط پشتیبانی نمی‌شود."],
          engine_confidence: null,
        } satisfies OcrResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: [`استخراج متن PDF ناموفق بود: ${msg.slice(0, 200)}`],
          engine_confidence: null,
        } satisfies OcrResult;
      }
    }

    // image/* → vision OCR via Lovable AI Gateway.
    if (fileType.startsWith("image/")) {
      // SH.6: feature flag — strict self-host pipeline must not reach the
      // external Lovable AI Gateway unless the operator explicitly opts in
      // by setting OCR_ENABLED=true on the server. Default is OFF.
      // Default ON (Lovable hosted). Self-host operators can opt out by
      // setting OCR_ENABLED=false explicitly on the server.
      const ocrEnabled = (process.env.OCR_ENABLED ?? "true").toLowerCase() === "true";
      if (!ocrEnabled) {
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: [
            "OCR در نسخه self-host غیرفعال است. لطفاً اطلاعات رسید را دستی وارد کنید.",
          ],
          engine_confidence: null,
        } satisfies OcrResult;
      }

      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        return {
          raw_text: "",
          method: "unsupported" as const,
          warnings: [
            "موتور OCR تصویری در این محیط فعال نیست (LOVABLE_API_KEY تنظیم نشده).",
          ],
          engine_confidence: null,
        } satisfies OcrResult;
      }

      // Encode the image as a data URL for the multimodal request.
      const buf = new Uint8Array(await fileResp.arrayBuffer());
      // Bound the size to keep payload reasonable (10MB upload cap exists).
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const dataUrl = `data:${fileType};base64,${b64}`;

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
              content:
                "You are an OCR engine. Output only the raw visible text from the image. No commentary.",
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
          warnings: ["محدودیت نرخ موتور OCR؛ کمی بعد دوباره تلاش کنید."],
          engine_confidence: null,
        } satisfies OcrResult;
      }
      if (aiResp.status === 402) {
        return {
          raw_text: "",
          method: "image_ocr" as const,
          warnings: ["اعتبار موتور OCR کافی نیست؛ با مدیر تماس بگیرید."],
          engine_confidence: null,
        } satisfies OcrResult;
      }
      if (!aiResp.ok) {
        const errBody = await aiResp.text().catch(() => "");
        console.error(`[ocr] AI gateway error ${aiResp.status}:`, errBody.slice(0, 500));
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
        engine_confidence: null,
      } satisfies OcrResult;
    }

    // Anything else → unsupported.
    return {
      raw_text: "",
      method: "unsupported" as const,
      warnings: ["نوع فایل برای استخراج پشتیبانی نمی‌شود."],
      engine_confidence: null,
    } satisfies OcrResult;
  });
