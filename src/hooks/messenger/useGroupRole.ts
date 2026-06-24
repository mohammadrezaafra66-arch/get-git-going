import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GroupRole = "admin" | "member" | "viewer" | "purchaser" | null;

export function useGroupRole(groupId: string | null, userId: string | null | undefined) {
  return useQuery({
    queryKey: ["messenger-group-role", groupId, userId],
    enabled: !!groupId && !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<GroupRole> => {
      if (!groupId || !userId) return null;
      const { data, error } = await supabase
        .from("messenger_group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return null;
      return (data?.role as GroupRole) ?? null;
    },
  });
}

export function useGroupPurchasers(groupId: string | null) {
  return useQuery({
    queryKey: ["messenger-group-purchasers", groupId],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!groupId) return [] as Array<{ user_id: string; full_name: string | null }>;
      const { data, error } = await supabase
        .from("messenger_group_members")
        .select("user_id, profile:profiles(full_name)")
        .eq("group_id", groupId)
        .eq("role", "purchaser");
      if (error) return [];
      type Row = { user_id: string; profile: { full_name: string | null } | null };
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        user_id: r.user_id,
        full_name: r.profile?.full_name ?? null,
      }));
    },
  });
}