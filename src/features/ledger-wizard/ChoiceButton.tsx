import { cn } from "@/lib/utils";

interface ChoiceButtonProps {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
}

export function ChoiceButton({
  title,
  subtitle,
  selected,
  onClick,
  testId,
  disabled,
}: ChoiceButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border-2 p-5 text-right transition-colors",
        selected ? "border-primary bg-primary/5" : "border-input hover:bg-accent",
        disabled && "opacity-50",
      )}
    >
      <div className="text-lg font-semibold">{title}</div>
      {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
    </button>
  );
}
