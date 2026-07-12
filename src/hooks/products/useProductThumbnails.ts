import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches a signed-URL thumbnail (primary image, else lowest sort_order)
 * for each given product id. Reuses the exact pattern already used in
 * `/products` admin list (see _app.products.index.tsx — query key
 * "product-thumbnails") so caching is consistent across pages.
 *
 * Returns a `Map<productId, signedUrl>` and a helper `thumbnailFor(id)`.
 */
export function useProductThumbnails(productIds: string[]) {
  const ids = productIds.filter(Boolean);
  const query = useQuery({
    enabled: ids.length > 0,
    queryKey: ["product-thumbnails", ids],
    queryFn: async () => {
      const { data: imgs, error } = await supabase
        .from("product_images")
        .select("product_id, url, is_primary, sort_order")
        .in("product_id", ids)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const firstByProduct = new Map<string, string>();
      for (const r of imgs ?? []) {
        const pid = (r as { product_id: string }).product_id;
        const url = (r as { url: string }).url;
        if (!firstByProduct.has(pid)) firstByProduct.set(pid, url);
      }
      const paths = Array.from(firstByProduct.values());
      if (paths.length === 0) return new Map<string, string>();
      const { data: signed } = await supabase.storage
        .from("product-images")
        .createSignedUrls(paths, 3600);
      const signedByPath = new Map<string, string>();
      (signed ?? []).forEach((s: { path?: string | null; signedUrl?: string | null }) => {
        if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
      });
      const out = new Map<string, string>();
      firstByProduct.forEach((path, pid) => {
        const u = signedByPath.get(path);
        if (u) out.set(pid, u);
      });
      return out;
    },
    staleTime: 60_000,
  });

  return {
    ...query,
    thumbnailFor: (id: string): string | undefined => query.data?.get(id),
  };
}