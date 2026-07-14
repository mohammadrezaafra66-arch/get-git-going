// Phase 4 — pre-check سرور-ساید قبل از آپلود به Storage.
// جبران فقدان allowed_mime_types روی bucket: ext/mime/size + عضویت گروه
// + تولید path امن {userId}/{uuid}.{ext}.
import { createServerFn } from "@tanstack/react-start";
// Node-20-safe wrapper: disables Realtime inside the per-request Supabase
// client so `createClient(...)` does not throw the native-WebSocket error
// during messenger attachment pre-check on self-host.
import { requireSupabaseAuthNode20 as requireSupabaseAuth } from "@/integrations/supabase/messenger-auth-middleware";
import { z } from "zod";
import {
  ABSOLUTE_MAX_BYTES,
  getExt,
  getRuleByExt,
  getRuleByExtAndMime,
  mimeMatchesRule,
} from "@/lib/messenger/attachment-rules";
import type { SupabaseClient } from "@supabase/supabase-js";

const inputSchema = z.object({
  group_id: z.string().uuid({ message: "شناسه گروه نامعتبر است" }),
  file_name: z.string().min(1).max(200),
  mime_type: z.string().min(1).max(120),
  file_size: z.number().int().positive().max(ABSOLUTE_MAX_BYTES),
});

export const preCheckMessengerAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as { userId: string; supabase: SupabaseClient };
    const { userId, supabase } = ctx;

    // 1) عضویت کاربر در گروه
    const { data: isMember, error: memErr } = await supabase.rpc(
      "is_messenger_group_member",
      { _group_id: data.group_id, _user_id: userId },
    );
    if (memErr) throw new Error("بررسی عضویت ناموفق بود");
    if (!isMember) throw new Error("شما عضو این گروه نیستید");

    // 2) ext در allow-list
    const ext = getExt(data.file_name);
    if (!ext) throw new Error("فایل بدون پسوند مجاز نیست");
    // برای audio (mime با audio/ شروع می‌شود) قانون صوتی انتخاب شود
    const rule = data.mime_type.toLowerCase().startsWith("audio/")
      ? getRuleByExtAndMime(ext, data.mime_type)
      : getRuleByExt(ext);
    if (!rule) throw new Error("نوع فایل مجاز نیست");

    // 3) mime ↔ ext match
    if (!mimeMatchesRule(rule, data.mime_type)) {
      throw new Error("نوع MIME با پسوند فایل سازگار نیست");
    }

    // 4) size per-type
    if (data.file_size > rule.maxBytes) {
      const mb = Math.round(rule.maxBytes / (1024 * 1024));
      throw new Error(`حجم بیش از سقف مجاز برای ${rule.label} است (حداکثر ${mb} مگابایت)`);
    }

    // 5) path امن
    const uuid = crypto.randomUUID();
    const path = `${userId}/${uuid}.${ext}`;

    return { ok: true as const, path, kind: rule.kind, ext };
  });
