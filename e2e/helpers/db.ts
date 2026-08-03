import { execFileSync } from "node:child_process";

/**
 * Read-only database access for end-to-end assertions.
 *
 * Tests assert against the database because the UI is not evidence of what was
 * stored. Only SELECT-shaped statements are permitted: a test that can write is
 * a test that can quietly repair the very state it is supposed to be checking.
 *
 * Connection details come from the environment with the LAN test server as the
 * default, so nothing machine-specific is required to run this and nothing
 * secret is stored here. There is no password: `postgres` authenticates locally
 * inside the container via the socket.
 */
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME = process.env.E2E_DB_NAME ?? "afrakala";
const DB_USER = process.env.E2E_DB_USER ?? "postgres";

function assertReadOnlySql(sql: string): void {
  const normalized = sql.trim().replace(/\s+/g, " ").toLowerCase();
  const startsReadOnly =
    normalized.startsWith("select ") ||
    normalized.startsWith("with ") ||
    normalized.startsWith("show ");
  const blocked =
    /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|merge)\b/i.test(
      normalized,
    );

  if (!startsReadOnly || blocked) {
    throw new Error(`Refusing non-read-only SQL in E2E helper: ${sql}`);
  }
}

export function dbScalar(sql: string): string {
  assertReadOnlySql(sql);
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-A", "-t", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

export function dbRows(sql: string): string[] {
  const out = dbScalar(sql);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}
