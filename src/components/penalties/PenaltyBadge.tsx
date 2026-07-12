import { ShieldAlert } from "lucide-react";
import { useUserPenaltyCount } from "@/hooks/penalties/usePenalties";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE_MAP: Record<Size, { box: string; icon: number; text: string }> = {
  sm: { box: "h-5 px-1.5 gap-1 text-xs", icon: 12, text: "text-xs" },
  md: { box: "h-6 px-2 gap-1.5 text-sm", icon: 14, text: "text-sm" },
  lg: { box: "h-8 px-2.5 gap-2 text-base", icon: 18, text: "text-base" },
};

function toPersianDigits(s: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/[0-9]/g, (d) => map[Number(d)]);
}

export function PenaltyBadge({
  userId,
  size = "md",
  className,
}: {
  userId: string | null | undefined;
  size?: Size;
  className?: string;
}) {
  const { data: count = 0 } = useUserPenaltyCount(userId);
  if (!count || count <= 0) return null;
  const s = SIZE_MAP[size];
  return (
    <span
      dir="rtl"
      title={`${toPersianDigits(count)} کارت قرمز فعال`}
      className={cn(
        "inline-flex items-center rounded-full border border-red-300 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
        s.box,
        className,
      )}
    >
      <ShieldAlert size={s.icon} />
      <span className={cn("font-semibold", s.text)}>{toPersianDigits(count)}</span>
    </span>
  );
}