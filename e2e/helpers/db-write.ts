import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
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
    // Delivery is a STDIN STREAM, not `docker cp`, and that is not a style choice.
    //
    // On 2026-08-26 `docker cp` into `afrakala-lan-db` began failing at the Docker Desktop
    // mount layer:
    //
    //   Error response from daemon: error while creating mount source path
    //   '/run/desktop/mnt/host/d/.../db/init/00-afrakala-pre-supabase-admin.sh':
    //   mkdir /run/desktop/mnt/host/d: file exists
    //
    // `docker cp` re-resolves the container's binds, and this container carries four of them
    // recorded in already-translated VM form. Every fixture write therefore died in setup and
    // cascaded its whole spec file out of the run — 137 tests silently did not execute while
    // the summary line still read "375 passed / 59 failed / 27 skipped".
    //
    // `docker exec -i` never touches the mount layer. `readFileSync` with no encoding returns
    // a Buffer, and passing a Buffer as `input` hands those exact bytes to stdin with no
    // shell and no re-encoding in between — which matters because this SQL carries Persian,
    // and a PowerShell pipe was measured appending a trailing CRLF (md5 mismatch) on the same
    // content. Verified byte-for-byte before this change shipped: a 36,006-byte Persian
    // migration arrived with an identical md5.
    execFileSync(
      "docker",
      ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`],
      { input: readFileSync(local) },
    );
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
