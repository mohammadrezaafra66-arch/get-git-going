/**
 * OG-81 — the migration ledger must describe reality: every file on disk has a row, and every
 * row has a file.
 *
 * WHY THIS EXISTS. On 2026-08-27 the ledger held 552 rows while disk held 597 files — **45
 * migrations had been applied and never recorded**, and the ledger had stopped updating on
 * 2026-08-22. Everything since was applied by direct `psql`, which is exactly what CLAUDE.md
 * instructs, and nothing wrote the row back.
 *
 * That is a deploy hazard rather than untidiness. Anyone using the ledger to decide what to run
 * on production would conclude 45 migrations were outstanding and re-run them — and several are
 * NOT idempotent: 402 drops columns, 404 drops and recreates a function, 409 drops a signature.
 * Re-running those against a database that already has them fails partway or succeeds
 * destructively.
 *
 * BOTH DIRECTIONS ARE CHECKED, and they fail for opposite reasons:
 *   * a file with no ledger row  → it was applied without being recorded (the 2026-08-27 case),
 *     so the next deployer will re-run it;
 *   * a ledger row with no file  → a migration file was DELETED after being applied, which
 *     means the repository is no longer a complete record of the schema and a rebuild from
 *     scratch would produce a different database.
 *
 * The second was 0 on 2026-08-27 and that is the good news in the finding: the disk was already
 * a complete record even while the ledger was not.
 */
import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

/** Version strings from the filenames — the leading timestamp before the first underscore. */
function diskVersions(): string[] {
  return readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.split("_")[0])
    .sort();
}

function ledgerVersions(): string[] {
  return dbRows(
    "select version from supabase_migrations.schema_migrations order by version",
  ).sort();
}

test("⛔ every migration file on disk has a ledger row", () => {
  const disk = diskVersions();
  const ledger = new Set(ledgerVersions());
  const unrecorded = disk.filter((v) => !ledger.has(v));

  expect(
    unrecorded,
    `${unrecorded.length} migration(s) are applied-but-unrecorded: ${unrecorded.slice(0, 8).join(", ")}${unrecorded.length > 8 ? " …" : ""}. ` +
      "A deployer reading the ledger would re-run these, and several migrations in this repo are NOT idempotent. " +
      "Record the row — do NOT re-run the migration.",
  ).toEqual([]);
});

test("⛔ every ledger row has a migration file on disk", () => {
  const disk = new Set(diskVersions());
  const orphaned = ledgerVersions().filter((v) => !disk.has(v));

  expect(
    orphaned,
    `${orphaned.length} ledger row(s) have no file: ${orphaned.slice(0, 8).join(", ")}. ` +
      "A migration file was deleted after being applied, so the repository is no longer a complete " +
      "record of the schema and a rebuild from scratch would produce a different database.",
  ).toEqual([]);
});

test("the comparison is not vacuous — both sides are populated", () => {
  // Without this, an empty migrations directory and an empty ledger would agree perfectly and
  // both assertions above would pass forever.
  const disk = diskVersions();
  const ledger = ledgerVersions();
  expect(disk.length, "no migration files found — the path is probably wrong").toBeGreaterThan(500);
  expect(
    ledger.length,
    "the ledger is empty — the table is probably not the one in use",
  ).toBeGreaterThan(500);
  expect(
    disk.length,
    `disk ${disk.length} vs ledger ${ledger.length} — the two must agree exactly`,
  ).toBe(ledger.length);
});

test("no duplicate versions on either side", () => {
  // A duplicated timestamp means two migrations claim the same ordinal, and only one of them
  // will ever be applied by a tool that keys on version. This project has renumbered a migration
  // mid-flight before (313 was claimed twice on one day), so it is a real shape.
  const disk = diskVersions();
  const dupes = disk.filter((v, i) => disk.indexOf(v) !== i);
  expect(
    [...new Set(dupes)],
    `duplicate migration version(s) on disk: ${[...new Set(dupes)].join(", ")}`,
  ).toEqual([]);
});
