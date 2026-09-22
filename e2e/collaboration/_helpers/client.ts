import { lanEnv, mintJwt, rest, restUrl, errMessage, type RestResult } from "../../helpers/pgrest";
import { dbScalar, dbRows } from "../../helpers/db";
import { storageStateForRole, authStorageKey, type TestRole } from "../../helpers/role-session";
import { APP_URL, USER_IDS, type CollabRole } from "./constants";
import { execFileSync } from "node:child_process";

export { dbScalar, dbRows, mintJwt, rest, restUrl, errMessage, lanEnv };
export type { RestResult };

export function jwtFor(role: CollabRole, ttl = 7200): string {
  return mintJwt(USER_IDS[role], ttl);
}

export function anonKey(): string {
  return lanEnv().ANON_KEY;
}

export function supabaseUrl(): string {
  // Host Playwright must never use the docker-compose hostname `kong`.
  return "http://192.168.170.8:9000";
}

export function storageBaseUrl(): string {
  return "http://192.168.170.8:9000";
}

/** Read-only scalar against a named DB in the LAN container (e.g. postgres for cron.job). */
export function dbScalarOn(database: string, sql: string): string {
  const normalized = sql.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized.startsWith("select ") && !normalized.startsWith("with ")) {
    throw new Error(`Refusing non-read-only SQL: ${sql}`);
  }
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(normalized)) {
    throw new Error(`Refusing mutating SQL: ${sql}`);
  }
  return execFileSync(
    "docker",
    ["exec", "afrakala-lan-db", "psql", "-U", "postgres", "-d", database, "-A", "-t", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

/** Map collab role to role-session TestRole (sales2 -> sales email path via mint). */
export function storageFor(role: CollabRole) {
  if (role === "sales2") {
    const userId = USER_IDS.sales2;
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
        email: "test.sales2@afrakala.local",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      },
    };
    return {
      cookies: [] as never[],
      origins: [
        {
          origin: APP_URL,
          localStorage: [
            { name: authStorageKey(supabaseUrl()), value: JSON.stringify(session) },
          ],
        },
      ],
    };
  }
  const map: Record<Exclude<CollabRole, "sales2">, TestRole> = {
    admin: "admin",
    manager: "manager",
    sales: "sales",
    accountant: "accountant",
    viewer: "viewer",
  };
  return storageStateForRole(map[role], APP_URL, supabaseUrl());
}

export async function rpc<T = unknown>(
  jwt: string | null,
  fn: string,
  args: Record<string, unknown>,
): Promise<RestResult<T>> {
  return rest<T>(jwt, `/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function countSql(sql: string): number {
  const v = dbScalar(sql);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`countSql bad: ${sql} => ${v}`);
  return n;
}

export function assertNoProdUrl(url: string): void {
  if (url.includes("192.168.170.10")) {
    throw new Error("STOP: production IP in URL");
  }
}
