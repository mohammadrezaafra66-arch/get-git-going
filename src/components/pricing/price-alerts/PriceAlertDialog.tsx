import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { fetchSalePriceTypes, searchProducts } from "@/lib/pricing/queries";
import { toast } from "sonner";
import {
  createAlertRule, updateAlertRule,
  type CreateAlertInput, type PriceAlertOperator, type PriceAlertRule,
  OPERATOR_LABELS, OPERATOR_HINTS, isPriceOp, isPercentOp, isUsdOp,
} from "@/lib/pricing/price-alerts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill?: {
    productId?: string;
    productName?: string;
    salePriceTypeId?: string | null;
  } | null;
  editing?: PriceAlertRule | null;
}

export function PriceAlertDialog({ open, onOpenChange, prefill, editing }: Props) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string>("");
  const [productLabel, setProductLabel] = useState<string>("");
  const [productSearch, setProductSearch] = useState<string>("");
  const dProductSearch = useDebounce(productSearch, 300);
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("__any");
  const [operator, setOperator] = useState<PriceAlertOperator>("below_price");
  const [targetValue, setTargetValue] = useState<string>("");
  const [isRepeatable, setIsRepeatable] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // reset when opening
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProductId(editing.product_id);
      setProductLabel(editing.product?.name ?? "");
      setSalePriceTypeId(editing.sale_price_type_id ?? "__any");
      setOperator(editing.operator);
      setTargetValue(editing.target_value !== null ? String(editing.target_value) : "");
      setIsRepeatable(editing.is_repeatable);
      setNote(editing.note ?? "");
    } else {
      setProductId(prefill?.productId ?? "");
      setProductLabel(prefill?.productName ?? "");
      setSalePriceTypeId(prefill?.salePriceTypeId ?? "__any");
      setOperator("below_price");
      setTargetValue("");
      setIsRepeatable(false);
      setNote("");
    }
    setProductSearch("");
  }, [open, editing, prefill]);

  const { data: salePriceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 60_000,
  });

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["pa-product-search", dProductSearch],
    queryFn: () => searchProducts(dProductSearch, 12),
    enabled: open && dProductSearch.trim().length >= 2 && !editing,
    staleTime: 30_000,
  });

  const isPrice = isPriceOp(operator);
  const isPercent = isPercentOp(operator);
  const isUsd = isUsdOp(operator);
  const valueLabel = isUsd ? "مقدار (دلار)" : isPercent ? "درصد" : isPrice ? "مقدار (تومان)" : "مقدار";
  const valueDisabled = operator === "stock_status_changed";

  const placeholderHint = useMemo(() => OPERATOR_HINTS[operator], [operator]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const input: CreateAlertInput = {
        product_id: productId,
        sale_price_type_id: salePriceTypeId === "__any" ? null : salePriceTypeId,
        operator,
        target_value: valueDisabled ? null : Number(targetValue.replace(/[٬,]/g, "")),
        is_repeatable: isRepeatable,
        note: note.trim() || null,
      };
      if (editing) {
        await updateAlertRule(editing.id, input);
        toast.success("هشدار با موفقیت بروزرسانی شد.");
      } else {
        await createAlertRule(input);
        toast.success("هشدار با موفقیت ساخته شد.");
      }
      await qc.invalidateQueries({ queryKey: ["my-price-alerts"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "خطای نامشخص");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش هشدار قیمت" : "ایجاد هشدار قیمت"}</DialogTitle>
          <DialogDescription>
            شرط دلخواه خود را تعریف کنید تا هنگام تغییر مهم قیمت مطلع شوید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product */}
          <div className="space-y-1">
            <Label>محصول</Label>
            {productId ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="truncate">{productLabel || "(انتخاب شده)"}</span>
                {!editing && (
                  <Button variant="ghost" size="sm" onClick={() => { setProductId(""); setProductLabel(""); }}>
                    تغییر
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Input
                  placeholder="جستجوی نام یا SKU محصول…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                {dProductSearch.trim().length >= 2 && (
                  <div className="max-h-44 overflow-auto rounded-md border bg-popover">
                    {searching ? (
                      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                        <Loader2 className="ml-1 h-3 w-3 animate-spin" /> در حال جستجو…
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">نتیجه‌ای یافت نشد.</div>
                    ) : (
                      searchResults.map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-3 py-2 text-right text-sm hover:bg-accent"
                          onClick={() => {
                            setProductId(p.id);
                            setProductLabel(p.name);
                            setProductSearch("");
                          }}
                        >
                          {p.name}
                          {p.sku ? <span className="mr-2 text-xs text-muted-foreground">({p.sku})</span> : null}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sale price type */}
          <div className="space-y-1">
            <Label>نوع قیمت فروش</Label>
            <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any">همه انواع قیمت</SelectItem>
                {salePriceTypes.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operator */}
          <div className="space-y-1">
            <Label>نوع شرط</Label>
            <Select value={operator} onValueChange={(v) => setOperator(v as PriceAlertOperator)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(OPERATOR_LABELS) as PriceAlertOperator[])
                  .filter((op) => op !== "stock_status_changed")
                  .map((op) => (
                    <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{placeholderHint}</p>
          </div>

          {/* Value */}
          {!valueDisabled && (
            <div className="space-y-1">
              <Label>{valueLabel}</Label>
              <Input
                inputMode="decimal"
                placeholder={isPercent ? "مثلاً 10" : isUsd ? "مثلاً 500" : "مثلاً 30000000"}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
          )}

          {/* Repeatable */}
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">تکرار هشدار</div>
              <div className="text-xs text-muted-foreground">در صورت روشن بودن، با cooldown ۶ ساعت دوباره فعال می‌شود.</div>
            </div>
            <Switch checked={isRepeatable} onCheckedChange={setIsRepeatable} />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea
              maxLength={500}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="هر توضیحی برای خودتان…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>انصراف</Button>
          <Button onClick={handleSubmit} disabled={submitting || !productId}>
            {submitting && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
            {editing ? "ذخیره تغییرات" : "ایجاد هشدار"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}