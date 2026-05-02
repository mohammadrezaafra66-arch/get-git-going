import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, Trash2, FileText, Image as ImageIcon, ExternalLink, X, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole, type AppRole } from "@/lib/rbac/roles";
import { toFaDigits } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  extractRawText,
  parseReceiptText,
  scoreExtraction,
  decideStatus,
  type ReceiptExtractionResult,
  type DocumentChannel,
} from "@/lib/accounting/receipt-extraction";

export const RECEIPT_DOCS_BUCKET = "payment-receipt-documents";
export const ALLOWED_DOC_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
] as const;
export const ALLOWED_DOC_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.txt,image/jpeg,image/png,image/webp,application/pdf,text/plain";
export const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_DOC_COUNT = 5;

export type ReceiptDocumentRow = {
  id: string;
  receipt_id: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
  extraction_status: "pending" | "extracted" | "needs_review" | "failed";
  extracted_data: unknown | null;
  extraction_confidence: number | null;
  extraction_notes: string | null;
};

const EXTRACTION_STATUS_LABELS: Record<ReceiptDocumentRow["extraction_status"], string> = {
  pending: "در انتظار استخراج",
  extracted: "استخراج‌شده",
  needs_review: "نیازمند بازبینی",
  failed: "ناموفق",
};

const EXTRACTION_STATUS_CLASSES: Record<ReceiptDocumentRow["extraction_status"], string> = {
  pending: "bg-muted text-muted-foreground",
  extracted: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  needs_review: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  failed: "bg-destructive/15 text-destructive",
};

const CHANNEL_LABELS: Record<DocumentChannel, string> = {
  card_to_card: "کارت به کارت",
  paya: "پایا",
  pol: "پل",
  satna: "ساتنا",
  cash: "نقدی",
  other: "سایر",
  unknown: "نامشخص",
};

function ExtractionField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-medium" dir="auto">
        {value && String(value).trim() !== "" ? value : "—"}
      </span>
    </div>
  );
}

export function validateReceiptFile(file: File): string | null {
  if (file.size > MAX_DOC_SIZE_BYTES) {
    return `«${file.name}» بیش از حد مجاز (۱۰ مگابایت) است`;
  }
  const mime = file.type.toLowerCase();
  if (!ALLOWED_DOC_MIMES.includes(mime as (typeof ALLOWED_DOC_MIMES)[number])) {
    return `نوع فایل «${file.name}» مجاز نیست`;
  }
  return null;
}

function safeFileName(name: string) {
  // Keep extension; strip path separators and weird chars
  return name.replace(/[\\/]+/g, "_").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120);
}

/**
 * Uploads staged files for a receipt. Best-effort: per-file failures are
 * surfaced via toast but do not throw, so the receipt itself is preserved.
 */
export async function uploadReceiptDocuments(
  receiptId: string,
  userId: string,
  files: File[],
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const path = `${receiptId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(RECEIPT_DOCS_BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from("payment_receipt_documents")
        .insert({
          receipt_id: receiptId,
          storage_path: path,
          file_name: file.name,
          file_type: file.type || "application/octet-stream",
          file_size: file.size,
          uploaded_by: userId,
        } as never)
        .select("id")
        .single();
      if (insErr) {
        // Try to roll back the storage object
        await supabase.storage.from(RECEIPT_DOCS_BUCKET).remove([path]);
        throw insErr;
      }

      await supabase.from("audit_logs").insert({
        actor_id: userId,
        entity_type: "payment_receipt",
        entity_id: receiptId,
        action: "receipt_document_uploaded",
        diff: {
          document_id: (row as { id: string }).id,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: path,
        },
      } as never);
      uploaded += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`آپلود «${file.name}» ناموفق بود: ${msg}`);
    }
  }
  return { uploaded, failed };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${toFaDigits(String(bytes))} B`;
  if (bytes < 1024 * 1024) return `${toFaDigits((bytes / 1024).toFixed(1))} KB`;
  return `${toFaDigits((bytes / (1024 * 1024)).toFixed(2))} MB`;
}

