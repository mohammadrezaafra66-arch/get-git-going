import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Loader2, Phone } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CallNoteForm,
  InteractionTimeline,
  SalesDeskShell,
  SalesDeskTiltCard,
} from "@/components/sales-desk";
import { loadSalesDossier } from "@/lib/sales-desk";
import { formatDateTimeFa, formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import {
  SALES_QUOTE_STATUS_LABELS,
  type SalesQuoteStatus,
} from "@/lib/sales/quotes";

function callDirectionLabel(direction: string): string {
  switch (direction) {
    case "inbound":
      return "ورودی";
    case "outbound":
      return "خروجی";
    case "internal":
      return "داخلی";
    default:
      return direction;
  }
}

function quoteStatusLabel(status: string): string {
  return (
    SALES_QUOTE_STATUS_LABELS[status as SalesQuoteStatus] ?? status
  );
}

export const Route = createFileRoute("/_app/sales_/customers_/$customerId/dossier")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: CustomerSalesDossierPage,
});

/**
 * پرونده فروش ۳۶۰ مشتری — هویت، مسئول، پیش‌فاکتورها، تایم‌لاین، تماس‌ها.
 * person_id از customers خوانده می‌شود و به loadSalesDossier داده می‌شود.
 */
function CustomerSalesDossierPage() {
  const { customerId } = Route.useParams();
  const qc = useQueryClient();

  const customerQ = useQuery({
    queryKey: ["sales-desk", "customer-person", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, phone, person_id, responsible_id, responsible:profiles!customers_responsible_id_fkey(id, full_name)",
        )
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as {
        id: string;
        name: string | null;
        phone: string | null;
        person_id: string | null;
        responsible_id: string | null;
        responsible: { id: string; full_name: string | null } | null;
      } | null;
    },
  });

  const personId = customerQ.data?.person_id ?? null;

  const dossierQ = useQuery({
    queryKey: ["sales-desk", "dossier", personId],
    enabled: !!personId,
    queryFn: () => loadSalesDossier(personId!),
    staleTime: 30_000,
  });

  const loading = customerQ.isLoading || (!!personId && dossierQ.isLoading);
  const errorMsg =
    (customerQ.isError && (customerQ.error as Error).message) ||
    (dossierQ.isError && (dossierQ.error as Error).message) ||
    null;

  const person = dossierQ.data?.person;
  const customers = dossierQ.data?.customers ?? [];
  const quotes = dossierQ.data?.quotes ?? [];
  const interactions = dossierQ.data?.interactions ?? [];
  const callLogs = dossierQ.data?.callLogs ?? [];

  return (
    <SalesDeskShell
      title={
        customerQ.data?.name
          ? `پرونده فروش: ${customerQ.data.name}`
          : "پرونده فروش مشتری"
      }
      description="هویت، مسئول، پیش‌فاکتورها، تعاملات و تاریخچه تماس — تاریخ‌ها شمسی نمایش داده می‌شوند."
      fallbackTo="/operations/sales-desk"
      actions={
        <Button asChild variant="outline" size="sm" className="bg-white/70 backdrop-blur-sm">
          <Link to="/sales/customers/$customerId/edit" params={{ customerId }}>
            ویرایش مشتری
          </Link>
        </Button>
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری پرونده…
        </p>
      ) : errorMsg ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{errorMsg}</CardContent>
        </Card>
      ) : !customerQ.data ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            مشتری یافت نشد.
          </CardContent>
        </Card>
      ) : !personId ? (
        <Card>
          <CardContent className="space-y-2 py-6 text-sm text-muted-foreground">
            <p>این مشتری به پروندهٔ شخص متصل نیست؛ بارگذاری ۳۶۰ ممکن نیست.</p>
            <Button asChild size="sm" variant="outline">
              <Link to="/sales/customers/$customerId/edit" params={{ customerId }}>
                اتصال شخص در ویرایش مشتری
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SalesDeskTiltCard delayMs={40}>
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">هویت</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="نام نمایشی" value={person?.display_name ?? "—"} />
                  <Row label="نام حقوقی" value={person?.legal_name ?? "—"} />
                  <Row
                    label="نوع"
                    value={
                      person?.kind === "organization"
                        ? "حقوقی"
                        : person?.kind === "individual"
                          ? "حقیقی"
                          : (person?.kind ?? "—")
                    }
                  />
                  <Row
                    label="تلفن مشتری"
                    value={
                      customerQ.data.phone ? (
                        <span dir="ltr" className="inline-block text-right tabular-nums">
                          {toFaDigits(customerQ.data.phone)}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  {personId ? (
                    <Button asChild size="sm" variant="link" className="h-auto p-0">
                      <Link to="/persons/$personId" params={{ personId }}>
                        پرونده هویت شخص
                      </Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </SalesDeskTiltCard>

            <SalesDeskTiltCard delayMs={100}>
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">مسئول و حساب‌ها</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row
                    label="مسئول این مشتری"
                    value={customerQ.data.responsible?.full_name ?? "تعیین نشده"}
                  />
                  {customers.length === 0 ? (
                    <p className="text-muted-foreground">حساب مشتری دیگری پیوند نشده.</p>
                  ) : (
                    <ul className="space-y-2">
                      {customers.map((c) => (
                        <li
                          key={c.id}
                          className="rounded-md border border-border/60 px-3 py-2"
                        >
                          <div className="font-medium">{c.name ?? c.id.slice(0, 8)}</div>
                          <div className="text-xs text-muted-foreground">
                            مسئول: {c.responsible?.full_name ?? "—"}
                            {c.phone ? (
                              <>
                                {" · "}
                                <span dir="ltr" className="inline-block tabular-nums">
                                  {toFaDigits(c.phone)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </SalesDeskTiltCard>
          </div>

          <SalesDeskTiltCard delayMs={160}>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">آخرین پیش‌فاکتورها</CardTitle>
              </CardHeader>
              <CardContent>
                {quotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">پیش‌فاکتوری ثبت نشده.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {quotes.map((q) => (
                      <li
                        key={q.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <div>
                          <Link
                            to="/sales/quotes/$quoteId"
                            params={{ quoteId: q.id }}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {q.quote_number ? (
                              toFaDigits(q.quote_number)
                            ) : (
                              <span dir="ltr" className="font-mono text-xs">
                                {q.id.slice(0, 8)}
                              </span>
                            )}
                          </Link>
                          <span className="mr-2 text-xs text-muted-foreground">
                            {formatDateTimeFa(q.created_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {quoteStatusLabel(q.status)}
                          </Badge>
                          <span className="tabular-nums">
                            {q.final_amount != null ? formatNumber(q.final_amount) : "—"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </SalesDeskTiltCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SalesDeskTiltCard delayMs={220}>
              <div className="p-1">
                <InteractionTimeline
                  items={interactions}
                  onStatusUpdated={() => {
                    qc.invalidateQueries({
                      queryKey: ["sales-desk", "dossier", personId],
                    });
                  }}
                />
              </div>
            </SalesDeskTiltCard>
            <SalesDeskTiltCard delayMs={280}>
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    تاریخچه تماس
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {callLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      تماس ایزابل/CDR یافت نشد. می‌توانید خلاصه دستی ثبت کنید.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {callLogs.map((c) => (
                        <li
                          key={c.id}
                          className="rounded-md border border-border/60 px-3 py-2 text-sm"
                        >
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {callDirectionLabel(c.direction)}
                            </Badge>
                            {c.is_missed ? (
                              <Badge variant="outline" className="text-[10px]">
                                ازدست‌رفته
                              </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {formatDateTimeFa(c.started_at)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            داخلی:{" "}
                            <span dir="ltr" className="inline-block tabular-nums">
                              {c.extension ? toFaDigits(c.extension) : "—"}
                            </span>
                            {c.duration_seconds != null ? (
                              <>
                                {" · "}
                                <span className="tabular-nums">
                                  {toFaDigits(c.duration_seconds)}ث
                                </span>
                              </>
                            ) : null}
                            {c.disposition ? (
                              <>
                                {" · "}
                                <span dir="ltr" className="inline-block font-mono text-[11px]">
                                  {c.disposition}
                                </span>
                              </>
                            ) : null}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </SalesDeskTiltCard>
          </div>

          <SalesDeskTiltCard delayMs={340}>
            <div className="p-1">
              <CallNoteForm
                personId={personId}
                personName={person?.display_name ?? customerQ.data.name}
                customerId={customerId}
                onCreated={() => {
                  qc.invalidateQueries({
                    queryKey: ["sales-desk", "dossier", personId],
                  });
                }}
              />
            </div>
          </SalesDeskTiltCard>
        </>
      )}
    </SalesDeskShell>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border/40 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
