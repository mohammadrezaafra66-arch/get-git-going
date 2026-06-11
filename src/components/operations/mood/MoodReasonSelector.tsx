import { REASONS } from "@/lib/operations/daily-mood";
import { cn } from "@/lib/utils";

export function MoodReasonSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (r: string) => {
    if (value.includes(r)) onChange(value.filter((x) => x !== r));
    else onChange([...value, r]);
  };
  return (
    <div className="flex flex-wrap gap-2" dir="rtl">
      {REASONS.map((r) => {
        const active = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => toggle(r)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-accent",
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
