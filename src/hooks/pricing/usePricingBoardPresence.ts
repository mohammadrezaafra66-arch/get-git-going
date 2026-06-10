import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  startOrUpdateSession,
  heartbeatSession,
  endSession,
} from "@/lib/pricing/board-presence";

const HEARTBEAT_MS = 30_000;

/**
 * فعال‌سازی session presence فقط برای کاربر approved.
 */
export function usePricingBoardPresence(opts: {
  boardKey: string;
  enabled: boolean;
  salePriceTypeId: string | null;
}) {
  const { boardKey, enabled, salePriceTypeId } = opts;
  const { user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const sptRef = useRef<string | null>(salePriceTypeId);
  sptRef.current = salePriceTypeId;

  useEffect(() => {
    if (!enabled || !user?.id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
        const s = await startOrUpdateSession({
          boardKey,
          userId: user.id,
          salePriceTypeId: sptRef.current,
          userAgent: ua,
        });
        if (cancelled) return;
        sessionIdRef.current = s.id;
        interval = setInterval(() => {
          if (sessionIdRef.current) {
            heartbeatSession(sessionIdRef.current, sptRef.current).catch(() => {});
          }
        }, HEARTBEAT_MS);
      } catch {
        // silent
      }
    })();

    const onUnload = () => {
      if (sessionIdRef.current) {
        // بهترین تلاش — beforeunload قابل اعتماد ۱۰۰٪ نیست
        endSession(sessionIdRef.current).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, [enabled, user?.id, boardKey]);
}