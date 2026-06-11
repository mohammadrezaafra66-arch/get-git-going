import { Crown, Shield, Star, Gem, Sparkles, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type LeagueTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Legend";

interface TierSpec {
  fa: string;
  Icon: LucideIcon;
  /** outer ring gradient */
  ring: string;
  /** badge body gradient */
  body: string;
  /** glow color (used in box-shadow) */
  glow: string;
  /** main accent color for text */
  accent: string;
}

const TIERS: Record<LeagueTier, TierSpec> = {
  Bronze: {
    fa: "برنز",
    Icon: Shield,
    ring: "from-amber-800 via-amber-600 to-amber-900",
    body: "from-amber-700 via-orange-500 to-amber-800",
    glow: "rgba(217, 119, 6, 0.55)",
    accent: "text-amber-100",
  },
  Silver: {
    fa: "نقره",
    Icon: Shield,
    ring: "from-slate-300 via-slate-100 to-slate-400",
    body: "from-slate-400 via-slate-200 to-slate-500",
    glow: "rgba(148, 163, 184, 0.55)",
    accent: "text-slate-50",
  },
  Gold: {
    fa: "طلا",
    Icon: Crown,
    ring: "from-yellow-500 via-amber-300 to-yellow-600",
    body: "from-yellow-400 via-amber-300 to-yellow-600",
    glow: "rgba(250, 204, 21, 0.65)",
    accent: "text-amber-900",
  },
  Platinum: {
    fa: "پلاتین",
    Icon: Star,
    ring: "from-cyan-300 via-sky-200 to-blue-400",
    body: "from-cyan-300 via-sky-200 to-blue-400",
    glow: "rgba(56, 189, 248, 0.6)",
    accent: "text-sky-950",
  },
  Diamond: {
    fa: "الماس",
    Icon: Gem,
    ring: "from-sky-400 via-fuchsia-400 to-violet-500",
    body: "from-sky-300 via-fuchsia-300 to-violet-400",
    glow: "rgba(168, 85, 247, 0.65)",
    accent: "text-violet-950",
  },
  Legend: {
    fa: "افسانه",
    Icon: Sparkles,
    ring: "from-fuchsia-500 via-orange-400 to-rose-500",
    body: "from-fuchsia-500 via-orange-400 to-rose-500",
    glow: "rgba(236, 72, 153, 0.7)",
    accent: "text-white",
  },
};

const SIZES = {
  xs: { box: "h-6 w-6", icon: "h-3 w-3", ring: "p-[1.5px]" },
  sm: { box: "h-9 w-9", icon: "h-4 w-4", ring: "p-[2px]" },
  md: { box: "h-14 w-14", icon: "h-7 w-7", ring: "p-[2.5px]" },
  lg: { box: "h-20 w-20", icon: "h-10 w-10", ring: "p-[3px]" },
  xl: { box: "h-28 w-28", icon: "h-14 w-14", ring: "p-[4px]" },
} as const;

export interface LeagueBadgeProps {
  tier: LeagueTier | string | null | undefined;
  size?: keyof typeof SIZES;
  /** show small label under the badge */
  label?: boolean;
  /** subtle pulsing glow */
  animated?: boolean;
  className?: string;
}

export function LeagueBadge({
  tier,
  size = "sm",
  label = false,
  animated = false,
  className = "",
}: LeagueBadgeProps) {
  const spec = (tier && (TIERS as Record<string, TierSpec>)[tier as string]) || null;
  if (!spec) {
    return (
      <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
        <div
          className={`${SIZES[size].box} rounded-full border border-dashed border-muted-foreground/40 bg-muted/40 flex items-center justify-center`}
        >
          <Trophy className={`${SIZES[size].icon} text-muted-foreground/40`} />
        </div>
        {label ? <span className="text-[10px] text-muted-foreground">—</span> : null}
      </div>
    );
  }
  const sz = SIZES[size];
  const { Icon } = spec;
  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      {/* hex-like rounded badge with double ring */}
      <div
        className={`relative ${sz.box} rounded-[28%] bg-gradient-to-br ${spec.ring} ${sz.ring} ${animated ? "animate-pulse" : ""} transition-transform hover:scale-110`}
        style={{
          boxShadow: `0 6px 20px -4px ${spec.glow}, 0 0 0 1px rgba(255,255,255,0.15) inset`,
        }}
        aria-label={`League: ${spec.fa}`}
      >
        <div
          className={`relative h-full w-full rounded-[24%] bg-gradient-to-br ${spec.body} flex items-center justify-center overflow-hidden`}
        >
          {/* shine overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-transparent pointer-events-none" />
          {/* radial highlight */}
          <div className="absolute -top-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-white/30 blur-md pointer-events-none" />
          <Icon className={`relative ${sz.icon} ${spec.accent} drop-shadow-md`} strokeWidth={2.2} />
        </div>
      </div>
      {label ? (
        <span className={`text-[11px] font-semibold ${size === "xs" ? "hidden" : ""}`}>
          {spec.fa}
        </span>
      ) : null}
    </div>
  );
}

export function getLeagueLabel(tier: string | null | undefined): string {
  if (!tier) return "—";
  return (TIERS as Record<string, TierSpec>)[tier]?.fa ?? tier;
}
