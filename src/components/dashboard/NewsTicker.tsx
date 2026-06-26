import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toFaDigits } from "@/lib/i18n/formatters";

interface TickerEvent {
  id: string;
  event_type: string;
  message_fa: string;
  created_at: string;
}

function timeAgoFa(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "همین الان";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${toFaDigits(min)} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${toFaDigits(hr)} ساعت پیش`;
  const day = Math.floor(hr / 24);
  return `${toFaDigits(day)} روز پیش`;
}

export function NewsTicker() {
  const { data } = useQuery({
    queryKey: ["dashboard-ticker-events"],
    queryFn: async (): Promise<TickerEvent[]> => {
      const { data, error } = await supabase
        .from("dashboard_ticker_events" as never)
        .select("id, event_type, message_fa, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as TickerEvent[];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const events = data ?? [];
  if (events.length === 0) return null;

  const content = events
    .map((e) => `${timeAgoFa(e.created_at)} — ${e.message_fa}`)
    .join("   •   ");

  return (
    <div
      dir="rtl"
      className="relative w-full overflow-hidden rounded-lg border bg-muted/40 py-2"
    >
      <div className="ticker-track flex w-max gap-12 whitespace-nowrap text-sm text-muted-foreground">
        <span className="px-4">{content}</span>
        <span className="px-4" aria-hidden="true">
          {content}
        </span>
      </div>
    </div>
  );
}

export default NewsTicker;