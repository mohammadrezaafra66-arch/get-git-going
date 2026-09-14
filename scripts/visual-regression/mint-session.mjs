#!/usr/bin/env node
/**
 * Mint a 2-hour browser session for test.admin@afrakala.local, WITHOUT writing
 * anything to the database. The visual-regression tool needs one and, by design,
 * cannot obtain one itself — a human runs this.
 *
 * Why a minted JWT and not a password login: GoTrue's /token writes auth.sessions,
 * auth.refresh_tokens, auth.audit_log_entries and auth.users.last_sign_in_at. The
 * comparison must leave afrakala untouched. Same approach as
 * e2e/helpers/role-session.ts.
 *
 * Inputs — process.env ONLY. Never a file, never an argument:
 *   JWT_SECRET                 signs the token. Never printed, never written anywhere.
 *   SUPABASE_PUBLISHABLE_KEY   the public anon key the containers are given at runtime
 *                              (the same key every browser already receives).
 *
 * The only database access is one SELECT for the account's uuid, run with
 * default_transaction_read_only=on so the server itself refuses any write.
 *
 * Output: a JSON file holding a live 2h token. The path must be outside every git
 * work tree, so it can never be committed; this script refuses otherwise.
 *
 *   node scripts/visual-regression/mint-session.mjs --out <path outside any repo>
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EMAIL = "test.admin@afrakala.local";
const TTL_SECONDS = 2 * 60 * 60; // fixed. Not configurable on purpose.

function fail(msg) {
  console.error(`mint-session: ${msg}`);
  process.exit(1);
}

const outIdx = process.argv.indexOf("--out");
if (outIdx < 0 || !process.argv[outIdx + 1]) fail("usage: --out <file outside any git repo>");
const out = path.resolve(process.argv[outIdx + 1]);

const secret = process.env.JWT_SECRET;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!secret) fail("JWT_SECRET is not set in the environment");
if (!anonKey) fail("SUPABASE_PUBLISHABLE_KEY is not set in the environment");

// Refuse any destination inside a git work tree: a file with a live JWT must never be committable.
const outDir = path.dirname(out);
fs.mkdirSync(outDir, { recursive: true });
let insideRepo = true;
try {
  execFileSync("git", ["-C", outDir, "rev-parse", "--is-inside-work-tree"], { stdio: "pipe" });
} catch {
  insideRepo = false;
}
if (insideRepo) fail(`refusing to write inside a git work tree: ${outDir}`);

const userId = execFileSync(
  "docker",
  [
    "exec",
    "-e",
    "PGOPTIONS=-c default_transaction_read_only=on",
    "afrakala-lan-db",
    "psql",
    "-U",
    "postgres",
    "-d",
    "afrakala",
    "-A",
    "-t",
    "-c",
    `select id from auth.users where email = '${EMAIL}'`,
  ],
  { encoding: "utf8" },
).trim();
if (!/^[0-9a-f-]{36}$/i.test(userId)) fail(`no auth.users row for ${EMAIL}`);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const exp = now + TTL_SECONDS;
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({
  sub: userId,
  role: "authenticated",
  aud: "authenticated",
  email: EMAIL,
  iat: now,
  exp,
});
const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");

const session = {
  access_token: `${head}.${body}.${sig}`,
  token_type: "bearer",
  expires_in: TTL_SECONDS,
  expires_at: exp,
  refresh_token: "",
  user: {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: EMAIL,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  },
};

fs.writeFileSync(out, JSON.stringify({ email: EMAIL, expiresAt: exp, anonKey, session }), {
  mode: 0o600,
});
console.log(`mint-session: wrote ${out}`);
console.log(
  `mint-session: user ${EMAIL} (${userId}), expires ${new Date(exp * 1000).toISOString()}`,
);
