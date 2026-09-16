/**
 * پوستهٔ مشترک صفحات میز فروش: دکمه بازگشت، اتمسفر، کارت‌های سه‌بعدی تعاملی.
 */
import { type ReactNode, useCallback, useRef } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** مسیر پیش‌فرض اگر history خالی باشد */
  fallbackTo?: string;
  className?: string;
};

export function SalesDeskShell({
  title,
  description,
  actions,
  children,
  fallbackTo = "/operations/sales-desk",
  className,
}: ShellProps) {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
      return;
    }
    router.history.push(fallbackTo);
  };

  return (
    <div className={cn("sales-desk-shell relative isolate", className)} dir="rtl">
      <div className="sales-desk-atmosphere" aria-hidden />
      <div className="sales-desk-orb sales-desk-orb-a" aria-hidden />
      <div className="sales-desk-orb sales-desk-orb-b" aria-hidden />

      <header className="sales-desk-header relative z-[1] mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={goBack}
            className="sales-desk-back gap-1.5 border-teal-800/15 bg-white/70 shadow-sm backdrop-blur-sm hover:-translate-y-0.5 hover:bg-white"
          >
            <ArrowRight className="h-4 w-4" />
            بازگشت
          </Button>
          {fallbackTo !== "/operations/sales-desk" ? (
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/operations/sales-desk">میز فروش</Link>
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="sales-desk-kicker mb-1 text-xs font-medium tracking-wide text-teal-800/70">
              میز تماس فروش
            </p>
            <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl break-words text-sm leading-relaxed text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </header>

      <div className="relative z-[1] space-y-6">{children}</div>
    </div>
  );
}

type TiltProps = {
  children: ReactNode;
  className?: string;
  /** تأخیر ورود برای stagger */
  delayMs?: number;
};

/** کارت با شیب سه‌بعدی هنگام حرکت موس */
export function SalesDeskTiltCard({ children, className, delayMs = 0 }: TiltProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rotY = (px - 0.5) * -10;
    const rotX = (py - 0.5) * 8;
    el.style.setProperty("--sd-rot-x", `${rotX}deg`);
    el.style.setProperty("--sd-rot-y", `${rotY}deg`);
    el.style.setProperty("--sd-shine-x", `${px * 100}%`);
    el.style.setProperty("--sd-shine-y", `${py * 100}%`);
  }, []);

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--sd-rot-x", "0deg");
    el.style.setProperty("--sd-rot-y", "0deg");
  }, []);

  return (
    <div
      ref={ref}
      className={cn("sales-desk-tilt", className)}
      style={{ animationDelay: `${delayMs}ms` }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="sales-desk-tilt-inner">{children}</div>
    </div>
  );
}
