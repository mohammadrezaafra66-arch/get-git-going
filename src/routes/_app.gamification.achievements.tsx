import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAllAchievements,
  useMyAchievements,
} from "@/hooks/gamification/useGamification";
import { AchievementCard } from "@/components/gamification/AchievementCard";
import { toPersianDigits } from "@/lib/dashboard/utils";
import { requirePermission } from "@/lib/rbac/route-guards";

// C-4 (unwired wave 1). Had no beforeLoad. This page is for every employee, so the
// guard is deliberately the widest one that is still a guard: `dashboard:view`, which
// role_permissions grants to admin, manager, accountant, sales, viewer and
// purchase_specialist and denies to `site`. requireAdmin/requireAnyRole would be
// wrong here — they would hide the badge wall from the people who earn the badges.
export const Route = createFileRoute("/_app/gamification/achievements")({
  beforeLoad: async () => {
    await requirePermission("dashboard", "view");
  },
  component: AchievementsPage,
});

function AchievementsPage() {
  const all = useAllAchievements();
  const mine = useMyAchievements();

  const unlockedMap = new Map<string, string | undefined>();
  for (const row of mine.data ?? []) {
    const a = (row as { achievement_id: string; unlocked_at: string });
    unlockedMap.set(a.achievement_id, a.unlocked_at);
  }

  const total = all.data?.length ?? 0;
  const unlockedCount = (all.data ?? []).filter((a) => unlockedMap.has(a.id)).length;
  const isLoading = all.isLoading || mine.isLoading;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="نشان‌ها"
          description="مجموعه‌ی دستاوردهای قابل کسب در سیستم."
        />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gamification">
            <ChevronRight className="ml-1 h-4 w-4" /> بازگشت
          </Link>
        </Button>
      </div>

      {!isLoading && total > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <span className="font-bold text-primary">
            {toPersianDigits(unlockedCount)}
          </span>{" "}
          از <span className="font-bold">{toPersianDigits(total)}</span> نشان کسب
          شده است.
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
          هنوز نشانی تعریف نشده است.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5">
          {(all.data ?? []).map((a) => {
            const unlockedAt = unlockedMap.get(a.id);
            return (
              <AchievementCard
                key={a.id}
                achievement={{
                  id: a.id,
                  key: a.key,
                  title_fa: a.title_fa,
                  description: a.description ?? null,
                  icon: a.icon ?? null,
                  xp_reward: a.xp_reward,
                }}
                unlocked={unlockedMap.has(a.id)}
                unlockedAt={unlockedAt}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}