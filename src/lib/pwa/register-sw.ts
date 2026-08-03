import { toast } from "sonner";
import { clientBuildId, fetchServerBuildId, isDifferentBuild } from "./build-version";

/**
 * Service worker registration + "a new build is deployed" prompt — Phase 8.2 (D8-7).
 *
 * Pairs with public/sw.js (why the worker caches only immutable assets and
 * never HTML) and build-version.ts (why deploy detection is an HTTP poll and
 * not registration.update()).
 *
 * ─── THE UPDATE STRATEGY, STATED PLAINLY ───────────────────────────────────
 * Requirement 8.2: "after a deploy, a user must NOT sit on the old build for
 * long." Two independent mechanisms, because they cover different failures:
 *
 *  1. DEPLOY POLL (primary, works over http and https alike).
 *     Every 15 minutes, and whenever the tab regains focus, ask /api/version
 *     which build the server is serving. If it differs from the build baked
 *     into this tab's JavaScript, show a persistent Persian toast offering a
 *     reload. Worst case a user sits on an old build for 15 minutes while
 *     staring at the tab; in practice, switching away and back detects it at
 *     once. This is the mechanism that actually satisfies the requirement.
 *
 *  2. SERVICE WORKER WAITING (secondary, https only).
 *     A new worker installs and waits rather than calling skipWaiting() on its
 *     own. If one is waiting, the same toast is offered; accepting posts
 *     SKIP_WAITING and reloads on controllerchange. This keeps the asset cache
 *     from lingering a version behind.
 *
 * The reload is always the USER'S click, never automatic. A silent reload
 * would discard a half-filled proforma, and the worker serves no HTML, so
 * there is nothing to be gained by forcing it.
 */

const SW_URL = "/sw.js";
/** Bounded staleness for an idle open tab. */
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** Don't re-check on every tab focus; a returning user checks at most this often. */
const FOCUS_CHECK_THROTTLE_MS = 5 * 60 * 1000;

let started = false;
let lastCheckedAt = 0;
let promptShown = false;

export function isPwaRuntimeSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && window.isSecureContext === true
  );
}

/**
 * Show the update offer. `onAccept` differs per mechanism: the service worker
 * path has to hand control to the waiting worker first, the deploy-poll path
 * can just reload.
 */
function promptForUpdate(onAccept: () => void) {
  if (promptShown) return;
  promptShown = true;

  toast("نسخهٔ جدید در دسترس است", {
    description: "برای استفاده از آخرین نسخه، صفحه یک‌بار بارگذاری می‌شود.",
    duration: Infinity,
    action: {
      label: "به‌روزرسانی",
      onClick: onAccept,
    },
    cancel: {
      label: "بعداً",
      onClick: () => {
        // Let the prompt return on a later check rather than suppressing it
        // for the life of the tab — the user postponed, they did not opt out.
        promptShown = false;
      },
    },
  });
}

/**
 * Reload exactly once, when the newly-activated worker takes control. Guarded,
 * because `controllerchange` can fire more than once and a reload loop here
 * would look exactly like the stale-chunk failure this design exists to avoid.
 */
function reloadOnControllerChange() {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function watchForWaitingWorker(registration: ServiceWorkerRegistration) {
  const offer = (worker: ServiceWorker) =>
    promptForUpdate(() => worker.postMessage({ type: "SKIP_WAITING" }));

  // An update may already be waiting from a previous visit.
  if (registration.waiting && navigator.serviceWorker.controller) {
    offer(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      // `controller` is null on the very first install. Prompting then would
      // ask the user to reload for the version they are already running.
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        offer(installing);
      }
    });
  });
}

/**
 * The primary detector. Runs regardless of whether a service worker exists, so
 * the plain-http LAN deployment is covered too.
 */
function startDeployPoll() {
  const client = clientBuildId();
  if (!client) {
    // No build identity was baked in (npm run dev, or a build without
    // GIT_SHA/BUILD_TIME). There is nothing meaningful to compare against, and
    // guessing would produce a toast on every page load.
    console.debug("[pwa] No client build id — deploy detection disabled for this build.");
    return;
  }

  const check = async () => {
    const now = Date.now();
    if (now - lastCheckedAt < FOCUS_CHECK_THROTTLE_MS) return;
    lastCheckedAt = now;

    const server = await fetchServerBuildId();
    if (isDifferentBuild(client, server)) {
      promptForUpdate(() => window.location.reload());
    }
  };

  window.setInterval(() => {
    lastCheckedAt = 0; // the interval IS the deadline; never throttled away
    void check();
  }, UPDATE_CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
}

export function registerServiceWorker(): void {
  if (started) return;
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return;

  started = true;
  lastCheckedAt = Date.now();

  // Deploy detection first — it does not depend on service workers at all and
  // is the half that works on today's http LAN deployment.
  startDeployPoll();

  if (!("serviceWorker" in navigator)) {
    console.debug("[pwa] Service workers are not supported by this browser.");
    return;
  }

  // Service workers are unavailable over plain http on a LAN IP. That is
  // browser policy, not a bug, and requirement 8.3 asks for it to be handled
  // with no console errors and no broken install button.
  if (!window.isSecureContext) {
    console.debug(
      "[pwa] Not a secure context (plain http) — service worker registration skipped. " +
        "Expected on the LAN deployment; see docs/deployment/https-readiness.md.",
    );
    return;
  }

  const build = clientBuildId() || "dev";
  // The `?v=` gives each build its own script URL, so a freshly loaded client
  // installs a new worker (and the worker gets a per-build cache name) instead
  // of silently adopting the previous build's worker.
  const url = `${SW_URL}?v=${encodeURIComponent(build)}`;

  navigator.serviceWorker
    .register(url, { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      reloadOnControllerChange();
      watchForWaitingWorker(registration);
      console.debug(`[pwa] Service worker registered (build ${build}).`);
    })
    .catch((error) => {
      // A failed registration must never break the app: the worker only ever
      // caches static assets, so without it everything still works.
      console.warn("[pwa] Service worker registration failed:", error);
    });
}
