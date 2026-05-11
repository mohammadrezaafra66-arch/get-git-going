import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
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
export function ProductPriceChart({ data, mode, usdRate, height = 280 }: Props) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data
      .map((d) => {
        const toman = d.new_sale_price;
        const usd = mode === "usd" ? tomanToUsd(toman, usdRate) : null;
        return {
          ts: new Date(d.created_at).getTime(),
          date: d.created_at,
          value: mode === "toman" ? toman : usd,
        };
      })
      .filter((p) => p.value !== null)
      .sort((a, b) => a.ts - b.ts);
  }, [data, mode, usdRate]);

  const { yMin, yMax, yTicks, stats } = useMemo(() => {
    if (chartData.length === 0)
      return { yMin: 0, yMax: 0, yTicks: [] as number[], stats: null as null | { min: number; max: number; avg: number; current: number } };
    const values = chartData.map((p) => p.value as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const current = values[values.length - 1];
    const stats = { min, max, avg, current };
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.05);
      const lo = min - pad;
      const hi = max + pad;
      const step = (hi - lo) / 4;
      return { yMin: lo, yMax: hi, yTicks: [0, 1, 2, 3, 4].map((i) => lo + step * i), stats };
    }
    const range = max - min;
    const pad = range * 0.1;
    const lo = Math.max(0, min - pad);
    const hi = max + pad;
    const step = (hi - lo) / 5;
    const ticks = [0, 1, 2, 3, 4, 5].map((i) => lo + step * i);
    return { yMin: lo, yMax: hi, yTicks: ticks, stats };
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        داده‌ای برای نمایش در این بازه وجود ندارد.
      </div>
    );
  }

  const isUsd = mode === "usd";
  const unit = isUsd ? "$" : "ت";
  const fmtY = (v: number) => {
    if (isUsd) return toFaDigits(v.toFixed(2));
    return toFaDigits(Math.round(v).toLocaleString("en-US"));
  };

  return (
    <div style={{ width: "100%", height }} dir="ltr">
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 12, right: 16, left: 12, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => formatDateTimeFa(new Date(v))}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            minTickGap={60}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tickFormatter={fmtY}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            width={90}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(v) => formatDateTimeFa(new Date(Number(v)))}
            formatter={(v: number) => [`${formatNumber(v)} ${unit}`, isUsd ? "قیمت دلاری" : "قیمت تومانی"]}
          />
          {stats && stats.min !== stats.max && (
            <>
              <ReferenceLine
                y={stats.max}
                stroke="hsl(var(--destructive))"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: `بیشترین: ${fmtY(stats.max)}`,
                  position: "insideTopRight",
                  fill: "hsl(var(--destructive))",
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={stats.avg}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="2 4"
                strokeOpacity={0.6}
                label={{
                  value: `میانگین: ${fmtY(stats.avg)}`,
                  position: "insideRight",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={stats.min}
                stroke="hsl(142 70% 40%)"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: `کمترین: ${fmtY(stats.min)}`,
                  position: "insideBottomRight",
                  fill: "hsl(142 70% 40%)",
                  fontSize: 10,
                }}
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            connectNulls
            dot={{
              r: 3.5,
              fill: "hsl(var(--primary))",
              stroke: "hsl(var(--background))",
              strokeWidth: 1.5,
            }}
            activeDot={{
              r: 6,
              fill: "hsl(var(--background))",
              stroke: "hsl(var(--primary))",
              strokeWidth: 2.5,
            }}
            isAnimationActive={true}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ProductPriceChart;