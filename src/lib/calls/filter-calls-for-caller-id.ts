/**
 * Pure filter: which live/CDR calls a user should see in Caller ID cards.
 */
import type { CallerIdSettings } from "./caller-id-settings";

export type CallerIdFilterableCall = {
  direction: string;
  extension: string | null;
  /**
   * Customer's responsible profile id when known (after resolve).
   * Used only when settings.only_my_customers is true.
   */
  responsibleUserId?: string | null;
  /** true once person/customer lookup finished (unknown → null responsible). */
  customerResolved?: boolean;
};

export type FilterCallsOptions = {
  /** Required when only_my_customers is on. */
  currentUserId?: string | null;
};

export function filterCallsForCallerId<T extends CallerIdFilterableCall>(
  calls: T[],
  settings: CallerIdSettings,
  myExtensions: string[],
  options: FilterCallsOptions = {},
): T[] {
  if (!settings.enabled) return [];

  const mine = new Set(
    myExtensions.map((e) => e.trim()).filter(Boolean),
  );
  const currentUserId = options.currentUserId ?? null;

  return calls.filter((call) => {
    const direction = (call.direction || "").toLowerCase();
    const isOutbound = direction === "outbound";
    const isInbound = !isOutbound; // treat unknown/internal as inbound for popup
    const ext = call.extension?.trim() ?? "";

    if (settings.only_my_extension) {
      if (!ext || !mine.has(ext)) return false;
    }

    if (isInbound) {
      if (!settings.show_inbound) return false;
    } else {
      if (!settings.show_outbound) return false;
      if (!settings.only_my_extension) {
        if (ext && mine.has(ext)) {
          /* own outbound ok */
        } else if (!settings.show_others_outbound) {
          return false;
        }
      }
    }

    if (settings.only_my_customers) {
      if (!currentUserId) return false;
      // Skip until resolve attaches responsible — caller re-filters after resolve.
      if (!call.customerResolved) return true;
      if (!call.responsibleUserId) return false;
      if (call.responsibleUserId !== currentUserId) return false;
    }

    return true;
  });
}

/**
 * Post-resolve gate for only_my_customers (B3).
 */
export function passesOnlyMyCustomers(
  settings: CallerIdSettings,
  currentUserId: string | null | undefined,
  responsibleUserId: string | null | undefined,
): boolean {
  if (!settings.only_my_customers) return true;
  if (!currentUserId) return false;
  return responsibleUserId === currentUserId;
}
