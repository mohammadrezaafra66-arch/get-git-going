import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

interface AdvancePaymentSectionProps {
  totalAmount: number;
  depositAmount: number | null;
  onDepositChange: (v: number | null) => void;
  commitmentConfirmed: boolean;
  onCommitmentChange: (v: boolean) => void;
  /** When true, checkbox cannot be toggled (already confirmed previously). */
  commitmentLocked?: boolean;
  /** Show validation errors after submit attempt. */
  showErrors?: boolean;
}

const MIN_RATIO = 0.3;

export function AdvancePaymentSection({
  totalAmount,
  depositAmount,
  onDepositChange,
  commitmentConfirmed,
  onCommitmentChange,
  commitmentLocked = false,
  showErrors = false,
}: AdvancePaymentSectionProps) {
  const minRequired = Math.ceil(totalAmount * MIN_RATIO);
  const dep = Number(depositAmount ?? 0);
  const hasDeposit = dep > 0;
  const meetsMin = totalAmount > 0 && dep >= minRequired;
  const ratio = totalAmount > 0 ? Math.round((dep / totalAmount) * 100) : 0;

  const depositError =
    showErrors &&
    (!hasDeposit
      ? "مبلغ بیعانه الزامی است"
      : !meetsMin
        ? `مبلغ بیعانه باید حداقل ۳۰٪ مبلغ کل (${formatNumber(minRequired)} تومان) باشد`
        : null);
  const commitmentError =
    showErrors && !commitmentConfirmed ? "تأیید تعهد فروشنده الزامی است" : null;

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4" />
        تعهد فروشنده (پیش‌واریزی)
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="deposit_amount" className="text-xs">
            مبلغ بیعانه (تومان) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="deposit_amount"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder={
              totalAmount > 0
                ? `حداقل ${formatNumber(minRequired)} (۳۰٪ مبلغ کل)`
                : "حداقل ۳۰٪ مبلغ کل"
            }
            value={depositAmount ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onDepositChange(v === "" ? null : Number(v));
            }}
            aria-invalid={!!depositError}
          />
          {totalAmount > 0 && hasDeposit && (
            <p className="text-xs text-muted-foreground">نسبت بیعانه: {toFaDigits(ratio)}٪</p>
          )}
          {depositError && <p className="text-xs text-destructive">{depositError}</p>}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">جمع کل پیش‌فاکتور</Label>
          <div className="h-9 flex items-center px-3 rounded-md border bg-background text-sm">
            {formatNumber(totalAmount)} تومان
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="commitment_confirmed"
          checked={commitmentConfirmed}
          disabled={commitmentLocked}
          onCheckedChange={(v) => onCommitmentChange(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="commitment_confirmed" className="text-xs leading-relaxed cursor-pointer">
          تأیید می‌کنم که حداقل ۳۰٪ مبلغ کل پیش‌فاکتور به عنوان بیعانه از مشتری دریافت شده است و
          مسئولیت آن را تا زمان ثبت فیش توسط حسابدار می‌پذیرم.
        </Label>
      </div>
      {commitmentError && <p className="text-xs text-destructive">{commitmentError}</p>}
      {commitmentLocked && (
        <p className="text-xs text-muted-foreground">این تعهد قبلاً تأیید شده و قابل تغییر نیست.</p>
      )}

      {totalAmount > 0 && hasDeposit && !meetsMin && !showErrors && (
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 dark:text-amber-200 text-xs">
            مبلغ بیعانه کمتر از حداقل ۳۰٪ ({formatNumber(minRequired)} تومان) است.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
