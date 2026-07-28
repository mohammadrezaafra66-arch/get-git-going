import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  FileDown,
  MessageCircle,
  Eye,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, formatDateTimeFa, formatDateFa } from "@/lib/i18n/formatters";
import { toPersianAmountWords } from "@/lib/i18n/number-to-words";
import { QuoteStatusBadge } from "@/components/sales/quotes/QuoteStatusBadge";
import {
  SALES_QUOTE_SOURCE_LABELS,
  type SalesQuoteStatus,
  type SalesQuoteItemSource,
} from "@/lib/sales/quotes";
import { downloadQuotePdf } from "@/lib/sales/quote-pdf";
import { ShareQuoteDialog } from "@/components/sales/quotes/ShareQuoteDialog";
import { useServerFn } from "@tanstack/react-start";
import { updateQuoteStatus } from "@/lib/sales/quote-status.functions";
import { WarehouseSelect } from "@/components/warehouses/WarehouseSelect";
import { checkQuoteStockAvailability } from "@/lib/warehouses/queries";

const STATUS_LABELS_FA: Record<SalesQuoteStatus, string> = {
  draft: "پیش‌نویس",
  sent: "ارسال‌شده",
  accepted: "پذیرفته‌شده",
  rejected: "رد شده",
  canceled: "لغو شده",
};

export const Route = createFileRoute("/_app/sales/quotes/$quoteId")({
  component: QuoteDetailPage,
});

