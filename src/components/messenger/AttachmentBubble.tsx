import { useSignedAttachmentUrl } from "@/hooks/messenger/useSignedAttachmentUrl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileIcon, FileImage, FileVideo, FileText, Download } from "lucide-react";
import { formatBytes, getExt, getRuleByExt, type AttachmentKind } from "@/lib/messenger/attachment-rules";

export type MessengerAttachment = {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
};

function iconFor(kind: AttachmentKind | null) {
  switch (kind) {
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "pdf":
    case "word":
    case "excel":
      return FileText;
    default:
      return FileIcon;
  }
}

export function AttachmentBubble({ attachment }: { attachment: MessengerAttachment }) {
  const { data: url, isLoading, isError } = useSignedAttachmentUrl(attachment.file_path);
  const ext = getExt(attachment.file_name);
  const rule = getRuleByExt(ext);
  const kind = rule?.kind ?? null;
  const Icon = iconFor(kind);

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        خطا در دریافت فایل
      </div>
    );
  }

  if (kind === "image") {
    if (isLoading || !url) return <Skeleton className="h-40 w-56 rounded-md" />;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={attachment.file_name}
          loading="lazy"
          className="max-h-64 max-w-full rounded-md border object-cover"
        />
      </a>
    );
  }

  // ویدئو و سایر فایل‌ها: کارت دانلود
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background/60 p-2">
      <Icon className="h-8 w-8 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{attachment.file_name}</div>
        <div className="text-xs text-muted-foreground">
          {rule?.label ?? attachment.file_type ?? "فایل"}
          {attachment.file_size != null && ` · ${formatBytes(attachment.file_size)}`}
        </div>
      </div>
      {isLoading || !url ? (
        <Skeleton className="h-8 w-8 rounded-md" />
      ) : (
        <Button asChild size="icon" variant="ghost" aria-label="دانلود">
          <a href={url} target="_blank" rel="noopener noreferrer" download={attachment.file_name}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
      )}
    </div>
  );
}
