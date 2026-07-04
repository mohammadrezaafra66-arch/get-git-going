import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMessengerGroups } from "@/hooks/messenger/useMessengerGroups";

const COMMON = { staleTime: 60_000, refetchInterval: 120_000, retry: false } as const;

export function useUnreadMessagesCount(): number {
  const { data } = useMessengerGroups();
  if (!data) return 0;
  return data.reduce((sum, g) => sum + (g.unread_count ?? 0), 0);
}

type AnySupabase = {
  from: (t: string) => {
    select: (
      cols: string,
      opts: { count: "estimated"; head: true },
    ) => {
      eq: (k: string, v: unknown) => unknown;
    };
  };
};

async function safeCount(
  builder: (db: AnySupabase) => Promise<{ count: number | null; error: unknown }> | unknown,
): Promise<number> {
  try {
    const res = (await builder(supabase as unknown as AnySupabase)) as {
      count: number | null;
      error: unknown;
    };
    if (res?.error) return 0;
    return res?.count ?? 0;
  } catch {
    return 0;
  }
}

export function usePendingPurchaseCount() {
  const { user, roles } = useAuth();
  const isAdminOrManager = roles.some(
    (r) => r === "admin" || r === "manager",
  );
  return useQuery({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: [
      "hub-count",
      "purchase-pending",
      user?.id,
      isAdminOrManager ? "all" : "mine",
    ],
    queryFn: () =>
      safeCount((db) => {
        const q = db
          .from("purchase_requests")
          .select("id", { count: "estimated", head: true })
          .eq("status", "pending") as unknown as {
          eq: (k: string, v: unknown) => unknown;
        };
        if (isAdminOrManager) return q;
        return q.eq("requested_by", user!.id);
      }),
  });
}

export function useActivePenaltyCount() {
  const { user } = useAuth();
  return useQuery({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: ["hub-count", "penalties-active", user?.id],
    queryFn: () =>
      safeCount((db) => {
        const q = db
          .from("performance_penalties")
          .select("id", { count: "estimated", head: true })
          .eq("is_active", true) as unknown as {
          eq: (k: string, v: unknown) => unknown;
        };
        return q.eq("user_id", user!.id);
      }),
  });
}

export function usePendingReceiptCount() {
  const { user } = useAuth();
  return useQuery({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: ["hub-count", "receipts-pending", user?.id],
    queryFn: () =>
      safeCount((db) => {
        const q = db
          .from("delivery_receipts")
          .select("id", { count: "estimated", head: true })
          .eq("status", "pending_review") as unknown as {
          eq: (k: string, v: unknown) => unknown;
        };
        return q.eq("uploaded_by", user!.id);
      }),
  });
}

export function usePendingDocCount() {
  const { user } = useAuth();
  return useQuery({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: ["hub-count", "docs-pending", user?.id],
    queryFn: () =>
      safeCount((db) => {
        const q = db
          .from("documents")
          .select("id", { count: "estimated", head: true })
          .eq("status", "pending_review") as unknown as {
          eq: (k: string, v: unknown) => unknown;
        };
        return q.eq("uploaded_by", user!.id);
      }),
  });
}

export function useGamificationBadgeCount(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    enabled: !!user?.id,
    queryKey: ["gamification-badge", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_progress")
        .select("level")
        .eq("employee_id", user!.id)
        .maybeSingle();
      if (error) return 0;
      return data?.level ?? 0;
    },
    staleTime: 300_000,
    refetchInterval: 300_000,
  });
  return data ?? 0;
}