interface QuoteDetail {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_phone: string;
  customer_note: string | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  status: SalesQuoteStatus;
  subtotal_amount: number;
  discount_amount: number;
  final_amount: number;
  expires_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

interface QuoteItem {
  id: string;
  source: SalesQuoteItemSource;
  product_id: string | null;
  free_item_name: string | null;
  sku_snapshot: string | null;
  title_snapshot: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
}

function QuoteDetailPage() {
  const { quoteId } = Route.useParams();
  const { user, roles } = useAuth();
  const isManagerial = roles.includes("admin") || roles.includes("manager");

  const quoteQuery = useQuery({
    queryKey: ["sales-quote-detail", quoteId],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<QuoteDetail | null> => {
      const { data, error } = await supabase
        .from("sales_quotes")
        .select(
          "id, quote_number, customer_name, customer_phone, customer_note, salesperson_id, status, subtotal_amount, discount_amount, final_amount, expires_at, cancel_reason, created_at",
        )
        .eq("id", quoteId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let salesperson_name: string | null = null;
      if (data.salesperson_id) {
        const sr = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.salesperson_id)
          .maybeSingle();
        salesperson_name = (sr.data?.full_name as string | null) ?? null;
      }
      return { ...(data as Omit<QuoteDetail, "salesperson_name">), salesperson_name };
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["sales-quote-items", quoteId],
    enabled: !!user && !!quoteQuery.data,
    staleTime: 30_000,
    queryFn: async (): Promise<QuoteItem[]> => {
      const { data, error } = await supabase
        .from("sales_quote_items")
        .select(
          "id, source, product_id, free_item_name, sku_snapshot, title_snapshot, quantity, unit_price, discount_amount, line_total",
        )
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuoteItem[];
    },
  });

  if (quoteQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
      </div>
    );
  }

  const quote = quoteQuery.data;
  if (!quote) {
    return (
      <div className="space-y-4">
        <PageHeader title="جزئیات پیش‌فاکتور" />
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            پیش‌فاکتور پیدا نشد یا دسترسی ندارید.
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link to="/sales/quotes">
                  <ArrowRight className="ml-1 h-4 w-4" /> بازگشت به لیست
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOwner = quote.salesperson_id === user?.id;
  const items = itemsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="جزئیات پیش‌فاکتور"
        description={`شماره: ${quote.quote_number}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/sales/quotes">
                <ArrowRight className="ml-1 h-4 w-4" /> بازگشت به لیست
              </Link>
            </Button>
            <QuoteActionButtons quote={quote} isManagerial={isManagerial} isOwner={isOwner} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono text-sm">{quote.quote_number}</div>
              <QuoteStatusBadge status={quote.status} />
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Field label="نام مشتری" value={quote.customer_name} />
              <Field label="شماره تماس" value={<span dir="ltr">{quote.customer_phone}</span>} />
              <Field label="فروشنده" value={quote.salesperson_name ?? "—"} />
              <Field label="تاریخ ایجاد" value={formatDateTimeFa(quote.created_at)} />
              <Field
                label="اعتبار تا"
                value={quote.expires_at ? formatDateFa(quote.expires_at) : "—"}
              />
            </div>
            {quote.customer_note && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="mb-1 text-muted-foreground">یادداشت مشتری</div>
                <div className="whitespace-pre-wrap">{quote.customer_note}</div>
              </div>
            )}
            {quote.status === "canceled" && quote.cancel_reason && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <div className="mb-1 text-destructive">دلیل لغو</div>
                <div className="whitespace-pre-wrap">{quote.cancel_reason}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">جمع جزء</span>
              <span>{formatNumber(quote.subtotal_amount)} تومان</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">تخفیف</span>
              <span>{formatNumber(quote.discount_amount)} تومان</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="font-medium">مبلغ نهایی</span>
              <span className="text-lg font-bold text-primary">
                {formatNumber(quote.final_amount)}{" "}
                <span className="text-xs font-normal text-muted-foreground">تومان</span>
              </span>
            </div>
            {/* Item 203 — the amount in Persian letters, the way a financial
                document spells it out to remove any doubt about the figure. */}
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-[11px] text-muted-foreground">مبلغ به حروف</div>
              <div className="text-xs leading-6">
                {toPersianAmountWords(quote.final_amount) || "—"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">آیتم‌های پیش‌فاکتور</h2>
        {itemsQuery.isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری آیتم‌ها...
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              آیتمی ثبت نشده است.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="p-3 text-right font-medium">عنوان</th>
                          <th className="p-3 text-right font-medium">SKU</th>
                          <th className="p-3 text-right font-medium">منبع</th>
                          <th className="p-3 text-right font-medium">تعداد</th>
                          <th className="p-3 text-right font-medium">قیمت واحد</th>
                          <th className="p-3 text-right font-medium">تخفیف</th>
                          <th className="p-3 text-right font-medium">جمع خط</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((it) => (
                          <tr key={it.id} className="hover:bg-muted/30">
                            <td className="p-3 align-top font-medium">
                              {it.title_snapshot ?? it.free_item_name ?? "—"}
                            </td>
                            <td className="p-3 align-top font-mono text-xs text-muted-foreground">
                              {it.sku_snapshot ?? "—"}
                            </td>
                            <td className="p-3 align-top text-xs text-muted-foreground">
                              {SALES_QUOTE_SOURCE_LABELS[it.source]}
                            </td>
                            <td className="p-3 align-top">{formatNumber(it.quantity)}</td>
                            <td className="p-3 align-top">{formatNumber(it.unit_price)}</td>
                            <td className="p-3 align-top">{formatNumber(it.discount_amount)}</td>
                            <td className="p-3 align-top font-medium">
                              {formatNumber(it.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-3 md:hidden">
              {items.map((it) => (
                <Card key={it.id}>
                  <CardContent className="p-3 space-y-1.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {it.title_snapshot ?? it.free_item_name ?? "—"}
                        </div>
                        {it.sku_snapshot && (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {it.sku_snapshot}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {SALES_QUOTE_SOURCE_LABELS[it.source]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">تعداد × قیمت واحد</span>
                      <span>
                        {formatNumber(it.quantity)} × {formatNumber(it.unit_price)}
                      </span>
                    </div>
                    {it.discount_amount > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">تخفیف</span>
                        <span>{formatNumber(it.discount_amount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t pt-1.5">
                      <span className="text-muted-foreground text-xs">جمع خط</span>
                      <span className="font-medium">{formatNumber(it.line_total)} تومان</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:hidden">
        <QuoteActionButtons quote={quote} isManagerial={isManagerial} isOwner={isOwner} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function QuoteActionButtons({
  quote,
  isManagerial,
  isOwner,
}: {
  quote: QuoteDetail;
  isManagerial: boolean;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | {
    next: SalesQuoteStatus;
    label: string;
    needsReason?: boolean;
  }>(null);
  const [reason, setReason] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Items 175/179 — at confirm time the operator may switch warehouse, and sees
  // the availability check for whichever warehouse is selected.
  const [confirmWarehouseId, setConfirmWarehouseId] = useState<string | null>(null);

  const isAccepting = confirm?.next === "accepted";

  const stockCheckQ = useQuery({
    queryKey: ["quote-stock-check", quote.id, confirmWarehouseId],
    enabled: isAccepting,
    queryFn: () => checkQuoteStockAvailability(quote.id, confirmWarehouseId),
    staleTime: 0,
  });

  const shortages = (stockCheckQ.data ?? []).filter((r) => !r.is_sufficient);

  const updateQuoteStatusFn = useServerFn(updateQuoteStatus);
  const mutation = useMutation({
    mutationFn: async (payload: {
      next: SalesQuoteStatus;
      reason?: string;
      warehouseId?: string | null;
    }) => {
      // 179 — persist the warehouse override BEFORE the status change, because
      // the deduction trigger reads sales_quotes.warehouse_id at that moment.
      if (payload.next === "accepted" && payload.warehouseId) {
        const { error } = await supabase
          .from("sales_quotes")
          .update({ warehouse_id: payload.warehouseId } as never)
          .eq("id", quote.id);
        if (error) throw new Error(error.message);
      }
      await updateQuoteStatusFn({
        data: { id: quote.id, next: payload.next, reason: payload.reason },
      });
    },
    onSuccess: () => {
      toast.success("وضعیت پیش‌فاکتور به‌روزرسانی شد.");
      qc.invalidateQueries({ queryKey: ["sales-quote-detail", quote.id] });
      qc.invalidateQueries({ queryKey: ["sales-quotes"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "خطا در تغییر وضعیت."),
  });

  const canSend = (isManagerial || isOwner) && quote.status === "draft";
  const canAccept = isManagerial && quote.status === "sent";
  const canReject = (isManagerial || isOwner) && quote.status === "sent";
  const canCancel =
    (isManagerial || isOwner) && (quote.status === "draft" || quote.status === "sent");

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { data: itemRows, error } = await supabase
        .from("sales_quote_items")
        .select(
          "title_snapshot, free_item_name, sku_snapshot, quantity, unit_price, discount_amount, line_total, created_at",
        )
        .eq("quote_id", quote.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const items = (itemRows ?? []).map((it) => ({
        title: (it.title_snapshot as string | null) ?? (it.free_item_name as string | null) ?? "—",
        sku: (it.sku_snapshot as string | null) ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price: Number(it.unit_price ?? 0),
        discount_amount: Number(it.discount_amount ?? 0),
        line_total: Number(it.line_total ?? 0),
      }));
      await downloadQuotePdf({
        quote_number: quote.quote_number,
        customer_name: quote.customer_name,
        customer_phone: quote.customer_phone,
        salesperson_name: quote.salesperson_name,
        created_at: quote.created_at,
        expires_at: quote.expires_at,
        status_label: STATUS_LABELS_FA[quote.status] ?? quote.status,
        customer_note: quote.customer_note,
        items,
        subtotal_amount: Number(quote.subtotal_amount ?? 0),
        discount_amount: Number(quote.discount_amount ?? 0),
        final_amount: Number(quote.final_amount ?? 0),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ساخت PDF پیش‌فاکتور");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      {canSend && (
        <Button
          size="sm"
          onClick={() => setConfirm({ next: "sent", label: "ارسال پیش‌فاکتور" })}
          disabled={mutation.isPending}
        >
          <Send className="ml-1 h-3.5 w-3.5" /> ارسال پیش‌فاکتور
        </Button>
      )}
      {canAccept && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirm({ next: "accepted", label: "پذیرش پیش‌فاکتور" })}
          disabled={mutation.isPending}
        >
          <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> پذیرش
        </Button>
      )}
      {canReject && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirm({ next: "rejected", label: "رد پیش‌فاکتور" })}
          disabled={mutation.isPending}
        >
          <XCircle className="ml-1 h-3.5 w-3.5" /> رد
        </Button>
      )}
      {canCancel && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReason("");
            setConfirm({ next: "canceled", label: "لغو پیش‌فاکتور", needsReason: true });
          }}
          disabled={mutation.isPending}
        >
          <Ban className="ml-1 h-3.5 w-3.5" /> لغو
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={handleDownloadPdf} disabled={pdfLoading}>
        {pdfLoading ? (
          <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileDown className="ml-1 h-3.5 w-3.5" />
        )}
        دانلود PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
        <MessageCircle className="ml-1 h-3.5 w-3.5" /> ارسال در پیام‌رسان
      </Button>
      <ShareQuoteDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        quoteId={quote.id}
        quoteNumber={quote.quote_number}
        defaultRecipient={quote.customer_phone}
      />

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از این تغییر وضعیت مطمئن هستید؟ این عملیات ثبت می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.needsReason && (
            <div className="space-y-2 py-2">
              <label className="text-xs text-muted-foreground">دلیل لغو (اختیاری)</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="دلیل لغو"
              />
            </div>
          )}

          {/* Items 175/179 — warehouse override + availability check before confirming. */}
          {isAccepting && (
            <div className="space-y-3 py-2">
              <WarehouseSelect
                label="انبار کسر موجودی"
                value={confirmWarehouseId}
                onChange={setConfirmWarehouseId}
                hint="می‌توانید انبار انتخاب‌شدهٔ پیش‌فاکتور را همین حالا تغییر دهید."
              />

              {stockCheckQ.isLoading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> بررسی موجودی…
                </p>
              ) : (stockCheckQ.data ?? []).length === 0 ? null : shortages.length === 0 ? (
                <p className="rounded-md border border-emerald-500/40 bg-emerald-50 p-2 text-xs leading-6 dark:bg-emerald-950/20">
                  موجودی همهٔ کالاهای این پیش‌فاکتور در انبار انتخاب‌شده کافی است.
                </p>
              ) : (
                <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs leading-6">
                  <div className="font-medium text-destructive">
                    موجودی کافی نیست — قطعی‌کردن انجام نمی‌شود:
                  </div>
                  {shortages.map((s) => (
                    <div key={s.product_id}>
                      {s.product_name}: نیاز {formatNumber(s.required)} / موجود{" "}
                      {formatNumber(s.available)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={isAccepting && shortages.length > 0}
              onClick={() => {
                if (!confirm) return;
                mutation.mutate({
                  next: confirm.next,
                  reason: confirm.needsReason ? reason.trim() || undefined : undefined,
                  warehouseId: confirm.next === "accepted" ? confirmWarehouseId : null,
                });
                setConfirm(null);
              }}
            >
              تایید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// silence unused import warnings for icons reserved for future toolbar polish
void Eye;
