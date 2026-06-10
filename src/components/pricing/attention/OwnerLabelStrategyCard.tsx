import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/i18n/formatters";

export interface OwnerLabelStrategyCardProps {
  eligibleCount: number;
  taggedCount: number;
  quota: number;
  remaining: number;
  excludedSharedCount: number;
  exhausted: boolean;
}

/**
 * کارت راهنمای UX برای تب «سهمیه برچسب‌های من».
 * presentational است؛ هیچ fetch/mutation داخل آن انجام نمی‌شود.
 */
export function OwnerLabelStrategyCard({
  remaining,
  excludedSharedCount,
  exhausted,
}: OwnerLabelStrategyCardProps) {
  return (
    <Card className="space-y-3 p-4 text-sm leading-7" dir="rtl">
      <div>
        <h3 className="text-base font-semibold">راهنمای انتخاب سبد تمرکز</h3>
        <p className="mt-1 text-muted-foreground">
          شما می‌توانید بخشی از محصولات تحت مسئولیت خود را به‌عنوان سبد تمرکز انتخاب کنید.
          پیشنهاد ما این است که برچسب‌ها را برای محصولاتی بگذارید که بیشترین نیاز به پیگیری،
          قیمت‌گذاری یا فرصت فروش دارند.
        </p>
      </div>

      <div className="space-y-1 text-[13px]">
        {exhausted ? (
          <p className="text-amber-700 dark:text-amber-300">
            سهمیه فعلی شما تکمیل شده است. برای اضافه‌کردن محصول جدید، ابتدا یکی از محصولات قبلی را از سبد تمرکز خارج کنید.
          </p>
        ) : remaining > 0 ? (
          <p>
            هنوز <span className="font-semibold">{formatNumber(remaining)}</span> جای خالی برای انتخاب محصول‌های مهم‌تر دارید.
          </p>
        ) : null}

        {excludedSharedCount > 0 && (
          <p className="text-muted-foreground">
            {formatNumber(excludedSharedCount)} محصول مشترک در این فاز از محاسبه سهمیه خارج شده‌اند تا مسئولیت‌ها با هم تداخل نداشته باشند.
          </p>
        )}
      </div>

      <div>
        <h4 className="mb-1 text-sm font-medium">اولویت پیشنهادی برای انتخاب</h4>
        <ul className="list-disc space-y-0.5 ps-5 text-[13px] text-muted-foreground">
          <li>محصولات فعال و بدون برچسب داخلی</li>
          <li>محصولاتی که مدت بیشتری بدون رسیدگی مانده‌اند</li>
          <li>محصولاتی که برای فروش یا قیمت‌گذاری نیاز به تمرکز بیشتری دارند</li>
        </ul>
      </div>
    </Card>
  );
}

export default OwnerLabelStrategyCard;