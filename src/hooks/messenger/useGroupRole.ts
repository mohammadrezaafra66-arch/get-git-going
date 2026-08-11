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
        .select("user_id")
        .eq("group_id", groupId)
        .eq("role", "purchaser");
      if (error) return [];
      const rows = (data ?? []) as Array<{ user_id: string }>;
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? null]));

      return rows.map((r) => ({
        user_id: r.user_id,
        full_name: names.get(r.user_id) ?? null,
      }));
    },
  });
}