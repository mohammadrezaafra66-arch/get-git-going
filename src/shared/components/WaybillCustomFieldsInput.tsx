import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CustomFieldDef = {
  id: string;
  field_key: string;
  field_label: string;
  field_type: "text" | "number" | "date" | "select";
  field_options: { value: string; label?: string }[] | string[] | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

export type CustomData = Record<string, string | number | null>;

function normalizeOptions(
  opts: CustomFieldDef["field_options"],
): { value: string; label: string }[] {
  if (!opts) return [];
  if (Array.isArray(opts)) {
    return opts.map((o) => {
      if (typeof o === "string") return { value: o, label: o };
      return { value: String(o.value), label: String(o.label ?? o.value) };
    });
  }
  return [];
}

export function validateCustomData(
  fields: CustomFieldDef[],
  data: CustomData,
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of fields) {
    if (!f.is_active) continue;
    const v = data[f.field_key];
    const empty = v === undefined || v === null || v === "";
    if (f.is_required && empty) {
      errs[f.field_key] = "این فیلد الزامی است";
      continue;
    }
    if (!empty && f.field_type === "number" && Number.isNaN(Number(v))) {
      errs[f.field_key] = "عدد نامعتبر";
    }
  }
  return errs;
}

export function WaybillCustomFieldsInput({
  fields,
  value,
  onChange,
  errors,
}: {
  fields: CustomFieldDef[];
  value: CustomData;
  onChange: (next: CustomData) => void;
  errors?: Record<string, string>;
}) {
  const active = fields.filter((f) => f.is_active).sort((a, b) => a.sort_order - b.sort_order);
  if (active.length === 0) return null;

  const set = (key: string, v: string) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3" dir="rtl">
      <div className="text-sm font-semibold">اطلاعات تکمیلی</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {active.map((f) => {
          const v = value[f.field_key] ?? "";
          const err = errors?.[f.field_key];
          return (
            <div key={f.id} className="space-y-1">
              <Label>
                {f.field_label}
                {f.is_required ? <span className="text-destructive"> *</span> : null}
              </Label>
              {f.field_type === "select" ? (
                <Select value={String(v)} onValueChange={(val) => set(f.field_key, val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {normalizeOptions(f.field_options).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.field_type === "date" ? (
                <PersianDatePicker
                  value={v ? String(v) : null}
                  onChange={(val) => set(f.field_key, val ?? "")}
                />
              ) : f.field_type === "number" ? (
                <Input
                  type="number"
                  inputMode="decimal"
                  value={String(v)}
                  onChange={(e) => set(f.field_key, e.target.value)}
                />
              ) : (
                <Input
                  value={String(v)}
                  maxLength={500}
                  onChange={(e) => set(f.field_key, e.target.value)}
                />
              )}
              {err ? <p className="text-xs text-destructive">{err}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
