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
        {/* P6-m2: this used to end «پیوست اختیاری است», which reads as a promise of a
            file-upload control. There is none — p_attachment_ids raises 0A000 by
            contract C8, and attachments belong to a later phase. The sentence is about
            attaching a PROFORMA, so it now says so. */}
        پیش‌فاکتور بازی برای این مشتری وجود ندارد. تخصیص پیش‌فاکتور اختیاری است.
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
