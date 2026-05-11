import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatNumber, formatDateFa, toFaDigits } from "@/lib/i18n/formatters";
import type { PriceHistoryPoint } from "@/lib/pricing/price-history";
import { tomanToUsd } from "@/lib/pricing/price-history";

interface Props {
  data: PriceHistoryPoint[];
  mode: "toman" | "usd";
  usdRate: number | null; // snapshot
  height?: number;
}

/**
 * نمودار خطی روند قیمت فروش — تومان یا دلار.
 * - دلار با snapshot آخرین نرخ معتبر محاسبه می‌شود.
 * - tooltip شامل تاریخ شمسی و قیمت.
 */
export function ProductPriceChart({ data, mode, usdRate, height = 240 }: Props) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((d) => {
      const toman = d.new_sale_price;
      const usd = mode === "usd" ? tomanToUsd(toman, usdRate) : null;
      return {
        ts: new Date(d.created_at).getTime(),
        date: d.created_at,
        value: mode === "toman" ? toman : usd,
      };
    }).filter((p) => p.value !== null);
  }, [data, mode, usdRate]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        داده‌ای برای نمایش در این بازه وجود ندارد.
      </div>
    );
  }

  const isUsd = mode === "usd";
  const unit = isUsd ? "$" : "ت";

  return (
    <div style={{ width: "100%", height }} dir="ltr">
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => formatDateFa(new Date(v))}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            minTickGap={30}
          />
          <YAxis
            tickFormatter={(v) => toFaDigits(Number(v).toLocaleString("en-US"))}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(v) => formatDateFa(new Date(Number(v)))}
            formatter={(v: number) => [`${formatNumber(v)} ${unit}`, isUsd ? "قیمت دلاری" : "قیمت تومانی"]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            connectNulls
            dot={{
              r: 5,
              fill: "hsl(var(--background))",
              stroke: "hsl(var(--primary))",
              strokeWidth: 2,
            }}
            activeDot={{
              r: 7,
              fill: "hsl(var(--background))",
              stroke: "hsl(var(--primary))",
              strokeWidth: 2.5,
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ProductPriceChart;