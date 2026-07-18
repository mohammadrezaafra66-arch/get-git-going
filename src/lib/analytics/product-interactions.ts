/**
 * Lightweight, fire-and-forget product interaction tracking.
 * No IP / fingerprint / user-agent is collected — only the minimal
 * fields the management dashboard needs.
 *
 * Tracking is best-effort: failures are swallowed silently so they
 * never block UX. Calls are de-duplicated within a short time window
 * to avoid spamming the database when a user clicks rapidly.
 *
 * MKT-2.4.a — The actual insert is performed by an authenticated
 * serverFn (`trackProductInteractionFn`) which validates inputs,
 * sets `user_id` server-side, and rejects forged or spam events.
 * The browser utility is a thin fire-and-forget wrapper that
 * preserves the 30-second dedup window and never throws.
 */
import { trackProductInteractionFn } from "./product-interactions.functions";

export type InteractionEventType =
  | "search_result_viewed"
  | "price_checked"
  | "chart_opened"
  | "product_details_opened"
  | "board_price_viewed"
  | "sales_text_copied";

export type InteractionSource =
  | "sales_search"
  | "live_price_list"
  | "amin_hozoor_board"
  | "product_details"
  | "management_dashboard";

interface TrackArgs {
  productId: string;
  eventType: InteractionEventType;
  source: InteractionSource;
  salePriceTypeId?: string | null;
  searchSessionId?: string | null;
}

const DEDUP_WINDOW_MS = 30_000;
const recent = new Map<string, number>();

function makeKey(a: TrackArgs): string {
  return [
    a.productId,
    a.eventType,
    a.source,
    a.salePriceTypeId ?? "_",
    a.searchSessionId ?? "_",
  ].join("|");
}

function gc() {
  const now = Date.now();
  for (const [k, t] of recent) {
    if (now - t > DEDUP_WINDOW_MS) recent.delete(k);
  }
}

export function trackProductInteraction(args: TrackArgs): void {
  if (!args.productId || !args.eventType || !args.source) return;
  const key = makeKey(args);
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return;
  recent.set(key, now);
  if (recent.size > 200) gc();

  // Fire and forget — never await, never throw.
  void (async () => {
    try {
      await trackProductInteractionFn({
        data: {
          product_id: args.productId,
          event_type: args.eventType,
          source: args.source,
          sale_price_type_id: args.salePriceTypeId ?? null,
          search_session_id: args.searchSessionId ?? null,
        },
      });
    } catch {
      // Tracking failures must never affect the user experience.
    }
  })();
}
