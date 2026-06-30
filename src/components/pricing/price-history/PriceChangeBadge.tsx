import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/i18n/formatters";
import type { PriceChangeInfo } from "@/lib/pricing/price-history";

interface Props {
  info: Pick<PriceChangeInfo, "change_percent" | "change_amount" | "direction">;
  /** نمایش مبلغ تغییر در کنار درصد. */
  showAmount?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Badge درصد تغییر قیمت — قرارداد پروژه:
 *   افزایش = سبز، کاهش = قرمز، بدون تغییر = خنثی.
 */
export function PriceChangeBadge({ info, showAmount = false, size = "sm", className }: Props) {
  const { change_percent, change_amount, direction } = info;

  if (direction === "none" || (change_percent === null && change_amount === null)) {
    return (
      <Badge variant="outline" className={cn("font-normal text-muted-foreground", className)}>
        —
      </Badge>
    );
  }

  if (direction === "flat") {
    return (
      <Badge variant="secondary" className={cn("gap-1 font-normal", className)}>
        <Minus className="h-3 w-3" /> بدون تغییر
      </Badge>
    );
  }

  const up = direction === "up";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const colorCls = up
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400";
  const text = up ? "افزایش" : "کاهش";
  const pct = change_percent !== null ? Math.abs(change_percent) : null;
  const amt = change_amount !== null ? Math.abs(change_amount) : null;

  const padding = size === "md" ? "px-2 py-1 text-sm" : "text-xs";

  const pctLabel =
    pct !== null ? (pct > 999 ? `۹۹۹٪+ ${text}` : `${formatNumber(pct)}٪ ${text}`) : null;

  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", colorCls, padding, className)}>
      <Icon className="h-3 w-3" />
      {pctLabel !== null ? pctLabel : `${formatNumber(amt!)} ت ${text}`}
      {showAmount && pct !== null && amt !== null && (
        <span className="opacity-80">({formatNumber(amt)} ت)</span>
      )}
    </Badge>
  );
}
