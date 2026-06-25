import { toPersianDigits } from "@/lib/dashboard/utils";
import { cn } from "@/lib/utils";
import type { LeaderboardPeriod } from "@/lib/operations/gamification";

interface LeaderboardRowProps {
  row: {
    employee_id: string;
    full_name: string;
    score: number;
    rank: number;
  };
  isCurrentUser: boolean;
  period: LeaderboardPeriod;
  topScore?: number;
  index?: number;
}

function rankDisplay(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return toPersianDigits(rank);
}

export function LeaderboardRow({ row, isCurrentUser, topScore, index = 0 }: LeaderboardRowProps) {
  const max = topScore && topScore > 0 ? topScore : row.score || 1;
  const percent = Math.max(0, Math.min(100, (row.score / max) * 100));
  return (
    <div
      dir="rtl"
      className={cn(
        "flex items-center gap-3 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2",
        isCurrentUser && "border-r-4 border-primary bg-primary/10",
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold">
        {rankDisplay(row.rank)}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{row.full_name}</span>
          <span className="shrink-0 text-sm font-bold text-primary">
            {toPersianDigits(Math.round(row.score).toLocaleString("en-US"))}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-l from-teal-500 to-blue-500 transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default LeaderboardRow;