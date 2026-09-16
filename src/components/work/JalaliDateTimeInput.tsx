/**
 * تاریخ+ساعت شمسی برای دستیار کار.
 * مقدار داخلی: datetime-local سازگار (YYYY-MM-DDTHH:mm) تا با fromDatetimeLocalValue یکی بماند.
 */
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  value: string; // YYYY-MM-DDTHH:mm or ""
  onChange: (local: string) => void;
  disabled?: boolean;
  className?: string;
  datePlaceholder?: string;
}

function splitLocal(value: string): { date: string; time: string } {
  const v = (value ?? "").trim();
  if (!v) return { date: "", time: "12:00" };
  const [datePart, timePart] = v.split("T");
  const date = /^(\d{4})-(\d{2})-(\d{2})/.test(datePart ?? "") ? (datePart as string) : "";
  const time =
    timePart && /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : "12:00";
  return { date, time };
}

export function JalaliDateTimeInput({
  id,
  value,
  onChange,
  disabled,
  className,
  datePlaceholder = "انتخاب تاریخ شمسی",
}: Props) {
  const { date, time } = splitLocal(value);

  function emit(nextDate: string, nextTime: string) {
    if (!nextDate) {
      onChange("");
      return;
    }
    const t = nextTime && /^\d{2}:\d{2}/.test(nextTime) ? nextTime.slice(0, 5) : "12:00";
    onChange(`${nextDate}T${t}`);
  }

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <div className="min-w-0 flex-1">
        <JalaliDateInput
          value={date || null}
          onChange={(iso) => emit(iso, time)}
          disabled={disabled}
          placeholder={datePlaceholder}
        />
      </div>
      <Input
        id={id}
        type="time"
        dir="ltr"
        className="w-full text-start sm:w-[8.5rem]"
        value={date ? time : ""}
        onChange={(e) => emit(date, e.target.value || "12:00")}
        disabled={disabled || !date}
        aria-label="ساعت"
      />
    </div>
  );
}
