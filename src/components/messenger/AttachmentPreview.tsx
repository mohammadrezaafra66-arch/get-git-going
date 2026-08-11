import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileIcon, FileImage, FileVideo, FileText, X } from "lucide-react";
import { formatBytes, getExt, getRuleByExt, type AttachmentKind } from "@/lib/messenger/attachment-rules";

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

export function AttachmentPreview({
  file,
  onRemove,
  uploading,
}: {
  file: File;
  onRemove: () => void;
  uploading: boolean;
}) {
  const ext = getExt(file.name);
  const rule = getRuleByExt(ext);
  const Icon = iconFor(rule?.kind ?? null);

  return (
    <div className="mb-2 rounded-md border bg-muted/40 p-2">
      <div className="flex items-center gap-2">
        <Icon className="h-8 w-8 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.name}</div>
          <div className="text-xs text-muted-foreground">
            {rule?.label ?? "نامشخص"} · {formatBytes(file.size)}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onRemove}
          disabled={uploading}
          aria-label="حذف فایل"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {uploading && (
        <div className="mt-2">
          {/* SDK Supabase JS v2 progress استاندارد ندارد — حالت indeterminate */}
          <Progress value={undefined} className="h-1" />
          <div className="mt-1 text-[10px] text-muted-foreground">در حال آپلود…</div>
        </div>
      )}
    </div>
  );
}
