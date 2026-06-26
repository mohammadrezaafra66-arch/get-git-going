import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RateType = "نیمایی" | "آزاد" | "توافقی";

interface RateTypeBadgeProps {
  rateType: RateType | null | undefined;
  className?: string;
}

const STYLES: Record<RateType, string> = {
  نیمایی: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
  آزاد: "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100",
  توافقی: "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100",
};

const TOOLTIPS: Record<RateType, string> = {
  نیمایی: "نرخ رسمی بانک مرکزی",
  آزاد: "نرخ بازار آزاد",
  توافقی: "نرخ توافقی",
};

export function RateTypeBadge({ rateType, className }: RateTypeBadgeProps) {
  if (!rateType) return null;
  return (
    <Badge
      variant="outline"
      title={TOOLTIPS[rateType]}
      className={cn(STYLES[rateType], className)}
    >
      {rateType}
    </Badge>
  );
}
