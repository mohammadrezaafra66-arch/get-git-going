import { cn } from "@/lib/utils";

export interface StepperProps {
  steps: string[];
  current: number;
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * RTL step indicator. Navigation state lives in the parent — this component
 * never reads or writes browser storage.
 */
export function Stepper({ steps, current, onStepClick, className }: StepperProps) {
  return (
    <ol className={cn("flex flex-wrap gap-2", className)} dir="rtl" data-testid="wizard-stepper">
      {steps.map((label, index) => {
        const step = index + 1;
        const active = step === current;
        const done = step < current;
        const canJump = Boolean(onStepClick) && step < current;
        return (
          <li key={`${step}-${label}`}>
            <button
              type="button"
              disabled={!canJump}
              onClick={() => {
                if (canJump) onStepClick?.(step);
              }}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active && "border-primary bg-primary text-primary-foreground",
                done && "border-primary/40 bg-primary/10 text-foreground",
                !active && !done && "border-muted text-muted-foreground",
              )}
              data-testid={`wizard-step-${step}`}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/30 text-xs font-semibold">
                {step}
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
