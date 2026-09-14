// Visual regression — captures the same pages from one container. compare.mjs runs this
// twice: "before" (writes the baseline) and "after" (toHaveScreenshot against it).
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.VISREG_OUT!;
const SIDE = process.env.VISREG_SIDE!;
const BASE = process.env.VISREG_BASE_URL!;
const FROZEN_TIME = new Date(Number(process.env.VISREG_FROZEN_TIME));
const session = JSON.parse(fs.readFileSync(process.env.VISREG_SESSION!, "utf8"));
const readOnlyRpcs = new Set<string>(
  JSON.parse(fs.readFileSync(path.join(OUT, "readonly-rpcs.json"), "utf8")),
);

type PageSpec = { name: string; path: string; auth: boolean; ready: string; mask: string[] };

// Why these: /login is the one page anyone sees without a session; the other three are the
// authenticated pages people open all day — a KPI dashboard and the two largest lists.
// `ready` is a selector that exists only once the page is hydrated and its data is on screen.
// networkidle is NOT enough: /login was once captured with its pre-hydration button
// («در حال آماده‌سازی...»), which is stable for two frames and so passes toHaveScreenshot.
// `mask` lists selectors whose content legitimately changes between two captures of the
// same image (see README "Masking"). Empty means the self-comparison needed none.
const PAGES: PageSpec[] = [
  {
    name: "login",
    path: "/login",
    auth: false,
    ready: 'button[type="submit"][aria-busy="false"]',
    mask: [],
  },
  { name: "dashboard", path: "/dashboard", auth: true, ready: "h1", mask: [] },
  { name: "products", path: "/products", auth: true, ready: "table tbody tr", mask: [] },
  { name: "persons", path: "/persons", auth: true, ready: "table tbody tr", mask: [] },
];

const LOADING_TEXT = ["در حال آماده‌سازی", "در حال بارگذاری"];

const SUPABASE_PATH = /^\/(rest|auth|storage|realtime|functions|graphql)\/v1\//;

/**
 * Read-only guard. The database is shared and live, so the browser may only READ:
 * - Supabase paths: GET/HEAD, plus POST /rest/v1/rpc/<fn> for STABLE/IMMUTABLE functions
 *   (PostgREST runs those in a read-only transaction). Edge functions: never.
 * - The app container: GET/HEAD for pages and assets; /api only version/healthz;
 *   server functions never (they carry the user's token and can write).
 * Everything else is aborted and recorded.
 */
async function installGuard(page: Page, log: { hosts: Set<string>; blocked: string[] }) {
  const base = new URL(BASE).origin;
  await page.routeWebSocket(/.*/, (ws) => {
    log.blocked.push(`WS ${new URL(ws.url()).pathname}`);
    ws.close();
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const isRead = method === "GET" || method === "HEAD";
    const host = url.origin === base ? "<app>" : url.host;
    log.hosts.add(host);

    let allow: boolean;
    if (SUPABASE_PATH.test(url.pathname)) {
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
      allow = url.pathname.startsWith("/functions/")
        ? false
        : isRead || (method === "POST" && !!rpc && readOnlyRpcs.has(rpc[1]));
    } else if (url.origin === base) {
      allow =
        isRead &&
        !url.pathname.startsWith("/_serverFn") &&
        (!url.pathname.startsWith("/api/") || /^\/api\/(version|healthz)$/.test(url.pathname));
    } else {
      allow = isRead;
    }
    if (allow) return route.continue();
    log.blocked.push(`${method} ${host}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
}

for (const spec of PAGES) {
  test(spec.name, async ({ page }) => {
    const log = { hosts: new Set<string>(), blocked: [] as string[] };
    await installGuard(page, log);
    // Same wall clock in both runs: "today", greetings and relative times render identically.
    await page.clock.setFixedTime(FROZEN_TIME);
    if (spec.auth) {
      // Serve the minted session under whatever sb-<ref>-auth-token key the image asks for,
      // so an image with a different Supabase host still finds it.
      await page.addInitScript((sessionJson: string) => {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key: string) {
          const value = original.call(this, key);
          return value === null && /^sb-[^-]+-auth-token$/.test(key) ? sessionJson : value;
        };
      }, JSON.stringify(session.session));
    }

    try {
      await page.goto(BASE + spec.path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      // A failed session would silently capture /login on both sides and report "identical".
      if (spec.auth) await expect(page).toHaveURL(new RegExp(`${spec.path}(\\?|$)`));
      await page.locator(spec.ready).first().waitFor({ state: "visible", timeout: 30_000 });
      // Nothing may still be loading. A page stuck loading fails here, loudly, on both sides.
      await page.waitForFunction(
        (loading) =>
          !document.querySelector('[aria-busy="true"]') &&
          !loading.some((t) => document.body.innerText.includes(t)),
        LOADING_TEXT,
        { timeout: 30_000 },
      );

      const options = {
        fullPage: true,
        animations: "disabled" as const,
        caret: "hide" as const,
        scale: "css" as const,
        mask: spec.mask.map((selector) => page.locator(selector)),
        maskColor: "#FF00FF",
        maxDiffPixels: 0,
        timeout: 60_000,
      };
      if (SIDE === "before") {
        await expect(page).toHaveScreenshot(`${spec.name}.png`, options);
      } else {
        await expect.soft(page).toHaveScreenshot(`${spec.name}.png`, options);
        const { maxDiffPixels: _unused, timeout: _t, ...shotOptions } = options;
        await page.screenshot({
          ...shotOptions,
          path: path.join(OUT, "after", `${spec.name}.png`),
        });
      }
    } finally {
      fs.mkdirSync(path.join(OUT, "network"), { recursive: true });
      fs.writeFileSync(
        path.join(OUT, "network", `${SIDE}-${spec.name}.json`),
        JSON.stringify(
          { hosts: [...log.hosts].sort(), blocked: [...new Set(log.blocked)].sort() },
          null,
          2,
        ),
      );
    }
  });
}
