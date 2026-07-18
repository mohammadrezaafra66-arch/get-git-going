import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";

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
};

async function fetchPurchaseRequests(f: ListFilters): Promise<PurchaseRequestRow[]> {
  const { data, error } = await supabase.rpc("get_purchase_requests", {
    p_status: f.status ?? undefined,
    p_product_id: f.productId ?? undefined,
    p_limit: f.limit ?? 50,
    p_offset: f.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseRequestRow[];
}

export function useMyPurchaseRequests(status?: string | null) {
  return useQuery({
    queryKey: ["purchase-requests", "me", status ?? "all"],
    queryFn: () => fetchPurchaseRequests({ status, limit: 100 }),
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

export function useUpdatePurchaseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      request_id: string;
      new_status: string;
      note?: string | null;
      final_price?: number | null;
    }) => {
      const { error } = await supabase.rpc("update_purchase_status", {
        p_request_id: input.request_id,
        p_new_status: input.new_status,
        p_note: input.note ?? undefined,
        p_final_price: input.final_price ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("وضعیت درخواست به‌روزرسانی شد");
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`تغییر وضعیت ناموفق بود: ${err.message}`),
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