/**
 * F2 live acceptance — B2 (BroadcastChannel), B4 (draft switcher), B5 (deal_id link).
 *
 * Markers: [TEST-9FIX] titles/names, phones 09000000xxx, linkedid TEST9FIX-…
 * Auth: minted JWT for test.sales2@afrakala.local (mapped ext 403) — no password mutation [E-1].
 * Rings: real hook via docker exec inside afrakala-lan-web (token never printed).
 *
 * Run:
 *   cmd /c "…\playwright.cmd" test --config docs/missions/salesdesk-9-fixes/evidence/FIX/playwright.fix-f2.config.ts --workers=1
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { dbScalar } from "../helpers/db";
import { mintJwt } from "../helpers/pgrest";
import { authStorageKey } from "../helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";
const SALES2_EMAIL = "test.sales2@afrakala.local";
const EXT_PREFERRED = "403";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const FIX_DIR = path.join(
  repoRoot,
  "docs/missions/salesdesk-9-fixes/evidence/FIX",
);
const POST_RING = path.join(FIX_DIR, "f2-post-ring.mjs");
const SQL_HELPER = path.join(FIX_DIR, "f2-sql.mjs");

const MARKER = "[TEST-9FIX]";

function sales2StorageState() {
  const userId = dbScalar(
    `select id::text from auth.users where email = '${SALES2_EMAIL}'`,
  );
  expect(userId).toMatch(/^[0-9a-f-]{36}$/i);
  const ttlSeconds = 2 * 60 * 60;
  const accessToken = mintJwt(userId, ttlSeconds);
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ttlSeconds,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    refresh_token: "",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: SALES2_EMAIL,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  };
  return {
    cookies: [] as never[],
    origins: [
      {
        origin: BASE,
        localStorage: [
          { name: authStorageKey(SUPABASE), value: JSON.stringify(session) },
        ],
      },
    ],
  };
}

function runNode(script: string, args: string[] = []): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      AFRAKALA_LAN_ENV:
        process.env.AFRAKALA_LAN_ENV ??
        "D:\\AfraKalaTest\\app\\deploy\\lan\\.env.lan",
    },
  });
}

function postRing(opts: {
  phone: string;
  linkedid: string;
  ext?: string;
  probe: string;
}): { extension: string; linkedid: string; ok: boolean; http: number } {
  execFileSync("docker", ["cp", POST_RING, "afrakala-lan-web:/tmp/f2-post-ring.mjs"], {
    encoding: "utf8",
  });
  const envArgs = [
    "-e",
    "HOOK_BASE=http://127.0.0.1:3000",
    "-e",
    `PHONE=${opts.phone}`,
    "-e",
    `LINKEDID=${opts.linkedid}`,
    "-e",
    `PROBE=${opts.probe}`,
  ];
  if (opts.ext) {
    envArgs.push("-e", `EXT=${opts.ext}`);
  }
  const out = execFileSync(
    "docker",
    ["exec", ...envArgs, "afrakala-lan-web", "node", "/tmp/f2-post-ring.mjs"],
    { encoding: "utf8" },
  );
  const lines = out
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return { raw: l };
      }
    });
  const result = [...lines].reverse().find((j) => "http" in j) as
    | {
        extension?: string;
        linkedid?: string;
        ok?: boolean;
        http?: number;
      }
    | undefined;
  if (!result || result.http !== 200 || !result.ok) {
    throw new Error(`ring POST failed: ${out}`);
  }
  return {
    extension: String(result.extension),
    linkedid: String(result.linkedid ?? opts.linkedid),
    ok: true,
    http: 200,
  };
}

/** Card toast showing a phone (LTR digits). */
function cardWithPhone(page: Page, phone: string) {
  const fa = phone.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
  return page
    .locator("div.fixed.bottom-4.right-4")
    .locator("div.pointer-events-auto")
    .filter({ hasText: new RegExp(`${phone}|${fa}`) });
}

