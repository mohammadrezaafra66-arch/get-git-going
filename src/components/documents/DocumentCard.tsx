import { useEffect, useState } from "react";
import { Download, CheckCircle2, XCircle, FileText, Clock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  documentTypeLabel,
  documentStatusLabel,
  documentStatusBadgeClass,
  formatFileSize,
  toPersianDigits,
} from "@/lib/documents/labels";
import {
  getSignedDocumentUrl,
  type DocumentRow,
} from "@/hooks/documents/useDocuments";

function useNow(intervalMs: number, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "مهلت تمام شد";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${toPersianDigits(m)}:${toPersianDigits(String(s).padStart(2, "0"))}`;
}

const DEADLINE_WINDOW_MS = 10 * 60 * 1000; // فرض: ۱۰ دقیقه از زمان آپلود

export function DocumentCard({ document }: { document: DocumentRow }) {
  const isPending = document.status === "pending_review";
  const now = useNow(30_000, isPending);

  const deadlineTs = new Date(document.review_deadline).getTime();
  const remaining = Math.max(0, deadlineTs - now);
  const percentLeft = Math.min(100, Math.max(0, (remaining / DEADLINE_WINDOW_MS) * 100));

  let barClass = "bg-green-500";
  if (remaining <= 2 * 60 * 1000) barClass = "bg-red-500";
  else if (remaining <= 5 * 60 * 1000) barClass = "bg-amber-500";

  const handleDownload = async () => {
    try {
      const url = await getSignedDocumentUrl(document.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(`دانلود ناموفق: ${(e as Error).message}`);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4" dir="rtl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{documentTypeLabel(document.type)}</Badge>
              <Badge
                variant="outline"
                className={documentStatusBadgeClass(document.status)}
              >
                {documentStatusLabel(document.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate" title={document.file_name}>
                {document.file_name}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatFileSize(document.file_size)} •{" "}
              {formatJalaliDateTime(document.created_at)}
            </div>
            {document.uploader_name && (
              <div className="text-xs text-muted-foreground">
                آپلودکننده: {document.uploader_name}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={handleDownload}>
            <Download className="ml-1 h-4 w-4" />
            دانلود
          </Button>
        </div>

        {isPending && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                مهلت تأیید
              </span>
              <span className="font-mono">{formatRemaining(remaining)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${barClass}`}
                style={{ width: `${percentLeft}%` }}
              />
            </div>
          </div>
        )}

        {document.status === "confirmed" && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-2 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              تأیید توسط {document.reviewer_name ?? "—"}
              {document.reviewed_at &&
                ` • ${formatJalaliDateTime(document.reviewed_at)}`}
            </span>
          </div>
        )}

        {document.status === "rejected" && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              <div>
                رد توسط {document.reviewer_name ?? "—"}
                {document.reviewed_at &&
                  ` • ${formatJalaliDateTime(document.reviewed_at)}`}
              </div>
              {document.notes && <div>یادداشت: {document.notes}</div>}
            </div>
          </div>
        )}

        {document.status === "expired" && (
          <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            مهلت تأیید این سند منقضی شد.
          </div>
        )}

        {document.notes && document.status !== "rejected" && (
          <div className="rounded-md bg-muted/40 p-2 text-xs">{document.notes}</div>
        )}
      </CardContent>
    </Card>
  );
}