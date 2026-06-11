import { useRef } from "react";
import { toast } from "sonner";
import { useComputedPricesRealtime } from "@/hooks/pricing/useComputedPricesRealtime";
import { usePopupCenter } from "@/lib/popups/PopupCenterProvider";

/**
 * گوش‌دادن سراسری به رویداد تغییر قیمت محاسبه‌شده و نمایش toast کوتاه
 * با دکمهٔ «متوجه شدم». در صورت عدم تأیید یا اتمام زمان، آیتم به
 * مرکز پاپ‌آپ‌ها منتقل می‌شود.
 *
 * این کامپوننت هیچ UI ثابتی رندر نمی‌کند.
 */
const TOAST_DURATION_MS = 2500;

export function PriceChangePopupListener() {
  const { add } = usePopupCenter();
  // محدودسازی فرکانس برای پرهیز از سیل toast هنگام آپدیت‌های دسته‌ای
  const lastShownRef = useRef<number>(0);

  useComputedPricesRealtime({
    invalidateKeys: [],
    debounceMs: 500,
    channelName: "popup-center-price-rt",
    onChange: ({ eventType }) => {
      if (eventType === "DELETE") return;
      const now = Date.now();
      if (now - lastShownRef.current < 1500) return;
      lastShownRef.current = now;

      const id = `price-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const title = "تغییر قیمت خرید";
      const body = "قیمت یکی از محصولات به‌روزرسانی شد.";
      let acknowledged = false;

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
          if (!acknowledged) {
            add({ id, title, body, type: "price-change", createdAt: now });
          }
        },
        onAutoClose: () => {
          if (!acknowledged) {
            add({ id, title, body, type: "price-change", createdAt: now });
          }
        },
      });
    },
  });

  return null;
}