async function countCardsForPhone(
  pages: Page[],
  phone: string,
): Promise<number> {
  let n = 0;
  for (const p of pages) {
    n += await cardWithPhone(p, phone).count();
  }
  return n;
}

async function waitForSingleCard(
  pages: Page[],
  phone: string,
  timeoutMs = 25_000,
): Promise<void> {
  await expect
    .poll(async () => countCardsForPhone(pages, phone), {
      timeout: timeoutMs,
      intervals: [400, 600, 800],
    })
    .toBeGreaterThanOrEqual(1);

  // Settle BroadcastChannel claim election (~1–2 poll cycles)
  await pages[0]!.waitForTimeout(1500);

  const settled = await countCardsForPhone(pages, phone);
  expect(
    settled,
    `B2: after settle, exactly one notification card for ${phone} across tabs (got ${settled})`,
  ).toBe(1);
}

async function openCardWithPhone(page: Page, phone: string): Promise<void> {
  const card = cardWithPhone(page, phone).first();
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.locator("button").first().click();
  await expect(
    page
      .locator("#sd-note-body")
      .or(page.getByRole("button", { name: /ثبت شخص/ }))
      .first(),
  ).toBeVisible({ timeout: 10_000 });
}

async function quickAddPerson(
  page: Page,
  name: string,
  phone: string,
): Promise<void> {
  await page.getByRole("button", { name: /ثبت شخص/ }).click();
  const dialog = page.getByRole("dialog", { name: /معرفی شخص جدید/ });
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  await dialog.getByPlaceholder("نام و نام خانوادگی").fill(name);
  await dialog.getByPlaceholder("09xxxxxxxxx").fill(phone);
  await dialog.getByPlaceholder("مثلاً CUST-1024").fill(
    `T9F${Date.now().toString().slice(-6)}`,
  );
  await dialog.getByRole("button", { name: /^ثبت شخص$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 25_000 });
  await expect(page.getByText(/ابتدا «ثبت شخص»/)).toHaveCount(0, {
    timeout: 10_000,
  });
}

function seedPerson(name: string, phone: string): string {
  const out = execFileSync(
    process.execPath,
    [SQL_HELPER, "seed-person"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PERSON_NAME: name,
        PERSON_PHONE: phone,
        PERSON_CODE: `T9F${Date.now().toString().slice(-8)}`,
        AFRAKALA_LAN_ENV:
          process.env.AFRAKALA_LAN_ENV ??
          "D:\\AfraKalaTest\\app\\deploy\\lan\\.env.lan",
      },
    },
  );
  const line = out
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.includes("person_id"));
  const parsed = line ? (JSON.parse(line) as { person_id?: string }) : {};
  if (!parsed.person_id) throw new Error(`seed-person failed: ${out}`);
  return parsed.person_id;
}

