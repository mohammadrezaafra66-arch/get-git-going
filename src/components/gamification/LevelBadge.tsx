import { toPersianDigits } from "@/lib/dashboard/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
  level: number;
  size?: "sm" | "md" | "lg";
}

function getLevelMeta(level: number) {
  if (level >= 10) return { name: "استاد", classes: "bg-gradient-to-br from-yellow-400 to-amber-600 text-white" };
  if (level >= 7) return { name: "پیشرفته", classes: "bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white" };
  if (level >= 4) return { name: "متوسط", classes: "bg-gradient-to-br from-blue-500 to-sky-600 text-white" };
  return { name: "مبتدی", classes: "bg-gradient-to-br from-slate-400 to-slate-600 text-white" };
}

const sizeClasses: Record<NonNullable<LevelBadgeProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
};

export function LevelBadge({ level, size = "md" }: LevelBadgeProps) {
  const meta = getLevelMeta(level);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center justify-center rounded-full font-bold shadow-md ring-2 ring-background",
              sizeClasses[size],
              meta.classes,
            )}
          >
            {toPersianDigits(level)}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <span>سطح {toPersianDigits(level)} — {meta.name}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default LevelBadge;