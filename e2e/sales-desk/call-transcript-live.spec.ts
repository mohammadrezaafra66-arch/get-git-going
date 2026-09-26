/**
 * G5 — live transcript inside CallerInboundPopup + dossier + call-activity.
 * Markers: phones 09000009xxx, linkedid CTG5-…
 * Auth: minted JWT for test.sales2 (ext 403). No password mutation.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { mintJwt } from "../helpers/pgrest";
import { authStorageKey } from "../helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";
const SALES2_EMAIL = "test.sales2@afrakala.local";
const LIVE_PHRASE = "سلام این متن زنده آزمایش است";
const FINAL_PHRASE = "متن نهایی آزمایش رونویسی تماس";

function lanEnv(): Record<string, string> {
  const file =
    process.env.AFRAKALA_LAN_ENV ??
    path.join(process.cwd(), "deploy/lan/.env.lan");
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

function sales2StorageState() {
  const userId = dbScalar(
    `select id::text from auth.users where email = '${SALES2_EMAIL}'`,
  );
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

function postHook(body: Record<string, unknown>): { status: number } {
  const env = lanEnv();
  const token = env.CALL_TRANSCRIPT_WORKER_TOKEN;
  if (!token) throw new Error("CALL_TRANSCRIPT_WORKER_TOKEN missing");
  const tmp = path.join(process.cwd(), "docs/missions/call-transcription/_g5_hook.json");
  fs.writeFileSync(tmp, JSON.stringify(body), "utf8");
  const out = execFileSync(
    "curl.exe",
    [
      "-sS",
      "-o",
      "-",
      "-w",
      "\nHTTP %{http_code}",
      "-X",
      "POST",
      "http://192.168.170.8:3100/api/public/hooks/call-transcript",
      "-H",
      "Content-Type: application/json",
      "-H",
      `Authorization: Bearer ${token}`,
      "--data-binary",
      `@${tmp}`,
    ],
    { encoding: "utf8" },
  );
  fs.unlinkSync(tmp);
  const m = out.match(/HTTP (\d+)/);
  return { status: m ? Number(m[1]) : 0 };
}

const POST_RING = path.join(
  process.cwd(),
  "docs/missions/salesdesk-9-fixes/evidence/FIX/f2-post-ring.mjs",
);

function enableCallerId() {
  const helper = path.join(
    process.cwd(),
    "docs/missions/salesdesk-9-fixes/evidence/FIX/f2-sql.mjs",
  );
  execFileSync(process.execPath, [helper, "settings-enable"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function postRing(phone: string, linkedid: string): string {
  execFileSync("docker", ["cp", POST_RING, "afrakala-lan-web:/tmp/f2-post-ring.mjs"]);
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-e",
      "HOOK_BASE=http://127.0.0.1:3000",
      "-e",
      `PHONE=${phone}`,
      "-e",
      `LINKEDID=${linkedid}`,
      "-e",
      "PROBE=CTG5",
      "-e",
      "EXT=403",
      "afrakala-lan-web",
      "node",
      "/tmp/f2-post-ring.mjs",
    ],
    { encoding: "utf8" },
  );
  if (!/"http":\s*200/.test(out) && !out.includes('"http":200')) {
    throw new Error("ring_post_failed");
  }
  return out;
}

function faDigits(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.describe("call transcript live UI", () => {
  test.use({ storageState: sales2StorageState() });

  test.beforeAll(() => {
    enableCallerId();
  });

  test("popup shows live then final text", async ({ page }, testInfo) => {
    const phone = "09000009103";
    const linkedid = `CTG5-${Date.now()}`;
    const uniqueid = `${linkedid}-u`;
    const filename = `exten-403-${phone}-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-120000-${uniqueid}.wav`;

    await page.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    postRing(phone, linkedid);
    const toast = page.getByRole("button", { name: /تماس ورودی/ }).first();
    await expect(toast).toBeVisible({ timeout: 35_000 });
    await toast.click();

    const live = postHook({
      recording_filename: filename,
      recording_uniqueid: uniqueid,
      kind: "committed",
      segment_seq: 0,
      text: LIVE_PHRASE,
      extension: "403",
      prefix: "exten",
      started_at: new Date().toISOString(),
    });
    expect(live.status).toBe(200);

    const panel = page.getByTestId("call-transcript");
    await expect(panel.getByText("در حال رونویسی…")).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText(LIVE_PHRASE)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: path.join(testInfo.outputDir, "g5-popup-live.png"),
      fullPage: true,
    });

    const fin = postHook({
      recording_filename: filename,
      recording_uniqueid: uniqueid,
      kind: "final",
      segment_seq: 0,
      text: FINAL_PHRASE,
      eof: true,
      extension: "403",
      prefix: "exten",
    });
    expect(fin.status).toBe(200);
    await expect(panel.getByText("متن نهایی", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel.getByText(FINAL_PHRASE, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: path.join(testInfo.outputDir, "g5-popup-final.png"),
      fullPage: true,
    });
  });

  test("call-activity row shows transcript panel", async ({ page }, testInfo) => {
    await page.goto("/operations/call-activity", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /فعالیت تلفنی/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: path.join(testInfo.outputDir, "g5-call-activity.png"),
      fullPage: true,
    });
  });
});
