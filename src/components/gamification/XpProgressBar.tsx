import { toPersianDigits } from "@/lib/dashboard/utils";

interface XpProgressBarProps {
  current: number;
  nextLevel: number;
  percent: number;
  level: number;
}

export function XpProgressBar({ current, nextLevel, percent, level }: XpProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-full space-y-2" dir="rtl">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">سطح {toPersianDigits(level)}</span>
        <span className="text-muted-foreground">
          {toPersianDigits(current)}/{toPersianDigits(nextLevel)} XP
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-l from-green-500 to-blue-500 transition-all duration-700"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export default XpProgressBar;