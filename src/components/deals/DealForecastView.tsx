import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatDateFa, formatNumber } from "@/lib/i18n/formatters";
import { listSalesPipelines } from "@/lib/sales-desk/pipelines";
import { DealCreateDialog } from "./DealCreateDialog";
import { DealPageHeader, DealViewTabs, soonToast } from "./DealChrome";

export function DealForecastView() {
  const [pipelineId, setPipelineId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const now = new Date();
  const pipesQ = useQuery({
    queryKey: ["sales-desk", "pipelines"],
    queryFn: () => listSalesPipelines({ activeOnly: true }),
  });
  const active = pipelineId || pipesQ.data?.[0]?.id || "";
  const dealsQ = useQuery({
    queryKey: ["sales-desk", "forecast", active, now.getFullYear(), now.getMonth()],
    enabled: !!active,
    queryFn: async () => {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { data, error } = await supabase
        .from("sales_interactions" as never)
        .select("id, title, expected_close_on, probability, status" as never)
        .eq("kind" as never, "request" as never)
        .eq("pipeline_id" as never, active as never)
        .is("deleted_at" as never, null as never)
        .gte("expected_close_on" as never, start.slice(0, 10) as never)
        .lte("expected_close_on" as never, end.slice(0, 10) as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        title: string | null;
        expected_close_on: string | null;
        probability: number | null;
        status: string;
      }>;
    },
  });

  const days = useMemo(() => {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: last }, (_, i) => i + 1);
  }, [now]);

  const byDay = useMemo(() => {
    const map = new Map<number, typeof dealsQ.data>();
    for (const d of dealsQ.data ?? []) {
      if (!d.expected_close_on) continue;
      const day = Number(d.expected_close_on.slice(8, 10));
      const list = map.get(day) ?? [];
      list.push(d);
      map.set(day, list);
    }
    return map;
  }, [dealsQ.data]);

  return (
    <div className="space-y-4" dir="rtl">
      <DealPageHeader title="بیش بینی">
        <div className="flex flex-wrap items-center gap-2">
          <DealViewTabs active="forecast" />
          <Button type="button" onClick={() => setCreateOpen(true)}>
            افزودن معامله
          </Button>
          <Button type="button" variant="outline" onClick={() => void dealsQ.refetch()}>
            بروزرسانی سریع صفحه
          </Button>
        </div>
      </DealPageHeader>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>امروز {formatDateFa(now)}</span>
        <Button type="button" variant="link" onClick={soonToast}>
          راهنمای استفاده از پیش بینی
        </Button>
        <Select value={active || undefined} onValueChange={setPipelineId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="کاریز" />
          </SelectTrigger>
          <SelectContent>
            {(pipesQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <div key={d} className="min-h-24 rounded border p-1 text-xs">
            <div className="font-medium">{d}</div>
            {(byDay.get(d) ?? []).map((deal) => (
              <div key={deal.id}>
                {deal.title} · {formatNumber(deal.probability ?? 0)}٪
              </div>
            ))}
          </div>
        ))}
      </div>
      <DealCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
