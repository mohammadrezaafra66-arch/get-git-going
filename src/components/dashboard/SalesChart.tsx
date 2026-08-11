import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Loader2 } from "lucide-react";
import { useSalesChart7d } from "@/hooks/dashboard/useDashboardChart";
import { toPersianDigits, formatTomanFa } from "@/lib/dashboard/utils";

type Metric = "amount" | "count";

export function SalesChart() {
  const [metric, setMetric] = useState<Metric>("amount");
  const { data, isLoading } = useSalesChart7d();
  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" />
          فروش ۷ روز گذشته
        </CardTitle>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={metric === "amount" ? "default" : "outline"}
            onClick={() => setMetric("amount")}
            className="h-7 px-2 text-[11px]"
          >
            مبلغ
          </Button>
          <Button
            type="button"
            size="sm"
            variant={metric === "count" ? "default" : "outline"}
            onClick={() => setMetric("count")}
            className="h-7 px-2 text-[11px]"
          >
            تعداد
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-56 items-center justify-center text-muted-foreground">
            <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : (
          <div dir="ltr" className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {metric === "amount" ? (
                <LineChart data={rows} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="label" reversed tick={{ fontSize: 11 }} />
                  <YAxis
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => toPersianDigits(Math.round(v / 1000))}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatTomanFa(v) + " تومان", "مبلغ"]}
                    labelFormatter={(l: string) => l}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={rows} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="label" reversed tick={{ fontSize: 11 }} />
                  <YAxis
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => toPersianDigits(v)}
                  />
                  <Tooltip
                    formatter={(v: number) => [toPersianDigits(v), "فاکتور"]}
                    labelFormatter={(l: string) => l}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}