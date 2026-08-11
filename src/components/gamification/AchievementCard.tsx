import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toPersianDigits } from "@/lib/dashboard/utils";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { cn } from "@/lib/utils";

interface AchievementCardProps {
  achievement: {
    id: string;
    key: string;
    title_fa: string;
    description: string | null;
    icon: string | null;
    xp_reward: number;
  };
  unlocked: boolean;
  unlockedAt?: string;
}

export function AchievementCard({ achievement, unlocked, unlockedAt }: AchievementCardProps) {
  return (
    <Card
      dir="rtl"
      className={cn(
        "flex flex-col items-center gap-2 p-4 text-center transition-all",
        unlocked ? "border-primary/40 shadow-md" : "grayscale opacity-50",
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-3xl">
        {unlocked ? (
          achievement.icon ?? "🏆"
        ) : (
          <Lock className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <h3 className="font-bold text-sm">{achievement.title_fa}</h3>
      {achievement.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{achievement.description}</p>
      )}
      <div className="text-xs font-semibold text-primary">
        +{toPersianDigits(achievement.xp_reward)} XP
      </div>
      {unlocked && unlockedAt && (
        <div className="text-[10px] text-muted-foreground">
          {formatJalaliDateTime(unlockedAt)}
        </div>
      )}
    </Card>
  );
}

export default AchievementCard;