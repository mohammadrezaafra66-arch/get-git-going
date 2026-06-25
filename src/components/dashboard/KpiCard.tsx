import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toPersianDigits } from "@/lib/dashboard/utils";

export type KpiColor = "green" | "amber" | "red" | "blue" | "violet" | "neutral";

const COLOR_CLASS: Record<KpiColor, { bg: string; text: string; ring: string }> = {
  green: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-300", ring: "ring-emerald-200/60" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-300", ring: "ring-amber-200/60" },
  red: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-600 dark:text-red-300", ring: "ring-red-200/60" },
  blue: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-600 dark:text-blue-300", ring: "ring-blue-200/60" },
  violet: { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-600 dark:text-violet-300", ring: "ring-violet-200/60" },
  neutral: { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" },
};

export interface KpiCardProps {
  title: string;
  value: number | string | null | undefined;
  subtitle?: string;
  unit?: string;
  icon: LucideIcon;
  color?: KpiColor;
  loading?: boolean;
  formatter?: (v: number) => string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  unit,
  icon: Icon,
  color = "blue",
  loading,
  formatter,
}: KpiCardProps) {
  const c = COLOR_CLASS[color];
  let display: string;
  if (loading) display = "…";
  else if (value === null || value === undefined) display = "—";
  else if (typeof value === "number") display = formatter ? formatter(value) : toPersianDigits(value);
  else display = value;

  return (
    <Card className="overflow-hidden border-border/70 transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg} ${c.text}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-[18px] w-[18px]" />}
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{title}</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className={`text-2xl font-bold tabular-nums ${c.text}`}>{display}</span>
          {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
        </div>
        {subtitle && <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}