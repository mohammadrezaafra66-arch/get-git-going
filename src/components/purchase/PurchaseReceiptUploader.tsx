import { useRef, useState } from "react";
import { Upload, Loader2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  usePurchaseReceipts,
  useUploadPurchaseReceipt,
  getSignedReceiptUrl,
} from "@/hooks/purchase/usePurchase";
import { toPersianDigits } from "@/lib/purchase/labels";
import { CameraCaptureButton } from "@/shared/components/CameraCaptureButton";

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${toPersianDigits(n)} B`;
  if (n < 1024 * 1024) return `${toPersianDigits((n / 1024).toFixed(1))} KB`;
  return `${toPersianDigits((n / 1024 / 1024).toFixed(2))} MB`;
}

export function PurchaseReceiptUploader({ requestId }: { requestId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Phase 8.4: 0–100 while the file is in flight. */
  const [percent, setPercent] = useState(0);
  /** Phase 8.4: the last failed file, so «تلاش دوباره» can resend it. */
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const { data: receipts = [], isLoading } = usePurchaseReceipts(requestId);
  const upload = useUploadPurchaseReceipt();

  const handleFile = (file: File) => {
    setPercent(0);
    setFailedFile(null);
    upload.mutate(
      { request_id: requestId, file, onProgress: (p) => setPercent(p.percent) },
      {
        // The hook already toasts the reason; this only keeps the file around
        // so the user does not have to re-photograph a receipt after a drop-out.
        onError: () => setFailedFile(file),
        onSettled: () => setPercent(0),
      },
    );
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onDownload = async (path: string) => {
    try {
      const url = await getSignedReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(`دانلود ناموفق: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
        ].join(" ")}
      >
        {upload.isPending ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {percent > 0 ? `در حال آپلود… ٪${percent}` : "در حال آپلود..."}
            </p>
            <div
              className="h-1.5 w-full max-w-xs overflow-hidden rounded bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm">برای انتخاب فایل کلیک کنید یا فایل را اینجا رها کنید</p>
            <p className="text-xs text-muted-foreground">
              فرمت‌های مجاز: JPG, PNG, PDF — حداکثر ۱۰ مگابایت
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={onPick}
        />
      </div>

      {/* Phase 8.4 — retry. The helper already retried transient failures
          internally; this is the manual path for when it exhausted them, so a
          weak connection does not cost the user another trip to the receipt. */}
      {failedFile && !upload.isPending ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
          <span className="truncate text-xs text-muted-foreground">
            ارسال «{failedFile.name}» ناموفق بود.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => handleFile(failedFile)}>
            تلاش دوباره
          </Button>
        </div>
      ) : null}

      <div className="flex justify-center">
        <CameraCaptureButton
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          disabled={upload.isPending}
          onFiles={(files) => {
            const f = files?.[0];
            if (f) handleFile(f);
          }}
          testId="purchase-receipt-camera"
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">رسیدهای آپلودشده</div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> بارگذاری...
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز رسیدی آپلود نشده است.</p>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-sm">{r.file_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(r.file_size)} • {formatJalaliDateTime(r.created_at)}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(r.storage_path)}
                  >
                    <Download className="ml-1 h-4 w-4" />
                    دانلود
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
