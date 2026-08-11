import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ProfileFieldDefinition, WEEK_DAYS } from "@/lib/profile-fields/types";

export type DynamicValues = Record<string, unknown>;

interface Props {
  fields: ProfileFieldDefinition[];
  values: DynamicValues;
  onChange: (name: string, value: unknown) => void;
  errors?: Record<string, string>;
  /** When true, only fields with show_on_register=true are rendered. */
  registerMode?: boolean;
  disabled?: boolean;
}

export function DynamicProfileFields({
  fields,
  values,
  onChange,
  errors,
  registerMode,
  disabled,
}: Props) {
  const visible = useMemo(
    () =>
      fields
        .filter((f) => f.is_active && (!registerMode || f.show_on_register))
        .sort((a, b) => a.sort_order - b.sort_order),
    [fields, registerMode],
  );

  if (visible.length === 0) return null;

  return (
    <div className="space-y-4">
      {visible.map((f) => {
        const v = values[f.name];
        const err = errors?.[f.name];
        return (
          <div key={f.id} className="space-y-2">
            <Label>
              {f.label}
              {f.is_required && <span className="text-destructive"> *</span>}
            </Label>
            <FieldInput
              field={f}
              value={v}
              onChange={(nv) => onChange(f.name, nv)}
              disabled={disabled}
            />
            {f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>}
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ProfileFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  switch (field.field_type) {
    case "text":
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          dir="ltr"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          disabled={disabled}
        />
      );
    case "textarea":
      return (
        <Textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          disabled={disabled}
        />
      );
    case "date":
      return (
        <PersianDatePicker
          value={(value as string) || null}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case "time":
      return (
        <Input
          type="time"
          dir="ltr"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        />
      );
    case "select":
      return (
        <Select value={(value as string) ?? ""} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب کنید..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-3">
          {field.options.map((o) => {
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) => {
                    const next = v ? [...arr, o.value] : arr.filter((x) => x !== o.value);
                    onChange(next);
                  }}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      );
    }
    case "days": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2 rounded-md border p-3">
          {WEEK_DAYS.map((d) => {
            const checked = arr.includes(d.value);
            return (
              <label key={d.value} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) => {
                    const next = v ? [...arr, d.value] : arr.filter((x) => x !== d.value);
                    onChange(next);
                  }}
                />
                <span>{d.label}</span>
              </label>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}
