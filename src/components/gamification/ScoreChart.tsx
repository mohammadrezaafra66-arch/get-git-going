import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toPersianDigits } from "@/lib/dashboard/utils";

interface ScoreChartProps {
  data: { date: string; score: number }[];
  title?: string;
}

function formatShortJalali(iso: string): string {
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
      month: "2-digit",
      day: "2-digit",
      calendar: "persian",
    }).formatToParts(d);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    return toPersianDigits(`${day}/${month}`);
  } catch {
    return iso;
  }
}

export function ScoreChart({ data, title }: ScoreChartProps) {
  if (!data || data.length === 0) {
    return (
      <div dir="rtl" className="space-y-2">
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          داده‌ای برای نمایش وجود ندارد
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, label: formatShortJalali(d.date) }));

  return (
    <div dir="rtl" className="space-y-2">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(200 90% 50%)" stopOpacity={0.8} />
              <stop offset="100%" stopColor="hsl(170 80% 45%)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="label"
            reversed
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            orientation="right"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => toPersianDigits(v)}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            contentStyle={{ direction: "rtl", fontSize: 12 }}
            labelFormatter={(label: string) => `تاریخ: ${label}`}
            formatter={(value: number) => [toPersianDigits(value), "امتیاز"]}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="hsl(200 90% 50%)"
            fill="url(#scoreGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ScoreChart;