/** Staged-file picker used inside the create form (before receipt exists). */
export function ReceiptDocumentPicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_DOC_COUNT) {
        toast.error(`حداکثر ${toFaDigits(String(MAX_DOC_COUNT))} فایل قابل پیوست است`);
        break;
      }
      const err = validateReceiptFile(f);
      if (err) {
        toast.error(err);
        continue;
      }
      // de-dup by name+size
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (idx: number) => {
    const next = files.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">مستندات فیش</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || files.length >= MAX_DOC_COUNT}
        >
          <Upload className="ml-1 h-4 w-4" />
          آپلود تصویر یا فایل
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_DOC_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleAdd(e.target.files)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        فایل‌های مجاز: JPG, PNG, WEBP, PDF, TXT — حداکثر ۱۰ مگابایت برای هر فایل، حداکثر {toFaDigits(String(MAX_DOC_COUNT))} فایل.
      </p>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">هیچ مستندی انتخاب نشده است.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${f.size}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                {f.type.startsWith("image/") ? (
                  <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{f.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAt(idx)}
                  disabled={disabled}
                  aria-label="حذف"
                >
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read-only / managed list shown on the receipt detail page. */
export function ReceiptDocumentsList({
  receiptId,
  legacyImageUrl,
}: {
  receiptId: string;
  legacyImageUrl?: string | null;
}) {
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasAnyRole(roles as AppRole[], ["admin", "accountant"]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReceiptDocumentRow | null>(null);

  const { data: docs = [], isLoading } = useQuery<ReceiptDocumentRow[]>({
    queryKey: ["payment-receipt-documents", receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipt_documents")
        .select("id, receipt_id, storage_path, file_name, file_type, file_size, uploaded_by, created_at, extraction_status, extracted_data, extraction_confidence, extraction_notes")
        .eq("receipt_id", receiptId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReceiptDocumentRow[];
    },
  });

  const openDoc = async (doc: ReceiptDocumentRow) => {
    setOpeningId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from(RECEIPT_DOCS_BUCKET)
        .createSignedUrl(doc.storage_path, 300);
      if (error || !data?.signedUrl) throw error ?? new Error("URL در دسترس نیست");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`باز کردن مستند ناموفق بود: ${msg}`);
    } finally {
      setOpeningId(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (doc: ReceiptDocumentRow) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const { error: stErr } = await supabase.storage
        .from(RECEIPT_DOCS_BUCKET)
        .remove([doc.storage_path]);
      // Continue even if storage delete fails (object may already be gone),
      // but surface non-not-found errors.
      if (stErr && !/not.?found/i.test(stErr.message ?? "")) throw stErr;

      const { error: delErr } = await supabase
        .from("payment_receipt_documents")
        .delete()
        .eq("id", doc.id);
      if (delErr) throw delErr;

      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt",
        entity_id: doc.receipt_id,
        action: "receipt_document_removed",
        diff: {
          document_id: doc.id,
          file_name: doc.file_name,
          file_type: doc.file_type,
          file_size: doc.file_size,
          storage_path: doc.storage_path,
        },
      } as never);
    },
    onSuccess: () => {
      toast.success("مستند حذف شد");
      queryClient.invalidateQueries({ queryKey: ["payment-receipt-documents", receiptId] });
      setPendingDelete(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`حذف مستند ناموفق بود: ${msg}`);
    },
  });

  // ---- Extraction (Stage 1: text-only) -------------------------------------
  const extractMutation = useMutation({
    mutationFn: async (doc: ReceiptDocumentRow) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");

      // Audit: started
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt_document",
        entity_id: doc.id,
        action: "receipt_document_extraction_started",
        diff: { document_id: doc.id, receipt_id: doc.receipt_id, file_type: doc.file_type },
      } as never);

      try {
        // Download file via short-lived signed URL (storage rules unchanged).
        const { data: signed, error: signErr } = await supabase.storage
          .from(RECEIPT_DOCS_BUCKET)
          .createSignedUrl(doc.storage_path, 120);
        if (signErr || !signed?.signedUrl) throw signErr ?? new Error("دریافت فایل ناموفق بود");

        const resp = await fetch(signed.signedUrl);
        if (!resp.ok) throw new Error(`دانلود فایل ناموفق بود (${resp.status})`);
        const blob = await resp.blob();

        const { text, warnings } = await extractRawText(blob, doc.file_type);
        const parsed = parseReceiptText(text);
        parsed.warnings = [...warnings, ...parsed.warnings];

        const confidence = scoreExtraction(parsed);
        const status = decideStatus(parsed, Boolean(text.trim()));

        const notes =
          parsed.warnings.length > 0
            ? parsed.warnings.join(" | ")
            : status === "extracted"
            ? "استخراج با موفقیت انجام شد."
            : "متن خامی برای استخراج وجود نداشت یا فیلدهای کلیدی پیدا نشد.";

        const { error: updErr } = await supabase
          .from("payment_receipt_documents")
          .update({
            extraction_status: status,
            extracted_data: parsed as unknown as object,
            extraction_confidence: confidence,
            extraction_notes: notes,
          } as never)
          .eq("id", doc.id);
        if (updErr) throw updErr;

        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          entity_type: "payment_receipt_document",
          entity_id: doc.id,
          action: "receipt_document_extraction_completed",
          diff: {
            document_id: doc.id,
            receipt_id: doc.receipt_id,
            extraction_status: status,
            extraction_confidence: confidence,
            extracted_keys: parsed.detected_keywords,
          },
        } as never);

        return { status, confidence, hasText: Boolean(text.trim()) };
      } catch (err) {
        await supabase
          .from("payment_receipt_documents")
          .update({
            extraction_status: "failed",
            extraction_notes: err instanceof Error ? err.message : "خطای ناشناخته",
          } as never)
          .eq("id", doc.id);

        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          entity_type: "payment_receipt_document",
          entity_id: doc.id,
          action: "receipt_document_extraction_failed",
          diff: {
            document_id: doc.id,
            receipt_id: doc.receipt_id,
            error: err instanceof Error ? err.message : String(err),
          },
        } as never);
        throw err;
      }
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipt-documents", receiptId] });
      if (r.status === "extracted") toast.success("اطلاعات فیش استخراج شد.");
      else if (!r.hasText) toast.info("موتور استخراج خودکار برای این نوع فایل هنوز فعال نیست.");
      else toast.warning("استخراج انجام شد ولی نیازمند بررسی است.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`استخراج ناموفق بود: ${msg}`);
      queryClient.invalidateQueries({ queryKey: ["payment-receipt-documents", receiptId] });
    },
  });

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">مستندات فیش</h3>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {docs.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">هیچ مستندی پیوست نشده است.</p>
          {legacyImageUrl && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <Label className="text-xs text-muted-foreground">تصویر فیش (لینک قدیمی)</Label>
              <div className="mt-1">
                <a
                  href={legacyImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                  dir="ltr"
                >
                  مشاهده تصویر
                </a>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => {
            const isImage = doc.file_type.startsWith("image/");
            const extracting = extractMutation.isPending && extractMutation.variables?.id === doc.id;
            const extracted = (doc.extracted_data ?? null) as ReceiptExtractionResult | null;
            return (
              <li
                key={doc.id}
                className={cn(
                  "rounded-md border bg-background p-2 text-sm",
                )}
              >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {isImage ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{doc.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(doc.file_size)} • {doc.file_type}
                    </div>
                    <div className="mt-1 text-xs">
                      <span className={cn("rounded px-1.5 py-0.5", EXTRACTION_STATUS_CLASSES[doc.extraction_status])}>
                        {EXTRACTION_STATUS_LABELS[doc.extraction_status]}
                      </span>
                      {doc.extraction_confidence != null && doc.extraction_status === "extracted" && (
                        <span className="ms-2 text-muted-foreground">
                          اطمینان: {toFaDigits(String(Math.round((doc.extraction_confidence ?? 0) * 100)))}٪
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => extractMutation.mutate(doc)}
                      disabled={extracting}
                    >
                      {extracting ? (
                        <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="ml-1 h-4 w-4" />
                      )}
                      استخراج اطلاعات از فیش
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDoc(doc)}
                    disabled={openingId === doc.id}
                  >
                    {openingId === doc.id ? (
                      <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="ml-1 h-4 w-4" />
                    )}
                    مشاهده مستندات
                  </Button>
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingDelete(doc)}
                      aria-label="حذف مستند"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
              {extracted && (doc.extraction_status === "extracted" || doc.extraction_status === "needs_review") && (
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-muted/40 p-2 text-xs sm:grid-cols-3">
                  <ExtractionField label="شماره پیگیری" value={extracted.tracking_number} />
                  <ExtractionField label="مبلغ" value={extracted.amount != null ? `${toFaDigits(extracted.amount.toLocaleString("en-US"))} ریال` : null} />
                  <ExtractionField label="تاریخ" value={extracted.receipt_date ? toFaDigits(extracted.receipt_date) : null} />
                  <ExtractionField label="ساعت" value={extracted.receipt_time ? toFaDigits(extracted.receipt_time) : null} />
                  <ExtractionField label="بانک مبدا" value={extracted.source_bank} />
                  <ExtractionField label="بانک مقصد" value={extracted.destination_bank} />
                  <ExtractionField label="کانال انتقال" value={CHANNEL_LABELS[extracted.document_channel]} />
                  <ExtractionField
                    label="درصد اطمینان"
                    value={doc.extraction_confidence != null ? `${toFaDigits(String(Math.round(doc.extraction_confidence * 100)))}٪` : null}
                  />
                  {doc.extraction_notes && (
                    <div className="col-span-2 sm:col-span-3 mt-1 text-[11px] text-muted-foreground">
                      یادداشت: {doc.extraction_notes}
                    </div>
                  )}
                </div>
              )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مستند</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `آیا از حذف «${pendingDelete.file_name}» اطمینان دارید؟ این عمل قابل بازگشت نیست.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}