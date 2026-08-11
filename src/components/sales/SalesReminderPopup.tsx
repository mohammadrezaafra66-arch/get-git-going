import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * 128 — rotating 2-second reminder popup for Quick Sales Search.
 *
 * On mount, shows exactly one active reminder as a short (2s) toast. The shown
 * reminder rotates on each open via a per-session counter so sellers cycle
 * through the whole list instead of always seeing the first one.
 *
 * Renders nothing itself. Fails silently: if the table/rows are missing (e.g.
 * migration not yet applied on the server) no popup is shown.
 */
const ROTATION_KEY = "afrakala.sales-reminder.rotation";

export function SalesReminderPopup() {
  const shownRef = useRef(false);

  const { data: reminders } = useQuery({
    queryKey: ["sales-reminders-active"],
    queryFn: async (): Promise<string[]> => {
      // NOTE: `sales_reminders` (migration 128) is not yet in the generated
      // supabase types.ts. Per project guidance we do NOT regenerate types here;
      // a minimal local cast keeps this one query type-safe-enough without
      // touching the shared client typings.
      const { data, error } = await (supabase as any)
        .from("sales_reminders")
        .select("text, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ text: string }>;
      return rows.map((r) => r.text).filter((t) => typeof t === "string" && t.trim().length > 0);
    },
    staleTime: 5 * 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (shownRef.current) return;
    if (!reminders || reminders.length === 0) return;
    shownRef.current = true;

    let idx = 0;
    try {
      const raw = window.sessionStorage.getItem(ROTATION_KEY);
      const prev = raw == null ? -1 : Number.parseInt(raw, 10);
      idx = (Number.isFinite(prev) ? prev + 1 : 0) % reminders.length;
      window.sessionStorage.setItem(ROTATION_KEY, String(idx));
    } catch {
      idx = 0;
    }

    toast.info(reminders[idx], { duration: 2000 });
  }, [reminders]);

  return null;
}
