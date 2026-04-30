import { useEffect, useMemo, useState } from "react";
import { Sparkles, Zap } from "lucide-react";

interface LevelUpOverlayProps {
  level: number | null;
  /** ms — how long the overlay stays before auto-dismissing */
  duration?: number;
  onDone?: () => void;
}

/**
 * Full-screen LEVEL UP celebration with confetti, glow, and large level text.
 * Mount-then-unmount: pass `level` (number) to trigger; pass null when done.
 */
export function LevelUpOverlay({ level, duration = 3000, onDone }: LevelUpOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (level == null) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => clearTimeout(t);
  }, [level, duration, onDone]);

  // 60 confetti pieces — memoized so they don't re-randomize on rerender
  const confetti = useMemo(
    () =>
      Array.from({ length: 60 }).map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 600,
        dur: 1800 + Math.random() * 1400,
        size: 6 + Math.random() * 8,
        rot: Math.random() * 360,
        hue: Math.floor(Math.random() * 360),
      })),
    [level],
  );

  if (!visible || level == null) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none animate-in fade-in duration-300"
      role="status"
      aria-live="polite"
    >
      {/* radial glow backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.35),rgba(0,0,0,0.55)_60%,rgba(0,0,0,0.85))]" />

      {/* confetti layer */}
      <div className="absolute inset-0 overflow-hidden">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="absolute top-[-10%] block rounded-sm"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size * 1.6,
              background: `hsl(${c.hue} 90% 60%)`,
              transform: `rotate(${c.rot}deg)`,
              animation: `lu-fall ${c.dur}ms cubic-bezier(0.22,0.61,0.36,1) ${c.delay}ms forwards`,
              opacity: 0.95,
              boxShadow: `0 0 6px hsl(${c.hue} 90% 70% / 0.6)`,
            }}
          />
        ))}
      </div>

      {/* center burst */}
      <div className="relative flex flex-col items-center gap-3 text-center" style={{ animation: "lu-pop 700ms cubic-bezier(0.22,1.61,0.36,1) both" }}>
        <div className="relative">
          <div className="absolute inset-0 -m-8 rounded-full bg-yellow-400/30 blur-3xl animate-pulse" />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 shadow-[0_0_60px_rgba(250,204,21,0.8)]">
            <Zap className="h-14 w-14 text-white drop-shadow" strokeWidth={2.5} />
            <Sparkles className="absolute -top-2 -right-2 h-7 w-7 text-yellow-200 animate-ping" />
          </div>
        </div>
        <div className="mt-2 text-xs uppercase tracking-[0.4em] text-yellow-200/90">LEVEL UP</div>
        <div
          className="bg-gradient-to-b from-white via-yellow-100 to-amber-300 bg-clip-text text-7xl font-black tabular-nums text-transparent drop-shadow-[0_4px_20px_rgba(250,204,21,0.6)]"
          style={{ animation: "lu-rise 800ms cubic-bezier(0.22,0.61,0.36,1) 100ms both" }}
        >
          {level}
        </div>
        <div className="text-sm font-medium text-white/90">سطح {level}</div>
      </div>

      {/* keyframes injected once */}
      <style>{`
        @keyframes lu-fall {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
        }
        @keyframes lu-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes lu-rise {
          0%   { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}