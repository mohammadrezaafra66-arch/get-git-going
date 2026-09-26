import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDealHistorySentence, type DealHistoryRow } from "@/lib/deals/history";
import { loadDealLookupNames } from "@/lib/deals/names";

export function DealHistoryFeed(props: { dealId: string; dealTitle: string }) {
  const q = useQuery({
    queryKey: ["sales-desk", "deal-history", props.dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_interaction_history" as never)
        .select("id, event, field_name, from_value, to_value, actor_id, created_at" as never)
        .eq("interaction_id" as never, props.dealId as never)
        .order("created_at" as never, { ascending: false } as never)
        .limit(80);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as DealHistoryRow[];
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[])];
      const uuidVals = [
        ...new Set(
          rows.flatMap((r) => [r.from_value, r.to_value]).filter((v) => !!v && /^[0-9a-f-]{36}$/i.test(v!)) as string[],
        ),
      ];
      const names: Record<string, string> = {
        ...(await loadDealLookupNames([...actorIds, ...uuidVals])),
      };
      if (uuidVals.length) {
        const [{ data: stages }, { data: pipes }] = await Promise.all([
          supabase.from("sales_pipeline_stages" as never).select("id, title" as never).in("id" as never, uuidVals as never),
          supabase.from("sales_pipelines" as never).select("id, title" as never).in("id" as never, uuidVals as never),
        ]);
        for (const s of (stages ?? []) as { id: string; title: string }[]) names[s.id] = s.title;
        for (const p of (pipes ?? []) as { id: string; title: string }[]) names[p.id] = p.title;
      }
      return { rows, names };
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>;
  const rows = q.data?.rows ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">سابقه‌ای ثبت نشده است.</p>;
  }
  return (
    <ul className="space-y-2 text-sm" data-testid="deal-history-feed">
      {rows.map((r) => (
        <li key={r.id} className="deal-elev rounded-xl border bg-card p-3 leading-7">
          {formatDealHistorySentence(r, q.data?.names ?? {}, props.dealTitle)}
        </li>
      ))}
    </ul>
  );
}
