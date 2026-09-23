/**
 * Report «معاملات ثبت‌شده برای دیگران»: author_id <> salesperson_id,
 * group by author × Tehran day, count, drill-down.
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
import { tehranToday } from "@/lib/marketing/tehran-date";
import { toFaDigits, formatDateTimeFa } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute(
  "/_app/operations/sales-desk_/deals-for-others",
)({
  beforeLoad: async () => {
    await requirePermission("sales-deals-for-others", "view");
  },
  component: DealsForOthersReportPage,
});

function tehranDayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

type Row = {
  id: string;
  author_id: string;
  salesperson_id: string;
  title: string | null;
  body: string;
  status: string;
  created_at: string;
  person_id: string;
  stage_id?: string | null;
  stage_title?: string | null;
};

type Group = {
  authorId: string;
  authorName: string;
  day: string;
  count: number;
  dealIds: string[];
};

function DealsForOthersReportPage() {
  const { user, roles } = useAuth();
  const isManager = hasAnyRole(roles, ["admin", "manager"]);
  const [drill, setDrill] = useState<Group | null>(null);

  const q = useQuery({
    queryKey: ["sales-desk", "deals-for-others", user?.id, isManager],
    enabled: !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from("sales_interactions" as never)
        .select(
          "id, author_id, salesperson_id, title, body, status, created_at, person_id, stage_id" as never,
        )
        .eq("kind" as never, "request" as never)
        .is("deleted_at" as never, null as never)
        .not("salesperson_id" as never, "is" as never, null as never)
        .order("created_at" as never, { ascending: false } as never)
        .limit(500);

      // author <> salesperson — PostgREST has no neq-column; filter client-side
      if (!isManager) {
        query = query.eq("author_id" as never, user!.id as never);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as unknown as Row[]).filter(
        (r) => r.salesperson_id && r.author_id !== r.salesperson_id,
      );
      const stageIds = [...new Set(rows.map((r) => r.stage_id).filter(Boolean) as string[])];
      if (stageIds.length) {
        const { data: stages } = await supabase
          .from("sales_pipeline_stages" as never)
          .select("id, title" as never)
          .in("id" as never, stageIds as never);
        const sm = new Map(
          ((stages ?? []) as { id: string; title: string }[]).map((s) => [s.id, s.title]),
        );
        for (const r of rows) r.stage_title = r.stage_id ? sm.get(r.stage_id) ?? null : null;
      }

      const authorIds = [...new Set(rows.map((r) => r.author_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);
      const nameMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.id.slice(0, 8)]),
      );

      const groupMap = new Map<string, Group>();
      for (const r of rows) {
        const day = tehranDayOf(r.created_at);
        const key = `${r.author_id}|${day}`;
        const g = groupMap.get(key) ?? {
          authorId: r.author_id,
          authorName: nameMap.get(r.author_id) ?? r.author_id.slice(0, 8),
          day,
          count: 0,
          dealIds: [],
        };
        g.count += 1;
        g.dealIds.push(r.id);
        groupMap.set(key, g);
      }

      return {
        rows,
        groups: [...groupMap.values()].sort((a, b) =>
          a.day === b.day
            ? a.authorName.localeCompare(b.authorName, "fa")
            : b.day.localeCompare(a.day),
        ),
        nameMap,
      };
    },
    staleTime: 60_000,
  });

  const drillRows = useMemo(() => {
    if (!drill || !q.data) return [];
    const set = new Set(drill.dealIds);
    return q.data.rows.filter((r) => set.has(r.id));
  }, [drill, q.data]);

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="معاملات ثبت‌شده برای دیگران"
        description={`گروه‌بندی بر اساس ایجاد کننده × روز تهران (امروز: ${tehranToday()})`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/operations/sales-desk">
              <ArrowRight className="ms-1 h-4 w-4" />
              میز فروش
            </Link>
          </Button>
        }
      />

      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> …
        </p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">خلاصه</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(q.data?.groups ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">ردیفی نیست.</p>
              ) : (
                <ul className="divide-y">
                  {(q.data?.groups ?? []).map((g) => (
                    <li key={`${g.authorId}-${g.day}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right text-sm hover:bg-muted/40"
                        onClick={() => setDrill(g)}
                      >
                        <span>
                          <strong>{g.authorName}</strong>
                          <span className="mr-2 text-xs text-muted-foreground" dir="ltr">
                            {g.day}
                          </span>
                        </span>
                        <Badge variant="secondary">{toFaDigits(g.count)}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {drill
                  ? `جزئیات — ${drill.authorName} / ${drill.day}`
                  : "برای جزئیات یک ردیف را انتخاب کنید"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!drill ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : drillRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">خالی</p>
              ) : (
                <ul className="space-y-2">
                  {drillRows.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-md border p-2.5 text-sm"
                    >
                      <Link
                        to="/operations/sales-desk/deals/$dealId"
                        params={{ dealId: r.id }}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {r.title || r.body.slice(0, 60) || r.id.slice(0, 8)}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTimeFa(r.created_at)} · {r.status}
                        {r.stage_title ? ` · ${r.stage_title}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
