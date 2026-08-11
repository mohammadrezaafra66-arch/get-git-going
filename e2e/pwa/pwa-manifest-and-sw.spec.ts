import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 8 (D8-7) — PWA verification against the deployed build.
 *
 *   npx playwright test --config=playwright.pwa.config.ts
 *   PWA_BASE_URL=https://app.example  overrides the target origin.
 *
 * The suite adapts to whatever origin it is pointed at, so one file covers both
 * halves of requirement 8.3 without a flag or a second project:
 *   - over plain http  → the "degrades cleanly" test runs; the service worker
 *                        tests skip, because a worker legitimately cannot exist.
 *   - over https       → the service worker tests run; the http test skips.
 * Manifest, icon and deploy-detection tests run on either origin.
 */

/**
 * Console noise that predates this phase and is not a PWA defect. The
 * requirement is "no console errors" caused by the PWA work — asserting on a
 * literal zero would just pin an unrelated pre-existing log.
 */
const PREEXISTING_CONSOLE_NOISE = [/\[auth-diagnostic\]/, /\[cache-buster\]/];

function isPwaRelevantError(text: string): boolean {
  return !PREEXISTING_CONSOLE_NOISE.some((rx) => rx.test(text));
}

/**
 * Skip — never silently pass — when the origin is not actually a secure context.
 *
 * The intent was to grant the LAN origin secure-context status with Chromium's
 * `--unsafely-treat-insecure-origin-as-secure`, launched through a persistent
 * context so Chrome would honour it. Measured result: `window.isSecureContext`
 * stays FALSE in Playwright's bundled Chromium, so the flag does not take
 * effect and the worker cannot register.
 *
 * These assertions are therefore NOT claimed as passing. They are real tests
 * that will execute unchanged the moment the app is served over HTTPS
 * (docs/deployment/https-readiness.md). Until then the service worker's runtime
 * behaviour is an owner-verified step, and the report says so.
 */
async function skipUnlessSecureContext(page: Page) {
  const secure = await page.evaluate(() => window.isSecureContext);
  test.skip(
    !secure,
    "origin is not a secure context — a service worker cannot register. " +
      "Re-run against HTTPS; see docs/deployment/https-readiness.md.",
  );
}

async function waitForServiceWorker(page: Page, timeoutMs = 25_000) {
  await page.waitForFunction(
    () =>
      navigator.serviceWorker
        .getRegistration("/")
        .then((reg) => Boolean(reg && (reg.active || reg.waiting || reg.installing))),
    undefined,
    { timeout: timeoutMs },
  );
}

/**
 * Force a deploy check to actually run.
 *
 * Dispatching `visibilitychange` alone is NOT enough, and that is correct
 * behaviour rather than a bug: the app throttles focus-triggered checks to one
 * per 5 minutes, and the clock starts at page load — a tab that was just loaded
 * has demonstrably current code, so re-asking the server two seconds later
 * would be pure noise.
 *
 * So the test advances a fake clock past the 15-minute interval, which is the
 * path that is guaranteed to fire and which resets the throttle. This exercises
 * the real timer the design relies on, not a test-only shortcut.
 */
async function forceDeployCheck(page: Page) {
  await page.clock.fastForward("16:00");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("Phase 8.1 — manifest and icons", () => {
  test("manifest is valid, RTL/Persian, and every icon it names resolves", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");

    const manifest = JSON.parse(await res.text());

    expect(manifest.name).toBe("دستیار هوشمند افراکالا");
    expect(manifest.short_name).toBe("افراکالا");
    expect(manifest.lang).toBe("fa-IR");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.theme_color).toBe("#007d7e");
    expect(manifest.background_color).toBe("#f8fdfd");

    // Installability needs a 192 and a 512, plus a maskable set — without
    // maskable, Android crops the icon inside its own circle.
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    const maskable = manifest.icons.filter((i: { purpose: string }) => i.purpose === "maskable");
    expect(maskable.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );

    // No 404s anywhere the manifest points, shortcuts included.
    const referenced = new Set<string>(manifest.icons.map((i: { src: string }) => i.src));
    for (const shortcut of manifest.shortcuts ?? []) {
      for (const icon of shortcut.icons ?? []) referenced.add(icon.src);
    }
    for (const src of referenced) {
      const iconRes = await request.get(src);
      expect(iconRes.status(), `icon ${src}`).toBe(200);
      expect(iconRes.headers()["content-type"], `icon ${src}`).toContain("image/");
    }
  });

  test("every shortcut target is a real route, not a 404", async ({ request }) => {
    // A shortcut pointing at a removed route is invisible until a user long-
    // presses the installed icon, so assert it here instead.
    const manifest = JSON.parse(await (await request.get("/manifest.webmanifest")).text());
    for (const shortcut of manifest.shortcuts ?? []) {
      const res = await request.get(shortcut.url);
      // Signed out these redirect to /login; what must never happen is a 404.
      expect([200, 301, 302, 307, 308], `shortcut ${shortcut.url}`).toContain(res.status());
    }
  });

  test("the document head links the manifest and icons, and each resolves", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel="manifest"], link[rel*="icon"]')).map(
        (el) => ({
          rel: el.getAttribute("rel"),
          href: el.getAttribute("href"),
        }),
      ),
    );

    expect(links.some((l) => l.rel === "manifest")).toBe(true);
    expect(links.some((l) => l.rel === "apple-touch-icon")).toBe(true);

    for (const { rel, href } of links) {
      const res = await request.get(href!);
      expect(res.status(), `${rel} -> ${href}`).toBe(200);
    }

    expect(await page.getAttribute('meta[name="theme-color"]', "content")).toBe("#007d7e");
  });
});

