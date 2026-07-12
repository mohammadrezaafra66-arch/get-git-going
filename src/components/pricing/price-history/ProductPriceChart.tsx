import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
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
const ProductPriceChart = forwardRef<HTMLDivElement, Props>(function ProductPriceChart(
  { data, mode, usdRate, height = 280 },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const setWrapperRef = (node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      return {
        yMin: 0,
        yMax: 0,
        yTicks: [] as number[],
        stats: null as null | {
          min: number;
          max: number;
          avg: number;
          current: number;
          minDate: string;
          maxDate: string;
          rangeStart: string;
          rangeEnd: string;
        },
      };
    const values = chartData.map((p) => p.value as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const current = values[values.length - 1];
    const minPoint = chartData.find((p) => p.value === min)!;
    const maxPoint = chartData.find((p) => p.value === max)!;
    const stats = {
      min,
      max,
      avg,
      current,
      minDate: minPoint.date,
      maxDate: maxPoint.date,
      rangeStart: chartData[0].date,
      rangeEnd: chartData[chartData.length - 1].date,
    };
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

  // Compute day boundaries (midnight ts) covering the data range — used for
  // both vertical day-separators and to size the chart so each day gets enough
  // horizontal room when many points cluster within a single day.
  const dayBoundaries = useMemo(() => {
    if (chartData.length === 0) return [] as number[];
    const startMs = chartData[0].ts;
    const endMs = chartData[chartData.length - 1].ts;
    const start = new Date(startMs);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endMs);
    end.setHours(0, 0, 0, 0);
    const out: number[] = [];
    const cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      out.push(cur.getTime());
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [chartData]);

  const MIN_DAY_WIDTH = 110; // px per day minimum
  const daysCount = Math.max(1, dayBoundaries.length || 1);
  const innerWidth = Math.max(containerWidth || 0, daysCount * MIN_DAY_WIDTH);
  const showDaySeparators = dayBoundaries.length > 1 && dayBoundaries.length <= 60;

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

  /**
   * Custom label for ReferenceLine with native SVG <title> tooltip.
   * Hovering روی برچسب، اطلاعات دقیق (تاریخ یا محدوده + مقدار) را نشان می‌دهد.
   */
  const RefLabel = (props: {
    viewBox?: { x: number; y: number; width: number; height: number };
    text: string;
    tooltip: string;
    fill: string;
    align?: "top" | "bottom" | "middle";
  }) => {
    const { viewBox, text, tooltip, fill, align = "middle" } = props;
    if (!viewBox) return null;
    const padX = 6;
    const padY = 3;
    const charW = 6.2;
    const textW = Math.max(40, Math.round(text.length * charW));
    const textH = 14;
    const x = viewBox.x + viewBox.width - 8;
    const dy = align === "top" ? -6 : align === "bottom" ? 14 : -6;
    const rectX = x - textW - padX;
    const rectY = viewBox.y + dy - textH + padY;
    return (
      <g style={{ cursor: "help" }}>
        <title>{tooltip}</title>
        <rect
          x={rectX}
          y={rectY}
          width={textW + padX * 2}
          height={textH + padY * 2}
          rx={3}
          fill="var(--background)"
          fillOpacity={0.85}
          stroke={fill}
          strokeOpacity={0.4}
          strokeWidth={0.75}
        />
        <text x={x} y={viewBox.y + dy} textAnchor="end" fill={fill} fontSize={11} fontWeight={700}>
          {text}
        </text>
      </g>
    );
  };

  return (
    <div
      ref={setWrapperRef}
      style={{ width: "100%", height }}
      className="overflow-x-auto overflow-y-hidden"
      dir="ltr"
    >
      <div style={{ width: innerWidth, height: "100%", touchAction: "pan-x" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 18, right: 24, left: 12, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            {showDaySeparators &&
              dayBoundaries.map((ts) => (
                <ReferenceLine
                  key={`day-${ts}`}
                  x={ts}
                  stroke="var(--border)"
                  strokeDasharray="2 4"
                  strokeOpacity={0.5}
                  ifOverflow="hidden"
                />
              ))}
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => formatDateTimeFa(new Date(v))}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              minTickGap={40}
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
              formatter={(v: number) => [
                `${formatNumber(v)} ${unit}`,
                isUsd ? "قیمت دلاری" : "قیمت تومانی",
              ]}
            />
            {stats && stats.min !== stats.max && (
              <>
                {/* Halo (under-stroke) for visibility on any background */}
                <ReferenceLine
                  y={stats.max}
                  stroke="var(--destructive)"
                  strokeWidth={5}
                  strokeOpacity={0.18}
                  ifOverflow="extendDomain"
                />
                <ReferenceLine
                  y={stats.max}
                  stroke="var(--destructive)"
                  strokeWidth={1.75}
                  strokeDasharray="8 4"
                  strokeOpacity={1}
                  ifOverflow="extendDomain"
                  label={(p: any) => (
                    <RefLabel
                      viewBox={p.viewBox}
                      text={`بیشترین: ${fmtY(stats.max)} ${unit}`}
                      tooltip={`بیشترین قیمت: ${formatNumber(stats.max)} ${unit}\nتاریخ: ${formatDateTimeFa(new Date(stats.maxDate))}`}
                      fill="var(--destructive)"
                      align="top"
                    />
                  )}
                />
                <ReferenceLine
                  y={stats.avg}
                  stroke="var(--muted-foreground)"
                  strokeWidth={4}
                  strokeOpacity={0.15}
                />
                <ReferenceLine
                  y={stats.avg}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="4 5"
                  strokeOpacity={0.95}
                  label={(p: any) => (
                    <RefLabel
                      viewBox={p.viewBox}
                      text={`میانگین: ${fmtY(stats.avg)} ${unit}`}
                      tooltip={`میانگین در بازه: ${formatNumber(stats.avg)} ${unit}\nاز ${formatDateTimeFa(new Date(stats.rangeStart))}\nتا ${formatDateTimeFa(new Date(stats.rangeEnd))}\nتعداد نقاط: ${toFaDigits(chartData.length)}`}
                      fill="var(--muted-foreground)"
                    />
                  )}
                />
                <ReferenceLine
                  y={stats.min}
                  stroke="var(--success)"
                  strokeWidth={5}
                  strokeOpacity={0.18}
                  ifOverflow="extendDomain"
                />
                <ReferenceLine
                  y={stats.min}
                  stroke="var(--success)"
                  strokeWidth={1.75}
                  strokeDasharray="8 4"
                  strokeOpacity={1}
                  ifOverflow="extendDomain"
                  label={(p: any) => (
                    <RefLabel
                      viewBox={p.viewBox}
                      text={`کمترین: ${fmtY(stats.min)} ${unit}`}
                      tooltip={`کمترین قیمت: ${formatNumber(stats.min)} ${unit}\nتاریخ: ${formatDateTimeFa(new Date(stats.minDate))}`}
                      fill="var(--success)"
                      align="bottom"
                    />
                  )}
                />
              </>
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2.5}
              connectNulls
              dot={{
                r: 3.5,
                fill: "var(--primary)",
                stroke: "var(--background)",
                strokeWidth: 1.5,
              }}
              activeDot={{
                r: 6,
                fill: "var(--background)",
                stroke: "var(--primary)",
                strokeWidth: 2.5,
              }}
              isAnimationActive={true}
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
ProductPriceChart.displayName = "ProductPriceChart";

export { ProductPriceChart };
export default ProductPriceChart;
