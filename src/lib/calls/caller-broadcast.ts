/**
 * Cross-tab Caller ID sync via BroadcastChannel (B2).
 * Channel: afrakala-caller-id
 *
 * Tabs share dismissed/opened sets. First tab to claim a call key is primary
 * (shows toast / may play sound); followers mark the key as seen only.
 */

export const CALLER_ID_CHANNEL = "afrakala-caller-id";

export type CallerBroadcastMessage =
  | { type: "dismiss"; key: string; tabId: string }
  | { type: "open"; key: string; tabId: string }
  | { type: "claim"; key: string; tabId: string }
  | { type: "shown"; key: string; tabId: string };

export function createCallerTabId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export type CallerBroadcastHandle = {
  tabId: string;
  post: (msg: CallerBroadcastMessage) => void;
  close: () => void;
};

/**
 * Open BroadcastChannel if available (browser). Returns null in SSR / unsupported.
 */
export function openCallerBroadcast(
  onMessage: (msg: CallerBroadcastMessage) => void,
): CallerBroadcastHandle | null {
  if (typeof BroadcastChannel === "undefined") return null;

  const tabId = createCallerTabId();
  const channel = new BroadcastChannel(CALLER_ID_CHANNEL);

  channel.onmessage = (ev: MessageEvent) => {
    const data = ev.data as CallerBroadcastMessage | null;
    if (!data || typeof data !== "object" || !("type" in data)) return;
    if (typeof (data as { key?: unknown }).key !== "string") return;
    if ((data as { tabId?: string }).tabId === tabId) return; // ignore echo
    onMessage(data);
  };

  return {
    tabId,
    post: (msg) => {
      try {
        channel.postMessage(msg);
      } catch {
        /* channel closed */
      }
    },
    close: () => {
      try {
        channel.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Elect whether this tab should present a new call card.
 * Returns true if we claim primary (no other tab already claimed/shown/dismissed).
 */
export function shouldPresentCallCard(options: {
  key: string;
  localShown: Set<string>;
  remoteClaimed: Set<string>;
  remoteDismissed: Set<string>;
}): boolean {
  const { key, localShown, remoteClaimed, remoteDismissed } = options;
  if (localShown.has(key)) return false;
  if (remoteDismissed.has(key)) return false;
  if (remoteClaimed.has(key)) return false;
  return true;
}
