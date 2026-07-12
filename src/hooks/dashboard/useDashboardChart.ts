import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import moment from "moment-jalaali";

const COMMON = { staleTime: 60_000, refetchInterval: 120_000, retry: false } as const;

export interface SalesChartPoint {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** Jalali label e.g. ۱۴۰۴/۰۳/۲۸ */
  label: string;
  amount: number;
  count: number;
}

/** فروش ۷ روز گذشته به تفکیک روز. */
export function useSalesChart7d() {
  return useQuery<SalesChartPoint[]>({
    ...COMMON,
    queryKey: ["dash", "sales-chart-7d"],
    queryFn: async () => {
      const today = new Date();
      const days: Date[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        days.push(d);
      }
      const fromIso = days[0].toISOString().slice(0, 10);
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("issue_date, total_amount")
          .gte("issue_date", fromIso);
        if (error || !data) return days.map(toEmpty);
        const byDay = new Map<string, { amount: number; count: number }>();
        for (const r of data as Array<{ issue_date: string | null; total_amount: number | null }>) {
          if (!r.issue_date) continue;
          const key = r.issue_date.slice(0, 10);
          const cur = byDay.get(key) ?? { amount: 0, count: 0 };
          cur.amount += Number(r.total_amount ?? 0);
          cur.count += 1;
          byDay.set(key, cur);
        }
        return days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const v = byDay.get(key) ?? { amount: 0, count: 0 };
          return { date: key, label: toJalaliShort(d), amount: v.amount, count: v.count };
        });
      } catch {
        return days.map(toEmpty);
      }

      function toEmpty(d: Date): SalesChartPoint {
        return {
          date: d.toISOString().slice(0, 10),
          label: toJalaliShort(d),
          amount: 0,
          count: 0,
        };
      }
    },
  });
}

let loaded = false;
function toJalaliShort(d: Date): string {
  if (!loaded) {
    moment.loadPersian({ usePersianDigits: true, dialect: "persian-modern" });
    loaded = true;
  }
  return moment(d).format("jMM/jDD");
}