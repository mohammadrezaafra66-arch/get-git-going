import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateFa, formatDateTimeFa, formatNumber } from "@/lib/i18n/formatters";
import {
  ActivityForm,
  OutcomeButtons,
  salesInteractionStatusLabel,
} from "@/components/sales-desk";
import {
  loadDealById,
  listSalesInteractionItems,
  listActivitiesForDeal,
} from "@/lib/sales-desk";
import { loadDealCapabilities } from "@/lib/sales-desk/capabilities";
import { listSalesPipelineStages, listSalesPipelines, moveSalesDeal } from "@/lib/sales-desk/pipelines";
import { supabase } from "@/integrations/supabase/client";
import { salesDeskErrorMessage } from "@/lib/sales-desk";
import { MessengerSoonButtons, soonToast } from "./DealChrome";

export function DealDidarDetail({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [lostOpenSignal, setLostOpenSignal] = useState(0);
  const [feedSort, setFeedSort] = useState<"planned" | "done">("planned");

  const dealQ = useQuery({
    queryKey: ["sales-desk", "deal", dealId],
    queryFn: () => loadDealById(dealId),
  });
  const deal = dealQ.data;
  const itemsQ = useQuery({
    queryKey: ["sales-desk", "deal-items", dealId],
    queryFn: () => listSalesInteractionItems(dealId),
  });
  const quotesQ = useQuery({
    queryKey: ["sales-desk", "deal-quotes", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_quotes" as never)
        .select("id, quote_number, status, final_amount, created_at" as never)
        .eq("interaction_id" as never, dealId as never)
        .order("created_at" as never, { ascending: false } as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        quote_number: string | null;
        status: string;
        final_amount: number | null;
        created_at: string;
      }>;
    },
  });
  const paidQ = useQuery({
    queryKey: ["sales-desk", "deal-paid", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_deal_paid" as never)
        .select("deal_amount, paid_amount, is_paid" as never)
        .eq("id" as never, dealId as never)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { deal_amount: number; paid_amount: number; is_paid: boolean } | null;
    },
  });
  const healthQ = useQuery({
    queryKey: ["sales-desk", "deal-health", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_deal_health" as never)
        .select("opportunity_age_days, idle_days_count, health_circle" as never)
        .eq("id" as never, dealId as never)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as {
        opportunity_age_days: number;
        idle_days_count: number;
        health_circle: string;
      } | null;
    },
  });
  const personQ = useQuery({
    queryKey: ["sales-desk", "deal-person", deal?.person_id],
    enabled: !!deal?.person_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("id, display_name, kind")
        .eq("id", deal!.person_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const { data: ids } = await supabase
        .from("person_identifiers")
        .select("kind, value_raw")
        .eq("person_id", deal!.person_id)
        .limit(8);
      return {
        person: data as { id: string; display_name: string; kind: string } | null,
        phones: (ids ?? []) as { kind: string; value_raw: string }[],
      };
    },
  });
  const companyQ = useQuery({
    queryKey: ["sales-desk", "deal-company", deal?.company_person_id],
    enabled: !!deal?.company_person_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("id, display_name")
        .eq("id", deal!.company_person_id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { id: string; display_name: string } | null;
    },
  });
  const acqQ = useQuery({
    queryKey: ["sales-desk", "deal-acq", deal?.acquaintance_id],
    enabled: !!deal?.acquaintance_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("acquaintance_methods" as never)
        .select("title" as never)
        .eq("id" as never, deal!.acquaintance_id as never)
        .maybeSingle();
      return data as { title: string } | null;
    },
  });
  const capsQ = useQuery({
    queryKey: ["sales-desk", "deal-caps", dealId],
    queryFn: async () => (await loadDealCapabilities([dealId])).get(dealId) ?? null,
  });
  const stagesQ = useQuery({
    queryKey: ["sales-desk", "deal-stages", deal?.pipeline_id],
    enabled: !!deal?.pipeline_id,
    queryFn: () => listSalesPipelineStages({ pipelineId: deal!.pipeline_id! }),
  });
  const pipesQ = useQuery({
    queryKey: ["sales-desk", "pipelines"],
    queryFn: () => listSalesPipelines(),
  });
  const activitiesQ = useQuery({
    queryKey: ["sales-desk", "deal-activities", dealId],
    queryFn: () => listActivitiesForDeal(dealId),
  });
  const actorsQ = useQuery({
    queryKey: ["sales-desk", "deal-actors", deal?.won_by, deal?.lost_by],
    enabled: !!(deal?.won_by || deal?.lost_by),
    queryFn: async () => {
      const ids = [deal?.won_by, deal?.lost_by].filter(Boolean) as string[];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return new Map((data ?? []).map((p) => [p.id, p.full_name]));
    },
  });

  if (dealQ.isLoading) return <p className="text-sm">در حال بارگذاری…</p>;
  if (!deal) return <p className="text-sm">معامله یافت نشد.</p>;

  const closed = deal.status === "won" || deal.status === "lost";
  const pipeTitle = pipesQ.data?.find((p) => p.id === deal.pipeline_id)?.title ?? "کاریز افراکالا";
  const amount = paidQ.data?.deal_amount ?? quotesQ.data?.[0]?.final_amount ?? 0;
  const paidLabel = paidQ.data?.is_paid ? "پرداخت شده" : "پرداخت نشده";
  const planned = (activitiesQ.data ?? []).filter((a) => !a.done_at);

  const setWonAt = async () => {
    const raw = window.prompt("تغییر تاریخ موفق شدن (ISO)");
    if (!raw) return;
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("sales_deal_set_won_at", { p_id: dealId, p_won_at: raw });
    if (error) toast.error(salesDeskErrorMessage(error.message));
    else {
      toast.success("تاریخ موفق شدن");
      void qc.invalidateQueries({ queryKey: ["sales-desk"] });
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          معامله {deal.title} {deal.display_code != null ? `#${deal.display_code}` : ""}
        </h1>
        <div className="flex flex-wrap gap-2">
          <OutcomeButtons
            interactionId={deal.id}
            currentStatus={deal.status}
            kind="request"
            capabilities={capsQ.data}
            lostOpenSignal={lostOpenSignal}
            onUpdated={() => {
              void qc.invalidateQueries({ queryKey: ["sales-desk"] });
            }}
          />
          <Button type="button" variant="ghost" size="sm" onClick={soonToast} title="پرونده‌های مهم را دم دست نگه دارید!">
            پین کردن
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={soonToast}>
            ویرایش
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={soonToast}>
            کپی معامله
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={soonToast}>
            نظرسنجی
          </Button>
        </div>
      </header>

      <ol className="flex flex-wrap gap-1">
        {(stagesQ.data ?? []).map((s) => (
          <li key={s.id}>
            <button
              type="button"
              title={`${pipeTitle} - ${s.title}`}
              className={`rounded-sm border px-2 py-1 text-xs ${
                s.id === deal.stage_id ? "bg-yellow-300" : "bg-muted"
              } ${closed ? "cursor-not-allowed opacity-70" : ""}`}
              disabled={closed || !capsQ.data?.can_move}
              onClick={() => {
                if (closed) return;
                moveSalesDeal({
                  id: deal.id,
                  pipelineId: deal.pipeline_id!,
                  stageId: s.id,
                })
                  .then(() => void qc.invalidateQueries({ queryKey: ["sales-desk"] }))
                  .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)));
              }}
            >
              {s.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById("deal-activity")?.scrollIntoView()}>
              افزودن فعالیت جدید
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={soonToast}>
              افزودن یادداشت
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                void navigate({
                  to: "/sales/quotes/new",
                  search: { interactionId: deal.id },
                })
              }
            >
              پیش فاکتور
            </Button>
          </div>
          <div id="deal-activity">
            {planned.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                هیچ فعالیتی برای این معامله برنامه ریزی نکردی! برای اینکه از دستش ندهی یک فعالیت
                برایش تعریف کن.
                <Button type="button" variant="link" onClick={soonToast}>
                  چرا مهم است روی معامله جاری فعالیت برنامه ریزی شده داشته باشیم؟
                </Button>
              </p>
            ) : null}
            <ActivityForm
              personId={deal.person_id}
              customerId={deal.customer_id}
              dealId={deal.id}
              compact
              onCreated={() => void activitiesQ.refetch()}
            />
          </div>
          <Tabs defaultValue="all">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>تاریخچه</span>
              <Button type="button" size="sm" variant="ghost" onClick={soonToast}>
                بزرگتر ببین و فیلتر کن
              </Button>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => setFeedSort(feedSort === "planned" ? "done" : "planned")}
              >
                مرتب سازی: تاریخ برنامه‌ریزی/انجام فعالیت
              </button>
            </div>
            <TabsList>
              <TabsTrigger value="all">همه</TabsTrigger>
              <TabsTrigger value="activities">فعالیت ها</TabsTrigger>
              <TabsTrigger value="notes">یادداشت ها</TabsTrigger>
              <TabsTrigger value="files">پیوست ها</TabsTrigger>
              <TabsTrigger value="history">سابقه</TabsTrigger>
              <TabsTrigger value="quotes">پیش فاکتور</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              {(activitiesQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">هنوز یادداشت یا فعالیتی ثبت نشده</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(activitiesQ.data ?? []).map((a) => (
                    <li key={a.id}>
                      {a.title || "فعالیت"} · {formatDateTimeFa(a.due_at ?? a.created_at)}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="activities">
              {(activitiesQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">فعالیتی نیست.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(activitiesQ.data ?? []).map((a) => (
                    <li key={a.id}>{a.title || "فعالیت"}</li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="notes">
              <p className="text-sm text-muted-foreground">هنوز یادداشت یا فعالیتی ثبت نشده</p>
            </TabsContent>
            <TabsContent value="files">
              <p className="text-sm text-muted-foreground">پیوستی نیست.</p>
            </TabsContent>
            <TabsContent value="history">
              <p className="text-sm text-muted-foreground">سابقه در تب قبلی جزئیات.</p>
            </TabsContent>
            <TabsContent value="quotes">
              {(quotesQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">پیش‌فاکتوری نیست.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(quotesQ.data ?? []).map((q) => (
                    <li key={q.id}>
                      <Link to="/sales/quotes/$quoteId" params={{ quoteId: q.id }}>
                        {q.quote_number ?? q.id.slice(0, 8)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </section>

        <aside className="space-y-3 text-sm">
          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">اطلاعات معامله</h2>
            <Button type="button" size="sm" variant="ghost" onClick={soonToast}>
              اضافه کردن برچسب
            </Button>
            <p>احتمال موفق شدن / {deal.probability ?? 100}٪</p>
            <p>تاریخ احتمالی بستن معامله {deal.expected_close_on ?? "—"}</p>
            <p>
              IRR {formatNumber(Number(amount))} ({paidLabel})
            </p>
            <Button type="button" size="sm" variant="link" onClick={soonToast}>
              + افزودن محصول
            </Button>
            <p>توضیحات / {deal.body?.trim() || "-"}</p>
            {deal.status === "won" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void setWonAt()}>
                تغییر تاریخ موفق شدن
              </Button>
            ) : null}
            {deal.lost_reason_note || deal.lost_reason_other ? (
              <p>
                توضیح دلیل شکست: {deal.lost_reason_note ?? ""} {deal.lost_reason_other ?? ""}
              </p>
            ) : null}
            {deal.won_by ? <p>موفق‌کننده: {actorsQ.data?.get(deal.won_by) ?? deal.won_by}</p> : null}
            {deal.lost_by ? <p>ناموفق‌کننده: {actorsQ.data?.get(deal.lost_by) ?? deal.lost_by}</p> : null}
          </section>

          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">شخص مرتبط</h2>
            {personQ.data?.person ? (
              <Link to="/persons/$personId" params={{ personId: personQ.data.person.id }}>
                {personQ.data.person.display_name}
              </Link>
            ) : (
              "—"
            )}
            <MessengerSoonButtons />
            <div className="mt-1 flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={soonToast}>
                تغییر شخص مرتبط
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => toast.error("شخص روی معامله الان الزامی است.")}>
                قطع اتصال شخص
              </Button>
            </div>
          </section>

          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">شرکت مرتبط</h2>
            {companyQ.data ? (
              <div>
                <p>{companyQ.data.display_name}</p>
                <a
                  className="text-primary underline"
                  href={`https://www.google.com/search?q=${encodeURIComponent(companyQ.data.display_name)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  جستجوی نام این شرکت در گوگل
                </a>
              </div>
            ) : (
              <p>این معامله به هیچ شرکتی وصل نیست</p>
            )}
            <Button type="button" size="sm" variant="link" onClick={soonToast}>
              + وصل کردن یک شرکت
            </Button>
          </section>

          <section className="rounded border p-3">
            <h2 className="font-medium">فیلدهای معامله</h2>
            <Button type="button" size="sm" variant="link" onClick={() => void navigate({ to: "/settings/deal-lost-reasons" })}>
              ایجاد فیلد جدید
            </Button>
          </section>
          <section className="rounded border p-3">
            <h2 className="font-medium">محصولات درخواستی</h2>
            {(itemsQ.data ?? []).length === 0 ? "—" : `${itemsQ.data?.length} مورد`}
          </section>
          <section className="rounded border p-3">
            ایجاد کننده معامله: {deal.author?.full_name ?? "—"}
          </section>
          <section className="rounded border p-3">
            <h2 className="font-medium">شیوه آشنایی</h2>
            {acqQ.data?.title ?? "شیوه آشنایی در این معامله مشخص نیست!"}
            <Button type="button" size="sm" variant="link" onClick={soonToast}>
              مشخص کردن شیوه آشنایی
            </Button>
          </section>
          <section className="rounded border p-3">
            <h2 className="font-medium">افراد درگیر در معامله</h2>
            <p>اگر شخصی مرتبط با این معامله است با + اضافه کنید</p>
            <Button type="button" size="sm" variant="link" onClick={soonToast}>
              +
            </Button>
          </section>
          <section className="rounded border p-3">
            <h2 className="font-medium">کارت های جاری</h2>
            <p>این پرونده هیچ کارتی ندارد</p>
            <Button type="button" size="sm" variant="link" onClick={soonToast}>
              همه کارت ها
            </Button>
          </section>
          <section className="rounded border p-3">
            <h2 className="font-medium">نمایه فرصت</h2>
            <p>تاریخ ایجاد فرصت {formatDateFa(deal.register_time ?? deal.created_at)}</p>
            <p>سن فرصت {healthQ.data?.opportunity_age_days ?? 0} روز</p>
            <p>روز غیر فعال {healthQ.data?.idle_days_count ?? 0}</p>
            <Button type="button" size="sm" variant="link" onClick={soonToast}>
              مشاهده بیشتر
            </Button>
          </section>
          <Badge variant="outline">{salesInteractionStatusLabel(deal.status)}</Badge>
        </aside>
      </div>
    </div>
  );
}
