/**
 * D4 · N18 — صفحه «فعالیت‌ها» با سطل‌های تاریخ و فیلتر انجام‌شده.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { toFaDigits, formatDateTimeFa } from "@/lib/i18n/formatters";
import {
  ActivityDoneControls,
} from "@/components/sales-desk";
import {
  bucketForDueAt,
  listActivities,
  type ActivityBucket,
  type ActivityDoneFilter,
  type SalesActivityRow,
} from "@/lib/sales-desk";

export const Route = createFileRoute(
  "/_app/operations/sales-desk_/activities",
)({
  beforeLoad: async () => {
    await requirePermission("sales-activities", "view");
  },
  component: SalesActivitiesPage,
});

const BUCKET_ORDER: ActivityBucket[] = [
  "past_to_today",
  "overdue",
  "today",
  "tomorrow",
  "rest_of_week",
  "other",
];

function bucketTitle(b: ActivityBucket, count: number): string {
  const n = toFaDigits(count);
  switch (b) {
    case "past_to_today":
      return "گذشته تا امروز";
    case "overdue":
      return `تاریخ گذشته (${n})`;
    case "today":
      return `امروز (${n})`;
    case "tomorrow":
      return "فردا";
    case "rest_of_week":
      return "تا آخر هفته";
    case "other":
      return "تاریخ دیگر";
  }
}

function SalesActivitiesPage() {
  const { user, roles } = useAuth();
  const isManager = hasAnyRole(roles, ["admin", "manager"]);
  const [doneFilter, setDoneFilter] = useState<ActivityDoneFilter>("open");
  const [activeBucket, setActiveBucket] = useState<ActivityBucket>("past_to_today");

  const q = useQuery({
    queryKey: [
      "sales-desk",
      "activities-page",
      user?.id,
      doneFilter,
      isManager,
    ],
    enabled: !!user?.id,
    queryFn: () =>
      listActivities({
        doneFilter,
        salespersonId: isManager ? null : user!.id,
        limit: 300,
      }),
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const todayYmd = q.data?.todayYmd ?? "";
    const buckets: Record<ActivityBucket, SalesActivityRow[]> = {
      past_to_today: [],
      overdue: [],
      today: [],
      tomorrow: [],
      rest_of_week: [],
      other: [],
    };
    for (const row of q.data?.rows ?? []) {
      if (!row.due_at) {
        buckets.other.push(row);
        continue;
      }
      const b = bucketForDueAt(row.due_at, todayYmd);
      if (!b) {
        buckets.other.push(row);
        continue;
      }
      if (b === "overdue" || b === "today") {
        buckets.past_to_today.push(row);
      }
      buckets[b].push(row);
    }
    return buckets;
  }, [q.data]);

  const list = grouped[activeBucket] ?? [];

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="فعالیت‌ها"
        description="سطل‌های موعد بر اساس روز تهران (tehran_today)"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/operations/sales-desk">
              <ArrowRight className="ms-1 h-4 w-4" />
              میز فروش
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["open", "انجام نشده"],
            ["done", "انجام شده"],
            ["all", "همه فعالیت ها"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={doneFilter === key ? "default" : "outline"}
            onClick={() => setDoneFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKET_ORDER.map((b) => {
          const count = grouped[b]?.length ?? 0;
          return (
            <Button
              key={b}
              type="button"
              size="sm"
              variant={activeBucket === b ? "secondary" : "ghost"}
              onClick={() => setActiveBucket(b)}
            >
              {bucketTitle(b, count)}
              {b !== "overdue" && b !== "today" && b !== "past_to_today" ? (
                <Badge variant="outline" className="mr-1 text-[10px]">
                  {toFaDigits(count)}
                </Badge>
              ) : null}
            </Button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {bucketTitle(activeBucket, list.length)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> …
            </p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">
              {(q.error as Error).message}
            </p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">ردیفی نیست.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((a) => (
                <li
                  key={a.id}
                  className="rounded-md border border-border/60 bg-muted/10 p-3 text-sm"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {a.activity_type?.title ?? "فعالیت"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {a.done_at ? "انجام شده" : "انجام نشده"}
                    </Badge>
                    <span className="font-medium">
                      {a.person?.display_name ?? "شخص"}
                    </span>
                    {a.deal_id ? (
                      <Link
                        to="/operations/sales-desk/deals/$dealId"
                        params={{ dealId: a.deal_id }}
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        معامله
                      </Link>
                    ) : null}
                  </div>
                  <p className="line-clamp-2">{a.title || a.body || "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.due_at ? formatDateTimeFa(a.due_at) : "بدون موعد"}
                    {" · "}
                    مسئول: {a.salesperson?.full_name?.trim() || "—"}
                  </p>
                  <ActivityDoneControls
                    activity={a}
                    onUpdated={() => void q.refetch()}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
