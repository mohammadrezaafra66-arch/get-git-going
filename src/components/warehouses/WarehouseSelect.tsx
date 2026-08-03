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
}: {
  value: string | null;
  onChange: (warehouseId: string | null) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  triggerTestId?: string;
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
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select
        value={value ?? DEFAULT_SENTINEL}
        onValueChange={(v) => onChange(v === DEFAULT_SENTINEL ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger data-testid={triggerTestId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_SENTINEL}>
            {defaultName ? `انبار پیش‌فرض (${defaultName})` : "انبار پیش‌فرض"}
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
