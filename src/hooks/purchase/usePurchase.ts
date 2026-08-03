import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";

/**
 * Issue 219 / C3 — one entry per purchase document linked to a request.
 *
 * The financial keys are OPTIONAL by design: get_purchase_requests omits them
 * entirely for roles that may not see purchase economics (sales), so absence
 * here is the masking working, not missing data.
 */
export type PurchaseSummaryEntry = {
  purchase_id: string;
  short_id: string;
  purchase_date: string;
  purchased_quantity: number;
  allocated_quantity: number;
  is_over_allocation: boolean;
  warehouse_name?: string | null;
  purchase_price?: number | null;
  currency?: string | null;
  total_amount?: number | null;
  supplier_name?: string | null;
};

export type PurchaseRequestRow = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  status: string;
  requested_by: string;
  requester_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  inquiry_id: string | null;
  expected_price: number | null;
  final_price: number | null;
  notes: string | null;
  created_at: string;
  receipt_count: number;
  // Issue 219 / C3 — fulfillment summary. NULL on legacy rows means "unknown",
  // deliberately not zero.
  legacy_no_fulfillment?: boolean;
  supplied_quantity?: number | null;
  effective_supplied?: number | null;
  remaining_quantity?: number | null;
  fulfillment_state?: "none" | "partial" | "complete" | "legacy_unknown";
  purchase_count?: number;
  has_over_allocation?: boolean;
  purchase_summaries?: PurchaseSummaryEntry[];
};

export type PurchaseReceipt = {
  id: string;
  request_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

type ListFilters = {
  status?: string | null;
  productId?: string | null;
  limit?: number;
  offset?: number;
  /**
   * Issue 219 / C4 — show only requests nobody owns. Not a status: the status
   * CHECK constraint would reject one, so the server takes its own parameter.
   * Only admin/manager get rows back; for anyone else the visibility rule
   * inside the RPC already makes the answer empty.
   */
  unassignedOnly?: boolean;
};

async function fetchPurchaseRequests(f: ListFilters): Promise<PurchaseRequestRow[]> {
  const { data, error } = await supabase.rpc("get_purchase_requests", {
    p_status: f.status ?? undefined,
    p_product_id: f.productId ?? undefined,
    p_limit: f.limit ?? 50,
    p_offset: f.offset ?? 0,
    p_unassigned_only: f.unassignedOnly ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseRequestRow[];
}

export function useMyPurchaseRequests(status?: string | null, unassignedOnly = false) {
  return useQuery({
    queryKey: ["purchase-requests", "me", status ?? "all", unassignedOnly],
    queryFn: () => fetchPurchaseRequests({ status, limit: 100, unassignedOnly }),
    staleTime: 30_000,
  });
}

export function useAllPurchaseRequests(filters: {
  status?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { status, search = "", limit = 20, offset = 0 } = filters;
  return useQuery({
    queryKey: ["purchase-requests", "all", status ?? "all", search, limit, offset],
    queryFn: async () => {
      // Fetch one extra to detect hasMore
      const rows = await fetchPurchaseRequests({ status, limit: limit + 1, offset });
      const term = search.trim();
      const filtered = term
        ? rows.filter((r) => (r.product_name ?? "").toLowerCase().includes(term.toLowerCase()))
        : rows;
      const hasMore = rows.length > limit;
      return { rows: filtered.slice(0, limit), hasMore };
    },
    staleTime: 30_000,
  });
}

export function usePurchaseStats() {
  return useQuery({
    queryKey: ["purchase-requests", "stats"],
    queryFn: async () => {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [pendingR, approvedR, purchasedR, weekR] = await Promise.all([
        supabase
          .from("purchase_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("purchase_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
        supabase
          .from("purchase_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "purchased"),
        supabase
          .from("purchase_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", oneWeekAgo),
      ]);
      for (const r of [pendingR, approvedR, purchasedR, weekR]) {
        if (r.error) throw new Error(r.error.message);
      }
      const pending = pendingR.count ?? 0;
      const approved = approvedR.count ?? 0;
      const purchased = purchasedR.count ?? 0;
      const week = weekR.count ?? 0;
      return { pending, approved, purchased, week };
    },
    staleTime: 60_000,
  });
}

export function usePurchaseReceipts(requestId: string | null | undefined) {
  return useQuery({
    queryKey: ["purchase-receipts", requestId],
    queryFn: async (): Promise<PurchaseReceipt[]> => {
      if (!requestId) return [];
      const { data, error } = await supabase
        .from("purchase_receipts")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as PurchaseReceipt[];
    },
    enabled: !!requestId,
    staleTime: 30_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["purchase-requests"] });
}

export function useCreatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_id: string;
      quantity: number;
      unit: string;
      inquiry_id?: string | null;
      notes?: string | null;
      expected_price?: number | null;
    }) => {
      const { data, error } = await supabase.rpc("create_purchase_request", {
        p_product_id: input.product_id,
        p_quantity: input.quantity,
        p_unit: input.unit,
        p_inquiry_id: input.inquiry_id ?? undefined,
        p_notes: input.notes ?? undefined,
        p_expected_price: input.expected_price ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      toast.success("درخواست خرید با موفقیت ثبت شد");
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`ثبت درخواست ناموفق بود: ${err.message}`),
  });
}

/**
 * ویرایش یک درخواست خرید توسط خودِ درخواست‌دهنده، فقط در وضعیت «در انتظار تأیید».
 *
 * برخلاف تغییر وضعیت، اینجا RPC نداریم و مستقیم UPDATE می‌زنیم؛ مجوز را سیاست
 * RLS جدول تعیین می‌کند (migration 219): شاخهٔ
 * `requested_by = auth.uid() AND status = 'pending'` هم در USING و هم در
 * WITH CHECK آمده، پس درخواست‌دهنده می‌تواند فیلدها را عوض کند ولی نمی‌تواند
 * درخواست خودش را تأیید کند.
 *
 * عمداً `status` در فیلدهای قابل‌ارسال نیست تا مسیر تغییر وضعیت فقط از
 * useUpdatePurchaseStatus بگذرد (که گذارهای مجاز را رعایت می‌کند).
 */
export function useUpdatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      request_id: string;
      product_id: string;
      quantity: number;
      unit: string;
      notes?: string | null;
      expected_price?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("purchase_requests")
        .update({
          product_id: input.product_id,
          quantity: input.quantity,
          unit: input.unit,
          notes: input.notes ?? null,
          expected_price: input.expected_price ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.request_id)
        .eq("status", "pending")
        .select("id");
      if (error) throw new Error(error.message);
      // RLS رد شدن را به‌صورت «صفر ردیف» برمی‌گرداند، نه خطا. بدون این بررسی،
      // کاربر پیام موفقیت می‌دید در حالی که چیزی ذخیره نشده بود.
      if (!data || data.length === 0) {
        throw new Error(
          "ویرایش انجام نشد. فقط درخواست‌دهنده و تنها تا پیش از تأیید می‌تواند درخواست را ویرایش کند.",
        );
      }
    },
    onSuccess: () => {
      toast.success("درخواست خرید ویرایش شد");
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`ویرایش ناموفق بود: ${err.message}`),
  });
}

