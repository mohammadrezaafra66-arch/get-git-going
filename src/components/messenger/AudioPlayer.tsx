import { useState } from "react";
import { useSignedAttachmentUrl } from "@/hooks/messenger/useSignedAttachmentUrl";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/messenger/attachment-rules";
import type { MessengerAttachment } from "./AttachmentBubble";

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function AudioPlayer({ attachment }: { attachment: MessengerAttachment }) {
  const { data: url, isLoading, isError } = useSignedAttachmentUrl(attachment.file_path);
  const [duration, setDuration] = useState<number | null>(null);

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        خطا در دریافت پیام صوتی
      </div>
    );
  }

  if (isLoading || !url) {
    return <Skeleton className="h-12 w-64 rounded-md" />;
  }

  return (
    <div className="flex max-w-full flex-col gap-1 rounded-md border bg-background/60 p-2">
      <audio
        controls
        preload="metadata"
        src={url}
        onLoadedMetadata={(e) => {
          const d = (e.currentTarget as HTMLAudioElement).duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        className="w-64 max-w-full"
      />
      <div className="px-1 text-[10px] text-muted-foreground" dir="ltr">
        {duration != null ? fmt(duration) : "--:--"}
        {attachment.file_size != null && ` · ${formatBytes(attachment.file_size)}`}
      </div>
    </div>
  );
}