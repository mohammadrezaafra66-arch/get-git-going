import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";

type Props = {
  dateIso: string | null;
  timeHm: string;
  onDateChange: (iso: string | null) => void;
  onTimeChange: (hm: string) => void;
  idPrefix?: string;
  label?: string;
  timeLabel?: string;
  /** When true, time input is disabled (e.g. «ساعت مشخص نیست»). */
  timeDisabled?: boolean;
};

/**
 * انتخاب پیگیری با تقویم شمسی (تاریخ) + ساعت اختیاری.
 * تاریخ به‌صورت YYYY-MM-DD میلادی نگه داشته می‌شود تا با DB سازگار بماند.
 */
export function PersianFollowUpFields({
  dateIso,
  timeHm,
  onDateChange,
  onTimeChange,
  idPrefix = "sd-fu",
  label = "پیگیری (اختیاری)",
  timeLabel = "ساعت",
  timeDisabled = false,
}: Props) {
  return (
    <div className="space-y-1.5" dir="rtl">
      <Label htmlFor={`${idPrefix}-date`}>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <PersianDatePicker
          value={dateIso}
          onChange={onDateChange}
          placeholder="تاریخ شمسی"
        />
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-time`} className="text-xs text-muted-foreground">
            {timeLabel}
          </Label>
          <Input
            id={`${idPrefix}-time`}
            type="time"
            dir="ltr"
            className="w-full text-left sm:w-[8.5rem]"
            value={timeHm}
            onChange={(e) => onTimeChange(e.target.value)}
            disabled={!dateIso || timeDisabled}
            aria-label={timeLabel}
            title={
              !dateIso
                ? "ابتدا تاریخ را انتخاب کنید"
                : timeDisabled
                  ? "ساعت مشخص نیست"
                  : undefined
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        تاریخ شمسی است؛ ساعت اختیاری است (پیش‌فرض ۰۹:۰۰ تهران).
      </p>
    </div>
  );
}

/** ترکیب تاریخ میلادی ISO + ساعت محلی تهران → ISO UTC برای ذخیره. */
export function combineTehranFollowUpIso(
  dateIso: string | null,
  timeHm: string,
): string | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const hm = /^\d{2}:\d{2}$/.test(timeHm) ? timeHm : "09:00";
  const d = new Date(`${dateIso}T${hm}:00+03:30`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
