import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import type { InquiryRow } from "@/hooks/messenger/useInquiries";
import { tickInquiries } from "@/lib/messenger/inquiry-status";

/** Cross-group inquiry list (RLS-filtered). */
export function useAllInquiries(enabled = true) {
  const qc = useQueryClient();
  const queryKey = ["inquiries", "all"];
  const instanceIdRef = useRef<string>(safeRandomUUID());

  const query = useQuery({
    queryKey,
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<InquiryRow[]> => {
      const { data, error } = await supabase
        .from("inquiries")
        .select(
          "id,product_id,group_id,requested_by,assigned_to,status,message_id,created_at,answered_at,closed_at,product:products(id,name,sku),replies:inquiry_replies(id,price,note,created_at,user_id)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as InquiryRow[];
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`messenger:inquiries:all:${instanceIdRef.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiries" }, () => {
        qc.invalidateQueries({ queryKey });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiry_replies" }, () => {
        qc.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      try {
        await tickInquiries();
        if (!cancelled) qc.invalidateQueries({ queryKey });
      } catch {
        // Best-effort — see inquiry-status.ts note on 42P10.
      }
    };
    void run();
    const id = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return query;
}
