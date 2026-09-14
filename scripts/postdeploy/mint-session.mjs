#!/usr/bin/env node
// Mint a short-lived admin session for a READ-ONLY post-deploy sweep.
//
// Why this exists: the app keeps its Supabase session in localStorage and
// `_app.beforeLoad` skips auth during SSR, so an authenticated page can only be
// seen by a real browser carrying a session. This writes a Playwright
// storageState that such a browser can load.
//
// Rules this script keeps (docs/research/postdeploy-sweep-20260914.md):
//   - secrets come from process.env ONLY: JWT_SECRET, SUPABASE_PUBLISHABLE_KEY
//   - the storage state is written OUTSIDE the repo (refuses a path inside it)
//   - the minted token is checked with a single GET /auth/v1/user (GoTrue rejects
//     banned users there); nothing is written to the database or to GoTrue
//   - prints the path, the account and the expiry, and nothing else
//
// Usage: node scripts/postdeploy/mint-session.mjs [--user-id <uuid>] [--out <path>] [--ttl <seconds>]

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  // Chosen 2026-09-14 from a READ ONLY query: admin, profiles.status=active,
  // banned_until NULL, and the operator's own account (not a staff member's).
  userId: "8ff55610-010f-4436-8f6e-1b20c42c93b2",
  appOrigin: "http://192.168.170.10:3000",
  supabaseUrl: "http://192.168.170.10:8000",
  ttl: 3600,
  out: path.join(os.tmpdir(), "afrakala-postdeploy-session.json"),
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(msg) {
  process.stderr.write(`mint-session: ${msg}\n`);
  process.exit(1);
}

const userId = arg("user-id") ?? DEFAULTS.userId;
const ttl = Number(arg("ttl") ?? DEFAULTS.ttl);
const out = path.resolve(arg("out") ?? DEFAULTS.out);
const appOrigin = arg("origin") ?? DEFAULTS.appOrigin;
const supabaseUrl = arg("supabase-url") ?? DEFAULTS.supabaseUrl;

const jwtSecret = process.env.JWT_SECRET;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!jwtSecret) fail("JWT_SECRET is not set in the environment");
if (!publishableKey) fail("SUPABASE_PUBLISHABLE_KEY is not set in the environment");
if (!/^[0-9a-f-]{36}$/i.test(userId)) fail("--user-id must be a uuid");
if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 3600) fail("--ttl must be 1..3600 seconds");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = path.relative(repoRoot, out);
if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
  fail("refusing to write the session inside the repository; pass --out outside it");
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const exp = now + ttl;
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ sub: userId, role: "authenticated", aud: "authenticated", iat: now, exp });
const sig = crypto.createHmac("sha256", jwtSecret).update(`${head}.${body}`).digest("base64url");
const accessToken = `${head}.${body}.${sig}`;

// One GET: proves the signature is accepted and the account is not banned.
const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
  method: "GET",
  headers: { apikey: publishableKey, authorization: `Bearer ${accessToken}` },
});
if (res.status !== 200) fail(`GoTrue rejected the minted session (HTTP ${res.status})`);
const user = await res.json();
if (user?.id !== userId) fail("GoTrue returned a different user than requested");

const session = {
  access_token: accessToken,
  token_type: "bearer",
  expires_in: ttl,
  expires_at: exp,
  // No refresh token on purpose: a refresh would be a POST, and the sweep allows none.
  refresh_token: "",
  user,
};
const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
const state = {
  cookies: [],
  origins: [{ origin: appOrigin, localStorage: [{ name: storageKey, value: JSON.stringify(session) }] }],
};

fs.writeFileSync(out, JSON.stringify(state), { mode: 0o600 });
process.stdout.write(`path    ${out}\naccount ${userId}\nexpires ${new Date(exp * 1000).toISOString()}\n`);
