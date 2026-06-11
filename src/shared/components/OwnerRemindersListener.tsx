import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth/AuthProvider";
import { usePopupCenter } from "@/lib/popups/PopupCenterProvider";
import {
  fetchStalePurchasePrices,
  fetchStaleUnavailableProducts,
} from "@/lib/pricing/attention-queries";
import {
  REMINDERS_REFRESH_INTERVAL_MS,
  STOCK_STALE_DAYS,
  USD_DRIFT_THRESHOLD_PCT,
} from "@/lib/popups/config";

/**
 * Listener سراسری: برای مالک هر محصول، یادآوری‌های موجودی/قیمت را
 * به‌صورت toast نمایش می‌دهد. در صورت بسته شدن بدون «متوجه شدم»،
 * آیتم به مرکز پاپ‌آپ‌ها منتقل می‌شود.
 */
const TOAST_DURATION_MS = 4000;

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

function showReminder(args: {
  id: string;
  title: string;
  body: string;
  type: string;
  add: ReturnType<typeof usePopupCenter>["add"];
}) {
  let acknowledged = false;
  const { id, title, body, type, add } = args;
  const now = Date.now();
  toast(title, {
    id,
    description: body,
    duration: TOAST_DURATION_MS,
    action: {
      label: "متوجه شدم",
      onClick: () => {
        acknowledged = true;
      },
    },
    onDismiss: () => {
      if (!acknowledged) add({ id, title, body, type, createdAt: now });
    },
    onAutoClose: () => {
      if (!acknowledged) add({ id, title, body, type, createdAt: now });
    },
  });
}

export function OwnerRemindersListener() {
  const { user } = useAuth();
  const { add } = usePopupCenter();
  const shownRef = useRef<Set<string>>(new Set());
  const userId = user?.id ?? null;

  const staleStockQ = useQuery({
    enabled: !!userId,
    queryKey: ["owner-reminders", "stock", userId],
    queryFn: () => fetchStaleUnavailableProducts({ ownerUserId: userId! }),
    staleTime: REMINDERS_REFRESH_INTERVAL_MS,
    refetchInterval: REMINDERS_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  const stalePriceQ = useQuery({
    enabled: !!userId,
    queryKey: ["owner-reminders", "purchase-price", userId],
    queryFn: () => fetchStalePurchasePrices({ ownerUserId: userId! }),
    staleTime: REMINDERS_REFRESH_INTERVAL_MS,
    refetchInterval: REMINDERS_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const rows = staleStockQ.data ?? [];
    const bucket = dayBucket();
    for (const r of rows) {
      const id = `reminder-stock-${r.id}-${bucket}`;
      if (shownRef.current.has(id)) continue;
      shownRef.current.add(id);
      showReminder({
        id,
        title: "ناموجود طولانی‌مدت",
        body: `«${r.name}» بیش از ${STOCK_STALE_DAYS} روز ناموجود است. لطفاً رسیدگی کنید.`,
        type: "owner-reminder-stock",
        add,
      });
    }
  }, [staleStockQ.data, add]);

  useEffect(() => {
    const rows = stalePriceQ.data ?? [];
    const bucket = dayBucket();
    for (const r of rows) {
      const reason = r.is_usd_drifted
        ? `تغییر معادل دلاری ${r.usd_drift_pct?.toFixed(1)}٪ (بیش از ${USD_DRIFT_THRESHOLD_PCT}٪)`
        : "قیمت خرید تومانی نیاز به بازبینی دارد";
      const id = `reminder-price-${r.product_id}-${r.is_usd_drifted ? "drift" : "stale"}-${bucket}`;
      if (shownRef.current.has(id)) continue;
      shownRef.current.add(id);
      showReminder({
        id,
        title: "بازبینی قیمت خرید",
        body: `«${r.name}»: ${reason}.`,
        type: "owner-reminder-price",
        add,
      });
    }
  }, [stalePriceQ.data, add]);

  return null;
}