test.describe("Phase 8.2 — service worker (https only)", () => {
  test("registers, with no PWA-related console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && isPwaRelevantError(msg.text())) errors.push(msg.text());
    });

    await page.goto("/");
    await skipUnlessSecureContext(page);

    await waitForServiceWorker(page);

    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const worker = reg?.active ?? reg?.waiting ?? reg?.installing;
      return { scope: reg?.scope, scriptURL: worker?.scriptURL };
    });

    expect(state.scope).toBe(new URL("/", page.url()).toString());
    // The `?v=` is what gives each build a distinct script URL.
    expect(state.scriptURL).toContain("/sw.js?v=");

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("caches immutable assets but NEVER an HTML document or an API response", async ({
    page,
  }) => {
    await page.goto("/");
    await skipUnlessSecureContext(page);
    await waitForServiceWorker(page);
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Reload so the activated worker's fetch handler actually sees the assets.
    await page.reload();
    await page.waitForLoadState("networkidle");

    const cached: string[] = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) out.push(new URL(req.url).pathname);
      }
      return out;
    });

    // The structural guarantee the whole design rests on. If an HTML document
    // could land in this cache, a deploy could strand a client on a stale build
    // and cache-buster.ts would loop until it gave up.
    const forbidden = cached.filter(
      (p) => p === "/" || p.startsWith("/api/") || p.startsWith("/_serverFn"),
    );
    expect(forbidden, `must never be cached: ${forbidden.join(", ")}`).toHaveLength(0);

    const allowed = ["/assets/", "/fonts/", "/icons/"];
    for (const path of cached) {
      expect(
        allowed.some((prefix) => path.startsWith(prefix)),
        `unexpected cached path: ${path}`,
      ).toBe(true);
    }

    // ...and it must actually be caching, not passing everything through.
    expect(cached.some((p) => p.startsWith("/assets/"))).toBe(true);
  });

  test("the cache is scoped to one build, so a deploy cannot inherit stale assets", async ({
    page,
  }) => {
    await page.goto("/");
    await skipUnlessSecureContext(page);
    await waitForServiceWorker(page);
    await page.evaluate(() => navigator.serviceWorker.ready);

    const names: string[] = await page.evaluate(() => caches.keys());
    const ours = names.filter((n) => n.startsWith("afrakala-static-"));
    expect(ours.length, `expected one build cache, got: ${names.join(", ")}`).toBe(1);
    expect(ours[0], "the deployed build must carry a real build id").not.toBe(
      "afrakala-static-dev",
    );
  });
});

test.describe("Phase 8.2 — deploy detection", () => {
  // Deliberately NOT gated on the secure project: this is the half that has to
  // work on today's plain-http LAN deployment, where there is no worker at all.

  test("offers the update when the server reports a different build", async ({ page }) => {
    await page.route("**/api/version", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, commit: "deadbee", buildTime: "2099-01-01T00:00:00" }),
      }),
    );

    await page.clock.install();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await forceDeployCheck(page);

    await expect(page.getByText("نسخهٔ جدید در دسترس است", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "به‌روزرسانی", exact: true })).toBeVisible();
  });

  test("stays silent when the server reports the SAME build", async ({ page }) => {
    // A toast that cries wolf is worse than no toast. Read the build id the
    // deployed server actually reports and echo it straight back.
    const real = await (await page.request.get("/api/version")).json();
    expect(real.commit, "the deployed build must report a real commit").not.toBe("unknown");

    await page.route("**/api/version", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(real),
      }),
    );

    await page.clock.install();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await forceDeployCheck(page);

    await page.waitForTimeout(4_000);
    await expect(page.getByText("نسخهٔ جدید در دسترس است")).toHaveCount(0);
  });

  test("stays silent when /api/version is unreachable", async ({ page }) => {
    await page.route("**/api/version", (route) => route.abort());

    await page.clock.install();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await forceDeployCheck(page);

    await page.waitForTimeout(4_000);
    await expect(page.getByText("نسخهٔ جدید در دسترس است")).toHaveCount(0);
  });
});

test.describe("Phase 8.3 — plain http degrades cleanly", () => {
  test("no service worker, no console error, no dead install button", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && isPwaRelevantError(msg.text())) errors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Mirror image of skipUnlessSecureContext: this test only means something
    // on a NON-secure origin. Pointed at https it skips rather than failing.
    const secure = await page.evaluate(() => window.isSecureContext);
    test.skip(secure, "origin IS secure — the http-degradation path does not apply here.");

    const registrations = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return 0;
      return (await navigator.serviceWorker.getRegistrations()).length;
    });
    expect(registrations).toBe(0);

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
    expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toHaveLength(0);

    // The install button is gated on `beforeinstallprompt`, which no browser
    // fires over plain http — so there is no dead button to click.
    await expect(page.getByRole("button", { name: "نصب برنامه" })).toHaveCount(0);

    // The manifest and icons still ship; nothing is broken, it just cannot install.
    expect(await page.getAttribute('link[rel="manifest"]', "href")).toBe("/manifest.webmanifest");
  });
});
