import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * PRICE-RT.3 — اشتراک Realtime روی `product_computed_prices`.
 *
 * هرگاه worker قیمت‌های محاسبه‌شده را به‌روزرسانی کند، این هوک با debounce
 * مشخص (پیش‌فرض ۵۰۰ms) queryهای داده‌شده را invalidate می‌کند تا UI بدون
 * refresh دستی، قیمت‌های جدید را نمایش دهد.
 *
 * - بدون فرمول قیمت‌گذاری/منطق publish ارتباطی ندارد.
 * - رفرش‌های زیاد در یک پنجره کوچک ادغام می‌شوند تا فشاری روی DB نیاید.
 */
export function useComputedPricesRealtime(opts: {
  enabled?: boolean;
  /** کلیدهایی که باید پس از تغییر product_computed_prices invalidate شوند. */
  invalidateKeys?: ReadonlyArray<readonly unknown[]>;
  /** Callback اختیاری برای منطق سفارشی (مثلاً نمایش toast). */
  onChange?: (payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE";
    productId: string | null;
    salePriceTypeId: string | null;
  }) => void;
  /** پنجره ادغام invalidate (پیش‌فرض ۵۰۰ms، حداقل ۳۰۰، حداکثر ۲۰۰۰). */
  debounceMs?: number;
  /** نام کانال؛ اگر چند جا همزمان استفاده می‌شود مقداردهی متفاوت کنید. */
  channelName?: string;
}) {
  const enabled = opts.enabled ?? true;
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);
  const [lastChangeAt, setLastChangeAt] = useState<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // refsها از callback های پایدار برای حلقه useEffect:
  const invalidateKeysRef = useRef(opts.invalidateKeys ?? []);
  invalidateKeysRef.current = opts.invalidateKeys ?? [];
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;

  const rawDebounce = opts.debounceMs ?? 500;
  const debounceMs = Math.max(300, Math.min(2000, rawDebounce));
  const channelName = opts.channelName ?? "computed-prices-realtime";

  useEffect(() => {
    if (!enabled) {
      setIsLive(false);
      return;
    }

    const scheduleInvalidate = () => {
      if (pendingTimer.current) return;
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null;
        for (const key of invalidateKeysRef.current) {
          queryClient.invalidateQueries({ queryKey: key as unknown[] });
        }
      }, debounceMs);
    };

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_computed_prices",
        },
        (payload) => {
          const row =
            (payload.new as Record<string, unknown> | null) ??
            (payload.old as Record<string, unknown> | null) ??
            null;
          const productId = (row?.product_id as string | undefined) ?? null;
          const salePriceTypeId =
            (row?.sale_price_type_id as string | undefined) ?? null;
          setLastChangeAt(Date.now());
          onChangeRef.current?.({
            eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            productId,
            salePriceTypeId,
          });
          scheduleInvalidate();
        },
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      setIsLive(false);
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, channelName, debounceMs]);

  return { isLive, lastChangeAt };
}