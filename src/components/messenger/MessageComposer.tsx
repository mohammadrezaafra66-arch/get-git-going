import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPreview } from "./AttachmentPreview";
import { AudioRecorder } from "./AudioRecorder";
import {
  ABSOLUTE_MAX_BYTES,
  acceptAttribute,
  getExt,
  getRuleByExt,
} from "@/lib/messenger/attachment-rules";
import { preCheckMessengerAttachment } from "@/lib/messenger/upload.functions";
import { transcribeMessengerAudio } from "@/lib/messenger/transcribe.functions";
import { generateMessageEmbedding } from "@/lib/messenger/embeddings.functions";
import { InquiryButton } from "./InquiryButton";

export function MessageComposer({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preCheck = useServerFn(preCheckMessengerAttachment);
  const transcribe = useServerFn(transcribeMessengerAudio);
  const embed = useServerFn(generateMessageEmbedding);

  const reset = () => {
    setValue("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const send = useMutation({
    mutationFn: async (override: { audioFile?: File } = {}) => {
      const trimmed = value.trim();
      const activeFile = override?.audioFile ?? file;
      if (!activeFile) {
        // مسیر متن خالص (بدون تغییر نسبت به قبل)
        const { data: row, error } = await supabase.rpc("send_messenger_message", {
          p_group_id: groupId,
          p_content: trimmed,
          p_type: "text",
        });
        if (error) throw error;
        // Phase 6: embedding در پس‌زمینه برای جست‌وجوی معنایی (graceful)
        const messageId = (row as { id?: string } | null)?.id;
        if (messageId) {
          void embed({ data: { message_id: messageId } }).catch((e) => {
            console.warn("[messenger] embedding failed:", (e as Error)?.message);
          });
        }
        return;
      }

      // مسیر پیوست
      // 1) اعتبارسنجی کلاینت (سریع)
      const isAudio = (activeFile.type || "").toLowerCase().startsWith("audio/");
      const ext = getExt(activeFile.name);
      const rule = isAudio
        ? { kind: "audio" as const, maxBytes: 25 * 1024 * 1024, label: "صوت" }
        : getRuleByExt(ext);
      if (!rule) throw new Error("نوع فایل مجاز نیست");
      if (activeFile.size > rule.maxBytes) {
        const mb = Math.round(rule.maxBytes / (1024 * 1024));
        throw new Error(`حجم بیش از سقف مجاز برای ${rule.label} است (حداکثر ${mb} مگابایت)`);
      }

      // 2) pre-check سرور-ساید (mime↔ext، عضویت، تولید path امن)
      const pre = await preCheck({
        data: {
          group_id: groupId,
          file_name: activeFile.name,
          mime_type: activeFile.type || "application/octet-stream",
          file_size: activeFile.size,
        },
      });

      // 3) آپلود به Storage
      const { error: upErr } = await supabase.storage
        .from("messenger-attachments")
        .upload(pre.path, activeFile, {
          contentType: activeFile.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);

      // 4) ثبت پیام + رکورد attachment (تراکنشی)
      const p_type =
        pre.kind === "image"
          ? "image"
          : pre.kind === "audio"
            ? "audio"
            : pre.kind === "video"
              ? "video"
              : "file";
      const initialContent = pre.kind === "audio" ? " " : trimmed || " ";
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "send_messenger_message_with_attachment",
        {
          p_group_id: groupId,
          p_content: initialContent,
          p_type,
          p_reply_to: null as unknown as string,
          p_file_path: pre.path,
          p_file_name: activeFile.name,
          p_file_type: activeFile.type || "application/octet-stream",
          p_file_size: activeFile.size,
        },
      );
      if (rpcErr) {
        // cleanup: جلوگیری از orphan
        await supabase.storage.from("messenger-attachments").remove([pre.path]);
        throw new Error(rpcErr.message);
      }

      // 5) STT در پس‌زمینه (fire-and-forget، graceful)
      if (pre.kind === "audio") {
        const messageId = typeof rpcData === "string" ? rpcData : (rpcData as { id?: string } | null)?.id;
        if (messageId) {
          void transcribe({ data: { message_id: messageId } }).catch((e) => {
            console.warn("[messenger] STT failed:", (e as Error)?.message);
          });
        }
      }
    },
    onSuccess: () => {
      reset();
      setRecording(false);
      qc.invalidateQueries({ queryKey: ["messenger-messages", groupId] });
      qc.invalidateQueries({ queryKey: ["messenger-groups"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطا در ارسال پیام";
      toast.error(msg);
    },
  });

  const submit = () => {
    if (send.isPending) return;
    if (!file && !value.trim()) return;
    send.mutate({});
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > ABSOLUTE_MAX_BYTES) {
      toast.error("حجم فایل بیش از سقف کلی (۵۰ مگابایت) است");
      e.target.value = "";
      return;
    }
    const rule = getRuleByExt(getExt(f.name));
    if (!rule) {
      toast.error("نوع فایل مجاز نیست");
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const disabled = send.isPending;
  const canSend = !disabled && (!!file || !!value.trim());

  const handleSendAudio = async (audioFile: File) => {
    await send.mutateAsync({ audioFile });
  };

  return (
    <div className="border-t bg-card p-3">
      {file && (
        <AttachmentPreview
          file={file}
          onRemove={() => {
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          uploading={send.isPending}
        />
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptAttribute()}
          onChange={onFileChange}
          className="hidden"
          aria-hidden
        />
        {recording ? (
          <AudioRecorder
            disabled={disabled}
            sending={send.isPending}
            onSend={handleSendAudio}
            onCancel={() => setRecording(false)}
          />
        ) : (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label="پیوست فایل"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <InquiryButton groupId={groupId} disabled={disabled} />
            <AudioRecorder
              disabled={disabled || !!file || !!value.trim()}
              sending={send.isPending}
              onSend={handleSendAudio}
              onCancel={() => setRecording(false)}
            />
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={4000}
              disabled={disabled}
              placeholder="پیام خود را بنویسید… (Enter ارسال، Shift+Enter خط جدید)"
              className="min-h-10 resize-none"
            />
            <Button onClick={submit} disabled={!canSend} size="icon">
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
