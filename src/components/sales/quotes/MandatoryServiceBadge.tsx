import { Lock, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The visible half of requirement 223.
 *
 * Deliberately NOT a checkbox or a removable chip. A control that looks
 * removable but is refused by the backend is worse than no control — the
 * salesperson would click it, watch it fail, and learn to distrust the form.
 * The obligation is shown as a locked statement of fact, because that is what
 * it is: the database attaches it on insert and refuses to let it go
 * (migration 276).
 */
export function MandatoryServiceBadge({
  text,
  className,
  compact = false,
}: {
  /** The sentence from the rule, e.g. «این کالا حتماً باید بسته‌بندی شود.» */
  text: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      dir="rtl"
      title="این خدمت اجباری است و قابل حذف نیست."
      data-testid="mandatory-service-badge"
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900",
        compact ? "text-[10px]" : "text-[11px]",
        className,
      )}
    >
      <PackageCheck className={compact ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
      <span className="truncate">{text}</span>
      <Lock className="h-3 w-3 shrink-0 opacity-70" />
    </span>
  );
}
