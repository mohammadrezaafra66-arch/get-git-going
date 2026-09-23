/**
 * Block «محصولات درخواستی» — product search + qty/note table for deal forms.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import {
  STOCK_STATUS_LABELS,
  STOCK_STATUS_VARIANTS,
} from "@/lib/products/constants";
import {
  searchDealProducts,
  type DealProductSearchHit,
} from "@/lib/sales-desk";

export type RequestedProductLine = {
  key: string;
  productId: string;
  name: string;
  sku: string | null;
  stockStatus: DealProductSearchHit["stock_status"];
  quantity: number;
  note: string;
};

type Props = {
  lines: RequestedProductLine[];
  onChange: (lines: RequestedProductLine[]) => void;
  disabled?: boolean;
};

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return `rpl-${Date.now()}-${keySeq}`;
}

export function RequestedProductsBlock({ lines, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 350);
  const term = debounced.trim();

  const searchQ = useQuery({
    queryKey: ["sales-desk", "deal-product-search", term],
    enabled: !disabled && term.length >= 1,
    queryFn: () => searchDealProducts(term, 20),
    staleTime: 30_000,
  });

  const addProduct = (p: DealProductSearchHit) => {
    if (lines.some((l) => l.productId === p.id)) {
      setQuery("");
      return;
    }
    onChange([
      ...lines,
      {
        key: nextKey(),
        productId: p.id,
        name: p.name,
        sku: p.sku,
        stockStatus: p.stock_status,
        quantity: 1,
        note: "",
      },
    ]);
    setQuery("");
  };

  const updateLine = (key: string, patch: Partial<RequestedProductLine>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    onChange(lines.filter((l) => l.key !== key));
  };

  return (
    <div className="space-y-2" dir="rtl">
      <Label>محصولات درخواستی</Label>

      <div className="relative">
        <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجوی کد، نام یا برند…"
          className="pr-9"
          disabled={disabled}
        />
      </div>

      {searchQ.isFetching ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> در حال جستجو…
        </p>
      ) : null}

      {(searchQ.data ?? []).length > 0 && query.trim() ? (
        <ul className="max-h-40 overflow-auto rounded-md border border-border">
          {(searchQ.data ?? []).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-muted/50"
                onClick={() => addProduct(p)}
                disabled={disabled}
              >
                <span>
                  {p.name}
                  {p.sku ? (
                    <span className="mr-2 font-mono text-xs text-muted-foreground" dir="ltr">
                      {p.sku}
                    </span>
                  ) : null}
                </span>
                <Badge variant={STOCK_STATUS_VARIANTS[p.stock_status]} className="text-[10px]">
                  {STOCK_STATUS_LABELS[p.stock_status]}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : term.length >= 1 && !searchQ.isFetching ? (
        <p className="text-xs text-muted-foreground">نتیجه‌ای یافت نشد.</p>
      ) : null}

      {lines.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="p-2 text-right font-medium">محصول</th>
                <th className="p-2 text-right font-medium w-20">تعداد</th>
                <th className="p-2 text-right font-medium">یادداشت</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b last:border-0">
                  <td className="p-2">
                    <div className="font-medium">{l.name}</div>
                    <div className="flex flex-wrap items-center gap-1">
                      {l.sku ? (
                        <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">
                          {l.sku}
                        </span>
                      ) : null}
                      {l.stockStatus === "unavailable" ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {STOCK_STATUS_LABELS.unavailable}
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={l.quantity}
                      onChange={(e) =>
                        updateLine(l.key, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="h-8 w-16"
                      disabled={disabled}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={l.note}
                      onChange={(e) => updateLine(l.key, { note: e.target.value })}
                      className="h-8"
                      disabled={disabled}
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => removeLine(l.key)}
                      disabled={disabled}
                      aria-label="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          // Focus search by clearing and prompting via placeholder — user types next.
          setQuery("");
          document
            .querySelector<HTMLInputElement>('input[placeholder="جستجوی کد، نام یا برند…"]')
            ?.focus();
        }}
      >
        <Plus className="ml-1 h-3.5 w-3.5" />
        + افزودن محصول
      </Button>
    </div>
  );
}
