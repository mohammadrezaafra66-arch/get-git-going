import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { GitMerge, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toFaDigits } from "@/lib/i18n/formatters";
import type { WorkMergeSuggestion } from "@/lib/work";

export type MergeSuggestionView = WorkMergeSuggestion & {
  sourceTitle?: string;
  targetTitle?: string;
};

export function MergePanel({
  suggestions,
  loading,
  error,
  busyId,
  onAccept,
  onDismiss,
}: {
  suggestions: MergeSuggestionView[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onAccept: (suggestionId: string, keepItemId: string) => void;
  onDismiss: (suggestionId: string) => void;
}) {
  const [keepById, setKeepById] = useState<Record<string, string>>({});

  return (
    <section
      id="work-merge-panel"
      className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
      dir="rtl"
    >
      <div className="mb-3 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-slate-600" />
        <h2 className="text-sm font-semibold text-slate-800">پیشنهاد ادغام</h2>
        <span className="text-xs text-slate-500">فقط با تأیید شما — هرگز خودکار نیست</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بررسی شباهت‌ها…
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-500">
          پیشنهاد ادغامی در صف نیست.
        </p>
      )}

      <ul className="space-y-3">
        {suggestions.map((s) => {
          const keep =
            keepById[s.id] ?? s.source_item_id;
          const busy = busyId === s.id;
          return (
            <li
              key={s.id}
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1 text-sm">
                  <p>
                    <span className="text-slate-500">مبدأ: </span>
                    <Link
                      to="/operations/work/$itemId"
                      params={{ itemId: s.source_item_id }}
                      className="text-teal-800 hover:underline"
                    >
                      {s.sourceTitle ?? (
                        <span dir="ltr" className="font-mono text-xs">
                          {s.source_item_id.slice(0, 8)}
                        </span>
                      )}
                    </Link>
                  </p>
                  <p>
                    <span className="text-slate-500">مقصد: </span>
                    <Link
                      to="/operations/work/$itemId"
                      params={{ itemId: s.target_item_id }}
                      className="text-teal-800 hover:underline"
                    >
                      {s.targetTitle ?? (
                        <span dir="ltr" className="font-mono text-xs">
                          {s.target_item_id.slice(0, 8)}
                        </span>
                      )}
                    </Link>
                  </p>
                  <p className="text-xs text-slate-500">
                    شباهت {toFaDigits((s.score * 100).toFixed(0))}٪
                    {s.reason ? ` · ${s.reason}` : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  aria-label="رد پیشنهاد"
                  onClick={() => onDismiss(s.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-xs text-slate-600">کدام بماند؟</label>
                <select
                  dir="rtl"
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  value={keep}
                  disabled={busy}
                  onChange={(e) =>
                    setKeepById((prev) => ({ ...prev, [s.id]: e.target.value }))
                  }
                >
                  <option value={s.source_item_id}>
                    مبدأ — {s.sourceTitle ?? "منبع"}
                  </option>
                  <option value={s.target_item_id}>
                    مقصد — {s.targetTitle ?? "هدف"}
                  </option>
                </select>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onAccept(s.id, keep)}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  تأیید ادغام
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
