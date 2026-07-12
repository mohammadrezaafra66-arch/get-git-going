import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { startOfTodayIso } from "@/lib/dashboard/utils";

const COMMON = { staleTime: 60_000, refetchInterval: 120_000, retry: false } as const;

/** آستانهٔ پاسخ به‌موقع به استعلام (دقیقه). */
export const ON_TIME_THRESHOLD_MIN = 30;

type AnyRes<T = unknown> = { data: T | null; error: unknown; count?: number | null };

async function safeCount(p: Promise<AnyRes>): Promise<number> {
  try {
    const r = await p;
    if (r?.error) return 0;
    return r?.count ?? 0;
  } catch {
    return 0;
  }
}

/** ─────────── استعلام‌های امروز ─────────── */
export interface TodayInquiryStats {
  total: number;
  onTime: number;
  late: number;
  avgResponseMin: number | null;
}

export function useTodayInquiryStats(scope: "all" | "mine" = "all") {
  const { user } = useAuth();
  return useQuery<TodayInquiryStats>({
    ...COMMON,
    enabled: scope === "all" ? true : !!user?.id,
    queryKey: ["dash", "inquiries-today", scope, user?.id ?? null],
    queryFn: async () => {
      const from = startOfTodayIso();
      try {
        let q = supabase
          .from("inquiries")
          .select("created_at, answered_at, requested_by")
          .gte("created_at", from);
        if (scope === "mine" && user?.id) q = q.eq("requested_by", user.id);
        const { data, error } = await q;
        if (error || !data) return { total: 0, onTime: 0, late: 0, avgResponseMin: null };
        const now = Date.now();
        const threshMs = ON_TIME_THRESHOLD_MIN * 60_000;
        let onTime = 0;
        let late = 0;
        let diffs: number[] = [];
        for (const r of data as Array<{ created_at: string; answered_at: string | null }>) {
          const c = new Date(r.created_at).getTime();
          if (r.answered_at) {
            const a = new Date(r.answered_at).getTime();
            const d = a - c;
            diffs.push(d);
            if (d <= threshMs) onTime++;
            else late++;
          } else if (now - c > threshMs) {
            late++;
          }
        }
        const avgMs = diffs.length ? diffs.reduce((s, x) => s + x, 0) / diffs.length : null;
        return {
          total: data.length,
          onTime,
          late,
          avgResponseMin: avgMs === null ? null : Math.round(avgMs / 60_000),
        };
      } catch {
        return { total: 0, onTime: 0, late: 0, avgResponseMin: null };
      }
    },
  });
}

/** ─────────── فروش امروز ─────────── */
export interface TodaySalesStats {
  count: number;
  totalAmount: number;
  issuedCount: number;
}

export function useTodaySalesStats() {
  return useQuery<TodaySalesStats>({
    ...COMMON,
    queryKey: ["dash", "sales-today"],
    queryFn: async () => {
      const todayDate = new Date().toISOString().slice(0, 10);
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("total_amount, status, issue_date")
          .eq("issue_date", todayDate);
        if (error || !data) return { count: 0, totalAmount: 0, issuedCount: 0 };
        const rows = data as Array<{ total_amount: number | null; status: string | null }>;
        const total = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
        const issued = rows.filter(
          (r) => r.status && r.status !== "draft" && r.status !== "cancelled",
        ).length;
        return { count: rows.length, totalAmount: total, issuedCount: issued };
      } catch {
        return { count: 0, totalAmount: 0, issuedCount: 0 };
      }
    },
  });
}

/** ─────────── درخواست خرید امروز ─────────── */
export interface TodayPurchaseStats {
  total: number;
  approved: number;
  pending: number;
}

export function useTodayPurchaseStats(scope: "all" | "mine" = "all") {
  const { user } = useAuth();
  return useQuery<TodayPurchaseStats>({
    ...COMMON,
    enabled: scope === "all" ? true : !!user?.id,
    queryKey: ["dash", "purchase-today", scope, user?.id ?? null],
    queryFn: async () => {
      const from = startOfTodayIso();
      try {
        let q = supabase
          .from("purchase_requests")
          .select("status, requested_by, created_at")
          .gte("created_at", from);
        if (scope === "mine" && user?.id) q = q.eq("requested_by", user.id);
        const { data, error } = await q;
        if (error || !data) return { total: 0, approved: 0, pending: 0 };
        const rows = data as Array<{ status: string | null }>;
        return {
          total: rows.length,
          approved: rows.filter((r) => r.status === "approved").length,
          pending: rows.filter((r) => r.status === "pending").length,
        };
      } catch {
        return { total: 0, approved: 0, pending: 0 };
      }
    },
  });
}

/** ─────────── کارت قرمز امروز ─────────── */
export interface TodayPenaltyStats {
  total: number;
  byType: Record<string, number>;
  myActive: number;
}

