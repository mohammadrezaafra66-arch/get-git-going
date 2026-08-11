import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { MessengerAttachment } from "@/components/messenger/AttachmentBubble";

export type MessengerMessage = {
  id: string;
  group_id: string;
  sender_id: string | null;
  content: string | null;
  type: string;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachments?: MessengerAttachment[] | null;
};

export function useMessengerMessages(groupId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const queryKey = ["messenger-messages", groupId];

  const query = useQuery({
    queryKey,
    enabled: !!groupId,
    staleTime: 10_000,
    queryFn: async (): Promise<MessengerMessage[]> => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("messenger_messages")
        .select(
          "id,group_id,sender_id,content,type,reply_to,created_at,edited_at,deleted_at,attachments:messenger_attachments(id,file_path,file_name,file_type,file_size)",
        )
        .eq("group_id", groupId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MessengerMessage[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`messenger:group:${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messenger_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const incoming = payload.new as MessengerMessage;
          qc.setQueryData<MessengerMessage[]>(queryKey, (old) => {
            if (!old) return [incoming];
            if (old.some((m) => m.id === incoming.id)) return old;
            // پیام جدید بدون attachments می‌آید؛ refetch تا join مجدد شود
            qc.invalidateQueries({ queryKey });
            return [...old, incoming];
          });
          qc.invalidateQueries({ queryKey: ["messenger-groups"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messenger_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const updated = payload.new as MessengerMessage;
          qc.setQueryData<MessengerMessage[]>(queryKey, (old) => {
            if (!old) return old;
            return old.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Mark visible messages as read (best-effort, idempotent via ON CONFLICT in DB)
  useEffect(() => {
    if (!groupId || !user?.id || !query.data || query.data.length === 0) return;
    const ids = query.data.map((m) => m.id);
    void (async () => {
      const { data: existing } = await supabase
        .from("messenger_read_receipts")
        .select("message_id")
        .eq("user_id", user.id)
        .in("message_id", ids);
      const have = new Set((existing ?? []).map((r) => r.message_id));
      const missing = ids.filter((id) => !have.has(id));
      if (missing.length === 0) return;
      const rows = missing.map((message_id) => ({ message_id, user_id: user.id }));
      await supabase.from("messenger_read_receipts").upsert(rows, { onConflict: "message_id,user_id" });
      qc.invalidateQueries({ queryKey: ["messenger-groups"] });
    })();
  }, [groupId, user?.id, query.data, qc]);

  return query;
}