/**
 * Issue 219 / C5 — Persian text for the machine codes update_purchase_status
 * puts in PostgreSQL's HINT field.
 *
 * Keyed on HINT rather than on the message so the wording can change on either
 * side without a raw database error reaching the screen.
 */
const STATUS_ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "برای این کار باید وارد شوید.",
  PURCHASE_STATUS_DERIVED: "وضعیت خرید فقط پس از ثبت سند خرید واقعی تغییر می‌کند.",
  PURCHASE_FINAL_PRICE_DERIVED: "قیمت نهایی از روی اسناد خرید محاسبه می‌شود و دستی ثبت نمی‌شود.",
  PURCHASE_TRANSITION_INVALID: "این تغییر وضعیت مجاز نیست.",
  PURCHASE_STATUS_INVALID: "وضعیت انتخاب‌شده معتبر نیست.",
  PURCHASE_PERMISSION_DENIED: "شما اجازه تغییر وضعیت این درخواست را ندارید.",
  REQUEST_NOT_FOUND: "درخواست خرید پیدا نشد.",
};

export function purchaseStatusErrorMessage(err: unknown): string {
  const e = err as { hint?: string; message?: string } | null;
  const byHint = e?.hint ? STATUS_ERROR_MESSAGES[e.hint] : undefined;
  if (byHint) return byHint;
  if (e?.message && /Failed to fetch|NetworkError|fetch failed/i.test(e.message)) {
    return "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.";
  }
  // Never surface the raw database text.
  return "تغییر وضعیت ناموفق بود.";
}

export function useUpdatePurchaseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      request_id: string;
      new_status: string;
      note?: string | null;
      // C5: `final_price` is deliberately not accepted here. It is derived from
      // the purchase documents, and the RPC now rejects the parameter outright.
    }) => {
      const { error } = await supabase.rpc("update_purchase_status", {
        p_request_id: input.request_id,
        p_new_status: input.new_status,
        p_note: input.note ?? undefined,
      });
      // Thrown as-is so the hint survives; the message is resolved in onError.
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("وضعیت درخواست به‌روزرسانی شد");
      invalidateAll(qc);
    },
    onError: (err: unknown) => toast.error(purchaseStatusErrorMessage(err)),
  });
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf"];
const MAX_SIZE = 10 * 1024 * 1024;

export function useUploadPurchaseReceipt() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { request_id: string; file: File }) => {
      if (!user?.id) throw new Error("احراز هویت لازم است");
      const { file, request_id } = input;
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
        throw new Error("فرمت فایل مجاز نیست (jpg, png, pdf)");
      }
      if (file.size > MAX_SIZE) {
        throw new Error("حجم فایل بیش از ۱۰ مگابایت است");
      }
      const path = `${request_id}/${safeRandomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("purchase-receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error: insErr } = await supabase.from("purchase_receipts").insert({
        request_id,
        uploaded_by: user.id,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
      });
      if (insErr) {
        // best-effort cleanup
        await supabase.storage.from("purchase-receipts").remove([path]);
        throw new Error(insErr.message);
      }
      return path;
    },
    onSuccess: (_data, vars) => {
      toast.success("رسید با موفقیت آپلود شد");
      qc.invalidateQueries({ queryKey: ["purchase-receipts", vars.request_id] });
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`آپلود ناموفق: ${err.message}`),
  });
}

export async function getSignedReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("purchase-receipts")
    .createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
