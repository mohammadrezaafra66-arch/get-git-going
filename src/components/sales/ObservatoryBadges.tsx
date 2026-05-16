import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/i18n/formatters";
import {
  OBSERVATORY_STATUS_META,
  getObservatoryScoreTier,
} from "@/lib/data-tables/constants";
import type { ObservatorySnippet } from "@/lib/sales/observatory-snippets";

interface ObservatoryBadgesProps {
  snippet?: ObservatorySnippet | null;
  className?: string;
}

/**
 * Sales-facing read-only Observatory hints next to a product card.
 *
 * Renders nothing when no snippet is available — DT.7H rule:
 * absence of snippet must never affect product visibility.
 *
 * Never shows raw market prices.
 */
export function ObservatoryBadges({ snippet, className }: ObservatoryBadgesProps) {
  if (!snippet) return null;

  const status = snippet.competitive_price_status;
  const score = snippet.sales_opportunity_score;
  const message = snippet.suggested_sales_message;

  const statusMeta =
    status && OBSERVATORY_STATUS_META[status]
      ? OBSERVATORY_STATUS_META[status]
      : null;

  // Special "Sales Opportunity" badge: below_market + score ≥ 60
  const isOpportunity =
    status === "below_market" && typeof score === "number" && score >= 60;

  // For above_market we intentionally do NOT show the score chip (avoid
  // suggesting a strong opportunity when we are pricier than market).
  const showScore =
    typeof score === "number" &&
    Number.isFinite(score) &&
    score > 0 &&
    status !== "above_market";

  const scoreTier = showScore ? getObservatoryScoreTier(score as number) : null;

  const hasAnything = statusMeta || showScore || message || isOpportunity;
  if (!hasAnything) return null;

  return (
    <div
      dir="rtl"
      className={cn(
        "mt-2 flex flex-wrap items-center gap-1.5 text-[11px]",
        className,
      )}
    >
      {isOpportunity && (
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        >
          <Sparkles className="ml-1 h-3 w-3" />
          فرصت فروش
        </Badge>
      )}

      {statusMeta && (
        <Badge variant="outline" className={statusMeta.className}>
          {statusMeta.label}
        </Badge>
      )}

      {showScore && scoreTier && (
        <Badge variant="outline" className={scoreTier.className}>
          فرصت فروش {formatNumber(Math.round(score as number))} از ۱۰۰
        </Badge>
      )}

      {message && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="max-w-[18rem] truncate rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground cursor-help"
                title={message}
              >
                {message}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-xs whitespace-pre-line text-right"
            >
              {message}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}