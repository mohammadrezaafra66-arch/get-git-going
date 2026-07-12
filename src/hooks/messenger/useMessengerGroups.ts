import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export type MessengerGroup = {
  id: string;
  name: string;
  type: string;
  created_at: string;
  last_message?: { content: string | null; created_at: string; sender_id: string | null } | null;
  unread_count: number;
};

export function useMessengerGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["messenger-groups", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<MessengerGroup[]> => {
      // RLS limits to groups the user is a member of
      const { data: groups, error } = await supabase
        .from("messenger_groups")
        .select("id,name,type,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const groupIds = (groups ?? []).map((g) => g.id);
      if (groupIds.length === 0) return [];

      // Last message per group (fetch latest 200 across these groups and pick first per group)
      const { data: msgs } = await supabase
        .from("messenger_messages")
        .select("id,group_id,content,created_at,sender_id")
        .in("group_id", groupIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);

      const lastByGroup = new Map<string, { content: string | null; created_at: string; sender_id: string | null }>();
      for (const m of msgs ?? []) {
        if (!lastByGroup.has(m.group_id)) {
          lastByGroup.set(m.group_id, { content: m.content, created_at: m.created_at, sender_id: m.sender_id });
        }
      }

      // Unread count: messages in groups whose id not in read_receipts for current user
      // Pull receipts for these groups' messages (latest 500) and compute client-side
      const { data: recent } = await supabase
        .from("messenger_messages")
        .select("id,group_id")
        .in("group_id", groupIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      const recentIds = (recent ?? []).map((r) => r.id);
      let readSet = new Set<string>();
      if (recentIds.length > 0 && user?.id) {
        const { data: receipts } = await supabase
          .from("messenger_read_receipts")
          .select("message_id")
          .eq("user_id", user.id)
          .in("message_id", recentIds);
        readSet = new Set((receipts ?? []).map((r) => r.message_id));
      }
      const unreadByGroup = new Map<string, number>();
      for (const r of recent ?? []) {
        if (!readSet.has(r.id)) {
          unreadByGroup.set(r.group_id, (unreadByGroup.get(r.group_id) ?? 0) + 1);
        }
      }

      return (groups ?? []).map((g) => ({
        ...g,
        last_message: lastByGroup.get(g.id) ?? null,
        unread_count: unreadByGroup.get(g.id) ?? 0,
      }));
    },
  });
}

export function useDeactivateMessengerGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.rpc(
        "deactivate_messenger_group" as never,
        { p_group_id: groupId } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messenger-groups"] });
    },
  });
}