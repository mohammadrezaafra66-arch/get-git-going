import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface HelpHintProps {
  /** متن راهنما (پشتیبانی از چند خط با \n) */
  text: string;
  /** برچسب دسترس‌پذیری */
  ariaLabel?: string;
  className?: string;
  /** اندازهٔ آیکن (پیش‌فرض ۱۴px) */
  size?: number;
}

/**
 * علامت سؤال کوچک کنار عنوان فیلد/بخش.
 * در دسکتاپ با hover (Tooltip) و در موبایل با لمس (Popover) نمایش داده می‌شود.
 */
export function HelpHint({ text, ariaLabel, className, size = 14 }: HelpHintProps) {
  const lines = text.split("\n");
  const content = (
    <div className="space-y-1 text-right leading-6" dir="rtl">
      {lines.map((l, i) => (
        <p key={i} className="text-xs">{l}</p>
      ))}
    </div>
  );

  return (
    <span className={cn("inline-flex align-middle", className)}>
      {/* موبایل: Popover با کلیک */}
      <span className="md:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={ariaLabel ?? "راهنما"}
              className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HelpCircle style={{ width: size, height: size }} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="max-w-[260px] text-xs" dir="rtl">
            {content}
          </PopoverContent>
        </Popover>
      </span>
      {/* دسکتاپ: Tooltip با hover */}
      <span className="hidden md:inline-flex">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={ariaLabel ?? "راهنما"}
                className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HelpCircle style={{ width: size, height: size }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] bg-popover text-popover-foreground border">
              {content}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
    </span>
  );
}