export function useTodayPenaltyStats(scope: "all" | "mine" = "all") {
  const { user } = useAuth();
  return useQuery<TodayPenaltyStats>({
    ...COMMON,
    enabled: scope === "all" ? true : !!user?.id,
    queryKey: ["dash", "penalties-today", scope, user?.id ?? null],
    queryFn: async () => {
      const from = startOfTodayIso();
      try {
        if (scope === "mine" && user?.id) {
          const { data, error } = await supabase
            .from("performance_penalties")
            .select("type, is_active")
            .eq("user_id", user.id)
            .eq("is_active", true);
          if (error || !data) return { total: 0, byType: {}, myActive: 0 };
          return { total: data.length, byType: {}, myActive: data.length };
        }
        const { data, error } = await supabase
          .from("performance_penalties")
          .select("type, created_at")
          .gte("created_at", from);
        if (error || !data) return { total: 0, byType: {}, myActive: 0 };
        const byType: Record<string, number> = {};
        for (const r of data as Array<{ type: string | null }>) {
          const k = r.type ?? "نامشخص";
          byType[k] = (byType[k] ?? 0) + 1;
        }
        return { total: data.length, byType, myActive: 0 };
      } catch {
        return { total: 0, byType: {}, myActive: 0 };
      }
    },
  });
}

/** ─────────── اسناد و رسیدها امروز ─────────── */
export interface TodayDocumentStats {
  uploaded: number;
  confirmed: number;
  rejectedOrExpired: number;
  deliveryReceipts: number;
}

export function useTodayDocumentStats(scope: "all" | "mine" = "all") {
  const { user } = useAuth();
  return useQuery<TodayDocumentStats>({
    ...COMMON,
    enabled: scope === "all" ? true : !!user?.id,
    queryKey: ["dash", "docs-today", scope, user?.id ?? null],
    queryFn: async () => {
      const from = startOfTodayIso();
      try {
        let docsQ = supabase
          .from("documents")
          .select("status, uploaded_by, created_at")
          .gte("created_at", from);
        let drQ = supabase
          .from("delivery_receipts")
          .select("status, uploaded_by, created_at")
          .gte("created_at", from);
        if (scope === "mine" && user?.id) {
          docsQ = docsQ.eq("uploaded_by", user.id);
          drQ = drQ.eq("uploaded_by", user.id);
        }
        const [docs, dr] = await Promise.all([docsQ, drQ]);
        const docRows =
          (docs.data as Array<{ status: string | null }> | null) ?? [];
        const drRows = (dr.data as Array<{ status: string | null }> | null) ?? [];
        const all = [...docRows, ...drRows];
        const confirmed = all.filter((r) => r.status === "confirmed").length;
        const badStatuses = new Set(["rejected", "expired"]);
        const rejected = all.filter((r) => r.status && badStatuses.has(r.status)).length;
        return {
          uploaded: all.length,
          confirmed,
          rejectedOrExpired: rejected,
          deliveryReceipts: drRows.length,
        };
      } catch {
        return { uploaded: 0, confirmed: 0, rejectedOrExpired: 0, deliveryReceipts: 0 };
      }
    },
  });
}

/** ─────────── رویدادهای اخیر کاربر ─────────── */
export interface RecentEvent {
  id: string;
  type: string;
  title: string;
  createdAt: string;
}

export function useRecentEvents(limit = 10) {
  const { user } = useAuth();
  return useQuery<RecentEvent[]>({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: ["dash", "recent-events", user?.id ?? null, limit],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("notification_events")
          .select("id, event_type, payload, created_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error || !data) return [];
        return (data as Array<{
          id: string;
          event_type: string | null;
          payload: { title?: string; message?: string } | null;
          created_at: string;
        }>).map((r) => ({
          id: r.id,
          type: r.event_type ?? "event",
          title:
            r.payload?.title ??
            r.payload?.message ??
            humanizeEventType(r.event_type),
          createdAt: r.created_at,
        }));
      } catch {
        return [];
      }
    },
  });
}

function humanizeEventType(t: string | null): string {
  if (!t) return "رویداد جدید";
  const map: Record<string, string> = {
    inquiry_created: "استعلام جدید",
    inquiry_answered: "استعلام پاسخ داده شد",
    penalty_created: "کارت قرمز ثبت شد",
    document_confirmed: "سند تأیید شد",
    document_rejected: "سند رد شد",
    delivery_receipt_uploaded: "رسید تحویل آپلود شد",
    purchase_request_created: "درخواست خرید ثبت شد",
    purchase_request_status_changed: "وضعیت درخواست خرید تغییر کرد",
    birthday: "تولد همکار",
  };
  return map[t] ?? t.replace(/_/g, " ");
}

// silence unused import warning when safeCount is removed
void safeCount;