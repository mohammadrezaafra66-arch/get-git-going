import { cn } from "@/lib/utils";
import { useIsOnline } from "@/hooks/presence/useIsOnline";

interface OnlineDotProps {
  userId: string | null | undefined;
  className?: string;
}

/**
 * نقطه وضعیت آنلاین برای نمایش روی آواتار کاربران.
 * سبز = آنلاین (در ۵ دقیقه گذشته فعال بوده) — خاکستری = آفلاین.
 * طوری طراحی شده که داخل یک عنصر `relative` به‌صورت absolute قرار گیرد.
 */
export function OnlineDot({ userId, className }: OnlineDotProps) {
  const { data: online } = useIsOnline(userId);
  return (
    <span
      aria-label={online ? "آنلاین" : "آفلاین"}
      title={online ? "آنلاین" : "آفلاین"}
      className={cn(
        "pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
        online ? "bg-green-500" : "bg-muted-foreground/50",
        className,
      )}
    />
  );
}

export default OnlineDot;