async function ensureNoteForm(page: Page): Promise<void> {
  const noteTab = page.getByRole("tab", { name: /خلاصه تماس/ });
  if (await noteTab.count()) {
    await noteTab.click();
  }
  await expect(page.locator("#sd-note-body")).toBeVisible({ timeout: 10_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("F2 — caller popup B2/B4/B5", () => {
  test.use({ storageState: sales2StorageState() });

  test.beforeAll(() => {
    runNode(SQL_HELPER, ["settings-backup"]);
    runNode(SQL_HELPER, ["settings-enable"]);
  });

  test.afterAll(() => {
    try {
      runNode(SQL_HELPER, ["cleanup"]);
    } catch (e) {
      console.error("cleanup error", e);
    }
    try {
      runNode(SQL_HELPER, ["settings-restore"]);
    } catch (e) {
      console.error("settings-restore error", e);
    }
    const counts = runNode(SQL_HELPER, ["marker-counts"]);
    console.log("F2_MARKER_COUNTS", counts.trim());
  });

  test("B2 — cross-tab dismiss sync + single primary claim", async ({
    context,
  }) => {
    const phone = "09000000121";
    const linkedid = `TEST9FIX-B2-${Date.now()}`;

    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await pageA.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
    await pageB.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    const posted = postRing({
      phone,
      linkedid,
      ext: EXT_PREFERRED,
      probe: "B2",
    });
    expect(posted.ok).toBe(true);
    expect(
      Number(
        dbScalar(
          `SELECT count(*)::text FROM call_ring_events WHERE linkedid = '${linkedid}'`,
        ),
      ),
    ).toBeGreaterThanOrEqual(1);

    // May FAIL here if TOCTOU leaves two cards — product fault, do not patch.
    await waitForSingleCard([pageA, pageB], phone, 35_000);

    const owner =
      (await cardWithPhone(pageA, phone).count()) === 1 ? pageA : pageB;

    await cardWithPhone(owner, phone)
      .getByRole("button", { name: "بستن" })
      .click();

    await expect
      .poll(async () => countCardsForPhone([pageA, pageB], phone), {
        timeout: 8_000,
      })
      .toBe(0);

    // Open-sync on a fresh mount (avoids stale shown/claim sets after dismiss)
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    const linkedid2 = `TEST9FIX-B2O-${Date.now()}`;
    const phone2 = "09000000122";
    const posted2 = postRing({
      phone: phone2,
      linkedid: linkedid2,
      ext: EXT_PREFERRED,
      probe: "B2-open",
    });
    expect(posted2.ok).toBe(true);
    const ringCount2 = dbScalar(
      `SELECT count(*)::text FROM call_ring_events WHERE linkedid = '${linkedid2}'`,
    );
    expect(Number(ringCount2)).toBeGreaterThanOrEqual(1);

    await waitForSingleCard([pageA, pageB], phone2, 35_000);
    const owner2 =
      (await cardWithPhone(pageA, phone2).count()) === 1 ? pageA : pageB;
    const follower2 = owner2 === pageA ? pageB : pageA;
    await openCardWithPhone(owner2, phone2);
    await expect
      .poll(async () => countCardsForPhone([pageA, pageB], phone2), {
        timeout: 8_000,
      })
      .toBe(0);
    expect(await cardWithPhone(follower2, phone2).count()).toBe(0);
    await expect(owner2.getByRole("button", { name: /ثبت شخص/ })).toBeVisible();

    await pageA.close();
    await pageB.close();
  });

  test("B4 — draft survives switch; cleared on save", async ({ page }) => {
    const phoneA = "09000000131";
    const phoneB = "09000000132";
    const draftText = `${MARKER} B4 draft note ${Date.now()}`;
    const nameA = `${MARKER} B4 Person A`;
    const nameB = `${MARKER} B4 Person B`;

    seedPerson(nameA, phoneA);
    seedPerson(nameB, phoneB);

    await page.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const lidA = `TEST9FIX-B4A-${Date.now()}`;
    postRing({ phone: phoneA, linkedid: lidA, ext: EXT_PREFERRED, probe: "B4A" });
    await expect
      .poll(async () => cardWithPhone(page, phoneA).count(), { timeout: 20_000 })
      .toBe(1);
    await openCardWithPhone(page, phoneA);
    if (await page.getByText(/ابتدا «ثبت شخص»/).count()) {
      await quickAddPerson(page, nameA, phoneA);
    }
    await ensureNoteForm(page);
    await page.locator("#sd-note-body").fill(draftText);
    await page.waitForTimeout(800);

    const lidB = `TEST9FIX-B4B-${Date.now()}`;
    postRing({ phone: phoneB, linkedid: lidB, ext: EXT_PREFERRED, probe: "B4B" });
    await expect
      .poll(async () => cardWithPhone(page, phoneB).count(), { timeout: 20_000 })
      .toBe(1);
    await openCardWithPhone(page, phoneB);
    if (await page.getByText(/ابتدا «ثبت شخص»/).count()) {
      await quickAddPerson(page, nameB, phoneB);
    }
    await ensureNoteForm(page);

    await expect(
      page.getByRole("button", { name: /B4 Person A/ }),
    ).toBeVisible({ timeout: 8_000 });
    await page.getByRole("button", { name: /B4 Person A/ }).click();
    await ensureNoteForm(page);
    await expect(page.locator("#sd-note-body")).toHaveValue(draftText, {
      timeout: 8_000,
    });

    await page.locator("#sd-note-title").fill(`${MARKER} B4 call note`);
    await page.getByRole("button", { name: /^ثبت$/ }).click();
    await expect(page.getByText(/خلاصه تماس ثبت شد|یادداشت ثبت شد/)).toBeVisible({
      timeout: 15_000,
    });

    const draftJson = await page.evaluate(() =>
      localStorage.getItem("afrakala-call-note-drafts-v1"),
    );
    const map = draftJson
      ? (JSON.parse(draftJson) as Record<string, { body?: string }>)
      : {};
    const bodies = Object.values(map).map((d) => d.body ?? "");
    expect(
      bodies.some((b) => b.includes(draftText)),
      "A's draft must be cleared from localStorage after save",
    ).toBe(false);
  });

  test("B5 — افزودن معامله from call note sets deal_id", async ({ page }) => {
    const phone = "09000000141";
    const personName = `${MARKER} B5 Person`;
    const dealTitle = `${MARKER} B5 deal ${Date.now()}`;
    const noteBody = `${MARKER} B5 note body`;
    const linkedid = `TEST9FIX-B5-${Date.now()}`;

    seedPerson(personName, phone);

    await page.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    postRing({ phone, linkedid, ext: EXT_PREFERRED, probe: "B5" });
    await expect
      .poll(async () => cardWithPhone(page, phone).count(), { timeout: 20_000 })
      .toBe(1);
    await openCardWithPhone(page, phone);
    if (await page.getByText(/ابتدا «ثبت شخص»/).count()) {
      await quickAddPerson(page, personName, phone);
    }
    await ensureNoteForm(page);

    await page
      .locator(".space-y-3")
      .filter({ has: page.locator("#sd-note-body") })
      .getByRole("button", { name: /^افزودن معامله$/ })
      .click();

    await expect(page.locator("#sd-req-body")).toBeVisible({ timeout: 10_000 });
    await page.locator("#sd-req-title").fill(dealTitle);
    await page.locator("#sd-req-body").fill(`${MARKER} B5 request body`);

    await page
      .locator("div.space-y-1\\.5")
      .filter({ hasText: /^مسئول معامله/ })
      .getByRole("combobox")
      .click();
    const staffOpt = page.getByRole("option").first();
    await expect(staffOpt).toBeVisible({ timeout: 8_000 });
    await staffOpt.click();

    await page.getByRole("button", { name: /^افزودن معامله$/ }).click();
    await expect(page.getByText(/معامله ثبت شد/)).toBeVisible({
      timeout: 20_000,
    });

    await ensureNoteForm(page);
    await page.locator("#sd-note-body").fill(noteBody);
    await page.locator("#sd-note-title").fill(`${MARKER} B5 note title`);
    await page.getByRole("button", { name: /^ثبت$/ }).click();
    await expect(page.getByText(/خلاصه تماس ثبت شد|یادداشت ثبت شد/)).toBeVisible({
      timeout: 15_000,
    });

    const dealId = dbScalar(
      `SELECT id::text FROM sales_interactions
       WHERE kind = 'request' AND title = '${dealTitle.replace(/'/g, "''")}'
       ORDER BY created_at DESC LIMIT 1`,
    );
    expect(dealId).toMatch(/^[0-9a-f-]{36}$/i);

    const noteDealId = dbScalar(
      `SELECT deal_id::text FROM sales_interactions
       WHERE kind <> 'request'
         AND title ILIKE '%[TEST-9FIX] B5 note%'
       ORDER BY created_at DESC LIMIT 1`,
    );
    expect(
      noteDealId,
      "call-note row deal_id must equal the new deal id",
    ).toBe(dealId);
  });
});
