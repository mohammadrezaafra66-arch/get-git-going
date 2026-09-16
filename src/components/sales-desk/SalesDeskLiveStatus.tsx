import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";

/**
 * نشانگر زنده بودن جریان ایزابل روی میز فروش.
 * آخرین started_at از call_logs را می‌خواند؛ اگر تازه باشد «زنده» نشان می‌دهد.
 */
export function SalesDeskLiveStatus({ className }: { className?: string }) {
  const q = useQuery({
    queryKey: ["sales-desk", "live-call-watermark"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_logs" as never)
        .select("started_at")
        .order("started_at" as never, { ascending: false } as never)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const startedAt = (data as { started_at?: string | null } | null)?.started_at ?? null;
      return { startedAt };
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const startedAt = q.data?.startedAt ?? null;
  const ageMs = startedAt ? Date.now() - new Date(startedAt).getTime() : null;
  const fresh =
    ageMs != null && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 15 * 60 * 1000;
  const stale =
    ageMs != null && Number.isFinite(ageMs) && ageMs >= 15 * 60 * 1000;

  return (
    <div
      className={cn(
        "sales-desk-chip inline-flex items-center gap-1.5",
        fresh && "border-emerald-500/30 bg-emerald-50 text-emerald-900",
        stale && "border-amber-500/30 bg-amber-50 text-amber-950",
        className,
      )}
      title={
        startedAt
          ? `آخرین تماس واردشده: ${formatDateTimeFa(startedAt)}`
          : "هنوز تماسی در call_logs نیست"
      }
    >
      <Radio
        className={cn(
          "h-3.5 w-3.5",
          fresh && "animate-pulse text-emerald-600",
          stale && "text-amber-700",
        )}
      />
      {q.isLoading
        ? "در حال بررسی جریان تماس…"
        : fresh
          ? "جریان زنده تماس فعال"
          : stale
            ? "جریان تماس کهنه — ایمپورت را چک کنید"
            : "هنوز تماسی وارد نشده"}
      {startedAt ? (
        <span className="text-[10px] opacity-80">
          · آخرین: {formatDateTimeFa(startedAt)}
        </span>
      ) : null}
    </div>
  );
}
