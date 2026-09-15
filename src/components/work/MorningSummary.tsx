import { Link } from "@tanstack/react-router";
import { Loader2, Sunrise } from "lucide-react";
import { toFaDigits } from "@/lib/i18n/formatters";
import type { WorkMorningSummary } from "@/lib/work";
import { IMPACT_LABELS } from "./labels";

export function MorningSummaryStrip({
  summary,
  loading,
  error,
}: {
  summary: WorkMorningSummary | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl border border-sky-200/60 bg-gradient-to-l from-sky-50/80 to-teal-50/50 px-4 py-6 text-sm text-slate-600"
        dir="rtl"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال آماده‌سازی خلاصهٔ صبح…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800"
        dir="rtl"
      >
        خلاصهٔ صبح بارگذاری نشد: {error}
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-sm text-slate-500"
        dir="rtl"
      >
        هنوز خلاصه‌ای برای امروز نیست.
      </div>
    );
  }

  const cells = [
    { key: "today_decide", label: "امروز تصمیم", value: summary.today_decide },
    { key: "today_do", label: "امروز انجام", value: summary.today_do },
    { key: "waiting", label: "در انتظار", value: summary.waiting },
    { key: "open", label: "باز", value: summary.open },
  ] as const;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-teal-50/70 shadow-sm"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-sky-100/80 px-4 py-3">
        <Sunrise className="h-4 w-4 text-teal-700" />
        <h2 className="text-sm font-semibold text-slate-800">خلاصهٔ صبحگاهی</h2>
        <span className="text-xs text-slate-500">
          تا {toFaDigits(summary.as_of_date)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {cells.map((c) => (
          <div
            key={c.key}
            className="rounded-xl bg-white/70 px-3 py-3 text-center ring-1 ring-slate-100"
          >
            <div className="text-2xl font-bold tracking-tight text-slate-800">
              {toFaDigits(c.value)}
            </div>
            <div className="mt-1 text-xs text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>
      {summary.top_impact.length > 0 && (
        <div className="border-t border-sky-100/80 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-slate-600">بیشترین اثر</p>
          <ul className="space-y-1.5">
            {summary.top_impact.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  to="/operations/work/$itemId"
                  params={{ itemId: item.id }}
                  className="truncate text-teal-800 hover:underline"
                >
                  {item.title}
                </Link>
                <span className="shrink-0 text-xs text-slate-500">
                  {IMPACT_LABELS[item.impact_level]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
