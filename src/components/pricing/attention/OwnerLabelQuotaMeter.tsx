import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatNumber } from "@/lib/i18n/formatters";

export interface OwnerLabelQuotaMeterProps {
  eligibleCount: number;
  taggedCount: number;
  quotaMax: number;
  remaining: number;
  exhausted: boolean;
}

export function OwnerLabelQuotaMeter({
  eligibleCount,
  taggedCount,
  quotaMax,
  remaining,
  exhausted,
}: OwnerLabelQuotaMeterProps) {
  const pct = quotaMax > 0 ? Math.min(100, Math.round((taggedCount / quotaMax) * 100)) : 0;

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">سهمیه برچسب‌گذاری شما</CardTitle>
        {exhausted ? (
          <Badge variant="destructive">سهمیه پر شده</Badge>
        ) : (
          <Badge variant="secondary">
            {formatNumber(remaining)} جای خالی
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <span className="font-semibold">{formatNumber(taggedCount)}</span>
          {" از "}
          <span className="font-semibold">{formatNumber(quotaMax)}</span>
          {" محصول مجاز"}
        </div>
        <Progress value={pct} />
        {exhausted ? (
          <p className="text-xs text-destructive">
            به سقف سهمیه رسیده‌اید؛ فقط ویرایش یا حذف برچسب‌های قبلی مجاز است.
          </p>
        ) : eligibleCount === 0 ? (
          <p className="text-xs text-muted-foreground">
            هنوز محصول واجد شرایطی برای محاسبه سهمیه ندارید.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {formatNumber(remaining)} جای خالی باقی مانده
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default OwnerLabelQuotaMeter;