// Phase 5 — STT با Whisper self-hosted (graceful fallback)
// خروجی همیشه { ok, reason? } — هرگز throw نمی‌کند تا UX ارسال قطع نشود.
import { createServerFn } from "@tanstack/react-start";
// Node-20-safe wrapper — see messenger-auth-middleware.ts for rationale.
import { requireSupabaseAuthNode20 as requireSupabaseAuth } from "@/integrations/supabase/messenger-auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const inputSchema = z.object({
  message_id: z.string().uuid({ message: "شناسه پیام نامعتبر است" }),
});

type Result = { ok: boolean; reason?: string };

const TIMEOUT_MS = 90_000;

export const transcribeMessengerAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<Result> => {
    const ctx = context as { userId: string; supabase: SupabaseClient };
    const { userId, supabase } = ctx;

    const apiUrl = process.env.WHISPER_API_URL?.trim();
    if (!apiUrl) {
      return { ok: false, reason: "disabled" };
    }
    const apiKey = process.env.WHISPER_API_KEY?.trim() || "";
    const model = process.env.WHISPER_MODEL?.trim() || "whisper-1";

    try {
      // 1) پیام و sender را اعتبارسنجی کن
      const { data: msg, error: msgErr } = await supabase
        .from("messenger_messages")
        .select("id, sender_id, type")
        .eq("id", data.message_id)
        .maybeSingle();
      if (msgErr || !msg) return { ok: false, reason: "not_found" };
      if (msg.sender_id !== userId) return { ok: false, reason: "forbidden" };

      // 2) attachment را بگیر
      const { data: att, error: attErr } = await supabase
        .from("messenger_attachments")
        .select("file_path, file_type, file_size")
        .eq("message_id", data.message_id)
        .limit(1)
        .maybeSingle();
      if (attErr || !att) return { ok: false, reason: "no_attachment" };

      // 3) دانلود از Storage
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("messenger-attachments")
        .download(att.file_path);
      if (dlErr || !fileBlob) return { ok: false, reason: "download_failed" };

      // 4) ارسال به Whisper (OpenAI-compatible)
      const form = new FormData();
      const filename = att.file_path.split("/").pop() || "voice.webm";
      form.append("file", fileBlob, filename);
      form.append("model", model);
      form.append("language", "fa");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let transcript = "";
      try {
        const url = apiUrl.replace(/\/+$/, "") + "/v1/audio/transcriptions";
        const headers: Record<string, string> = {};
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn("[whisper] non-OK", res.status);
          return { ok: false, reason: `http_${res.status}` };
        }
        const json = (await res.json()) as { text?: string };
        transcript = (json?.text ?? "").trim();
      } catch (e) {
        const reason = (e as Error)?.name === "AbortError" ? "timeout" : "fetch_failed";
        console.warn("[whisper] fetch error:", reason);
        return { ok: false, reason };
      } finally {
        clearTimeout(timer);
      }

      if (!transcript) return { ok: false, reason: "empty_transcript" };

      // 5) به‌روزرسانی content پیام (محدود به sender خود)
      const { error: upErr } = await supabase
        .from("messenger_messages")
        .update({ content: transcript })
        .eq("id", data.message_id)
        .eq("sender_id", userId);
      if (upErr) {
        console.warn("[whisper] update failed:", upErr.message);
        return { ok: false, reason: "update_failed" };
      }

      return { ok: true };
    } catch (e) {
      console.warn("[whisper] unexpected:", (e as Error)?.message);
      return { ok: false, reason: "unexpected" };
    }
  });