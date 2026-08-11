import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

export type PickedProduct = { id: string; name: string; sku: string | null };

export function InquiryProductPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: PickedProduct) => void;
}) {
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 300);

  const { data, isFetching } = useQuery({
    queryKey: ["inquiry-products", debounced],
    enabled: open,
    staleTime: 30_000,
    queryFn: async (): Promise<PickedProduct[]> => {
      const term = debounced.trim();
      let query = supabase
        .from("products")
        .select("id,name,sku")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(50);
      if (term.length > 0) {
        // ILIKE روی name یا sku
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PickedProduct[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>انتخاب محصول برای استعلام</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جست‌وجو بر اساس نام یا SKU…"
              className="pr-9"
              autoFocus
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {isFetching && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال جست‌وجو…
              </div>
            )}
            {!isFetching && (data?.length ?? 0) === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">محصولی یافت نشد</div>
            )}
            {!isFetching &&
              (data ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                  }}
                  className="block w-full border-b px-3 py-2 text-right text-sm last:border-b-0 hover:bg-muted"
                >
                  <div className="font-medium">{p.name}</div>
                  {p.sku && (
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      SKU: {p.sku}
                    </div>
                  )}
                </button>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}