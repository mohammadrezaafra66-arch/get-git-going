/**
 * Deal detail — ایجاد کننده / مسئول / محصولات / پیش‌فاکتورها / ایجاد پیش‌فاکتور.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";

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
          </Tabs>
        </div>
      )}
    </SalesDeskShell>
  );
}
