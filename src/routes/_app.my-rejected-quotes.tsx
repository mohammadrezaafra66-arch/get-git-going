import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, Loader2, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";

// Item 152 — the salesperson's own view of refused pre-invoice attempts.
// Backed by get_my_rejected_quotes (migration 206), which reads audit_logs rows
// with action='sales_quote_rejected' scoped to auth.uid().
export const Route = createFileRoute("/_app/my-rejected-quotes")({
  component: MyRejectedQuotesPage,
});

type RejectionRow = {
  id: string;
  created_at: string;
  reason: string | null;
  note: string | null;
  customer_name: string | null;
  final_amount: number | null;
};

function MyRejectedQuotesPage() {
  const rowsQ = useQuery({
    queryKey: ["my-rejected-quotes"],
    queryFn: async () => {
      // RPC not yet in the generated types — cast the fn name to satisfy the client.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("get_my_rejected_quotes", { p_limit: 50 });
      if (error) throw new Error(error.message);
      return (data as RejectionRow[] | null) ?? [];
    },
    staleTime: 30_000,
  });

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="درخواست‌های رد شدهٔ من"
        description="پیش‌فاکتورهایی که ثبتشان طبق قوانین سیستم انجام نشد، همراه با دلیل و توضیح خودتان."
        actions={
          <Button asChild variant="outline">
            <Link to="/sales/quotes/new">
              <FilePlus2 className="ml-2 h-4 w-4" /> پیش‌فاکتور جدید
            </Link>
          </Button>
        }
      />

      {rowsQ.isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
        </div>
      ) : rowsQ.isError ? (
        <p className="text-sm text-destructive">دریافت فهرست با خطا مواجه شد.</p>
      ) : (rowsQ.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={XCircle}
          title="درخواست رد شده‌ای ندارید"
          description="هر بار که ثبت یک پیش‌فاکتور طبق قوانین انجام نشود و دلیلش را ثبت کنید، اینجا نمایش داده می‌شود."
        />
      ) : (
        <div className="space-y-3">
          {rowsQ.data!.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.customer_name || "بدون نام مشتری"}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTimeFa(r.created_at)}
                  </span>
                </div>
                {r.final_amount != null && (
                  <div className="text-sm text-muted-foreground">
                    مبلغ نهایی: {formatNumber(Number(r.final_amount))} تومان
                  </div>
                )}
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm leading-6">
                  <span className="text-muted-foreground">دلیل رد: </span>
                  {r.reason || "—"}
                </div>
                {r.note && (
                  <div className="rounded-md border bg-muted/40 p-2 text-sm leading-6">
                    <span className="text-muted-foreground">توضیح شما: </span>
                    {r.note}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
