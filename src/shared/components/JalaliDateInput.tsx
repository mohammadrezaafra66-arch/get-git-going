/**
 * فیلد ورودی تاریخ شمسی با تقویم بازشو.
 * مقدار داخلی همیشه ISO Gregorian (YYYY-MM-DD) ذخیره می‌شود تا با دیتابیس سازگار بماند.
 * نمایش به کاربر شمسی با اعداد فارسی است.
 */
import DatePickerPkg from "react-multi-date-picker";
const DatePicker = (DatePickerPkg as unknown as { default?: typeof DatePickerPkg }).default ?? DatePickerPkg;
const DateObject = (DatePickerPkg as unknown as { DateObject: typeof import("react-multi-date-picker").DateObject }).DateObject
  ?? ((DatePickerPkg as unknown as { default: { DateObject: typeof import("react-multi-date-picker").DateObject } }).default?.DateObject);
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null | undefined; // ISO YYYY-MM-DD (Gregorian)
  onChange: (iso: string) => void;
  max?: string; // ISO Gregorian
  min?: string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}

function isoToDateObject(iso: string | null | undefined): DateObject | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new DateObject({
    date: new Date(+m[1], +m[2] - 1, +m[3]),
    calendar: persian,
    locale: persian_fa,
  });
}

export function JalaliDateInput({
  value,
  onChange,
  max,
  min,
  disabled,
  readOnly,
  placeholder = "انتخاب تاریخ",
  className,
  invalid,
}: Props) {
  return (
    <DatePicker
      value={isoToDateObject(value)}
      onChange={(d) => {
        if (!d) {
          onChange("");
          return;
        }
        const obj = Array.isArray(d) ? d[0] : d;
        if (!obj) {
          onChange("");
          return;
        }
        // Convert to Gregorian ISO
        const greg = obj.convert(undefined as never).toDate();
        const yyyy = greg.getFullYear().toString().padStart(4, "0");
        const mm = String(greg.getMonth() + 1).padStart(2, "0");
        const dd = String(greg.getDate()).padStart(2, "0");
        onChange(`${yyyy}-${mm}-${dd}`);
      }}
      calendar={persian}
      locale={persian_fa}
      calendarPosition="bottom-right"
      format="YYYY/MM/DD"
      maxDate={max ? (isoToDateObject(max) ?? undefined) : undefined}
      minDate={min ? (isoToDateObject(min) ?? undefined) : undefined}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      inputClass={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background placeholder:text-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-destructive ring-1 ring-destructive bg-destructive/5",
        className,
      )}
      containerClassName="w-full"
    />
  );
}
