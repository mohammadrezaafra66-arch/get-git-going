/**
 * Phase 12 — shared PostgREST/API helper for the mission's new specs.
 *
 * Several of these specs are explicitly specified as API-level ("Direct
 * PostgREST calls with a salesperson JWT"), and the rest assert database-
 * enforced rules that a UI test can only observe indirectly. Driving the API
 * directly also avoids the selector-guessing that the mission brief flags as
 * having wasted time before.
 *
 * Credentials come from deploy/lan/.env.lan, which is gitignored. Nothing here
 * is logged. This is LAN-test-server only, exactly like
 * e2e/auth/generate-role-sessions.spec.ts, which already reads env and calls
 * the Auth Admin API.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let cached: Record<string, string> | null = null;

export function lanEnv(): Record<string, string> {
  if (cached) return cached;
  const file = process.env.AFRAKALA_LAN_ENV ?? path.join(process.cwd(), "deploy/lan/.env.lan");
  cached = Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
  return cached;
}

export function restUrl(): string {
  return `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}/rest/v1`;
}

export function appUrl(): string {
  return `http://192.168.170.8:${lanEnv().APP_PORT}`;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Mint a real HS256 GoTrue-shaped JWT so PostgREST applies real RLS. */
export function mintJwt(sub: string, ttlSeconds = 3600): string {
  const env = lanEnv();
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({
    sub,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + ttlSeconds,
  });
  const sig = crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

export type RestResult<T = unknown> = { status: number; body: T; text: string };

export async function rest<T = unknown>(
  jwt: string | null,
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<RestResult<T>> {
  const env = lanEnv();
  const res = await fetch(`${restUrl()}${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: env.ANON_KEY,
      Authorization: `Bearer ${jwt ?? env.ANON_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T, text };
}

export const errMessage = (b: unknown): string =>
  (b && typeof b === "object" && ((b as { message?: string }).message ?? "")) || "";

/** Today's date in Asia/Tehran as YYYY-MM-DD — must match public.tehran_today(). */
export function tehranToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Resolve one user id holding the given role, for stable fixtures. */
export async function userWithRole(adminJwt: string, role: string): Promise<string | null> {
  const r = await rest<{ user_id: string }[]>(
    adminJwt,
    `/user_roles?select=user_id&role=eq.${role}&limit=1`,
  );
  return r.body?.[0]?.user_id ?? null;
}

/** The seeded emergency admin on the LAN test server. */
export const ADMIN_USER_ID = "48f7c9d5-096e-437e-af9b-9cb0be5deb8c";
