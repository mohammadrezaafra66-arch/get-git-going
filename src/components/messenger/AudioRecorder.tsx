import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Send, Loader2, Play, Pause } from "lucide-react";
import { toast } from "sonner";

const MAX_SECONDS = 5 * 60;
const MIN_BYTES = 1024;

function getBrowserRecordingIssue(): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  if (!window.isSecureContext) {
    return "ضبط صدا در مرورگر فقط روی HTTPS یا localhost فعال است؛ آدرس LAN فعلی امن نیست.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "مرورگر یا تنظیمات امنیتی صفحه اجازه دسترسی به میکروفون را نمی‌دهد.";
  }
  if (typeof MediaRecorder === "undefined") {
    return "مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.";
  }
  if (!pickMimeType()) {
    return "فرمت ضبط صدای پشتیبانی‌شده‌ای در این مرورگر پیدا نشد.";
  }
  return null;
}

function recorderStartErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : "";
  const text = `${name} ${message}`;

  if (/NotAllowedError|PermissionDeniedError|denied|permission/i.test(text)) {
    return "دسترسی به میکروفون رد شد؛ اجازه Microphone را در مرورگر فعال کنید.";
  }
  if (/SecurityError|Only secure origins|secure/i.test(text)) {
    return "ضبط صدا فقط روی HTTPS یا localhost مجاز است؛ آدرس LAN فعلی امن نیست.";
  }
  if (/NotFoundError|DevicesNotFoundError/i.test(text)) {
    return "میکروفونی روی این دستگاه پیدا نشد.";
  }
  if (/NotReadableError|TrackStartError|AbortError/i.test(text)) {
    return "میکروفون در دسترس نیست؛ ممکن است توسط برنامه دیگری در حال استفاده باشد.";
  }
  if (/NotSupportedError|mimeType/i.test(text)) {
    return "فرمت ضبط صدا در این مرورگر پشتیبانی نمی‌شود.";
  }
  return "شروع ضبط ناموفق بود؛ صفحه را با HTTPS یا localhost باز کنید و دسترسی میکروفون را بررسی کنید.";
}

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
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
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
  const [supportIssue, setSupportIssue] = useState<string | null>(null);

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
    setSupportIssue(getBrowserRecordingIssue());

    return () => {
      clearTimer();
      try {
        if (recorderRef.current?.state !== "inactive") {
          recorderRef.current?.stop();
        }
      } catch {
        // ignore
      }
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    const issue = getBrowserRecordingIssue();
    if (issue) {
      setSupportIssue(issue);
      toast.error(issue);
      return;
    }

    const picked = pickMimeType();
    if (!picked) {
      toast.error("مرورگر شما از ضبط صدا پشتیبانی نمی‌کند");
      return;
    }
    pickedRef.current = picked;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const hasAudioTrack = stream.getAudioTracks().some((track) => track.readyState === "live");
      if (!hasAudioTrack) {
        stopStream();
        toast.error("میکروفون فعال نیست؛ دوباره تلاش کنید");
        return;
      }

      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, { mimeType: picked.mime });
      } catch {
        rec = new MediaRecorder(stream);
      }
      const recorderMime = rec.mimeType || picked.mime;
      pickedRef.current = {
        mime: recorderMime,
        ext: recorderMime.includes("mp4") ? "mp4" : "webm",
      };
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const out = new Blob(chunksRef.current, { type: recorderMime.split(";")[0] });
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
      const message = recorderStartErrorMessage(err);
      console.warn("[messenger] audio recording start failed", {
        name: err instanceof Error ? err.name : undefined,
        message: err instanceof Error ? err.message : undefined,
        secureContext: typeof window !== "undefined" ? window.isSecureContext : undefined,
        hasMediaDevices:
          typeof navigator !== "undefined"
            ? Boolean(navigator.mediaDevices?.getUserMedia)
            : undefined,
      });
      toast.error(message);
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
        disabled={disabled}
        onClick={startRecording}
        aria-label="ضبط پیام صوتی"
        title={supportIssue ?? "ضبط پیام صوتی"}
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
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={stopRecording}
            aria-label="توقف"
          >
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
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={sending}
          aria-label="ارسال"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
