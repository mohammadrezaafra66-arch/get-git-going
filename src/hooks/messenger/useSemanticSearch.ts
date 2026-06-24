import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { semanticSearchMessenger, type SemanticSearchHit } from "@/lib/messenger/embeddings.functions";

export function useSemanticSearch(groupId: string | null) {
  const fn = useServerFn(semanticSearchMessenger);
  return useMutation<
    { ok: boolean; hits: SemanticSearchHit[]; reason?: string },
    Error,
    string
  >({
    mutationFn: async (query: string) => {
      if (!groupId) return { ok: false, hits: [], reason: "no_group" };
      const res = await fn({ data: { group_id: groupId, query } });
      if (res.ok) return { ok: true, hits: res.hits };
      return { ok: false, hits: [], reason: res.reason };
    },
  });
}