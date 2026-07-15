import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";

export type DocumentRow = {
  id: string;
  type: string;
  status: string;
  reference_id: string | null;
  reference_type: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  notes: string | null;
  review_deadline: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  uploaded_by: string;
  uploader_name: string | null;
  created_at: string;
};

type ListFilters = {
  type?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
};

async function fetchDocuments(f: ListFilters): Promise<DocumentRow[]> {
  const { data, error } = await supabase.rpc("get_documents", {
    p_type: f.type ?? undefined,
    p_status: f.status ?? undefined,
    p_limit: f.limit ?? 50,
    p_offset: f.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DocumentRow[];
}

export function useMyDocuments(type?: string | null, status?: string | null) {
  return useQuery({
    queryKey: ["documents", "me", type ?? "all", status ?? "all"],
    queryFn: () => fetchDocuments({ type, status, limit: 100 }),
    staleTime: 30_000,
  });
}

export function useAllDocuments(filters: {
  type?: string | null;
  status?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { type, status, search = "", limit = 20, offset = 0 } = filters;
  return useQuery({
    queryKey: ["documents", "all", type ?? "all", status ?? "all", search, limit, offset],
    queryFn: async () => {
      const rows = await fetchDocuments({ type, status, limit: limit + 1, offset });
      const term = search.trim().toLowerCase();
      const filtered = term
        ? rows.filter((r) => (r.file_name ?? "").toLowerCase().includes(term))
        : rows;
      const hasMore = rows.length > limit;
      return { rows: filtered.slice(0, limit), hasMore };
    },
    staleTime: 30_000,
  });
}

export function usePendingDocuments() {
  return useQuery({
    queryKey: ["documents", "pending"],
    queryFn: async () => {
      const rows = await fetchDocuments({ status: "pending_review", limit: 100 });
      // فوری‌ترین deadline اول
      return [...rows].sort(
        (a, b) => new Date(a.review_deadline).getTime() - new Date(b.review_deadline).getTime(),
      );
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useDocumentStats() {
  return useQuery({
    queryKey: ["documents", "stats"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const isoStart = startOfDay.toISOString();
      const [pendingR, confirmedTodayR, rejectedR, expiredR] = await Promise.all([
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "confirmed")
          .gte("reviewed_at", isoStart),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "rejected"),
        supabase
          .from("documents")
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
  qc.invalidateQueries({ queryKey: ["documents"] });
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf"];
const MAX_SIZE = 25 * 1024 * 1024;

export function useCreateDocument() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      type: "bijak" | "invoice" | "havale";
      file: File;
      reference_id?: string | null;
      reference_type?: string | null;
      notes?: string | null;
    }) => {
      if (!user?.id) throw new Error("احراز هویت لازم است");
      const { file, type } = input;
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
        throw new Error("فرمت فایل مجاز نیست (jpg, png, pdf)");
      }
      if (file.size > MAX_SIZE) {
        throw new Error("حجم فایل بیش از ۲۵ مگابایت است");
      }
      const path = `${type}/${safeRandomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data, error: rpcErr } = await supabase.rpc("create_document", {
        p_type: type,
        p_storage_path: path,
        p_file_name: file.name,
        p_file_size: file.size,
        p_mime_type: file.type || "application/octet-stream",
        p_reference_id: input.reference_id ?? undefined,
        p_reference_type: input.reference_type ?? undefined,
        p_notes: input.notes ?? undefined,
      });
      if (rpcErr) {
        await supabase.storage.from("documents").remove([path]);
        throw new Error(rpcErr.message);
      }
      return data as string;
    },
    onSuccess: () => {
      toast.success("سند با موفقیت ثبت شد");
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`ثبت سند ناموفق: ${err.message}`),
  });
}

export function useReviewDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      document_id: string;
      decision: "confirmed" | "rejected";
      note?: string | null;
    }) => {
      const { error } = await supabase.rpc("review_document", {
        p_document_id: input.document_id,
        p_decision: input.decision,
        p_note: input.note ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.decision === "confirmed" ? "سند تأیید شد" : "سند رد شد");
      invalidateAll(qc);
    },
    onError: (err: Error) => toast.error(`ثبت بررسی ناموفق: ${err.message}`),
  });
}

export async function getSignedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}