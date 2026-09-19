/**
 * Pure filter: which live/CDR calls a user should see in Caller ID cards.
 */
import type { CallerIdSettings } from "./caller-id-settings";

export type CallerIdFilterableCall = {
  direction: string;
  extension: string | null;
};

export function filterCallsForCallerId<T extends CallerIdFilterableCall>(
  calls: T[],
  settings: CallerIdSettings,
  myExtensions: string[],
): T[] {
  if (!settings.enabled) return [];

  const mine = new Set(
    myExtensions.map((e) => e.trim()).filter(Boolean),
  );

  return calls.filter((call) => {
    const direction = (call.direction || "").toLowerCase();
    const isOutbound = direction === "outbound";
    const isInbound = !isOutbound; // treat unknown/internal as inbound for popup

    if (isInbound) {
      return settings.show_inbound;
    }

    if (!settings.show_outbound) return false;

    const ext = call.extension?.trim() ?? "";
    if (ext && mine.has(ext)) return true;
    if (settings.show_others_outbound) return true;
    return false;
  });
}
