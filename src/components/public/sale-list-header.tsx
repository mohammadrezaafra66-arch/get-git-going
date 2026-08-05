import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { BRANDING } from "@/config/branding";

interface Props {
  name: string;
  versionNumber: number;
  publishedAt: string | null;
  salePriceTypeTitle: string | null;
  description?: string | null;
}

export function SaleListHeader({
  name,
  versionNumber,
  publishedAt,
  salePriceTypeTitle,
  description,
}: Props) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-bold text-foreground sm:text-lg">
            {BRANDING.displayNameFa}
          </div>
          <div className="text-xs text-muted-foreground sm:text-sm">لیست فروش</div>
        </div>
        <h1 className="mt-3 text-xl font-bold text-foreground sm:text-2xl">{name}</h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          <span>نسخه {formatNumber(versionNumber)}</span>
          {publishedAt ? <span>تاریخ انتشار: {formatDateFa(publishedAt)}</span> : null}
          {salePriceTypeTitle ? <span>نوع قیمت: {salePriceTypeTitle}</span> : null}
        </div>
      </div>
    </header>
  );
}
