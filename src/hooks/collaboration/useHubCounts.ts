import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMessengerGroups } from "@/hooks/messenger/useMessengerGroups";

const COMMON = { staleTime: 60_000, refetchInterval: 60_000, retry: false } as const;

export function useUnreadMessagesCount(): number {
  const { data } = useMessengerGroups();
  if (!data) return 0;
  return data.reduce((sum, g) => sum + (g.unread_count ?? 0), 0);
}

async function safeCount(
  table: string,
  build: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<number> {
  try {
    const q = supabase.from(table).select("id", { count: "exact", head: true });
    const filtered = build(q) as { count: number | null; error: unknown };
    const { count, error } = (await filtered) as { count: number | null; error: unknown };
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export function usePendingPurchaseCount() {
  return useQuery({
    ...COMMON,
    queryKey: ["hub-count", "purchase-pending"],
    queryFn: () =>
      safeCount("purchase_requests", (q) =>
        (q as unknown as { eq: (k: string, v: string) => unknown }).eq("status", "pending"),
      ),
  });
}

export function useActivePenaltyCount() {
  const { user } = useAuth();
  return useQuery({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: ["hub-count", "penalties-active", user?.id],
    queryFn: () =>
      safeCount("performance_penalties", (q) =>
        (q as unknown as { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => unknown } })
          .eq("is_active", true)
          .eq("user_id", user!.id),
      ),
  });
}

export function usePendingReceiptCount() {
  const { user } = useAuth();
  return useQuery({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: ["hub-count", "receipts-pending", user?.id],
    queryFn: () =>
      safeCount("delivery_receipts", (q) =>
        (q as unknown as { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => unknown } })
          .eq("status", "pending_review")
          .eq("uploaded_by", user!.id),
      ),
  });
}

export function usePendingDocCount() {
  const { user } = useAuth();
  return useQuery({
    ...COMMON,
    enabled: !!user?.id,
    queryKey: ["hub-count", "docs-pending", user?.id],
    queryFn: () =>
      safeCount("documents", (q) =>
        (q as unknown as { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => unknown } })
          .eq("status", "pending_review")
          .eq("uploaded_by", user!.id),
      ),
  });
}