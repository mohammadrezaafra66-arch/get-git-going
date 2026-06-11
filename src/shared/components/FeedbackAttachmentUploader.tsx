import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Mic, Paperclip, Square, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "feedback-attachments";
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILES = 5;
const ALLOWED = /^(image\/|video\/|audio\/)/;

export interface FeedbackAttachment {
  path: string;
  mime_type: string;
  size: number;
  name: string;
  previewUrl?: string;
}

interface Props {
  userId: string;
  value: FeedbackAttachment[];
  onChange: (next: FeedbackAttachment[]) => void;
  disabled?: boolean;
}

function kindOf(mime: string): "image" | "video" | "audio" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}

export function FeedbackAttachmentUploader({ userId, value, onChange, disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try { recorderRef.current.stop(); } catch { /* noop */ }
      }
    };
  }, []);

  const uploadFile = async (file: File | Blob, originalName: string, mime: string) => {
    if (value.length >= MAX_FILES) {
      toast.error(`حداکثر ${MAX_FILES} پیوست مجاز است`);
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("حجم فایل بیش از ۲۵ مگابایت است");
      return;
    }
    if (!ALLOWED.test(mime)) {
      toast.error("فقط عکس، ویدیو یا صدا مجاز است");
      return;
    }

    setUploading(true);
    try {
      const ext = originalName.includes(".")
        ? originalName.split(".").pop()
        : mime.split("/")[1] ?? "bin";
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${userId}/${safeName}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: mime, upsert: false });
      if (error) throw error;

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60);

      onChange([
        ...value,
        {
          path,
          mime_type: mime,
          size: file.size,
          name: originalName,
          previewUrl: signed?.signedUrl,
        },
      ]);
      toast.success("پیوست بارگذاری شد");
    } catch (e) {
      console.error(e);
      toast.error("بارگذاری ناموفق بود");
    } finally {
      setUploading(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      await uploadFile(f, f.name, f.type || "application/octet-stream");
    }
  };

  const removeAttachment = async (idx: number) => {
    const att = value[idx];
    try {
      await supabase.storage.from(BUCKET).remove([att.path]);
    } catch (e) {
      console.error(e);
    }
    onChange(value.filter((_, i) => i !== idx));
  };

  const startRecording = async () => {
    if (value.length >= MAX_FILES) {
      toast.error(`حداکثر ${MAX_FILES} پیوست مجاز است`);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        setRecordSeconds(0);
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        await uploadFile(blob, `voice_${Date.now()}.webm`, blob.type);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (e) {
      console.error(e);
      toast.error("دسترسی به میکروفون امکان‌پذیر نیست");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <div className="space-y-3">
      <Label>پیوست‌ها (عکس / ویدیو / صدا) — حداکثر ۵ فایل، هرکدام تا ۲۵ مگابایت</Label>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />

        <Button
          type="button" variant="outline" size="sm"
          disabled={disabled || uploading || recording}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="ms-1 h-4 w-4" /> عکس / ویدیو
        </Button>
        <Button
          type="button" variant="outline" size="sm"
          disabled={disabled || uploading || recording}
          onClick={() => audioInputRef.current?.click()}
        >
          <Paperclip className="ms-1 h-4 w-4" /> فایل صوتی
        </Button>
        {!recording ? (
          <Button
            type="button" variant="outline" size="sm"
            disabled={disabled || uploading}
            onClick={startRecording}
          >
            <Mic className="ms-1 h-4 w-4" /> ضبط ویس
          </Button>
        ) : (
          <Button
            type="button" variant="destructive" size="sm"
            onClick={stopRecording}
          >
            <Square className="ms-1 h-4 w-4" /> توقف ({recordSeconds}s)
          </Button>
        )}
        {uploading && (
          <span className="flex items-center text-xs text-muted-foreground">
            <Loader2 className="ms-1 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </span>
        )}
      </div>

      {value.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {value.map((a, i) => {
            const k = kindOf(a.mime_type);
            return (
              <li key={a.path} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="truncate text-xs font-medium" title={a.name}>{a.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {(a.size / 1024 / 1024).toFixed(2)} MB · {a.mime_type}
                  </div>
                  {a.previewUrl && k === "image" && (
                    <img src={a.previewUrl} alt={a.name} className="mt-1 h-20 w-auto rounded object-cover" />
                  )}
                  {a.previewUrl && k === "video" && (
                    <video src={a.previewUrl} controls className="mt-1 h-24 w-full rounded" />
                  )}
                  {a.previewUrl && k === "audio" && (
                    <audio src={a.previewUrl} controls className="mt-1 w-full" />
                  )}
                </div>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => removeAttachment(i)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}