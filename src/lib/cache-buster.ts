import { BUILD_TAG } from "./build-info";

const STORAGE_KEY = "afrakala:build-tag";
const RELOAD_FLAG = "afrakala:cache-buster:reloading";
const RELOAD_COUNT_KEY = "afrakala:cache-buster:count";
const MAX_RELOADS = 2;

/**
 * Pattern for chunk/module loading errors that indicate the user has stale
 * cached JS referencing files that no longer exist on the server (typical
 * after a new deployment).
 */
const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Loading CSS chunk/i,
  /Unable to preload CSS/i,
  /Failed to load module script/i,
  /MIME type \("text\/html"\)/i,
];

function isStaleChunkError(message: string | undefined | null): boolean {
  if (!message) return false;
  return STALE_CHUNK_PATTERNS.some((rx) => rx.test(message));
}

async function clearAllCaches() {
  // Clear browser Cache Storage (PWA / SW caches)
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* noop */
  }
  // Unregister service workers
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* noop */
  }
}

function bumpReloadCounter(): number {
  try {
    const cur = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0") || 0;
    const next = cur + 1;
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

function resetReloadCounter() {
  try {
    sessionStorage.removeItem(RELOAD_COUNT_KEY);
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* noop */
  }
}

let triggered = false;

/**
 * Forcefully clear caches and hard-reload the page with a cache-busting
 * query parameter. Guards against infinite reload loops.
 */
export async function forceHardReload(reason: string) {
  if (triggered) return;
  triggered = true;

  const count = bumpReloadCounter();
  if (count > MAX_RELOADS) {
    // Give up — likely a real error, not a cache problem
    console.error(
      `[cache-buster] Reached max reloads (${MAX_RELOADS}). Aborting auto-refresh.`,
      reason,
    );
    return;
  }

  console.warn(`[cache-buster] Hard reloading (attempt ${count}): ${reason}`);
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    /* noop */
  }

  await clearAllCaches();

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_cb", Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/**
 * Initialize the cache-buster:
 * 1. Compare stored BUILD_TAG with the current bundle. On mismatch, clear
 *    caches silently (no reload — we already loaded the new code).
 * 2. Listen for chunk-load / dynamic-import errors and trigger a hard
 *    reload to fetch fresh assets.
 */
export function initCacheBuster() {
  if (typeof window === "undefined") return;

  // 1) Detect new build → clear caches + reset reload counter
  try {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev !== BUILD_TAG) {
      localStorage.setItem(STORAGE_KEY, BUILD_TAG);
      // New build successfully loaded → reset any prior failure counter
      resetReloadCounter();
      if (prev) {
        // Async cache clear; ok to fire-and-forget
        void clearAllCaches();
        console.info(`[cache-buster] New build detected (${prev} → ${BUILD_TAG}), caches cleared.`);
      }
    } else {
      // Same build loaded successfully → clear stale reload flag
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
        resetReloadCounter();
      }
    }
  } catch {
    /* noop */
  }

  // 2) Listen for stale-chunk errors
  const onError = (event: ErrorEvent) => {
    const msg = event?.message ?? event?.error?.message;
    if (isStaleChunkError(msg)) {
      void forceHardReload(`window.error: ${msg}`);
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const msg = typeof reason === "string" ? reason : (reason?.message ?? String(reason ?? ""));
    if (isStaleChunkError(msg)) {
      void forceHardReload(`unhandledrejection: ${msg}`);
    }
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}
