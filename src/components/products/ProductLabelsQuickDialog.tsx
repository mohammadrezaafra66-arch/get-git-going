import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";

interface LabelRow {
  id: string;
  title: string;
  color: string;
  description: string | null;
}

interface Props {
  productId: string | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductLabelsQuickDialog({ productId, productName, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const { data: allLabels, isLoading: loadingAll } = useQuery({
    queryKey: ["product-labels-all"],
    queryFn: async (): Promise<LabelRow[]> => {
      const { data, error } = await supabase
        .from("product_labels")
        .select("id, title, color, description")
        .order("title", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LabelRow[];
    },
    enabled: open,
  });

  const { data: currentIds, isLoading: loadingCurrent } = useQuery({
    queryKey: ["product-label-links", productId],
    queryFn: async (): Promise<string[]> => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("product_label_links")
        .select("label_id")
        .eq("product_id", productId);
      if (error) throw error;
      return (data ?? []).map((r) => r.label_id);
    },
    enabled: open && !!productId,
  });

  useEffect(() => {
    if (open && currentIds) {
      setSelected(new Set(currentIds));
    }
    if (!open) {
      setSelected(new Set());
      setQuery("");
    }
  }, [open, currentIds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!productId) return;
    setSaving(true);
    try {
      const existingIds = new Set(currentIds ?? []);
      const nextIds = selected;
      const toAdd = [...nextIds].filter((x) => !existingIds.has(x));
      const toRemove = [...existingIds].filter((x) => !nextIds.has(x));

      if (toAdd.length > 0) {
        const rows = toAdd.map((label_id) => ({ product_id: productId, label_id }));
        const { error } = await supabase.from("product_label_links").insert(rows);
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("product_label_links")
          .delete()
          .eq("product_id", productId)
          .in("label_id", toRemove);
        if (error) throw error;
      }

      toast.success("برچسب‌ها به‌روزرسانی شد");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["product-label-links", productId] }),
        queryClient.invalidateQueries({ queryKey: ["product-edit", productId] }),
        queryClient.invalidateQueries({ queryKey: ["product", productId] }),
      ]);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ذخیره برچسب‌ها");
    } finally {
      setSaving(false);
    }
  };

  const loading = loadingAll || loadingCurrent;
  const normalizedQuery = normalizeSearchText(query).toLowerCase();
  const filteredLabels = useMemo(() => {
    if (!normalizedQuery) return allLabels ?? [];
    return (allLabels ?? []).filter((label) =>
      normalizeSearchText(`${label.title} ${label.description ?? ""}`)
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [allLabels, normalizedQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>مدیریت برچسب‌های محصول</DialogTitle>
          <DialogDescription className="truncate">{productName}</DialogDescription>
        </DialogHeader>

        <div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در برچسب‌ها..."
            className="mb-2"
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-border p-2">
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : (allLabels ?? []).length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              هنوز برچسبی تعریف نشده است.
            </div>
          ) : filteredLabels.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              برچسبی با این جست‌وجو پیدا نشد.
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredLabels.map((l) => {
                const checked = selected.has(l.id);
                return (
                  <li key={l.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                      <Checkbox checked={checked} onCheckedChange={() => toggle(l.id)} />
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ backgroundColor: `${l.color}22`, color: l.color }}
                      >
                        {l.title}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "در حال ذخیره..." : "ذخیره"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
