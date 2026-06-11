import { Badge } from "@/components/ui/badge";
import { SALES_QUOTE_STATUS_LABELS, type SalesQuoteStatus } from "@/lib/sales/quotes";

const VARIANT: Record<SalesQuoteStatus, { className: string }> = {
  draft: { className: "bg-muted text-foreground border-border" },
  sent: { className: "bg-primary/10 text-primary border-primary/20" },
  accepted: { className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  rejected: { className: "bg-destructive/10 text-destructive border-destructive/30" },
  canceled: { className: "bg-muted text-muted-foreground border-border line-through" },
};

export function QuoteStatusBadge({ status }: { status: SalesQuoteStatus }) {
  const v = VARIANT[status];
  return (
    <Badge variant="outline" className={v.className}>
      {SALES_QUOTE_STATUS_LABELS[status]}
    </Badge>
  );
}
