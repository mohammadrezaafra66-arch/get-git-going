import { Badge } from "@/components/ui/badge";
import {
  STOCK_ALERT_STATUS_LABEL, STOCK_ALERT_PRIORITY_LABEL,
  type StockAlertStatus, type StockAlertPriority,
} from "@/lib/sales/stock-alerts";

const STATUS_CLS: Record<StockAlertStatus, string> = {
  open: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  contacted: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  closed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  canceled: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_CLS: Record<StockAlertPriority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-secondary/40 text-foreground border-border",
  high: "bg-red-500/10 text-red-700 border-red-500/30",
};

export function StockAlertStatusBadge({ status }: { status: StockAlertStatus }) {
  return (
    <Badge variant="outline" className={`font-normal ${STATUS_CLS[status]}`}>
      {STOCK_ALERT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function StockAlertPriorityBadge({ priority }: { priority: StockAlertPriority }) {
  return (
    <Badge variant="outline" className={`font-normal ${PRIORITY_CLS[priority]}`}>
      {STOCK_ALERT_PRIORITY_LABEL[priority]}
    </Badge>
  );
}