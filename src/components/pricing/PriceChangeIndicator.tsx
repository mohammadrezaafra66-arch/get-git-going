import { cn } from "@/lib/utils";

interface PriceChangeIndicatorProps {
  currentPrice: number;
  previousPrice: number;
  className?: string;
}

export function PriceChangeIndicator({
  currentPrice,
  previousPrice,
  className,
}: PriceChangeIndicatorProps) {
  if (!currentPrice || !previousPrice || currentPrice === previousPrice) return null;

  const changePct = ((currentPrice - previousPrice) / previousPrice) * 100;
  const abs = Math.abs(changePct);
  const up = currentPrice > previousPrice;

  return (
    <span
      className={cn(
        "inline-flex items-center text-xs tabular-nums",
        up ? "text-destructive" : "text-emerald-600",
        abs > 5 && "font-bold",
        abs > 10 && "animate-pulse",
        className,
      )}
      aria-label={up ? "افزایش قیمت" : "کاهش قیمت"}
    >
      {up ? "↑" : "↓"} {abs.toFixed(1)}%
    </span>
  );
}
