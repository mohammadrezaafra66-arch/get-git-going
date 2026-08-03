import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { E2E_PREFIX } from "./app";

const EXTRA_ALLOWED_MARKERS = [
  "E2E_AUDIT_211_",
  "E2E_AUDIT_212_",
  "E2E_AUDIT_213_",
  "E2E_215_",
];

function assertE2eOnlySql(sql: string): void {
  const hasAllowedMarker =
    sql.includes(E2E_PREFIX) || EXTRA_ALLOWED_MARKERS.some((marker) => sql.includes(marker));
  if (!hasAllowedMarker) {
    throw new Error(
      `Refusing write SQL without an allowed E2E marker (${[
        E2E_PREFIX,
        ...EXTRA_ALLOWED_MARKERS,
      ].join(", ")})`,
    );
  }
  if (/\b(drop|truncate|alter|grant|revoke|vacuum|analyze|refresh|merge)\b/i.test(sql)) {
    throw new Error("Refusing destructive or schema-changing SQL in E2E write helper");
  }
}

export function dbExecE2e(sql: string): string {
  assertE2eOnlySql(sql);
  const local = join(tmpdir(), `afrakala-e2e-${randomUUID()}.sql`);
  const remote = `/tmp/afrakala-e2e-${randomUUID()}.sql`;
  writeFileSync(local, `SET client_encoding = 'UTF8';\n\\set ON_ERROR_STOP on\n${sql}\n`, {
    encoding: "utf8",
  });
  try {
    execFileSync("docker", ["cp", local, `afrakala-lan-db:${remote}`], { encoding: "utf8" });
    return execFileSync(
      "docker",
      [
        "exec",
        "afrakala-lan-db",
        "bash",
        "-lc",
        `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -f ${remote}`,
      ],
      { encoding: "utf8" },
    );
  } finally {
    try {
      unlinkSync(local);
    } catch {
      // Best-effort temp cleanup.
    }
    try {
      execFileSync("docker", ["exec", "afrakala-lan-db", "rm", "-f", remote], {
        encoding: "utf8",
      });
    } catch {
      // Best-effort remote cleanup.
    }
  }
}
