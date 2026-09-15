import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Inbox, Loader2, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";
import type { DossierInteraction } from "@/lib/sales-desk";
import { OutcomeButtons } from "./OutcomeButtons";

type DeskRow = DossierInteraction & {
  person?: { display_name: string } | null;
  dossierCustomerId?: string | null;
};

function tehranDayBounds(now = new Date()): { startIso: string; endIso: string } {
  // روز تقویمی تهران به‌صورت ISO محلی تقریبی (UTC offset از Intl)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = fmt.format(now); // YYYY-MM-DD
  // حدود تقریبی روز تهران: 00:00 تا 23:59:59 به وقت تهران ≈ UTC+3:30
  const startIso = new Date(`${day}T00:00:00+03:30`).toISOString();
  const endIso = new Date(`${day}T23:59:59.999+03:30`).toISOString();
  return { startIso, endIso };
}

async function fetchFollowUpsToday(userId: string): Promise<DeskRow[]> {
  const { startIso, endIso } = tehranDayBounds();
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(
      "id, person_id, customer_id, kind, title, body, status, outcome_note, salesperson_id, author_id, call_log_id, next_follow_up_at, followed_up_at, source, created_at, updated_at",
    )
    .eq("status" as never, "open" as never)
    .gte("next_follow_up_at" as never, startIso as never)
    .lte("next_follow_up_at" as never, endIso as never)
    .or(`salesperson_id.eq.${userId},author_id.eq.${userId}` as never)
    .order("next_follow_up_at" as never, { ascending: true } as never)
    .limit(30);
  if (error) throw new Error(error.message);
  return enrichWithPersonNames((data ?? []) as unknown as DeskRow[]);
}

async function fetchOpenRequests(userId: string): Promise<DeskRow[]> {
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(
      "id, person_id, customer_id, kind, title, body, status, outcome_note, salesperson_id, author_id, call_log_id, next_follow_up_at, followed_up_at, source, created_at, updated_at",
    )
    .eq("kind" as never, "request" as never)
    .eq("status" as never, "open" as never)
    .or(`salesperson_id.eq.${userId},author_id.eq.${userId}` as never)
    .order("created_at" as never, { ascending: false } as never)
    .limit(20);
  if (error) throw new Error(error.message);
  return enrichWithPersonNames((data ?? []) as unknown as DeskRow[]);
}

async function fetchRecentCalls(userId: string): Promise<DeskRow[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(
      "id, person_id, customer_id, kind, title, body, status, outcome_note, salesperson_id, author_id, call_log_id, next_follow_up_at, followed_up_at, source, created_at, updated_at",
    )
    .eq("kind" as never, "call" as never)
    .gte("created_at" as never, since as never)
    .or(`salesperson_id.eq.${userId},author_id.eq.${userId}` as never)
    .order("created_at" as never, { ascending: false } as never)
    .limit(10);
  if (error) throw new Error(error.message);
  return enrichWithPersonNames((data ?? []) as unknown as DeskRow[]);
}

async function enrichWithPersonNames(rows: DeskRow[]): Promise<DeskRow[]> {
  const ids = [...new Set(rows.map((r) => r.person_id).filter(Boolean))];
  if (ids.length === 0) return rows;
  const [{ data: persons }, { data: customers }] = await Promise.all([
    supabase.from("persons").select("id, display_name").in("id", ids),
    supabase.from("customers").select("id, person_id").in("person_id", ids).limit(100),
  ]);
  const personMap = new Map((persons ?? []).map((p) => [p.id, p]));
  const customerByPerson = new Map<string, string>();
  for (const c of customers ?? []) {
    if (c.person_id && !customerByPerson.has(c.person_id)) {
      customerByPerson.set(c.person_id, c.id);
    }
  }
  return rows.map((r) => ({
    ...r,
    person: personMap.get(r.person_id) ?? null,
    dossierCustomerId: r.customer_id ?? customerByPerson.get(r.person_id) ?? null,
  }));
}

/**
 * خلاصه امروز من: پیگیری‌های امروز، درخواست‌های باز، تماس‌های اخیر.
 */
export function FollowUpsToday() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  const followQ = useQuery({
    queryKey: ["sales-desk", "follow-ups-today", userId],
    enabled: !!userId,
    queryFn: () => fetchFollowUpsToday(userId!),
    staleTime: 30_000,
  });

  const openQ = useQuery({
    queryKey: ["sales-desk", "open-requests", userId],
    enabled: !!userId,
    queryFn: () => fetchOpenRequests(userId!),
    staleTime: 30_000,
  });

  const callsQ = useQuery({
    queryKey: ["sales-desk", "recent-calls-manual", userId],
    enabled: !!userId,
    queryFn: () => fetchRecentCalls(userId!),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sales-desk"] });
  };

  if (!userId) {
    return (
      <Card dir="rtl">
        <CardContent className="py-6 text-sm text-muted-foreground">
          برای دیدن خلاصه امروز وارد شوید.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3" dir="rtl">
      <Section
        title="پیگیری‌های امروز"
        icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
        loading={followQ.isLoading}
        error={followQ.isError ? (followQ.error as Error).message : null}
        empty="پیگیری سررسید امروز ندارید."
        rows={followQ.data ?? []}
        onUpdated={invalidate}
        badgeKind="follow"
      />
      <Section
        title="درخواست‌های باز"
        icon={<Inbox className="h-4 w-4 text-muted-foreground" />}
        loading={openQ.isLoading}
        error={openQ.isError ? (openQ.error as Error).message : null}
        empty="درخواست بازی ندارید."
        rows={openQ.data ?? []}
        onUpdated={invalidate}
        badgeKind="request"
      />
      <Section
        title="تماس‌های اخیر"
        icon={<Phone className="h-4 w-4 text-muted-foreground" />}
        loading={callsQ.isLoading}
        error={callsQ.isError ? (callsQ.error as Error).message : null}
        empty="تماس دستی اخیر ثبت نشده (بدون ایزابل هم می‌توانید خلاصه بنویسید)."
        rows={callsQ.data ?? []}
        onUpdated={invalidate}
        badgeKind="call"
        hideOutcomes
      />
    </div>
  );
}

function Section({
  title,
  icon,
  loading,
  error,
  empty,
  rows,
  onUpdated,
  badgeKind,
  hideOutcomes,
}: {
  title: string;
  icon: ReactNode;
  loading: boolean;
  error: string | null;
  empty: string;
  rows: DeskRow[];
  onUpdated: () => void;
  badgeKind: string;
  hideOutcomes?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
          {!loading && !error ? (
            <Badge variant="secondary" className="text-[10px]">
              {rows.length}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> …
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-border/60 bg-muted/10 p-2.5 text-sm"
              >
                <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {badgeKind}
                  </Badge>
                  <span className="font-medium">
                    {r.person?.display_name ?? "شخص"}
                  </span>
                  {r.dossierCustomerId ? (
                    <Link
                      to="/sales/customers/$customerId/dossier"
                      params={{ customerId: r.dossierCustomerId }}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      پرونده
                    </Link>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-muted-foreground">
                  {r.title || r.body || "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.next_follow_up_at
                    ? `پیگیری: ${formatDateTimeFa(r.next_follow_up_at)}`
                    : formatDateTimeFa(r.created_at)}
                </p>
                {!hideOutcomes && r.status === "open" ? (
                  <div className="mt-2">
                    <OutcomeButtons
                      interactionId={r.id}
                      currentStatus={r.status}
                      onUpdated={onUpdated}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
