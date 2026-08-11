import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import type { RealtimeCreditResult } from "@/hooks/credit/useDynamicScoring";

/**
 * مورد ۱۳۳ — «چرا سقف اعتبار صفر شده است؟»
 *
 * فقط وقتی رندر می‌شود که سقف اعتبار صفر باشد یا محاسبه با سرمایهٔ قدیمی انجام
 * شده باشد. همهٔ علت‌های صادق را با هم نشان می‌دهد (نه فقط اولی) تا ادمین بداند
 * دقیقاً چند چیز باید اصلاح شود.
 */

// ترجمهٔ فارسی binding_constraint. دو مقدار `credit_limit` و `formula` حالت
// عادی محاسبه‌اند و به‌عنوان خطا نمایش داده نمی‌شوند.
const BINDING_LABELS: Record<string, string> = {
  overdue: "بدهی معوق",
  no_salesperson: "بدون کارشناس مسئول",
  no_capital: "بدون سرمایهٔ تخصیص‌یافته",
  credit_limit: "محدود به سقف اعتبار (عادی)",
  formula: "محاسبه بر اساس فرمول (عادی)",
};

const bindingLabelFa = (c: string): string => BINDING_LABELS[c] ?? c;

export function CreditZeroReasonPanel({ data }: { data: RealtimeCreditResult }) {
  const weightedScore = Number(data.weighted_score ?? 0);
  const paramsActive = Number(data.params_active ?? 0);
  const paramsEvaluated = Number(data.params_evaluated ?? 0);
  const rawAllocation = Number(data.raw_allocation ?? 0);
  const allocatedCapital = Number(data.salesperson_allocated_capital ?? 0);
  const shareRatio = Number(data.share_ratio ?? 0);
  const finalLimit = Number(data.final_limit ?? 0);
  const isCapitalStale = data.is_capital_stale === true;

  // شرط نمایش — در حالت عادی اصلاً رندر نشود.
  if (finalLimit !== 0 && !isCapitalStale) return null;

  const reasons: string[] = [];

  if (data.binding_constraint === "overdue") {
    reasons.push("مشتری دارای بدهی معوق است؛ تا زمان رفع معوقه سقف اعتبار صفر می‌شود.");
  }
  if (data.binding_constraint === "no_salesperson") {
    reasons.push(
      "این مشتری به هیچ کارشناس فروشی متصل نیست؛ ابتدا کارشناس مسئول مشتری را مشخص کنید.",
    );
  }
  if (data.binding_constraint === "no_capital") {
    reasons.push(
      "برای کارشناس مسئول این مشتری سرمایه تخصیص داده نشده است؛ باید تخصیص سرمایه روزانه اجرا شود.",
    );
  }
  if (weightedScore <= 0) {
    reasons.push(
      "امتیاز وزنی مشتری صفر است؛ ممکن است مقادیر امتیازدهی ذخیره نشده باشند یا وزن‌های پارامترها برای این دوره معتبر نباشند.",
    );
  }
  if (paramsActive > 0 && paramsEvaluated > 0 && weightedScore === 0) {
    reasons.push(
      "پارامترها پر شده‌اند، اما وزن مؤثر آن‌ها صفر است؛ تاریخ اعتبار وزن‌ها یا تنظیمات وزن‌دهی را بررسی کنید.",
    );
  }
  if (allocatedCapital <= 0) {
    reasons.push(
      "سرمایه تخصیص‌یافته به کارشناس مسئول صفر است؛ حتی با امتیاز مشتری، سقف اعتبار قابل محاسبه نیست.",
    );
  }
  if (rawAllocation <= 0) {
    reasons.push(
      "سهم خام مشتری از سرمایه صفر شده است؛ امتیاز مشتری یا مجموع امتیازهای مشتریان همان کارشناس را بررسی کنید.",
    );
  }
  if (isCapitalStale) {
    reasons.push(
      "محاسبه با سرمایه قدیمی انجام شده است؛ تخصیص سرمایه روز جاری را دوباره اجرا کنید.",
    );
  }

  const facts: Array<{ label: string; value: string }> = [
    { label: "امتیاز وزنی", value: toFaDigits(weightedScore.toFixed(3)) },
    {
      label: "پارامترهای ارزیابی‌شده",
      value: `${toFaDigits(paramsEvaluated)} از ${toFaDigits(paramsActive)}`,
    },
    { label: "سهم خام از سرمایه", value: formatNumber(rawAllocation) },
    { label: "سرمایهٔ کارشناس", value: formatNumber(allocatedCapital) },
    { label: "نسبت سهم", value: toFaDigits(shareRatio.toFixed(4)) },
    {
      label: "تاریخ سرمایهٔ استفاده‌شده",
      value: data.capital_date_used ? formatDateTimeFa(data.capital_date_used) : "—",
    },
    { label: "عامل تعیین‌کننده", value: bindingLabelFa(data.binding_constraint) },
  ];

  return (
    <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-300">
        {finalLimit === 0 ? "چرا سقف اعتبار صفر شده است؟" : "هشدار در محاسبهٔ سقف اعتبار"}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        {reasons.length > 0 ? (
          <ul className="list-disc space-y-1 pe-4 text-xs leading-6">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            علت مشخصی از داده‌های محاسبه قابل تشخیص نبود؛ مقادیر زیر را بررسی کنید.
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-amber-500/20 pt-2 text-xs sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-medium tabular-nums">{f.value}</span>
            </div>
          ))}
        </div>

        <div>
          <Badge variant="outline" className="text-[10px]">
            کد فنی: {data.binding_constraint}
          </Badge>
        </div>
      </AlertDescription>
    </Alert>
  );
}
