import { Label } from "@/components/ui/label";

import type { OpenProforma, ProformaAllocation } from "./types";

interface ProformaListProps {
  items: OpenProforma[];
  allocations: ProformaAllocation[];
  onChange: (next: ProformaAllocation[]) => void;
}

/**
 * Optional attachment of open proformas. Selecting one does not change the
 * receipt's accounting (T5) — it only records a link.
 */
export function ProformaList({ items, allocations, onChange }: ProformaListProps) {
  const selected = new Set(allocations.map((a) => a.quote_id));

  const toggle = (item: OpenProforma) => {
    if (selected.has(item.id)) {
      onChange(allocations.filter((a) => a.quote_id !== item.id));
      return;
    }
    onChange([...allocations, { quote_id: item.id, amount: Math.trunc(item.remaining) }]);
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="wizard-proforma-empty">
        پیش‌فاکتور بازی برای این مشتری وجود ندارد. پیوست اختیاری است.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="wizard-proforma-list">
      <Label>پیش‌فاکتورهای باز (اختیاری — روی حسابداری سند اثر ندارد)</Label>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => toggle(item)}
              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm ${
                selected.has(item.id) ? "border-primary bg-primary/5" : "border-input"
              }`}
            >
              <span>{item.number ?? item.id.slice(0, 8)}</span>
              <span className="text-muted-foreground">
                مانده {item.remaining.toLocaleString("fa-IR")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
