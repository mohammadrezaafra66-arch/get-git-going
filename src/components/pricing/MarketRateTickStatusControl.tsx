import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * C-8 (unwired wave 1) — the only caller of `public.set_market_rate_tick_status`.
 *
 * Live signature (pg_proc, not the stale generated types):
 *   set_market_rate_tick_status(p_tick_id uuid, p_status text, p_note text DEFAULT NULL)
 *     RETURNS void, SECURITY DEFINER
 *
 * The function is not a thin UPDATE: it refuses anyone who is not admin / manager /
 * accountant («دسترسی لازم نیست»), rejects a status outside
 * ('accepted','suspect','rejected') («وضعیت نامعتبر»), and writes one `audit_logs` row
 * with action 'market_rate_status_changed' carrying {from, to, note}. Because the
 * database enforces all of that, this control only has to not offer what will be
 * refused — the role check below is a UI courtesy, never the protection.
 */
export const TICK_STATUSES = ["accepted", "suspect", "rejected"] as const;
export type TickStatus = (typeof TICK_STATUSES)[number];

export const TICK_STATUS_LABEL: Record<TickStatus, string> = {
  accepted: "تأییدشده",
  suspect: "مشکوک",
  rejected: "ردشده",
};

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function MarketRateTickStatusControl({
  tickId,
  status,
  /** Query keys to refresh once the write lands. */
  invalidateKeys = [["market-ticks-history"], ["market-rate-suspect-alerts"]],
}: {
  tickId: string;
  status: string;
  invalidateKeys?: unknown[][];
}) {
  const { roles } = useAuth();
  const canSet = roles.some((r) => ["admin", "manager", "accountant"].includes(r));
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async (next: TickStatus) => {
      const { error } = await (supabase.rpc as unknown as RpcFn)("set_market_rate_tick_status", {
        p_tick_id: tickId,
        p_status: next,
        p_note: null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, next) => {
      toast.success(`وضعیت نرخ به «${TICK_STATUS_LABEL[next]}» تغییر کرد.`);
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message || "تغییر وضعیت ناموفق بود"),
    onSettled: () => setPending(null),
  });

  if (!canSet) return null;

  return (
    <div className="flex items-center gap-1">
      <Select
        value={status}
        onValueChange={(v) => {
          if (v === status) return;
          setPending(v);
          mut.mutate(v as TickStatus);
        }}
        disabled={mut.isPending}
      >
        <SelectTrigger className="h-7 w-28 text-xs" aria-label="تغییر وضعیت نرخ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TICK_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {TICK_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mut.isPending && pending ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
