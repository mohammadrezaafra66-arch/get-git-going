import { useQuery } from "@tanstack/react-query";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWarehouses } from "@/lib/warehouses/queries";

const DEFAULT_SENTINEL = "__default__";

/**
 * ۱۷۸/۱۷۹ — انتخاب انبار در فرم خرید و پیش‌فاکتور.
 *
 * وقتی هیچ انباری تعریف نشده باشد، کامپوننت هیچ چیزی رندر نمی‌کند: مدل
 * چندانباره هنوز راه‌اندازی نشده و تریگرهای DB هم no-op می‌کنند، پس نمایش یک
 * فیلد خالی فقط کاربر را گیج می‌کرد.
 */
export function WarehouseSelect({
  value,
  onChange,
  label = "انبار",
  hint,
  disabled,
  triggerTestId,
  className,
  hideLabel = false,
  placeholder,
}: {
  value: string | null;
  onChange: (warehouseId: string | null) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  triggerTestId?: string;
  /** D8-8: compact rendering inside a line-items table cell. */
  className?: string;
  hideLabel?: boolean;
  /** Wording for the "no explicit warehouse" option. Line-level selectors say
   *  «انبار سند» because for a LINE the fallback is the document, not the
   *  system default. */
  placeholder?: string;
}) {
  const whQ = useQuery({
    queryKey: ["warehouse-options"],
    queryFn: () => fetchWarehouses(false),
    staleTime: 60_000,
  });

  const warehouses = whQ.data ?? [];
  if (whQ.isLoading || warehouses.length === 0) return null;

  const defaultName = warehouses.find((w) => w.is_default)?.name;

  return (
    <div className={hideLabel ? className : "space-y-1"}>
      {!hideLabel && <Label>{label}</Label>}
      <Select
        value={value ?? DEFAULT_SENTINEL}
        onValueChange={(v) => onChange(v === DEFAULT_SENTINEL ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger data-testid={triggerTestId} className={hideLabel ? undefined : className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_SENTINEL}>
            {placeholder ?? (defaultName ? `انبار پیش‌فرض (${defaultName})` : "انبار پیش‌فرض")}
          </SelectItem>
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
