import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  X,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole, type AppRole } from "@/lib/rbac/roles";
import { toFaDigits } from "@/lib/i18n/formatters";
import { parseDateToGregorianIso } from "@/lib/i18n/jalali";
import { cn } from "@/lib/utils";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { toHtmlTimeValue } from "@/lib/accounting/receipt-ocr-structured";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  parseReceiptText,
  scoreExtraction,
  decideStatus,
  type ReceiptExtractionResult,
  type DocumentChannel,
} from "@/lib/accounting/receipt-extraction";
import { evaluateReceiptSecurityWarnings } from "@/lib/accounting/receipt-security";
import { extractReceiptDocumentOcr, type OcrMethod } from "@/lib/receipt-ocr.functions";

export const RECEIPT_DOCS_BUCKET = "payment-receipt-documents";

/**
 * Accept any common format a customer might send: images (JPG/PNG/WEBP/HEIC/GIF/BMP/TIFF),
 * PDFs, plain text, Office documents (DOC/DOCX/XLS/XLSX), and ZIP archives.
 * MIME and extension are checked together since browsers/phones often report
 * empty or non-standard MIME types for screenshots and forwarded files.
 */
export const ALLOWED_DOC_EXTENSIONS = [
  // images
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
  "svg",
  // documents
  "pdf",
  "txt",
  "rtf",
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  // archives (in case customer sends multiple receipts together)
  "zip",
  "rar",
  "7z",
] as const;

export const ALLOWED_DOC_ACCEPT = [
  "image/*",
  "application/pdf",
  "text/*",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".rtf",
  ".csv",
  ".heic",
  ".heif",
  ".zip",
  ".rar",
  ".7z",
].join(",");

export const MAX_DOC_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_DOC_COUNT = 10;

/**
 * Extension -> MIME, used only when the browser reports nothing usable.
 *
 * Migration 267 gave payment-receipt-documents a MIME allowlist. Uploading with
 * `application/octet-stream` (the old fallback) would now be rejected by
 * Storage, and allowing octet-stream in the bucket instead would have made the
 * allowlist meaningless since any file can be sent under that type. Phones
 * routinely report an empty type for screenshots and forwarded files, which is
 * exactly the case this table covers.
 */
const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
};

/**
 * The Content-Type to upload a staged file under.
 *
 * Falls back to application/octet-stream only for an extension we do not know,
 * which validateReceiptFile already rejects before upload — so that path means
 * something unexpected got through and Storage should refuse it. Guessing a
 * concrete type here (e.g. defaulting to PDF) would mislabel the object and
 * defeat the point of the allowlist.
 */
function resolveUploadContentType(file: File): string {
  const reported = (file.type || "").toLowerCase();
  if (reported && reported !== "application/octet-stream") return reported;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MIME[ext] ?? "application/octet-stream";
}

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

// ---------------------------------------------------------------------------
// Apply-extracted-data: field map + value normalizers
// ---------------------------------------------------------------------------

type ApplyFieldKey =
  | "tracking_number"
  | "amount"
  | "receipt_date"
  | "receipt_time"
  | "source_bank"
  | "destination_bank"
  | "payer_name_on_receipt"
  | "receiver_name_on_receipt"
  | "document_channel";

const APPLY_FIELD_LABELS: Record<ApplyFieldKey, string> = {
  tracking_number: "شماره پیگیری",
  amount: "مبلغ",
  receipt_date: "تاریخ فیش",
  receipt_time: "ساعت فیش",
  source_bank: "بانک مبدا",
  destination_bank: "بانک مقصد",
  payer_name_on_receipt: "نام واریزکننده روی فیش",
  receiver_name_on_receipt: "نام گیرنده روی فیش",
  document_channel: "کانال انتقال",
};

/** Maps the apply-field key (extraction side) to the receipts column name. */
const APPLY_FIELD_TO_COLUMN: Record<ApplyFieldKey, string> = {
  tracking_number: "tracking_number",
  amount: "amount",
  receipt_date: "payment_date",
  receipt_time: "receipt_time",
  source_bank: "source_bank",
  destination_bank: "destination_bank",
  payer_name_on_receipt: "payer_name_on_receipt",
  receiver_name_on_receipt: "receiver_name_on_receipt",
  document_channel: "document_channel",
};

