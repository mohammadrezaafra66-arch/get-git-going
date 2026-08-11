import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toFaDigits } from "@/lib/i18n/formatters";
import {
  AGING_BUCKETS,
  AGING_TONE_BADGE,
  AGING_TONE_TEXT,
  type AgingBucket,
} from "@/lib/accounting/aging";

/** بَج سطل سنی برای نمایش داخل ردیف جدول. */
export function AgingBucketBadge({ bucket }: { bucket: string | null | undefined }) {
  const meta = AGING_BUCKETS.find((b) => b.key === bucket);
  if (!meta) return <Badge variant="outline">—</Badge>;
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", AGING_TONE_BADGE[meta.tone])}>
      {meta.label}
    </Badge>
  );
}

/**
 * ردیف کارت‌های خلاصهٔ سطل سنی. با کلیک روی هر کارت، فیلتر لیست روی همان سطل ست می‌شود.
 * `summary` خروجی خام `get_receivables_summary` / `get_payables_summary` است.
 */
export function AgingBucketCards({
  summary,
  isLoading,
  fmtMoney,
  activeBucket,
  onSelect,
}: {
  summary: Record<string, unknown> | null | undefined;
  isLoading?: boolean;
  fmtMoney: (n: number | null | undefined) => string;
  activeBucket?: string;
  onSelect?: (bucket: AgingBucket) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {AGING_BUCKETS.map((b) => {
        const amount = Number(summary?.[b.amountField] ?? 0);
        const count = Number(summary?.[b.countField] ?? 0);
        const active = activeBucket === b.key;
        return (
          <Card
            key={b.key}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onClick={onSelect ? () => onSelect(b.key) : undefined}
            onKeyDown={
              onSelect
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(b.key);
                    }
                  }
                : undefined
            }
            className={cn(
              onSelect && "cursor-pointer transition-colors hover:bg-muted/50",
              active && "ring-2 ring-primary",
            )}
          >
            <CardContent className="p-4 space-y-1">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className={cn("text-lg font-semibold", AGING_TONE_TEXT[b.tone])}>
                {isLoading ? "…" : fmtMoney(amount)}
              </div>
              <div className="text-xs text-muted-foreground">
                {isLoading ? "" : `${toFaDigits(String(count))} آیتم`}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
