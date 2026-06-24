import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export type AiTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export function useAiConversation(groupId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ai-conversation", user?.id, groupId],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<AiTurn[]> => {
      let q = supabase
        .from("ai_conversations")
        .select("id, role, content, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(100);
      q = groupId ? q.eq("group_id", groupId) : q.is("group_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        role: r.role as AiTurn["role"],
        content: r.content,
        created_at: r.created_at,
      }));
    },
  });
}

export async function clearAiConversation(userId: string, groupId: string | null) {
  let q = supabase.from("ai_conversations").delete().eq("user_id", userId);
  q = groupId ? q.eq("group_id", groupId) : q.is("group_id", null);
  const { error } = await q;
  if (error) throw error;
}