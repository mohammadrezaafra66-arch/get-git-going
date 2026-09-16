import { Link } from "@tanstack/react-router";
import { Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkItem } from "@/lib/work";
import { KIND_LABELS, PRIORITY_LABELS } from "./labels";

export function DecisionQueue({
  items,
  loading,
  error,
  busyId,
  onSetBucket,
}: {
  items: WorkItem[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onSetBucket: (
    itemId: string,
    bucket: "today_do" | "waiting" | null,
  ) => void;
}) {
  return (
    <section
      className="rounded-2xl border border-amber-200/70 bg-gradient-to-l from-amber-50/50 to-white p-4 shadow-sm"
      dir="rtl"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span aria-hidden>⚖️</span>
          <Scale className="h-4 w-4 text-amber-700" />
          صف تصمیم امروز
        </h2>
        <span className="text-xs text-slate-500">سریع به انجام یا انتظار بفرستید</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری صف…
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="rounded-xl bg-white/70 py-4 text-center text-sm text-slate-500 ring-1 ring-amber-100">
          😌 موردی برای تصمیم امروز نیست — آرام بمانید.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const busy = busyId === item.id;
          return (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-xl bg-white/90 p-3 shadow-sm ring-1 ring-amber-100 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link
                  to="/operations/work/$itemId"
                  params={{ itemId: item.id }}
                  className="block truncate font-medium text-slate-800 hover:text-teal-800"
                >
                  {item.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {KIND_LABELS[item.kind]} · {PRIORITY_LABELS[item.priority]}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => onSetBucket(item.id, "today_do")}
                >
                  ✅ امروز انجام
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => onSetBucket(item.id, "waiting")}
                >
                  ⏳ انتظار
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => onSetBucket(item.id, null)}
                >
                  پاک کردن
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
