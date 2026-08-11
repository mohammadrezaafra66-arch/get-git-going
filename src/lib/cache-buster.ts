import { BUILD_TAG } from "./build-info";

const STORAGE_KEY = "afrakala:build-tag";
const RELOAD_FLAG = "afrakala:cache-buster:reloading";
const RELOAD_COUNT_KEY = "afrakala:cache-buster:count";
const DEV_IMPORT_ERROR_COUNT_KEY = "afrakala:cache-buster:dev-import-count";
const DEV_IMPORT_NOTICE_ID = "afrakala-dev-import-recovery";
const MAX_RELOADS = 2;
const MAX_DEV_IMPORT_ERRORS = 2;

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

/**
 * Patterns that indicate the failing module URL belongs to the Vite dev
 * server itself (virtual modules, /@id/, /@vite/, /@fs/, optimized deps).
 * When the dev server restarts (HMR, .env change, sandbox restart), these
 * URLs temporarily 404 and the browser reports a dynamic-import failure —
 * but this is NOT a stale production chunk and MUST NOT trigger a hard
 * reload loop, because the dev server reconnects automatically and a
 * full page reload re-mounts the React tree (resetting auth/session
 * state to the "checking session…" screen indefinitely).
 */
const DEV_URL_PATTERNS = [/\/@id\//, /\/@vite\//, /\/@fs\//, /virtual:/, /node_modules\/\.vite\//];

function isDevModuleUrl(message: string | undefined | null): boolean {
  if (!message) return false;
  return DEV_URL_PATTERNS.some((rx) => rx.test(message));
}

function isDevMode(): boolean {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function isDevImportError(message: string | undefined | null): boolean {
  if (!message) return false;
  return isDevModuleUrl(message) && STALE_CHUNK_PATTERNS.some((rx) => rx.test(message));
}

function isStaleChunkError(message: string | undefined | null): boolean {
  if (!message) return false;
  // Dev-server transient failures are not stale chunks.
  if (isDevModuleUrl(message)) return false;
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
  // Unregister FOREIGN service workers only.
  //
  // Phase 8.2 (D8-7) added a deliberate service worker at /sw.js. It is safe to
  // keep here because it never caches an HTML document or an API response — see
  // the header of public/sw.js — so it structurally cannot be the cause of a
  // stale chunk. Tearing it down on every chunk error would unregister and
  // immediately re-register it on the next load, for no benefit.
  //
  // The original intent of this loop is preserved: any OTHER worker — a legacy
  // registration from an earlier build, or one left behind by a different app
  // previously served from this origin — is still removed, because such a
  // worker really can serve stale content and we know nothing about it.
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.filter((r) => !isOwnServiceWorker(r)).map((r) => r.unregister()));
    }
  } catch {
    /* noop */
  }
}

/** True when the registration's script is this app's own /sw.js (any ?v=). */
function isOwnServiceWorker(registration: ServiceWorkerRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;
  try {
    return new URL(worker.scriptURL).pathname === "/sw.js";
  } catch {
    return false;
  }
}

function bumpReloadCounter(): number {
  return bumpSessionCounter(RELOAD_COUNT_KEY);
}

function bumpSessionCounter(key: string): number {
  try {
    const cur = Number(sessionStorage.getItem(key) ?? "0") || 0;
    const next = cur + 1;
    sessionStorage.setItem(key, String(next));
    return next;
  } catch {
    return 0;
  }
}

function resetTransientErrorCounters() {
  try {
    sessionStorage.removeItem(RELOAD_COUNT_KEY);
    sessionStorage.removeItem(RELOAD_FLAG);
    sessionStorage.removeItem(DEV_IMPORT_ERROR_COUNT_KEY);
  } catch {
    /* noop */
  }
}

function showDevImportRecoveryNotice(reason: string) {
  if (typeof document === "undefined" || document.getElementById(DEV_IMPORT_NOTICE_ID)) return;

  const notice = document.createElement("div");
  notice.id = DEV_IMPORT_NOTICE_ID;
  notice.dir = "rtl";
  notice.setAttribute("role", "alert");
  notice.style.cssText = [
    "position:fixed",
    "inset-inline:16px",
    "bottom:16px",
    "z-index:2147483647",
    "max-width:520px",
    "margin-inline:auto",
    "border:1px solid var(--border, #e2e8f0)",
    "border-radius:8px",
    "background:var(--background, #ffffff)",
    "color:var(--foreground, #0f172a)",
    "box-shadow:0 16px 40px rgba(15,23,42,.18)",
    "padding:16px",
    "font:14px/1.8 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "بارگذاری پیش‌نمایش کامل نشد";
  title.style.cssText = "font-weight:700;margin-bottom:6px";

  const body = document.createElement("div");
  body.textContent =
    "ماژول داخلی محیط توسعه موقتاً در دسترس نیست. چند ثانیه صبر کنید؛ اگر صفحه برنگشت، یک‌بار تازه‌سازی کنید.";
  body.style.cssText = "color:var(--muted-foreground, #64748b);margin-bottom:12px";

  const detail = document.createElement("pre");
  detail.textContent = reason;
  detail.dir = "ltr";
  detail.style.cssText =
    "max-height:80px;overflow:auto;white-space:pre-wrap;text-align:left;background:var(--muted, #f1f5f9);padding:8px;border-radius:6px;font-size:11px;margin:0 0 12px";

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "تازه‌سازی صفحه";
  refresh.style.cssText =
    "border:0;border-radius:6px;background:var(--primary, #0f172a);color:var(--primary-foreground, #f8fafc);padding:8px 12px;cursor:pointer";
  refresh.addEventListener("click", () => window.location.reload());

  notice.append(title, body, detail, refresh);
  document.body.appendChild(notice);
}

function handleDevImportError(reason: string) {
  const count = bumpSessionCounter(DEV_IMPORT_ERROR_COUNT_KEY);
  console.warn(`[cache-buster] Dev/preview import failed (attempt ${count}): ${reason}`);
  if (count >= MAX_DEV_IMPORT_ERRORS) {
    showDevImportRecoveryNotice(reason);
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

  // In dev, never auto-reload on chunk/import errors — the Vite dev server
  // restart cycle would loop the page and wipe in-memory auth/session
  // state, leaving the user stuck on the loading screen.
  if (isDevMode()) {
    console.warn(`[cache-buster] DEV mode — skipping hard reload: ${reason}`);
    triggered = false;
    return;
  }

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
      resetTransientErrorCounters();
      if (prev) {
        // Async cache clear; ok to fire-and-forget
        void clearAllCaches();
        console.info(`[cache-buster] New build detected (${prev} → ${BUILD_TAG}), caches cleared.`);
      }
    } else {
      // Same build loaded successfully → clear stale reload flag
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
        resetTransientErrorCounters();
      }
    }
  } catch {
    /* noop */
  }

  // 2) Listen for stale-chunk errors
  const onError = (event: ErrorEvent) => {
    const msg = event?.message ?? event?.error?.message;
    if (isDevImportError(msg)) {
      event.preventDefault();
      handleDevImportError(`window.error: ${msg}`);
      return;
    }
    if (isStaleChunkError(msg)) {
      void forceHardReload(`window.error: ${msg}`);
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const msg = typeof reason === "string" ? reason : (reason?.message ?? String(reason ?? ""));
    if (isDevImportError(msg)) {
      event.preventDefault();
      handleDevImportError(`unhandledrejection: ${msg}`);
      return;
    }
    if (isStaleChunkError(msg)) {
      void forceHardReload(`unhandledrejection: ${msg}`);
    }
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}
