/* eslint-disable no-undef */
/**
 * AfraKala service worker — Phase 8.2 (D8-7).
 *
 * ─── THE DESIGN PROBLEM, AND THE ANSWER ────────────────────────────────────
 * The audit's risk table lists stale-cache as a real hazard, and
 * src/lib/cache-buster.ts exists precisely because users were left holding a
 * stale JS graph after a deploy. A service worker that caches HTML would
 * RE-CREATE that failure and make it permanent (reload → same stale HTML →
 * reload → cache-buster gives up after 2 attempts → user is stuck).
 *
 * So this worker is built around one structural guarantee:
 *
 *     IT NEVER CACHES AN HTML DOCUMENT, AN API RESPONSE, OR ANY CROSS-ORIGIN
 *     REQUEST. It only ever caches URLs whose content cannot change without
 *     the URL changing too.
 *
 * Concretely, `fetch` is intercepted for exactly three same-origin GET prefixes:
 *   /assets/  — Vite build output, content-hashed filenames. `.output/public/_headers`
 *               already declares them `immutable, max-age=31536000`. A hashed URL
 *               either resolves to the same bytes forever or is never requested.
 *   /fonts/   — the local Vazirmatn files (self-host rule 13).
 *   /icons/   — the PWA icon set.
 *
 * Every other request — navigations included — is not intercepted at all: no
 * `respondWith`, so the browser behaves exactly as if no worker were installed.
 * That is why installing this worker cannot make the app serve an old build:
 * the HTML that names the current chunk hashes always comes from the server.
 *
 * ─── UPDATE STRATEGY ───────────────────────────────────────────────────────
 * This worker does NOT call skipWaiting() on its own. A new version installs,
 * then WAITS. The page (src/lib/pwa/register-sw.ts) notices the waiting worker
 * and shows «نسخهٔ جدید در دسترس است» with an update button; only when the user
 * accepts does the page post SKIP_WAITING and reload. The client also calls
 * registration.update() periodically and when the tab regains focus, so an
 * idle open tab learns about a deploy within a bounded window rather than
 * waiting for the user to reload.
 *
 * Auto-skipWaiting was rejected deliberately: swapping the active worker under
 * a page that is mid-form (a proforma with unsaved lines) buys nothing here,
 * because the worker serves no HTML — the user would gain nothing and could
 * lose input on the reload.
 *
 * Offline operation is intentionally NOT implemented (owner decision 50).
 *
 * ─── VERSIONING ────────────────────────────────────────────────────────────
 * The client registers `/sw.js?v=<BUILD_ID>`. Two consequences, both wanted:
 *  1. The script URL changes every build, so the browser reliably runs an
 *     update check even though this file's bytes rarely change.
 *  2. The cache name is derived from that same `v`, so each build gets its own
 *     cache and `activate` deletes every other one.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `afrakala-static-${VERSION}`;
const CACHE_PREFIX = "afrakala-static-";

/** Same-origin path prefixes whose contents are immutable for a given URL. */
const CACHEABLE_PREFIXES = ["/assets/", "/fonts/", "/icons/"];

self.addEventListener("install", () => {
  // Nothing is pre-cached. Pre-caching would make installation fail whenever a
  // single listed URL 404s, and would download the whole asset graph for
  // routes the user may never open. Assets enter the cache as they are used.
  // skipWaiting() is deliberately absent — see the update strategy above.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isCacheable(request) {
  if (request.method !== "GET") return false;
  // Range requests must not be served from a whole-body cache entry.
  if (request.headers.has("range")) return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  if (url.origin !== self.location.origin) return false;
  if (url.search) return false; // a query string means it is not a plain static asset
  return CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  if (!isCacheable(event.request)) return; // no respondWith → default browser behaviour

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(event.request);
      if (hit) return hit;

      // Cache miss → network, and store only a genuinely successful response.
      // An opaque or error response is passed through but never persisted,
      // otherwise a transient 502 would be pinned for the life of the build.
      const response = await fetch(event.request);
      if (response && response.status === 200 && response.type === "basic") {
        cache.put(event.request, response.clone());
      }
      return response;
    })(),
  );
});
