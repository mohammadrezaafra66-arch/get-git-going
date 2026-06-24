import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Send, Loader2, Play, Pause } from "lucide-react";
import { toast } from "sonner";

const MAX_SECONDS = 5 * 60;
const MIN_BYTES = 1024;

function pickMimeType(): { mime: string; ext: string } | null {
  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "mp4" },
    { mime: "audio/mp4;codecs=mp4a.40.2", ext: "mp4" },
  ];
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export type AudioRecorderProps = {
  disabled?: boolean;
  sending?: boolean;
  onSend: (file: File) => Promise<void> | void;
  onCancel: () => void;
};

export function AudioRecorder({ disabled, sending, onSend, onCancel }: AudioRecorderProps) {
  const [mode, setMode] = useState<"idle" | "recording" | "recorded">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [supported] = useState<boolean>(() => pickMimeType() !== null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pickedRef = useRef<{ mime: string; ext: string } | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
      try {
        recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      } catch {
        // ignore
      }
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    const picked = pickMimeType();
    if (!picked) {
      toast.error("مرورگر شما از ضبط صدا پشتیبانی نمی‌کند");
      return;
    }
    pickedRef.current = picked;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: picked.mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const out = new Blob(chunksRef.current, { type: picked.mime.split(";")[0] });
        stopStream();
        clearTimer();
        if (out.size < MIN_BYTES) {
          toast.error("ضبط خالی است؛ دوباره تلاش کنید");
          setMode("idle");
          setSeconds(0);
          setBlob(null);
          return;
        }
        const url = URL.createObjectURL(out);
        setBlob(out);
        setPreviewUrl(url);
        setMode("recorded");
      };
      recorderRef.current = rec;
      rec.start();
      setMode("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_SECONDS) {
            try {
              recorderRef.current?.stop();
            } catch {
              // ignore
            }
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      stopStream();
      const msg = err instanceof Error ? err.message : "";
      if (/denied|NotAllowed/i.test(msg)) {
        toast.error("دسترسی به میکروفون رد شد");
      } else if (/NotFound/i.test(msg)) {
        toast.error("میکروفونی یافت نشد");
      } else {
        toast.error("شروع ضبط ناموفق بود");
      }
      setMode("idle");
    }
  };

  const stopRecording = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
  };

  const discard = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setSeconds(0);
    setMode("idle");
    onCancel();
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  };

  const handleSend = async () => {
    if (!blob || !pickedRef.current) return;
    const ext = pickedRef.current.ext;
    const mime = pickedRef.current.mime.split(";")[0];
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
    await onSend(file);
  };

  if (mode === "idle") {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || !supported}
        onClick={startRecording}
        aria-label="ضبط پیام صوتی"
        title={supported ? "ضبط پیام صوتی" : "مرورگر شما از ضبط صدا پشتیبانی نمی‌کند"}
      >
        <Mic className="h-4 w-4" />
      </Button>
    );
  }

  if (mode === "recording") {
    return (
      <div className="flex flex-1 items-center justify-between gap-2 rounded-md border bg-destructive/5 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
          <span>در حال ضبط…</span>
          <span dir="ltr" className="tabular-nums">
            {fmt(seconds)} / {fmt(MAX_SECONDS)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" onClick={discard} aria-label="لغو">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="destructive" onClick={stopRecording} aria-label="توقف">
            <Square className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // recorded
  return (
    <div className="flex flex-1 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={togglePlay}
          aria-label={playing ? "توقف پخش" : "پخش"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span dir="ltr" className="tabular-nums text-muted-foreground">
          {fmt(seconds)}
        </span>
        {previewUrl && (
          <audio
            ref={audioRef}
            src={previewUrl}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={discard}
          disabled={sending}
          aria-label="حذف"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" onClick={handleSend} disabled={sending} aria-label="ارسال">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}