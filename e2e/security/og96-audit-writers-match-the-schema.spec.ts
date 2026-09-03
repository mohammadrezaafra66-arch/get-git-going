/**
 * OG-96 — every place the code writes an audit row must name columns the table actually has.
 *
 * THE BUG CLASS THIS EXISTS FOR. src/lib/audit/index.ts wrote table_name, record_id and
 * change_details. audit_logs has never had those columns — the first migration on 2026-04-24
 * already used entity_type/entity_id/diff, and the helper arrived two months later. Every call
 * would have failed with 42703, and nobody noticed for two and a half months because the six
 * functions that use it have no consumers. Separately, the quote form sent entity_id: null into a
 * NOT NULL column and had written zero rows since it shipped.
 *
 * Both are the same failure: code and schema drifted apart, and nothing was watching the seam.
 * Types do not catch it — the insert goes through an untyped client — and neither does a build.
 * This is the sibling of the deploy-time env guard: a cheap mechanical check on the one property
 * that, when it breaks, breaks silently.
 *
 * READ-ONLY. It reads source files and information_schema. It writes nothing.
 */
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { dbRows } from "../helpers/db";

/** Files that insert into audit_logs, and how the columns appear in each. */
const WRITERS = ["src/lib/audit/index.ts", "src/routes/_app.sales.quotes.new.tsx"];

/** Columns audit_logs has never had. Naming any of them is the defect, by name. */
const GHOST_COLUMNS = ["table_name", "record_id", "change_details", "updated_at"];

function auditColumns(): string[] {
  return dbRows(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' ORDER BY ordinal_position",
  );
}

/**
 * The TOP-LEVEL keys of each `.insert({ ... })` aimed at audit_logs.
 *
 * Depth matters: `diff` is a jsonb column whose own keys (stage, code, actor_roles…) are data, not
 * columns. A naive scan treats them as column names and reports "audit_logs.stage does not exist",
 * which is true and irrelevant. So this walks braces and keeps only depth 1.
 */
function insertedKeys(src: string): string[] {
  const keys = new Set<string>();
  const marker = /\.from\(\s*["']audit_logs["']\s*\)/g;
  for (const m of src.matchAll(marker)) {
    const after = src.slice(m.index! + m[0].length);
    // Only INSERTs. A read query's first brace is its .order()/.range() options object, whose
    // keys (ascending, count…) are not columns — that is what "audit_logs.ascending" was.
    const ins = after.search(/^\s*\.insert\(/m);
    if (ins < 0 || ins > 200) continue;
    const open = after.indexOf("{", ins);
    if (open < 0) continue;
    let depth = 0;
    let end = open;
    for (let k = open; k < after.length; k += 1) {
      if (after[k] === "{") depth += 1;
      else if (after[k] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = k;
          break;
        }
      }
    }
    const body = after.slice(open + 1, end);
    // Strip nested objects and arrays so only this object's own keys remain.
    let flat = body;
    let prev = "";
    while (flat !== prev) {
      prev = flat;
      flat = flat.replace(/\{[^{}]*\}/g, "").replace(/\[[^[\]]*\]/g, "");
    }
    for (const km of flat.matchAll(/(?:^|,)\s*([a-z_]+)\s*:/g)) keys.add(km[1]);
  }
  return [...keys];
}

test.describe("OG-96 — audit writers and the audit table agree", () => {
  test("audit_logs has the columns this project believes it has", () => {
    // Grounding. If the table is ever migrated, this fails first and explains the others.
    const cols = auditColumns();
    for (const c of [
      "id",
      "actor_id",
      "entity_type",
      "entity_id",
      "action",
      "diff",
      "created_at",
    ]) {
      expect(cols, `audit_logs should have ${c}`).toContain(c);
    }
    for (const ghost of GHOST_COLUMNS) {
      expect(
        cols,
        `audit_logs must not have ${ghost} — the writers assume it does not`,
      ).not.toContain(ghost);
    }
  });

  for (const file of WRITERS) {
    test(`${file} writes only columns that exist`, () => {
      const src = readFileSync(file, "utf8");
      const cols = auditColumns();
      const keys = insertedKeys(src);
      expect(keys.length, `${file} should contain an audit_logs insert`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(cols, `${file} writes audit_logs.${key}, which does not exist`).toContain(key);
      }
    });

    test(`${file} never names a column audit_logs has never had`, () => {
      // Belt and braces, and it reads better in a failure: the ghost name is called out directly
      // rather than as "some key is missing from the table".
      const src = readFileSync(file, "utf8");
      const code = src
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      for (const ghost of GHOST_COLUMNS) {
        expect(code, `${file} still names ${ghost}`).not.toContain(`${ghost}:`);
      }
    });
  }

  test("the helper's declared row shape matches the table", () => {
    // AuditLogSchema.parse() runs on every returned row, so a schema that disagrees with the table
    // turns a successful insert into a thrown ZodError — a second way to be broken while green.
    const src = readFileSync("src/lib/audit/index.ts", "utf8");
    const schema = src.slice(src.indexOf("export const AuditLogSchema"));
    const declared = [...schema.slice(0, 600).matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
    const cols = auditColumns();
    expect(declared.length, "AuditLogSchema should declare fields").toBeGreaterThan(0);
    for (const f of declared) {
      expect(cols, `AuditLogSchema declares ${f}, which audit_logs does not have`).toContain(f);
    }
  });

  test("entity_id is NOT NULL, so no writer may pass null for it", () => {
    // The quote form's «ثبت دلیل» sent entity_id: null and failed with 23502 on every attempt.
    const nullable = dbRows(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_id'",
    );
    expect(nullable, "entity_id must still be NOT NULL for this test to mean anything").toEqual([
      "NO",
    ]);
    for (const file of WRITERS) {
      const code = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(code, `${file} passes null for a NOT NULL column`).not.toContain("entity_id: null");
    }
  });

  test("an audit write never blocks the business operation it describes", () => {
    // A failed audit row must not undo a payment or an invoice that the database has committed.
    for (const file of ["src/lib/accounting/functions.ts", "src/lib/invoices/functions.ts"]) {
      const src = readFileSync(file, "utf8");
      const calls = [...src.matchAll(/await logAuditEvent\(/g)].length;
      expect(calls, `${file} should still log audit events`).toBeGreaterThan(0);
      // Every call sits inside a try, and every catch reports at error severity.
      const guarded = [...src.matchAll(/try \{\s*\n\s*await logAuditEvent\(/g)].length;
      expect(guarded, `${file}: every logAuditEvent must be wrapped`).toBe(calls);
      const reported = [...src.matchAll(/catch \(auditError\) \{\s*\n\s*console\.error\(/g)].length;
      expect(reported, `${file}: every audit failure must be reported`).toBe(calls);
    }
  });
});
