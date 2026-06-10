import { MOODS, type MoodKey } from "@/lib/operations/daily-mood";
import { cn } from "@/lib/utils";

export function MoodEmojiSelector({
  value,
  onChange,
}: {
  value: MoodKey | null;
  onChange: (k: MoodKey, label: string, score: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" dir="rtl">
      {MOODS.map((m) => {
        const active = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key, m.label, m.score)}
            className={cn(
              "rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all",
              "hover:bg-accent hover:scale-[1.02]",
              active
                ? "bg-primary/10 border-primary ring-2 ring-primary/30"
                : "bg-card border-border",
            )}
            aria-pressed={active}
          >
            <span className="text-3xl" aria-hidden>
              {m.emoji}
            </span>
            <span className="text-sm font-medium">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
