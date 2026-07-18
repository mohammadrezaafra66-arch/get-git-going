import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";

export type InquiryStatus =
  | "draft" | "pending" | "warning_5min" | "danger_8min" | "critical_10min"
  | "transfer_available" | "transferred" | "answered"
  | "completed_on_time" | "completed_late" | "expired" | "cancelled" | "rejected";

export type InquiryRow = {
  id: string;
  product_id: string;
  group_id: string;
  requested_by: string;
  assigned_to: string;
  status: InquiryStatus;
  message_id: string | null;
  created_at: string;
  answered_at: string | null;
  closed_at: string | null;
  product: { id: string; name: string; sku: string | null } | null;
  replies: { id: string; price: number; note: string | null; created_at: string; user_id: string }[] | null;
};

export function useInquiries(groupId: string | null) {
  const qc = useQueryClient();
  const queryKey = ["inquiries", groupId];
  // Unique per-hook-instance suffix so multiple subscribers (e.g. ChatWindow + MessageList)
  // don't collide on the same realtime channel name and trigger
  // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
  const instanceIdRef = useRef<string>(safeRandomUUID());

  const query = useQuery({
    queryKey,
    enabled: !!groupId,
    staleTime: 10_000,
    queryFn: async (): Promise<InquiryRow[]> => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("inquiries")
        .select(
          "id,product_id,group_id,requested_by,assigned_to,status,message_id,created_at,answered_at,closed_at,product:products(id,name,sku),replies:inquiry_replies(id,price,note,created_at,user_id)",
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as InquiryRow[];
    },
  });

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`messenger:inquiries:${groupId}:${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inquiries", filter: `group_id=eq.${groupId}` },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return query;
}