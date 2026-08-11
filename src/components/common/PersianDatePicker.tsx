/**
 * PersianDatePicker — wrapper نازک روی JalaliDateInput.
 * فقط برای اینکه در سراسر پروژه یک نام واحد و قابل جستجو داشته باشیم.
 * منطق واقعی تقویم شمسی در JalaliDateInput است؛ اینجا duplicate نمی‌کنیم.
 *
 * value/onChange به‌صورت `YYYY-MM-DD` میلادی یا null کار می‌کنند تا سازگاری
 * با دیتابیس و API حفظ شود.
 */
import { X } from "lucide-react";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PersianDatePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  min?: string;
  max?: string;
  invalid?: boolean;
}

export function PersianDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  disabled,
  className,
  clearable = true,
  min,
  max,
  invalid,
}: PersianDatePickerProps) {
  const showClear = clearable && !disabled && !!value;
  return (
    <div className={cn("relative w-full", className)}>
      <JalaliDateInput
        value={value ?? ""}
        onChange={(iso: string) => onChange(iso ? iso : null)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        invalid={invalid}
        className={showClear ? "pl-8" : undefined}
      />
      {showClear && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          tabIndex={-1}
          aria-label="پاک کردن تاریخ"
          onClick={() => onChange(null)}
          className="absolute left-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default PersianDatePicker;