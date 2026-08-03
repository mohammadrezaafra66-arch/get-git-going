import { Badge } from "@/components/ui/badge";
import { formatDateFa } from "@/lib/i18n/formatters";
import { toPersianDigits } from "@/lib/purchase/labels";
import type { PurchaseRequestRow, PurchaseSummaryEntry } from "@/hooks/purchase/usePurchase";

/**
 * Issue 219 / C3.5 — the registered purchase, shown inside the request card.
 *
 * Deliberately a small read-only panel, not a purchase module. The final report
 * settled that a full purchase list/detail page is out of scope; the operator
 * needs to see the document from the request that produced it, and nothing more.
 *
 * Financial columns are omitted by get_purchase_requests for roles that may not
 * see them, so this component simply renders what it was given: if
 * `purchase_price` is absent the row shows no money. The masking decision lives
 * server-side, where it cannot be bypassed.
 */

const STATE_LABEL: Record<string, string> = {
  none: "بدون تأمین",
  partial: "تأمین جزئی",
  complete: "تأمین کامل",
  legacy_unknown: "خرید قدیمی — سند مرتبط ثبت نشده",
};

const STATE_CLASS: Record<string, string> = {
  none: "border-gray-300 bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
  partial: "border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  complete:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  legacy_unknown:
    "border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
};

function money(
  value: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (value == null) return null;
  const n = toPersianDigits(Math.round(value).toLocaleString("en-US"));
  const unit = currency === "toman" || !currency ? "تومان" : currency;
  return `${n} ${unit}`;
}

export function PurchaseFulfillmentSummary({ request }: { request: PurchaseRequestRow }) {
  const state = request.fulfillment_state ?? "none";
  const summaries: PurchaseSummaryEntry[] = request.purchase_summaries ?? [];

  // A legacy request has no reliable document. Its supplied quantity is UNKNOWN,
  // not zero — showing "0 of 5 supplied" would assert something the data does
  // not support, so the quantities are withheld entirely.
  if (state === "legacy_unknown") {
    return (
      <div
        className="rounded-md border border-dashed p-2 text-xs"
        data-testid="fulfillment-summary"
      >
        <Badge variant="outline" className={STATE_CLASS.legacy_unknown}>
          {STATE_LABEL.legacy_unknown}
        </Badge>
      </div>
    );
  }

  if (summaries.length === 0 && state === "none") return null;

  return (
    <div className="space-y-2 rounded-md border p-2 text-xs" data-testid="fulfillment-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className={STATE_CLASS[state]}>
          {STATE_LABEL[state] ?? state}
        </Badge>
        <span className="text-muted-foreground">
          تأمین‌شده {toPersianDigits(String(request.effective_supplied ?? 0))} از{" "}
          {toPersianDigits(String(request.quantity))}
          {(request.remaining_quantity ?? 0) > 0 && (
            <> · باقی‌مانده {toPersianDigits(String(request.remaining_quantity))}</>
          )}
        </span>
      </div>

      <ul className="space-y-1">
        {summaries.map((s) => {
          const amount = money(s.total_amount ?? null, s.currency ?? null);
          return (
            <li key={s.purchase_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded bg-muted px-1 font-mono text-[10px]" dir="ltr">
                {s.short_id}
              </span>
              {/* The RPC returns an ISO date; the UI is Persian and RTL throughout. */}
              <span className="text-muted-foreground">{formatDateFa(s.purchase_date)}</span>
              <span>
                خرید {toPersianDigits(String(s.purchased_quantity ?? 0))} · تخصیص{" "}
                {toPersianDigits(String(s.allocated_quantity ?? 0))}
              </span>
              {s.supplier_name && (
                <span className="text-muted-foreground">از {s.supplier_name}</span>
              )}
              {amount && <span className="font-medium">{amount}</span>}
              {s.warehouse_name && (
                <span className="text-muted-foreground">→ {s.warehouse_name}</span>
              )}
              {s.is_over_allocation && (
                <Badge variant="outline" className="text-[10px]">
                  تخصیص مازاد
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
