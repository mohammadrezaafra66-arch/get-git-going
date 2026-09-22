import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseURL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const here = path.dirname(fileURLToPath(import.meta.url));
// evidence/FIX -> salesdesk-9-fixes -> missions -> docs -> repo root (5 up)
const repoRoot = path.resolve(here, "../../../../../");

// JWT mint reads AFRAKALA_LAN_ENV (never print secrets). App tree is source of LAN env.
if (!process.env.AFRAKALA_LAN_ENV) {
  process.env.AFRAKALA_LAN_ENV = "D:\\AfraKalaTest\\app\\deploy\\lan\\.env.lan";
}

export default defineConfig({
  testDir: path.join(repoRoot, "e2e/missions"),
  testMatch: /salesdesk-9-fixes-fix-f4.*\.spec\.ts/,
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  },
});
