import type { AppRole } from "@/lib/rbac/roles";
import { getNavigationEntryByRoute, isNavigationEntryVisible } from "./selectors";
import type { NavigationEntry, NavigationPermission } from "./types";

export interface PricingQueueSnapshot {
  pending_count: number | null;
  failed_count: number | null;
  oldest_pending_at: string | null;
}

export interface NeedsActionSnapshot {
  pendingUsersCount?: number | null;
  pricingQueue?: PricingQueueSnapshot | null;
  nowMs?: number;
}

export interface NeedsActionSource {
  id: "pending-users" | "pricing-recompute-queue";
  label: string;
  route: string;
  permission: NavigationPermission;
  priority: number;
  resolve: (snapshot: NeedsActionSnapshot) => Omit<NeedsActionItem, "entry" | "route"> | null;
}

export interface NeedsActionItem {
  id: NeedsActionSource["id"];
  label: string;
  route: string;
  entry: NavigationEntry;
  count: number;
  priority: number;
  tone: "warning" | "danger";
  detail?: string;
}

const STALE_PRICING_QUEUE_MS = 10 * 60 * 1000;

export const NEEDS_ACTION_SOURCES: NeedsActionSource[] = [
  {
    id: "pending-users",
    label: "کاربران در انتظار تأیید",
    route: "/users",
    permission: { module: "users", action: "view" },
    priority: 10,
    resolve: ({ pendingUsersCount }) => {
      const count = Number(pendingUsersCount ?? 0);
      if (count <= 0) return null;
      return {
        id: "pending-users",
        label: "کاربران در انتظار تأیید",
        count,
        priority: 10,
        tone: "warning",
      };
    },
  },
  {
    id: "pricing-recompute-queue",
    label: "صف انتشار قیمت",
    route: "/pricing/recompute-prices",
    permission: { module: "pricing", action: "update" },
    priority: 20,
    resolve: ({ pricingQueue, nowMs = Date.now() }) => {
      const failedCount = Number(pricingQueue?.failed_count ?? 0);
      const pendingCount = Number(pricingQueue?.pending_count ?? 0);
      const oldestPendingAt = pricingQueue?.oldest_pending_at;
      const oldestPendingMs = oldestPendingAt ? nowMs - new Date(oldestPendingAt).getTime() : 0;

      if (failedCount > 0) {
        return {
          id: "pricing-recompute-queue",
          label: "صف انتشار قیمت",
          count: failedCount,
          priority: 5,
          tone: "danger",
          detail: "نیازمند بررسی خطا",
        };
      }

      if (pendingCount > 100 || oldestPendingMs > STALE_PRICING_QUEUE_MS) {
        return {
          id: "pricing-recompute-queue",
          label: "صف انتشار قیمت",
          count: pendingCount,
          priority: 20,
          tone: "warning",
          detail: "صف قیمت طولانی شده است",
        };
      }

      return null;
    },
  },
];

export function resolveNeedsActionItems(
  roles: AppRole[] | string[],
  snapshot: NeedsActionSnapshot,
  limit = 3,
): NeedsActionItem[] {
  return NEEDS_ACTION_SOURCES.map((source) => {
    const entry = getNavigationEntryByRoute(source.route);
    if (!entry || !isNavigationEntryVisible(entry, roles)) return null;
    const resolved = source.resolve(snapshot);
    if (!resolved) return null;
    return {
      ...resolved,
      route: source.route,
      entry,
    };
  })
    .filter((item): item is NeedsActionItem => Boolean(item))
    .sort((a, b) => a.priority - b.priority || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
