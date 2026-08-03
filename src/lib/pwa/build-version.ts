/**
 * Deploy detection — Phase 8.2 (D8-7).
 *
 * ─── WHY THIS EXISTS SEPARATELY FROM THE SERVICE WORKER ────────────────────
 * The obvious design — "let registration.update() notice the new build" — does
 * NOT work here, and the failure is silent, so it is worth stating plainly.
 *
 * `registration.update()` re-fetches the registration's own script URL and
 * byte-compares it. public/sw.js is a static file whose contents do not change
 * between deploys; only the `?v=` we register it under does. A tab that
 * registered `/sw.js?v=A` keeps re-fetching exactly that URL, gets identical
 * bytes every time, and concludes there is no update — forever. The service
 * worker lifecycle can only tell a tab about a new build at the moment the tab
 * loads new JavaScript, which is precisely the thing we are trying to trigger.
 *
 * So deploy detection is done over HTTP instead, against the existing
 * GET /api/version endpoint (src/routes/api.version.ts), which already reports
 * APP_GIT_SHA / APP_BUILD_TIME with `cache-control: no-store`.
 *
 * This has a second benefit that matters more than the PWA itself: it works
 * over plain http. The LAN deployment at http://192.168.170.8:3100 has no
 * service worker at all and never will until HTTPS is in place — but it gets
 * "you are running an old build" detection today.
 */

/**
 * Compose a build id from the two pieces of build metadata.
 *
 * ⚠️ This MUST stay byte-identical to the `buildId` expression in
 * vite.config.ts. The client's id is computed there at build time from
 * GIT_SHA/BUILD_TIME; the server's is computed here at runtime from the same
 * two values returned by /api/version. If the two expressions drift, every
 * client would think every server is a different build and the update toast
 * would never stop appearing.
 *
 * Returns "" when the inputs carry no real build identity, which callers must
 * treat as "unknown — do not compare".
 */
export function composeBuildId(
  gitSha: string | null | undefined,
  buildTime: string | null | undefined,
): string {
  return [gitSha, buildTime]
    .filter((v) => v && v !== "local-unknown" && v !== "unknown")
    .join("-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 64);
}

/** The build id baked into the JavaScript currently running in this tab. */
export function clientBuildId(): string {
  const raw = (import.meta.env as { VITE_BUILD_ID?: string }).VITE_BUILD_ID;
  if (typeof raw !== "string" || raw.length === 0 || raw === "dev") return "";
  return raw;
}

interface VersionResponse {
  commit?: string;
  buildTime?: string;
}

/**
 * Ask the server which build it is serving.
 *
 * Returns "" on any failure — a network blip, an offline laptop, a 503 while
 * the container restarts. "Unknown" must never be reported as "changed",
 * because a toast that fires on every hiccup trains users to ignore it.
 */
export async function fetchServerBuildId(signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch("/api/version", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) return "";
    const body = (await response.json()) as VersionResponse;
    return composeBuildId(body.commit, body.buildTime);
  } catch {
    return "";
  }
}

/**
 * True when the server is demonstrably serving a different build than this tab
 * is running. Deliberately false whenever either side is unknown.
 */
export function isDifferentBuild(client: string, server: string): boolean {
  if (!client || !server) return false;
  return client !== server;
}
