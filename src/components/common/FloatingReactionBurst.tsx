import { useEffect, useRef, useState } from "react";
import { Heart, PartyPopper, Sparkles, Star, Zap } from "lucide-react";

const ICONS = [Star, Heart, Sparkles, Zap, PartyPopper];

const TINTS = [
  "text-primary/70",
  "text-amber-400/80",
  "text-rose-400/80",
  "text-sky-400/80",
  "text-emerald-400/80",
];

interface Particle {
  id: number;
  iconIndex: number;
  tint: string;
  left: number;
  drift: number;
  rise: number;
  size: number;
  rotate: number;
  delayMs: number;
  durationMs: number;
}

const MIN_PARTICLES = 5;
const MAX_PARTICLES = 9;

const randBetween = (min: number, max: number) => min + Math.random() * (max - min);
const randIntBetween = (min: number, max: number) => Math.floor(randBetween(min, max + 1));

function buildParticles(startId: number): Particle[] {
  const count = randIntBetween(MIN_PARTICLES, MAX_PARTICLES);
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    iconIndex: randIntBetween(0, ICONS.length - 1),
    tint: TINTS[randIntBetween(0, TINTS.length - 1)],
    left: randBetween(18, 82),
    drift: randBetween(-24, 24),
    rise: randBetween(-46, -84),
    size: randBetween(12, 20),
    rotate: randBetween(-35, 35),
    delayMs: randBetween(0, 220),
    durationMs: randBetween(1000, 2000),
  }));
}

export function FloatingReactionBurst({ trigger }: { trigger: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const nextIdRef = useRef(0);
  const timeoutRefs = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    if (trigger <= 0) return;
    const batch = buildParticles(nextIdRef.current);
    nextIdRef.current += batch.length;
    setParticles((current) => [...current, ...batch]);

    const lifetime = Math.max(...batch.map((p) => p.delayMs + p.durationMs)) + 120;
    const batchIds = new Set(batch.map((p) => p.id));
    const timeout = setTimeout(() => {
      setParticles((current) => current.filter((particle) => !batchIds.has(particle.id)));
      timeoutRefs.current = timeoutRefs.current.filter((item) => item !== timeout);
    }, lifetime);
    timeoutRefs.current.push(timeout);

    return () => {
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    };
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-20 block overflow-visible">
      {particles.map((p) => {
        const Icon = ICONS[p.iconIndex];
        return (
          <span
            key={p.id}
            className={`floating-reaction absolute top-1/2 ${p.tint}`}
            style={
              {
                left: `${p.left}%`,
                "--fr-drift": `${p.drift}px`,
                "--fr-rise": `${p.rise}px`,
                "--fr-rotate": `${p.rotate}deg`,
                "--fr-delay": `${Math.round(p.delayMs)}ms`,
                "--fr-duration": `${Math.round(p.durationMs)}ms`,
              } as React.CSSProperties
            }
          >
            <Icon style={{ width: p.size, height: p.size }} />
          </span>
        );
      })}
    </span>
  );
}
