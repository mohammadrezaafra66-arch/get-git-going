import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OTHER = "__other__";
const EMPTY = "__empty__";

/**
 * Select from taxonomy names with free-text fallback via «سایر».
 * Value is always the resolved free-text string (empty allowed).
 */
export function TaxonomySelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "انتخاب…",
  allowEmpty = true,
  emptyLabel = "—",
  otherLabel = "سایر…",
  otherPlaceholder = "مقدار دلخواه",
  disabled,
  "data-testid": testId,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  otherLabel?: string;
  otherPlaceholder?: string;
  disabled?: boolean;
  "data-testid"?: string;
}) {
  const inList = useMemo(
    () => Boolean(value) && options.includes(value),
    [options, value],
  );
  const [forceOther, setForceOther] = useState(false);
  const showOther =
    forceOther || (Boolean(value) && !inList && value.length > 0);

  const selectValue = showOther
    ? OTHER
    : value
      ? value
      : allowEmpty
        ? EMPTY
        : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={selectValue}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === OTHER) {
            setForceOther(true);
            if (inList || !value) onChange("");
            return;
          }
          setForceOther(false);
          if (v === EMPTY) {
            onChange("");
            return;
          }
          onChange(v);
        }}
      >
        <SelectTrigger id={id} data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? (
            <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>
          ) : null}
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>{otherLabel}</SelectItem>
        </SelectContent>
      </Select>
      {showOther ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={otherPlaceholder}
          disabled={disabled}
          aria-label={`${label} (سایر)`}
        />
      ) : null}
    </div>
  );
}
