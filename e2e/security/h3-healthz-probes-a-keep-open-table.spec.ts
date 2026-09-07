/**
 * H-3 — the container healthcheck must read a table `anon` is ALLOWED to read.
 *
 * WHY THIS EXISTS. `/api/healthz` probes the database with the publishable (anon) key. It used
 * to read `shop_settings`; migration 477 revoked anon's SELECT on 188 tables including that one,
 * so from 477 onwards PostgREST answered 401, the probe reported `database: down`, and Docker
 * marked the web container `unhealthy` continuously while the app served perfectly. Measured
 * 2026-09-07 before the fix: GET /api/healthz -> 503 with
 * `{"database":{"state":"down","detail":"HTTP 401"}}`.
 *
 * WHAT WAS MISSING, and is the whole point of this file. `og103` pins the GRANT — it asserts the
 * eleven KEEP_OPEN tables stay anon-readable. Nothing pinned the other half: that healthz
 * actually points AT one of them. Re-pointing the probe at a closed table turns no test red,
 * which is precisely how it broke under 477 and stayed broken.
 *
 * The KEEP_OPEN list is parsed out of og103's own source rather than copied here, so the two
 * cannot drift: if og103's list changes, this test follows it automatically.
 *
 * HOW TO SEE IT FAIL (the red half, verified 2026-09-07): change the table in
 * `src/routes/api.healthz.ts` back to `shop_settings` and both the source assertion and the
 * live-privilege assertion go red, and the endpoint returns 503.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";

// Repo-root-relative, the same convention og81 uses for `supabase/migrations`. `__dirname` does
// not exist in this ESM spec scope.
const HEALTHZ_SRC = "src/routes/api.healthz.ts";
const OG103_SRC = "e2e/security/og103-anon-table-grants-stay-closed.spec.ts";

/** The table name in the probe URL, read out of the route's own source. */
function probedTable(): string {
  const src = readFileSync(HEALTHZ_SRC, "utf8");
  // Only the fetch URL counts, not the prose: match the template literal's REST path.
  const m = src.match(/\$\{url\.replace\([^)]*\)\}\/rest\/v1\/([A-Za-z0-9_]+)\?/);
  expect(
    m,
    `could not find the probe URL in ${HEALTHZ_SRC}. If the probe was restructured, update this ` +
      "test rather than deleting it — the point is that SOMETHING pins which table is read.",
  ).not.toBeNull();
  return (m as RegExpMatchArray)[1];
}

/** og103's KEEP_OPEN list, parsed from its source so the two files cannot drift apart. */
function keepOpen(): string[] {
  const src = readFileSync(OG103_SRC, "utf8");
  const block = src.match(/const KEEP_OPEN = \[([\s\S]*?)\];/);
  expect(block, "could not find KEEP_OPEN in og103's source").not.toBeNull();
  const names = [...(block as RegExpMatchArray)[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  expect(names.length, "KEEP_OPEN parsed as empty — the parser, not the rule, is broken").toBe(11);
  return names;
}

test("healthz probes a table og103 keeps open to anon", () => {
  const table = probedTable();
  const open = keepOpen();
  expect(
    open,
    `/api/healthz reads "${table}" with the anon key, but that table is not in og103's KEEP_OPEN ` +
      "list, so a hardening sweep may revoke it and the healthcheck will fail silently — which " +
      "is exactly what migration 477 did to shop_settings. Point the probe at one of: " +
      open.join(", ") +
      ". Do NOT re-grant anon access to make this pass.",
  ).toContain(table);
});

test("the probed table really is readable by anon right now", () => {
  const table = probedTable();
  // `::text` on a boolean renders "true"/"false", not psql's bare "t"/"f".
  const can = dbScalar(
    `select has_table_privilege('anon', 'public.${table}'::regclass, 'SELECT')::text`,
  );
  expect(
    can,
    `anon cannot SELECT "${table}", so the container healthcheck is failing with HTTP 401 ` +
      "regardless of what the route source says.",
  ).toBe("true");
});

/**
 * THIS TEST MEASURES THE RUNNING CONTAINER, NOT THE SOURCE — so it stays red until the fix is
 * deployed, and that is the correct reading, not a broken test. The two tests above pin the
 * source and the grant; this one pins the deployed reality, and the three only agree once
 * `afrakala-lan-web` has been rebuilt. If it is red while the source test above is green, the
 * container is running pre-fix code: rebuild it (see CLAUDE.md, `--no-deps` is mandatory) and
 * confirm `APP_GIT_SHA` matches HEAD.
 */
test("GET /api/healthz answers 200 and reports the database up", async ({ request }) => {
  const res = await request.get("/api/healthz");
  const body = await res.text();
  expect(
    res.status(),
    `/api/healthz returned ${res.status()}: ${body}. If the body says HTTP 401, the RUNNING ` +
      "container is still probing a table anon may not read — the fix is committed but not " +
      "deployed. This test closes on the next deploy of the web container.",
  ).toBe(200);
  const json = JSON.parse(body) as {
    ok: boolean;
    checks: { database: { state: string; detail?: string } };
  };
  expect(json.checks.database.state, `database probe said: ${JSON.stringify(json.checks.database)}`).toBe(
    "up",
  );
  expect(json.ok).toBe(true);
});
