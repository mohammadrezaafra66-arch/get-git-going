import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsOnline(userId: string | null | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["is-user-online", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_user_online", {
        _user_id: userId!,
      });
      if (error) throw error;
      return Boolean(data);
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}