function normalizeExtractedPaymentDate(s: string): string | null {
  // Jalali (e.g. 1405/04/23) or Gregorian → ISO YYYY-MM-DD.
  return parseDateToGregorianIso(s);
}

function normalizeReceiptTime(s: string): string | null {
  // DB constraint requires exactly HH:MM.
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s.trim());
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  if (Number(hh) > 23 || Number(m[2]) > 59) return null;
  return `${hh}:${m[2]}`;
}

/**
 * Build an effective value for a given field from extraction. Returns
 * `undefined` when the field cannot be safely applied (empty, or fails
 * server-side constraint).
 */
function effectiveExtractedValue(
  key: ApplyFieldKey,
  extracted: ReceiptExtractionResult,
): string | number | undefined {
  switch (key) {
    case "tracking_number":
      return extracted.tracking_number?.trim() || undefined;
    case "amount":
      return extracted.amount != null && extracted.amount > 0 ? extracted.amount : undefined;
    case "receipt_date": {
      if (!extracted.receipt_date) return undefined;
      const norm = normalizeExtractedPaymentDate(extracted.receipt_date);
      return norm ?? undefined;
    }
    case "receipt_time": {
      if (!extracted.receipt_time) return undefined;
      const tm =
        toHtmlTimeValue(extracted.receipt_time) || normalizeReceiptTime(extracted.receipt_time);
      return tm || undefined;
    }
    case "source_bank":
      return extracted.source_bank?.trim() || undefined;
    case "destination_bank":
      return extracted.destination_bank?.trim() || undefined;
    case "payer_name_on_receipt":
      return extracted.payer_name_on_receipt?.trim() || undefined;
    case "receiver_name_on_receipt":
      return extracted.receiver_name_on_receipt?.trim() || undefined;
    case "document_channel": {
      const c = extracted.document_channel;
      if (!c || c === "unknown") return undefined;
      return c;
    }
  }
}

function displayValue(key: ApplyFieldKey, v: string | number | undefined | null): string {
  if (v == null || v === "") return "—";
  if (key === "amount" && typeof v === "number") {
    return `${toFaDigits(v.toLocaleString("en-US"))} تومان`;
  }
  if (key === "document_channel") {
    return CHANNEL_LABELS[v as DocumentChannel] ?? String(v);
  }
  return toFaDigits(String(v));
}

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
    return `«${file.name}» بیش از حد مجاز (۲۰ مگابایت) است`;
  }
  const mime = (file.type || "").toLowerCase();
  // Accept any image/*, text/*, application/pdf, audio/* even if the
  // browser reports an unusual MIME (common on mobile screenshots).
  if (mime.startsWith("image/") || mime.startsWith("text/") || mime === "application/pdf") {
    return null;
  }
  // Fallback: check extension for documents/archives or empty MIME
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if ((ALLOWED_DOC_EXTENSIONS as readonly string[]).includes(ext)) {
    return null;
  }
  // Block executables and unknown binaries explicitly
  if (/\.(exe|bat|cmd|sh|msi|apk|dll|js|jar)$/i.test(file.name)) {
    return `نوع فایل «${file.name}» مجاز نیست`;
  }
  return `نوع فایل «${file.name}» پشتیبانی نمی‌شود`;
}

