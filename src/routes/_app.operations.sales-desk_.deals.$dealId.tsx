/**
 * Deal detail — ایجاد کننده / مسئول / محصولات / پیش‌فاکتورها / ایجاد پیش‌فاکتور.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, FilePlus2 } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ActivityDoneControls,
  ActivityForm,
  OutcomeButtons,
  SalesDeskShell,
  salesInteractionStatusLabel,
} from "@/components/sales-desk";
import {
  loadDealById,
  listSalesInteractionItems,
  listActivitiesForDeal,
} from "@/lib/sales-desk";
import { loadDealCapabilities } from "@/lib/sales-desk/capabilities";
import { listSalesPipelineStages, listSalesPipelines } from "@/lib/sales-desk/pipelines";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/operations/sales-desk_/deals/$dealId")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: DealDetailPage,
});

function DealDetailPage() {
  const { dealId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [lostOpenSignal, setLostOpenSignal] = useState(0);

  const dealQ = useQuery({
    queryKey: ["sales-desk", "deal", dealId],
    queryFn: () => loadDealById(dealId),
    staleTime: 15_000,
  });

  const itemsQ = useQuery({
    queryKey: ["sales-desk", "deal-items", dealId],
    queryFn: () => listSalesInteractionItems(dealId),
    staleTime: 15_000,
  });

  const quotesQ = useQuery({
    queryKey: ["sales-desk", "deal-quotes", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_quotes" as never)
        .select(
          "id, quote_number, status, final_amount, created_at, salesperson_id" as never,
        )
        .eq("interaction_id" as never, dealId as never)
        .order("created_at" as never, { ascending: false } as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Array<{
        id: string;
        quote_number: string | null;
        status: string;
        final_amount: number | null;
        created_at: string;
        salesperson_id: string | null;
      }>;
    },
    staleTime: 15_000,
  });

  const activitiesQ = useQuery({
    queryKey: ["sales-desk", "deal-activities", dealId],
    queryFn: () => listActivitiesForDeal(dealId),
    staleTime: 15_000,
  });

  const capsQ = useQuery({
    queryKey: ["sales-desk", "deal-caps", dealId],
    queryFn: async () => (await loadDealCapabilities([dealId])).get(dealId) ?? null,
    staleTime: 10_000,
  });

  const stagesQ = useQuery({
    queryKey: ["sales-desk", "deal-stages", dealQ.data?.pipeline_id],
    enabled: !!dealQ.data?.pipeline_id,
    queryFn: () => listSalesPipelineStages({ pipelineId: dealQ.data!.pipeline_id! }),
    staleTime: 30_000,
  });

  const historyQ = useQuery({
    queryKey: ["sales-desk", "deal-history", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_interaction_history" as never)
        .select("id, event, from_value, to_value, actor_id, source, created_at" as never)
        .eq("interaction_id" as never, dealId as never)
        .order("created_at" as never, { ascending: false } as never);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{
        id: string;
        event: string;
        from_value: string | null;
        to_value: string | null;
        actor_id: string | null;
        source: string;
        created_at: string;
      }>;
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[])];
      const [profilesRes, pipes, stages] = await Promise.all([
        actorIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", actorIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
        listSalesPipelines(),
        listSalesPipelineStages(),
      ]);
      const names = new Map(
        ((profilesRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
          p.id,
          p.full_name,
        ]),
      );
      const titles = new Map<string, string>();
      for (const p of pipes) titles.set(p.id, p.title);
      for (const s of stages) titles.set(s.id, s.title);
      return rows.map((r) => ({
        ...r,
        actor_name: r.actor_id ? names.get(r.actor_id) ?? null : null,
        from_label: historyValueFa(r.event, r.from_value, titles),
        to_label: historyValueFa(r.event, r.to_value, titles),
      }));
    },
    staleTime: 10_000,
  });

  const deal = dealQ.data;
  const items = itemsQ.data ?? [];
  const canCreateQuote = !!deal?.customer_id && items.length >= 1;

  const createQuote = () => {
    if (!deal) return;
    void navigate({
      to: "/sales/quotes/new",
      search: {
        interactionId: deal.id,
      },
    });
  };

  return (
    <SalesDeskShell
      title={deal?.title?.trim() || "جزئیات معامله"}
      description="مسئول، ایجاد کننده، محصولات و پیش‌فاکتورها"
      fallbackTo="/operations/sales-desk"
      actions={
        <Button
          type="button"
          size="sm"
          disabled={!deal || (!canCreateQuote && !deal.customer_id)}
          onClick={createQuote}
          title={
            !deal?.customer_id
              ? "مشتری معامله مشخص نیست"
              : items.length < 1
                ? "بدون محصول فقط مشتری و مسئول پر می‌شود"
                : undefined
          }
        >
          <FilePlus2 className="ml-1.5 h-4 w-4" />
          ایجاد پیش‌فاکتور
        </Button>
      }
    >
      {dealQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری…
        </p>
      ) : dealQ.isError ? (
        <p className="text-sm text-destructive">{(dealQ.error as Error).message}</p>
      ) : !deal ? (
        <p className="text-sm text-muted-foreground">معامله یافت نشد.</p>
      ) : (
        <div className="space-y-4" dir="rtl">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Badge variant="outline">{salesInteractionStatusLabel(deal.status)}</Badge>
                <span>{deal.title || "بدون عنوان"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {stagesQ.data && deal.stage_id ? (
                <ol className="flex flex-wrap gap-1.5">
                  {stagesQ.data.map((s) => (
                    <li key={s.id}>
                      <Badge variant={s.id === deal.stage_id ? "default" : "outline"}>
                        {s.title}
                      </Badge>
                    </li>
                  ))}
                </ol>
              ) : null}
              {capsQ.data?.show_rejected_quote_notice ? (
                <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
                  <p>
                    پیش‌فاکتور این معامله رد شد. اگر معامله از دست رفته، آن را ناموفق کنید و
                    دلیل شکست را انتخاب کنید.
                  </p>
                  {capsQ.data.can_set_lost ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setLostOpenSignal((n) => n + 1)}
                    >
                      ناموفق شد
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <p className="whitespace-pre-wrap text-foreground/90">{deal.body}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">مسئول معامله: </span>
                  <strong>{deal.salesperson?.full_name?.trim() || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">ایجاد کننده معامله: </span>
                  <strong>{deal.author?.full_name?.trim() || "—"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">ایجاد: </span>
                  {formatDateTimeFa(deal.created_at)}
                </div>
                {deal.won_at ? (
                  <div>
                    <span className="text-muted-foreground">موفق در: </span>
                    {formatDateTimeFa(deal.won_at)}
                  </div>
                ) : null}
                {deal.lost_at ? (
                  <div>
                    <span className="text-muted-foreground">ناموفق در: </span>
                    {formatDateTimeFa(deal.lost_at)}
                  </div>
                ) : null}
              </div>
              <OutcomeButtons
                interactionId={deal.id}
                currentStatus={deal.status}
                kind="request"
                capabilities={capsQ.data}
                lostOpenSignal={lostOpenSignal}
                onUpdated={() => {
                  qc.invalidateQueries({ queryKey: ["sales-desk", "deal", dealId] });
                  qc.invalidateQueries({ queryKey: ["sales-desk"] });
                }}
              />
            </CardContent>
          </Card>

          <Tabs defaultValue="items" dir="rtl">
            <TabsList>
              <TabsTrigger value="items">محصولات درخواستی</TabsTrigger>
              <TabsTrigger value="quotes">پیش‌فاکتورها</TabsTrigger>
              <TabsTrigger value="activities">فعالیت‌ها</TabsTrigger>
              <TabsTrigger value="history">سابقه</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="mt-3">
              <Card>
                <CardContent className="p-3">
                  {itemsQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">…</p>
                  ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">محصولی ثبت نشده.</p>
                  ) : (
                    <ul className="divide-y">
                      {items.map((it) => (
                        <li key={it.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                          <span>
                            {it.product?.name ?? it.product_id}
                            {it.product?.sku ? (
                              <span className="mr-2 font-mono text-xs text-muted-foreground" dir="ltr">
                                {it.product.sku}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-muted-foreground">
                            تعداد: {it.quantity}
                            {it.note ? ` — ${it.note}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="quotes" className="mt-3">
              <Card>
                <CardContent className="p-3">
                  {quotesQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">…</p>
                  ) : (quotesQ.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">پیش‌فاکتوری نیست.</p>
                  ) : (
                    <ul className="divide-y">
                      {(quotesQ.data ?? []).map((q) => (
                        <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <Link
                            to="/sales/quotes/$quoteId"
                            params={{ quoteId: q.id }}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {q.quote_number ?? q.id.slice(0, 8)}
                          </Link>
                          <Badge variant="secondary">{q.status}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTimeFa(q.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="activities" className="mt-3 space-y-3">
              <ActivityForm
                personId={deal.person_id}
                customerId={deal.customer_id}
                dealId={deal.id}
                compact
                onCreated={() => {
                  void activitiesQ.refetch();
                  qc.invalidateQueries({ queryKey: ["sales-desk"] });
                }}
              />
              <Card>
                <CardContent className="space-y-2 p-3">
                  {activitiesQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">…</p>
                  ) : (activitiesQ.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">فعالیتی نیست.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(activitiesQ.data ?? []).map((a) => (
                        <li
                          key={a.id}
                          className="rounded-md border border-border/60 bg-muted/10 p-2.5 text-sm"
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px]">
                              {a.activity_type?.title ?? "فعالیت"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {a.done_at ? "انجام شده" : "انجام نشده"}
                            </Badge>
                            {a.title ? (
                              <span className="font-medium">{a.title}</span>
                            ) : null}
                          </div>
                          {a.body ? (
                            <p className="line-clamp-3 text-muted-foreground">{a.body}</p>
                          ) : null}
                          <ActivityDoneControls
                            activity={a}
                            onUpdated={() => {
                              void activitiesQ.refetch();
                              qc.invalidateQueries({ queryKey: ["sales-desk"] });
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history" className="mt-3">
              <Card>
                <CardContent className="p-3">
                  {historyQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">…</p>
                  ) : (historyQ.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">سابقه‌ای نیست.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {(historyQ.data ?? []).map((h) => (
                        <li key={h.id} className="rounded-md border p-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{historyEventFa(h.event)}</Badge>
                            <span>
                              {h.from_label} → {h.to_label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {h.actor_name ?? "سامانه"} · {historySourceFa(h.source)} ·{" "}
                            {formatDateTimeFa(h.created_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </SalesDeskShell>
  );
}

function historyValueFa(
  event: string,
  value: string | null,
  titles: Map<string, string>,
): string {
  if (value == null || value === "") return "—";
  if (event === "status") return salesInteractionStatusLabel(value);
  if (event === "stage" || event === "pipeline") return titles.get(value) ?? value;
  return value;
}

function historyEventFa(event: string): string {
  switch (event) {
    case "status":
      return "وضعیت";
    case "stage":
      return "مرحله";
    case "pipeline":
      return "کاریز";
    case "delete":
      return "حذف";
    case "restore":
      return "بازیابی";
    default:
      return event;
  }
}

function historySourceFa(source: string): string {
  switch (source) {
    case "user":
      return "کاربر";
    case "auto_quote_created":
      return "ساخت پیش‌فاکتور";
    case "auto_quote_sent":
      return "ارسال پیش‌فاکتور";
    case "auto_quote_accepted":
      return "پذیرش پیش‌فاکتور";
    default:
      return source;
  }
}
