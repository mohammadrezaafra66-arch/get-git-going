/**
 * «کارهای من» — deals where salesperson_id = me.
 * D5: traffic-light follow-up + filter «معاملاتی که فعالیتی روی آن‌ها نیست»
 * D7: section «فعالیت‌های امروز و عقب‌افتاده»
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Inbox, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";
import {
  dealIdsWithNoOpenActivity,
  followUpLightsForDeals,
  listOpenDueTodayOrOverdue,
  type FollowUpTrafficLight,
} from "@/lib/sales-desk/activities";
import { OutcomeButtons, salesInteractionStatusLabel } from "./OutcomeButtons";
import { FollowUpTrafficLightIcon } from "./FollowUpTrafficLightIcon";
import { ActivityDoneControls } from "./ActivityDoneControls";

type DealRow = {
  id: string;
  person_id: string;
  customer_id: string | null;
  title: string | null;
  body: string;
  status: string;
  salesperson_id: string | null;
  author_id: string;
  created_at: string;
  won_at: string | null;
  lost_at: string | null;
  person?: { display_name: string } | null;
  author?: { full_name: string | null } | null;
  salesperson?: { full_name: string | null } | null;
  dossierCustomerId?: string | null;
};

type Mode = "my-work" | "all-mine";

async function fetchDeals(opts: {
  userId: string;
  mode: Mode;
  authorId?: string | null;
  status?: string | null;
}): Promise<DealRow[]> {
  let q = supabase
    .from("sales_interactions" as never)
    .select(
      "id, person_id, customer_id, title, body, status, salesperson_id, author_id, created_at, won_at, lost_at" as never,
    )
    .eq("kind" as never, "request" as never)
    .order("created_at" as never, { ascending: false } as never)
    .limit(50);

  if (opts.mode === "my-work") {
    q = q.eq("salesperson_id" as never, opts.userId as never);
  } else {
    q = q.or(
      `salesperson_id.eq.${opts.userId},author_id.eq.${opts.userId}` as never,
    );
  }
  if (opts.authorId) {
    q = q.eq("author_id" as never, opts.authorId as never);
  }
  if (opts.status && opts.status !== "all") {
    q = q.eq("status" as never, opts.status as never);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return enrich(data as unknown as DealRow[]);
}

async function enrich(rows: DealRow[]): Promise<DealRow[]> {
  if (rows.length === 0) return rows;
  const personIds = [...new Set(rows.map((r) => r.person_id))];
  const profileIds = [
    ...new Set(
      rows.flatMap((r) => [r.author_id, r.salesperson_id].filter(Boolean) as string[]),
    ),
  ];
  const [{ data: persons }, { data: profiles }, { data: customers }] =
    await Promise.all([
      supabase.from("persons").select("id, display_name").in("id", personIds),
      supabase.from("profiles").select("id, full_name").in("id", profileIds),
      supabase.from("customers").select("id, person_id").in("person_id", personIds).limit(100),
    ]);
  const personMap = new Map((persons ?? []).map((p) => [p.id, p]));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const customerByPerson = new Map<string, string>();
  for (const c of customers ?? []) {
    if (c.person_id && !customerByPerson.has(c.person_id)) {
      customerByPerson.set(c.person_id, c.id);
    }
  }
  return rows.map((r) => ({
    ...r,
    person: personMap.get(r.person_id) ?? null,
    author: profileMap.get(r.author_id) ?? null,
    salesperson: r.salesperson_id ? profileMap.get(r.salesperson_id) ?? null : null,
    dossierCustomerId: r.customer_id ?? customerByPerson.get(r.person_id) ?? null,
  }));
}

type Props = {
  mode?: Mode;
  title?: string;
};

export function MyWorkDeals({
  mode = "my-work",
  title = "کارهای من",
}: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [authorSearch, setAuthorSearch] = useState("");
  const [noActivityOnly, setNoActivityOnly] = useState(false);

  const dealsQ = useQuery({
    queryKey: ["sales-desk", "deals", mode, userId, authorFilter, statusFilter],
    enabled: !!userId,
    queryFn: () =>
      fetchDeals({
        userId: userId!,
        mode,
        authorId: authorFilter === "all" ? null : authorFilter,
        status: statusFilter,
      }),
    staleTime: 30_000,
  });

  const openDealIds = useMemo(
    () => (dealsQ.data ?? []).filter((r) => r.status === "open").map((r) => r.id),
    [dealsQ.data],
  );

  const lightsQ = useQuery({
    queryKey: ["sales-desk", "follow-up-lights", openDealIds.join(",")],
    enabled: openDealIds.length > 0,
    queryFn: () => followUpLightsForDeals(openDealIds),
    staleTime: 30_000,
  });

  const noActQ = useQuery({
    queryKey: ["sales-desk", "deals-no-activity", openDealIds.join(",")],
    enabled: noActivityOnly && openDealIds.length > 0,
    queryFn: () => dealIdsWithNoOpenActivity(openDealIds),
    staleTime: 30_000,
  });

  const overdueActsQ = useQuery({
    queryKey: ["sales-desk", "my-overdue-activities", userId],
    enabled: !!userId && mode === "my-work",
    queryFn: () => listOpenDueTodayOrOverdue({ salespersonId: userId! }),
    staleTime: 30_000,
  });

  const authors = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of dealsQ.data ?? []) {
      map.set(r.author_id, r.author?.full_name?.trim() || r.author_id.slice(0, 8));
    }
    return [...map.entries()];
  }, [dealsQ.data]);

  const filteredAuthors = useMemo(() => {
    const q = authorSearch.trim();
    if (!q) return authors;
    return authors.filter(([, name]) => name.includes(q));
  }, [authors, authorSearch]);

  const rows = useMemo(() => {
    let list = dealsQ.data ?? [];
    if (noActivityOnly && noActQ.data) {
      list = list.filter((r) => noActQ.data!.has(r.id));
    }
    return list;
  }, [dealsQ.data, noActivityOnly, noActQ.data]);

  if (!userId) {
    return (
      <Card dir="rtl">
        <CardContent className="py-6 text-sm text-muted-foreground">
          برای دیدن معاملات وارد شوید.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {mode === "my-work" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              فعالیت‌های امروز و عقب‌افتاده
              {!overdueActsQ.isLoading ? (
                <Badge variant="secondary" className="mr-2 text-[10px] tabular-nums">
                  {toFaDigits((overdueActsQ.data ?? []).length)}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueActsQ.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> …
              </p>
            ) : overdueActsQ.isError ? (
              <p className="text-sm text-destructive">
                {(overdueActsQ.error as Error).message}
              </p>
            ) : (overdueActsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">موردی نیست.</p>
            ) : (
              <ul className="space-y-2">
                {(overdueActsQ.data ?? []).map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-border/60 bg-muted/10 p-2.5 text-sm"
                  >
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {a.activity_type?.title ?? "فعالیت"}
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
                    <p className="line-clamp-2 text-muted-foreground">
                      {a.title || a.body || "—"}
                    </p>
                    {a.due_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        موعد: {formatDateTimeFa(a.due_at)}
                      </p>
                    ) : null}
                    <ActivityDoneControls
                      activity={a}
                      onUpdated={() =>
                        qc.invalidateQueries({ queryKey: ["sales-desk"] })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2 space-y-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            {title}
            {!dealsQ.isLoading ? (
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {toFaDigits(rows.length)}
              </Badge>
            ) : null}
          </CardTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">ایجاد کننده معامله</Label>
              <Select value={authorFilter} onValueChange={setAuthorFilter}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="همه" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {filteredAuthors.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={authorSearch}
                onChange={(e) => setAuthorSearch(e.target.value)}
                placeholder="جستجوی ایجاد کننده…"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">وضعیت</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="open">جاری</SelectItem>
                  <SelectItem value="won">موفق</SelectItem>
                  <SelectItem value="lost">ناموفق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                variant={noActivityOnly ? "default" : "outline"}
                className="h-8"
                onClick={() => setNoActivityOnly((v) => !v)}
              >
                معاملاتی که فعالیتی روی آن‌ها نیست
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {dealsQ.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> …
            </p>
          ) : dealsQ.isError ? (
            <p className="text-sm text-destructive">
              {(dealsQ.error as Error).message}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">معامله‌ای نیست.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const light: FollowUpTrafficLight | undefined =
                  r.status === "open"
                    ? lightsQ.data?.get(r.id) ?? "yellow"
                    : undefined;
                return (
                  <li
                    key={r.id}
                    className="rounded-md border border-border/60 bg-muted/10 p-2.5 text-sm"
                  >
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      {light ? <FollowUpTrafficLightIcon light={light} /> : null}
                      <Badge variant="outline" className="text-[10px]">
                        {salesInteractionStatusLabel(r.status)}
                      </Badge>
                      <span className="font-medium">
                        {r.person?.display_name ?? "شخص"}
                      </span>
                      <Link
                        to="/operations/sales-desk/deals/$dealId"
                        params={{ dealId: r.id }}
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        جزئیات
                      </Link>
                      {r.dossierCustomerId ? (
                        <Link
                          to="/sales/customers/$customerId/dossier"
                          params={{ customerId: r.dossierCustomerId }}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          پرونده
                        </Link>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-muted-foreground">
                      {r.title || r.body || "—"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        ایجاد کننده معامله:{" "}
                        {r.author?.full_name?.trim() || "—"}
                      </span>
                      <span>
                        مسئول معامله:{" "}
                        {r.salesperson?.full_name?.trim() || "—"}
                      </span>
                      <span>{formatDateTimeFa(r.created_at)}</span>
                      {r.won_at ? (
                        <span>موفق: {formatDateTimeFa(r.won_at)}</span>
                      ) : null}
                      {r.lost_at ? (
                        <span>ناموفق: {formatDateTimeFa(r.lost_at)}</span>
                      ) : null}
                    </div>
                    {r.status === "open" || r.status === "won" || r.status === "lost" ? (
                      <div className="mt-2">
                        <OutcomeButtons
                          interactionId={r.id}
                          currentStatus={r.status}
                          onUpdated={() =>
                            qc.invalidateQueries({ queryKey: ["sales-desk"] })
                          }
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
