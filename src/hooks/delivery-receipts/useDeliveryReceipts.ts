import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";

export type DeliveryReceiptRow = {
  id: string;
  type: string;
  status: string;
  file_name: string;
  file_size: number | null;
  storage_path: string;
  invoice_id: string | null;
  customer_id: string | null;
  uploaded_by: string;
  uploader_name: string | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  notes: string | null;
  created_at: string;
  review_deadline: string;
  reviewed_at: string | null;
};

type ListFilters = {
  type?: string | null;
  status?: string | null;
  invoice_id?: string | null;
  limit?: number;
  offset?: number;
};

async function fetchReceipts(f: ListFilters): Promise<DeliveryReceiptRow[]> {
  const { data, error } = await supabase.rpc("get_delivery_receipts", {
    p_type: f.type ?? undefined,
    p_status: f.status ?? undefined,
    p_invoice_id: f.invoice_id ?? undefined,
    p_limit: f.limit ?? 50,
    p_offset: f.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DeliveryReceiptRow[];
}

export function useMyDeliveryReceipts(
  type?: string | null,
  status?: string | null,
) {
  return useQuery({
    queryKey: ["delivery-receipts", "me", type ?? "all", status ?? "all"],
    queryFn: () => fetchReceipts({ type, status, limit: 100 }),
    staleTime: 30_000,
  });
}

export function useAllDeliveryReceipts(filters: {
  type?: string | null;
  status?: string | null;
  invoice_id?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    type,
    status,
    invoice_id,
    search = "",
    limit = 20,
    offset = 0,
  } = filters;
  return useQuery({
    queryKey: [
      "delivery-receipts",
      "all",
      type ?? "all",
      status ?? "all",
      invoice_id ?? "all",
      search,
      limit,
      offset,
    ],
    queryFn: async () => {
      const rows = await fetchReceipts({
        type,
        status,
        invoice_id,
        limit: limit + 1,
        offset,
      });
      const term = search.trim().toLowerCase();
      // فیلتر سمت کلاینت روی نام فایل — RPC پارامتر search ندارد.
      const filtered = term
        ? rows.filter((r) => (r.file_name ?? "").toLowerCase().includes(term))
        : rows;
      const hasMore = rows.length > limit;
      return { rows: filtered.slice(0, limit), hasMore };
    },
    staleTime: 30_000,
  });
}

export function usePendingDeliveryReceipts() {
  return useQuery({
    queryKey: ["delivery-receipts", "pending"],
    queryFn: async () => {
      const rows = await fetchReceipts({ status: "pending_review", limit: 100 });
      return [...rows].sort(
        (a, b) =>
          new Date(a.review_deadline).getTime() -
          new Date(b.review_deadline).getTime(),
      );
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useDeliveryReceiptStats() {
  return useQuery({
    queryKey: ["delivery-receipts", "stats"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const isoStart = startOfDay.toISOString();
      const [pendingR, confirmedTodayR, rejectedR, expiredR] = await Promise.all([
        supabase
          .from("delivery_receipts")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase
          .from("delivery_receipts")
          .select("id", { count: "exact", head: true })
          .eq("status", "confirmed")
          .gte("reviewed_at", isoStart),
        supabase
          .from("delivery_receipts")
          .select("id", { count: "exact", head: true })
          .eq("status", "rejected"),
        supabase
          .from("delivery_receipts")
          .select("id", { count: "exact", head: true })
          .eq("status", "expired"),
      ]);
      for (const r of [pendingR, confirmedTodayR, rejectedR, expiredR]) {
        if (r.error) throw new Error(r.error.message);
      }
      return {
        pending: pendingR.count ?? 0,
        confirmedToday: confirmedTodayR.count ?? 0,
        rejected: rejectedR.count ?? 0,
        expired: expiredR.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["delivery-receipts"] });
}

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf", "mp4", "mov", "webm", "mkv"];
const IMAGE_PDF_MAX = 20 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
function isVideo(f: File) {
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  return f.type.startsWith("video/") || ["mp4", "mov", "webm", "mkv"].includes(ext);
}

export function useCreateDeliveryReceipt() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      type: "shipping_receipt" | "delivery_receipt";
      file: File;
      invoice_id?: string | null;
      customer_id?: string | null;
      notes?: string | null;
    }) => {
      if (!user?.id) throw new Error("احراز هویت لازم است");
      const { file, type } = input;
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
        throw new Error("فرمت فایل مجاز نیست (jpg, png, pdf, mp4, mov, webm)");
      }
      const max = isVideo(file) ? VIDEO_MAX : IMAGE_PDF_MAX;
      if (file.size > max) {
        throw new Error(
          isVideo(file)
            ? "حجم ویدئو بیش از ۱۰۰ مگابایت است"
            : "حجم فایل بیش از ۲۰ مگابایت است",
        );
      }
      const path = `${type}/${safeRandomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("delivery-receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data, error: rpcErr } = await supabase.rpc(
        "create_delivery_receipt",
        {
          p_type: type,
          p_storage_path: path,
          p_file_name: file.name,
          p_file_size: file.size,
          p_mime_type: file.type || "application/octet-stream",
          p_invoice_id: input.invoice_id ?? undefined,
          p_customer_id: input.customer_id ?? undefined,
          p_notes: input.notes ?? undefined,
        },
      );
      if (rpcErr) {
        await supabase.storage.from("delivery-receipts").remove([path]);
        throw new Error(rpcErr.message);
      }
      return data as string;
    },
    onSuccess: () => {
      toast.success("رسید با موفقیت آپلود شد");
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`ثبت رسید ناموفق: ${err.message}`),
  });
}

export function useReviewDeliveryReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      receipt_id: string;
      decision: "confirmed" | "rejected";
      note?: string | null;
    }) => {
      const { error } = await supabase.rpc("review_delivery_receipt", {
        p_receipt_id: input.receipt_id,
        p_decision: input.decision,
        p_note: input.note ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.decision === "confirmed" ? "رسید تأیید شد" : "رسید رد شد");
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`ثبت بررسی ناموفق: ${err.message}`),
  });
}

export async function getSignedDeliveryReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("delivery-receipts")
    .createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}