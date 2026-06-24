import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
};

export function useInquiries(groupId: string | null) {
  const qc = useQueryClient();
  const queryKey = ["inquiries", groupId];

  const query = useQuery({
    queryKey,
    enabled: !!groupId,
    staleTime: 10_000,
    queryFn: async (): Promise<InquiryRow[]> => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("inquiries")
        .select(
          "id,product_id,group_id,requested_by,assigned_to,status,message_id,created_at,answered_at,closed_at,product:products(id,name,sku)",
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
      .channel(`messenger:inquiries:${groupId}`)
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