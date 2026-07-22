import { useEffect, useRef, useState } from "react";
import { Heart, Moon, Sparkles, Star } from "lucide-react";

/**
 * مورد ۱۳۸.۱ — افکت واکنش شناور
 *
 * هر بار که `trigger` تغییر کند یک burst از ۵ تا ۹ آیکون کوچک ساخته می‌شود که
 * از نزدیکی دکمه به سمت بالا شناور می‌شوند و محو می‌گردند. لایهٔ افکت همیشه
 * `pointer-events-none` است تا کلیک‌پذیری کارت دست‌نخورده بماند.
 *
 * انیمیشن کاملاً CSS است (کلاس `floating-reaction` در `src/styles.css`) و با
 * `prefers-reduced-motion: reduce` غیرفعال می‌شود. بدون وابستگی جدید.
 */

const ICONS = [Star, Heart, Sparkles, Moon];

// رنگ‌های ملایم و هماهنگ با تم — روی تم روشن و تیره هر دو خوانا هستند.
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
    // پخش افقی حول مرکز دکمه
    left: randBetween(15, 85),
    drift: randBetween(-26, 26),
    rise: randBetween(-72, -110),
    size: randBetween(12, 20),
    rotate: randBetween(-35, 35),
    delayMs: randBetween(0, 220),
    durationMs: randBetween(900, 1500),
  }));
}

export function FloatingReactionBurst({ trigger }: { trigger: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const nextIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (trigger <= 0) return;
    const batch = buildParticles(nextIdRef.current);
    nextIdRef.current += batch.length;
    setParticles(batch);

    // پاک‌سازی بعد از پایان کندترین ذره تا state نشت نکند.
    const lifetime = Math.max(...batch.map((p) => p.delayMs + p.durationMs)) + 80;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setParticles([]), lifetime);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-20 block">
      {particles.map((p) => {
        const Icon = ICONS[p.iconIndex];
        return (
          <span
            key={p.id}
            className={`floating-reaction absolute top-0 ${p.tint}`}
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
