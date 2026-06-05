#!/usr/bin/env node
/**
 * Phase-0 Worker Dummy E2E runner (G-08 / WPC-0-001).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node automation/worker-dummy/run-e2e.mjs
 *
 * Optional:
 *   AUTOMATION_E2E_IDEMPOTENCY_KEY=phase0-e2e-smoke-001
 *
 * Does not start any real bot. Requires automation tables migration applied.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runPhase0DummyE2E, verifyNoDuplicateClaim } from "./e2e-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function loadDotEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  const candidates = [
    resolve(repoRoot, ".env"),
    resolve(repoRoot, "deploy/local/.env.local"),
    resolve(repoRoot, "deploy/local/.env"),
  ];
  for (const path of candidates) {
    loadDotEnvFile(path);
  }
  if (process.env.SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
  }
}

async function main() {
  loadLocalEnv();

  const evidence = await runPhase0DummyE2E();
  const idempotencyKey = evidence.idempotency_key;
  const rerun = await verifyNoDuplicateClaim(idempotencyKey);

  const report = {
    ...evidence,
    idempotency_rerun_check: rerun,
    real_bot_scope: false,
    phase1_unlocked: false,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("[phase0-dummy-e2e] FAILED:", err.message);
  process.exit(1);
});