function safeFileName(name: string) {
  // Keep extension; strip path separators and weird chars
  return name
    .replace(/[\\/]+/g, "_")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .slice(0, 120);
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
      const path = `${receiptId}/${safeRandomUUID()}-${safeFileName(file.name)}`;
      const contentType = resolveUploadContentType(file);
      const { error: upErr } = await supabase.storage.from(RECEIPT_DOCS_BUCKET).upload(path, file, {
        contentType,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from("payment_receipt_documents")
        .insert({
          receipt_id: receiptId,
          storage_path: path,
          file_name: file.name,
          // Record the type the object was actually stored under, so the
          // viewer's isImage/PDF branches agree with Storage.
          file_type: contentType,
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
          file_type: contentType,
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

/** One staged attachment, in the shape the create RPCs' `p_attachments jsonb` expects. */
export interface StagedAttachment {
  storage_path: string;
  mime_type: string;
  ocr_payload: unknown | null;
  ocr_status: "pending" | "done" | "failed";
}

/**
 * Uploads staged files BEFORE any document row exists, and returns the descriptors that
 * `create_receipt` / `create_payment` / `create_dual_document` now accept as `p_attachments`.
 *
 * WHY A DRAFT PATH IS SAFE. `uploadReceiptDocuments` above needs a `receiptId` purely to build
 * its storage path — the bucket's own policies gate on `bucket_id` and role and never on the
 * object path (verified against `storage.objects`' three `prd_storage_*` policies). So a
 * `draft/<uuid>/…` prefix is accepted exactly as a `<receiptId>/…` prefix is, and the
 * `storage_path` UNIQUE constraint still holds because the uuid is fresh per upload.
 *
 * WHY THIS IS NOT A DUPLICATE OF `uploadReceiptDocuments`. That one writes rows into
 * `payment_receipt_documents` for a receipt that already exists — the post-creation surface,
 * still in use on the detail page. This one writes NO rows at all: it returns descriptors, and
 * the create RPC inserts the `document_attachments` rows inside the same transaction as the
 * document. They share the bucket, the validation and the filename rules deliberately.
 *
 * Throws on the first failure rather than continuing best-effort, because a partial upload
 * would produce a document claiming attachments it does not have. The caller is responsible for
 * calling `removeStagedAttachments` with whatever came back if the RPC then fails.
 */
export async function uploadStagedAttachments(
  files: File[],
  ocrByFile?: Map<File, unknown>,
): Promise<StagedAttachment[]> {
  const draftId = safeRandomUUID();
  const staged: StagedAttachment[] = [];
  try {
    for (const file of files) {
      const invalid = validateReceiptFile(file);
      if (invalid) throw new Error(invalid);

      const path = `draft/${draftId}/${safeRandomUUID()}-${safeFileName(file.name)}`;
      const contentType = resolveUploadContentType(file);
      const { error } = await supabase.storage.from(RECEIPT_DOCS_BUCKET).upload(path, file, {
        contentType,
        upsert: false,
      });
      if (error) throw error;

      const ocr = ocrByFile?.get(file) ?? null;
      staged.push({
        storage_path: path,
        mime_type: contentType,
        ocr_payload: ocr,
        ocr_status: ocr ? "done" : "pending",
      });
    }
    return staged;
  } catch (err) {
    // Anything already uploaded in THIS call is removed before rethrowing, so a mid-way failure
    // does not leave objects nobody will ever reference.
    await removeStagedAttachments(staged.map((s) => s.storage_path));
    throw err;
  }
}

/**
 * Removes staged storage objects. Used when the create RPC fails after the upload succeeded —
 * the one orphan class that cannot be closed in the database, because the object exists before
 * the transaction that would own it.
 *
 * Deliberately swallows its own errors: it runs on a failure path, and a cleanup that throws
 * would replace the real error with a less useful one.
 */
export async function removeStagedAttachments(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(RECEIPT_DOCS_BUCKET).remove(paths);
  } catch {
    // Intentionally ignored — see above.
  }
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
        تصویر، اسکرین‌شات، PDF، Word، Excel، متن یا فایل فشرده. حداکثر ۲۰ مگابایت برای هر فایل، تا{" "}
        {toFaDigits(String(MAX_DOC_COUNT))} فایل.
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
  const { user, session, roles } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasAnyRole(roles as AppRole[], ["admin", "accountant"]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReceiptDocumentRow | null>(null);
  const [applyDoc, setApplyDoc] = useState<ReceiptDocumentRow | null>(null);
  const [applySelections, setApplySelections] = useState<Record<ApplyFieldKey, boolean>>({
    tracking_number: false,
    amount: false,
    receipt_date: false,
    receipt_time: false,
    source_bank: false,
    destination_bank: false,
    payer_name_on_receipt: false,
    receiver_name_on_receipt: false,
    document_channel: false,
  });

  const { data: receiptMeta } = useQuery<{
    posting_status: string | null;
    status: string | null;
  } | null>({
    queryKey: ["payment-receipt-meta", receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipts")
        .select("posting_status, status")
        .eq("id", receiptId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { posting_status: string | null; status: string | null } | null;
    },
  });
  const isPosted = (receiptMeta?.posting_status ?? "unposted") === "posted";

  const { data: docs = [], isLoading } = useQuery<ReceiptDocumentRow[]>({
    queryKey: ["payment-receipt-documents", receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipt_documents")
        .select(
          "id, receipt_id, storage_path, file_name, file_type, file_size, uploaded_by, created_at, extraction_status, extracted_data, extraction_confidence, extraction_notes",
        )
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
        // Run OCR/text extraction server-side. The server function
        // enforces role checks, fetches the file via service role, and
        // calls the AI gateway for image OCR when configured.
        const token = session?.access_token;
        if (!token) {
          throw new Error("برای استخراج باید وارد شده باشید.");
        }
        const ocr = await extractReceiptDocumentOcr({
          data: { document_id: doc.id },
          headers: { Authorization: `Bearer ${token}` },
        });

        // SH-RA.2B-UI: explicit disabled state from server flag.
        const ocrDisabled =
          (ocr as { disabled?: boolean }).disabled === true &&
          (ocr as { reason?: string }).reason === "ocr_disabled";

        const text = ocr.raw_text || "";
        const parsed =
          ocr.structured ??
          (() => {
            const p = parseReceiptText(text);
            p.warnings = [...(ocr.warnings ?? []), ...p.warnings];
            return p;
          })();
        if (ocr.structured && ocr.warnings?.length) {
          parsed.warnings = [...ocr.warnings, ...parsed.warnings];
        }

        let confidence = scoreExtraction(parsed);
        // Conservative blend: never above field-derived score; if engine
        // also gave a score, take the min so missing key fields keep it low.
        if (ocr.engine_confidence != null) {
          confidence = Math.min(confidence, Math.max(0, Math.min(1, ocr.engine_confidence)));
        }
        const status = decideStatus(parsed, Boolean(text.trim() || parsed.amount != null));

        const method = ocr.method as OcrMethod;
        const methodNote =
          method === "image_ocr"
            ? "استخراج از تصویر انجام شد؛ لطفاً اطلاعات را بررسی کنید."
            : method === "pdf_text"
              ? "متن PDF استخراج شد؛ لطفاً اطلاعات را بررسی کنید."
              : method === "pdf_image_ocr"
                ? "استخراج از تصویر صفحات PDF انجام شد؛ لطفاً اطلاعات را بررسی کنید."
                : method === "unsupported" && doc.file_type === "application/pdf"
                  ? "استخراج متن PDF در این محیط پشتیبانی نمی‌شود."
                  : method === "unsupported"
                    ? "موتور OCR تصویری در این محیط فعال نیست."
                    : null;

        const baseNote =
          parsed.warnings.length > 0
            ? parsed.warnings.join(" | ")
            : status === "extracted"
              ? "استخراج با موفقیت انجام شد."
              : "متن خامی برای استخراج وجود نداشت یا فیلدهای کلیدی پیدا نشد.";
        const notes = methodNote ? `${methodNote} | ${baseNote}` : baseNote;

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
            file_type: doc.file_type,
            extraction_status: status,
            extraction_confidence: confidence,
            extracted_keys: parsed.detected_keywords,
            extraction_method: ocr.method,
          },
        } as never);

        // ---------------------------------------------------------------
        // Auto-apply: silently push extracted amount + tracking_number to
        // the receipt itself when available and the receipt is editable.
        // Mismatches with manually-entered values are reported back so the
        // UI can warn the accountant.
        // ---------------------------------------------------------------
        const autoMismatches: Array<{
          field: "amount" | "tracking_number";
          before: string | number | null;
          after: string | number;
        }> = [];
        const autoApplied: Array<"amount" | "tracking_number"> = [];
        try {
          const { data: rcpt } = await supabase
            .from("payment_receipts")
            .select("id, posting_status, amount, tracking_number")
            .eq("id", doc.receipt_id)
            .maybeSingle();
          const row = rcpt as {
            posting_status?: string | null;
            amount?: number | null;
            tracking_number?: string | null;
          } | null;
          if (row && (row.posting_status ?? "unposted") !== "posted") {
            const update: Record<string, unknown> = {};
            const exAmount = effectiveExtractedValue("amount", parsed);
            const exTracking = effectiveExtractedValue("tracking_number", parsed);
            if (exAmount !== undefined && typeof exAmount === "number") {
              const cur = row.amount ?? null;
              if (cur != null && Number(cur) > 0 && Number(cur) !== exAmount) {
                autoMismatches.push({ field: "amount", before: cur, after: exAmount });
              }
              if (cur == null || Number(cur) !== exAmount) {
                update["amount"] = exAmount;
                autoApplied.push("amount");
              }
            }
            if (exTracking !== undefined && typeof exTracking === "string") {
              const cur = (row.tracking_number ?? "").trim();
              if (cur && cur !== exTracking) {
                autoMismatches.push({ field: "tracking_number", before: cur, after: exTracking });
              }
              if (!cur || cur !== exTracking) {
                update["tracking_number"] = exTracking;
                autoApplied.push("tracking_number");
              }
            }
            if (Object.keys(update).length > 0) {
              const { error: rUpdErr } = await supabase
                .from("payment_receipts")
                .update(update as never)
                .eq("id", doc.receipt_id);
              if (!rUpdErr) {
                await supabase.from("audit_logs").insert({
                  actor_id: user.id,
                  entity_type: "payment_receipt",
                  entity_id: doc.receipt_id,
                  action: "receipt_extracted_data_auto_applied",
                  diff: {
                    document_id: doc.id,
                    applied_fields: autoApplied,
                    mismatches: autoMismatches,
                    extraction_confidence: confidence,
                  },
                } as never);
              }
            }
          }
        } catch {
          // Silent: auto-apply is best-effort; manual apply remains available.
        }

        return {
          status,
          confidence,
          hasText: Boolean(text.trim()),
          method: ocr.method,
          autoApplied,
          autoMismatches,
          ocrDisabled,
        };
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
      queryClient.invalidateQueries({ queryKey: ["payment-receipt-meta", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["payment-receipt", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      // Auto-apply feedback
      if (r.autoApplied && r.autoApplied.length > 0) {
        const labels = r.autoApplied.map((k) => APPLY_FIELD_LABELS[k]).join("، ");
        toast.success(`${labels} از روی فیش به‌صورت خودکار جایگذاری شد.`);
      }
      if (r.autoMismatches && r.autoMismatches.length > 0) {
        for (const m of r.autoMismatches) {
          const label = APPLY_FIELD_LABELS[m.field];
          toast.warning(
            `هشدار مغایرت ${label}: مقدار دستی «${displayValue(m.field, m.before)}» با مقدار استخراج‌شده «${displayValue(m.field, m.after)}» تفاوت دارد.`,
            { duration: 8000 },
          );
        }
      }
      if (r.method === "unsupported" && !r.hasText) {
        if (r.ocrDisabled) {
          toast.info("OCR در دسترس نیست، لطفاً دستی وارد کنید.");
        } else {
          toast.info("موتور استخراج خودکار برای این نوع فایل هنوز فعال نیست.");
        }
      } else if (r.status === "extracted") {
        toast.success(
          r.method === "image_ocr"
            ? "OCR انجام شد؛ لطفاً اطلاعات استخراج‌شده را بررسی کنید."
            : r.method === "pdf_text"
              ? "متن PDF استخراج شد؛ لطفاً اطلاعات را بررسی کنید."
              : "اطلاعات فیش استخراج شد.",
        );
      } else if (!r.hasText) {
        toast.info("موتور استخراج خودکار برای این نوع فایل هنوز فعال نیست.");
      } else {
        toast.warning("استخراج انجام شد ولی نیازمند بررسی است.");
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`استخراج ناموفق بود: ${msg}`);
      queryClient.invalidateQueries({ queryKey: ["payment-receipt-documents", receiptId] });
    },
  });

  // ---- Auto-extract for newly uploaded (pending) docs ---------------------
  // Triggers the same server-side OCR pipeline silently right after upload,
  // for accountants/admins. Each doc id is processed at most once per mount.
  const autoTriedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!canManage || isPosted) return;
    for (const d of docs) {
      if (d.extraction_status !== "pending") continue;
      if (autoTriedRef.current.has(d.id)) continue;
      autoTriedRef.current.add(d.id);
      extractMutation.mutate(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, canManage, isPosted]);

  // ---- Apply extracted data to receipt fields -----------------------------
  const openApplyDialog = (doc: ReceiptDocumentRow) => {
    const ex = (doc.extracted_data ?? null) as ReceiptExtractionResult | null;
    if (!ex) {
      toast.error("داده‌ای برای اعمال وجود ندارد.");
      return;
    }
    const next: Record<ApplyFieldKey, boolean> = {
      tracking_number: false,
      amount: false,
      receipt_date: false,
      receipt_time: false,
      source_bank: false,
      destination_bank: false,
      payer_name_on_receipt: false,
      receiver_name_on_receipt: false,
      document_channel: false,
    };
    (Object.keys(next) as ApplyFieldKey[]).forEach((k) => {
      next[k] = effectiveExtractedValue(k, ex) !== undefined;
    });
    setApplySelections(next);
    setApplyDoc(doc);
  };

  const applyMutation = useMutation({
    mutationFn: async (args: { doc: ReceiptDocumentRow; selected: ApplyFieldKey[] }) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const { doc, selected } = args;
      if (selected.length === 0) throw new Error("هیچ فیلدی انتخاب نشده است");
      const ex = (doc.extracted_data ?? null) as ReceiptExtractionResult | null;
      if (!ex) throw new Error("داده‌ای برای اعمال وجود ندارد");

      // Re-check posting status to avoid races.
      const { data: receiptRow, error: rErr } = await supabase
        .from("payment_receipts")
        .select(
          "id, posting_status, tracking_number, amount, payment_date, receipt_time, source_bank, destination_bank, payer_name_on_receipt, receiver_name_on_receipt, document_channel, has_perforation, is_typed_receipt, is_mobile_bank_screenshot, security_warnings",
        )
        .eq("id", doc.receipt_id)
        .single();
      if (rErr || !receiptRow) throw rErr ?? new Error("فیش پیدا نشد");
      if ((receiptRow as { posting_status?: string }).posting_status === "posted") {
        throw new Error("این فیش قبلاً ثبت حسابداری شده و قابل ویرایش نیست");
      }

      const beforeMap = receiptRow as unknown as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const skipped: ApplyFieldKey[] = [];
      const applied: ApplyFieldKey[] = [];

      for (const key of selected) {
        const v = effectiveExtractedValue(key, ex);
        if (v === undefined) {
          skipped.push(key);
          continue;
        }
        const col = APPLY_FIELD_TO_COLUMN[key];
        update[col] = v;
        before[col] = beforeMap[col] ?? null;
        after[col] = v;
        applied.push(key);
      }

      if (applied.length === 0) {
        throw new Error("مقادیر انتخاب‌شده قابل اعمال نیستند");
      }

      // Recompute security warnings using the post-apply state.
      const merged = { ...beforeMap, ...update } as Record<string, unknown>;
      const newWarnings = evaluateReceiptSecurityWarnings({
        payment_date: (merged.payment_date as string | null) ?? null,
        tracking_number: (merged.tracking_number as string | null) ?? null,
        amount: (merged.amount as number | null) ?? null,
        document_channel: (merged.document_channel as string | null) ?? null,
        payer_name_on_receipt: (merged.payer_name_on_receipt as string | null) ?? null,
        has_perforation: (merged.has_perforation as boolean | null) ?? null,
        is_typed_receipt: (merged.is_typed_receipt as boolean | null) ?? null,
        is_mobile_bank_screenshot: (merged.is_mobile_bank_screenshot as boolean | null) ?? null,
        extracted_data: ex,
        extraction_confidence: doc.extraction_confidence,
      });
      update["security_warnings"] = newWarnings;

      const { error: updErr } = await supabase
        .from("payment_receipts")
        .update(update as never)
        .eq("id", doc.receipt_id);
      if (updErr) throw updErr;

      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt",
        entity_id: doc.receipt_id,
        action: "receipt_extracted_data_applied",
        diff: {
          document_id: doc.id,
          applied_fields: applied,
          skipped_fields: skipped,
          before,
          after,
          extraction_confidence: doc.extraction_confidence,
          security_warning_codes: newWarnings.map((w) => w.code),
        },
      } as never);

      return { applied, skipped };
    },
    onSuccess: (r) => {
      toast.success("اطلاعات استخراج‌شده روی فیش اعمال شد.");
      if (r.skipped.length > 0) {
        toast.info(
          `برخی فیلدها قابل اعمال نبودند: ${r.skipped.map((k) => APPLY_FIELD_LABELS[k]).join("، ")}`,
        );
      }
      setApplyDoc(null);
      queryClient.invalidateQueries({ queryKey: ["payment-receipt-meta", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["payment-receipt", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`اعمال ناموفق بود: ${msg}`);
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
            const extracting =
              extractMutation.isPending && extractMutation.variables?.id === doc.id;
            const extracted = (doc.extracted_data ?? null) as ReceiptExtractionResult | null;
            return (
              <li key={doc.id} className={cn("rounded-md border bg-background p-2 text-sm")}>
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
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5",
                            EXTRACTION_STATUS_CLASSES[doc.extraction_status],
                          )}
                        >
                          {EXTRACTION_STATUS_LABELS[doc.extraction_status]}
                        </span>
                        {doc.extraction_confidence != null &&
                          doc.extraction_status === "extracted" && (
                            <span className="ms-2 text-muted-foreground">
                              اطمینان:{" "}
                              {toFaDigits(
                                String(Math.round((doc.extraction_confidence ?? 0) * 100)),
                              )}
                              ٪
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
                    {canManage &&
                      !isPosted &&
                      (doc.extraction_status === "extracted" ||
                        doc.extraction_status === "needs_review") &&
                      doc.extracted_data != null && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openApplyDialog(doc)}
                        >
                          <Wand2 className="ml-1 h-4 w-4" />
                          اعمال اطلاعات استخراج‌شده روی فیش
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
                {extracted &&
                  (doc.extraction_status === "extracted" ||
                    doc.extraction_status === "needs_review") && (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-muted/40 p-2 text-xs sm:grid-cols-3">
                      <ExtractionField label="شماره پیگیری" value={extracted.tracking_number} />
                      <ExtractionField
                        label="مبلغ"
                        value={
                          extracted.amount != null
                            ? `${toFaDigits(extracted.amount.toLocaleString("en-US"))} تومان`
                            : null
                        }
                      />
                      <ExtractionField
                        label="تاریخ"
                        value={extracted.receipt_date ? toFaDigits(extracted.receipt_date) : null}
                      />
                      <ExtractionField
                        label="ساعت"
                        value={extracted.receipt_time ? toFaDigits(extracted.receipt_time) : null}
                      />
                      <ExtractionField label="بانک مبدا" value={extracted.source_bank} />
                      <ExtractionField label="بانک مقصد" value={extracted.destination_bank} />
                      <ExtractionField
                        label="کانال انتقال"
                        value={CHANNEL_LABELS[extracted.document_channel]}
                      />
                      <ExtractionField
                        label="درصد اطمینان"
                        value={
                          doc.extraction_confidence != null
                            ? `${toFaDigits(String(Math.round(doc.extraction_confidence * 100)))}٪`
                            : null
                        }
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

      <Dialog
        open={applyDoc !== null}
        onOpenChange={(open) => {
          if (!open) setApplyDoc(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>اعمال اطلاعات استخراج‌شده</DialogTitle>
            <DialogDescription>
              این اطلاعات از روی مستندات استخراج شده و باید توسط حسابدار بررسی شود.
            </DialogDescription>
          </DialogHeader>
          {applyDoc &&
            (() => {
              const ex = (applyDoc.extracted_data ?? null) as ReceiptExtractionResult | null;
              if (!ex)
                return (
                  <p className="text-sm text-muted-foreground">داده‌ای برای اعمال وجود ندارد.</p>
                );
              const keys = Object.keys(APPLY_FIELD_LABELS) as ApplyFieldKey[];
              return (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {keys.map((key) => {
                    const v = effectiveExtractedValue(key, ex);
                    const disabled = v === undefined;
                    const checked = applySelections[key];
                    return (
                      <label
                        key={key}
                        className={cn(
                          "flex items-start gap-2 rounded-md border p-2 text-sm",
                          disabled ? "opacity-60" : "cursor-pointer hover:bg-muted/40",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(c) =>
                            setApplySelections((prev) => ({ ...prev, [key]: c === true }))
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{APPLY_FIELD_LABELS[key]}</div>
                          <div className="text-xs text-muted-foreground" dir="auto">
                            {disabled
                              ? "مقداری استخراج نشده یا قابل اعمال نیست"
                              : displayValue(key, v)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApplyDoc(null)}
              disabled={applyMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!applyDoc) return;
                const selected = (Object.keys(applySelections) as ApplyFieldKey[]).filter(
                  (k) => applySelections[k],
                );
                if (selected.length === 0) {
                  toast.error("حداقل یک فیلد را برای اعمال انتخاب کنید.");
                  return;
                }
                applyMutation.mutate({ doc: applyDoc, selected });
              }}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              اعمال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
