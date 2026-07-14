import { useEffect, useMemo, useState } from "react";
import { Plus, X, Filter as FilterIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DynamicColumnDataType } from "@/lib/data-tables/constants";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";

export type FilterColumn = {
  id: string;
  label: string;
  data_type: DynamicColumnDataType;
};

export type FilterRule = {
  id: string; // local uuid
  column_id: string;
  op: string; // contains | equals | greater_than | less_than | true | false | empty
  value?: string;
  value2?: string; // upper bound for date/datetime
};

const OPS_BY_TYPE: Record<DynamicColumnDataType, { op: string; label: string }[]> = {
  text: [{ op: "contains", label: "شامل" }],
  phone: [{ op: "contains", label: "شامل" }],
  tag: [{ op: "contains", label: "شامل" }],
  status: [{ op: "contains", label: "شامل" }],
  number: [
    { op: "equals", label: "برابر با" },
    { op: "greater_than", label: "بزرگ‌تر از" },
    { op: "less_than", label: "کوچک‌تر از" },
  ],
  date: [{ op: "between", label: "از/تا" }],
  datetime: [{ op: "between", label: "از/تا" }],
  boolean: [
    { op: "true", label: "بله" },
    { op: "false", label: "خیر" },
    { op: "empty", label: "خالی" },
  ],
};

export function makeRule(column_id: string, data_type: DynamicColumnDataType): FilterRule {
  const id = safeRandomUUID();
  const firstOp = OPS_BY_TYPE[data_type][0]?.op ?? "contains";
  return { id, column_id, op: firstOp };
}

export function FiltersBar({
  columns,
  rules,
  onChange,
}: {
  columns: FilterColumn[];
  rules: FilterRule[];
  onChange: (rules: FilterRule[]) => void;
}) {
  const filterable = useMemo(() => columns, [columns]);
  const [open, setOpen] = useState(false);

  const addRule = (col: FilterColumn) => {
    onChange([...rules, makeRule(col.id, col.data_type)]);
    setOpen(false);
  };
  const updateRule = (id: string, patch: Partial<FilterRule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: string) => onChange(rules.filter((r) => r.id !== id));
  const clearAll = () => onChange([]);

  if (!filterable.length) {
    return <div className="text-xs text-muted-foreground">ستون فیلترپذیری تعریف نشده است.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1">
              <Plus className="h-3.5 w-3.5" />
              <FilterIcon className="h-3.5 w-3.5" />
              افزودن فیلتر
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            <div className="max-h-64 overflow-y-auto">
              {filterable.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-right px-2 py-1.5 text-sm rounded hover:bg-muted"
                  onClick={() => addRule(c)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {rules.length > 0 && (
          <>
            <Badge variant="secondary" className="h-7">
              {rules.length} فیلتر فعال
            </Badge>
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={clearAll}>
              <RotateCcw className="h-3.5 w-3.5" />
              پاک‌کردن همه
            </Button>
          </>
        )}
      </div>

      {rules.length > 0 && (
        <div className="flex flex-wrap items-stretch gap-2 rounded-md border border-border bg-muted/20 p-2">
          {rules.map((r) => {
            const col = columns.find((c) => c.id === r.column_id);
            if (!col) return null;
            const ops = OPS_BY_TYPE[col.data_type];
            return (
              <RuleChip
                key={r.id}
                rule={r}
                column={col}
                ops={ops}
                onChange={(patch) => updateRule(r.id, patch)}
                onRemove={() => removeRule(r.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function RuleChip({
  rule,
  column,
  ops,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  column: FilterColumn;
  ops: { op: string; label: string }[];
  onChange: (patch: Partial<FilterRule>) => void;
  onRemove: () => void;
}) {
  // Local debounced input mirror so server isn't called on every keystroke
  const [draft, setDraft] = useState(rule.value ?? "");
  const [draft2, setDraft2] = useState(rule.value2 ?? "");
  useEffect(() => {
    setDraft(rule.value ?? "");
  }, [rule.value]);
  useEffect(() => {
    setDraft2(rule.value2 ?? "");
  }, [rule.value2]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== (rule.value ?? "")) onChange({ value: draft });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft2 !== (rule.value2 ?? "")) onChange({ value2: draft2 });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft2]);

  const t = column.data_type;
  const showValue = !(t === "boolean");
  const showValue2 = t === "date" || t === "datetime";
  const inputType =
    t === "number"
      ? "number"
      : t === "date"
        ? "date"
        : t === "datetime"
          ? "datetime-local"
          : "text";

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
      <span className="text-xs font-medium">{column.label}</span>
      <Select value={rule.op} onValueChange={(v) => onChange({ op: v })}>
        <SelectTrigger className="h-7 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((o) => (
            <SelectItem key={o.op} value={o.op}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showValue && (
        <Input
          className="h-7 w-32 text-xs"
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          dir={t === "phone" || t === "number" ? "ltr" : undefined}
          placeholder={showValue2 ? "از" : ""}
        />
      )}
      {showValue2 && (
        <Input
          className="h-7 w-32 text-xs"
          type={inputType}
          value={draft2}
          onChange={(e) => setDraft2(e.target.value)}
          dir="ltr"
          placeholder="تا"
        />
      )}
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
