/**
 * OG-92 — a Supabase method captured as a bare reference loses `this` and throws before it fetches.
 *
 * WHAT BROKE. Two production pages, measured on production:
 *
 *   /accounting/treasury           «دریافت ماندهٔ حساب‌ها با خطا مواجه شد», all totals zero, and
 *                                  ZERO network requests — it threw client-side before any fetch.
 *   /accounting/mutual-settlement  the same fault in its raw form:
 *                                  "Cannot read properties of undefined (reading 'rest')"
 *
 * WHY. Both modules captured the rpc method detached from its client:
 *
 *     const rpc = supabase.rpc as unknown as RpcFn;   // …then rpc("fn", {...})
 *
 * Called that way, `this` is undefined inside PostgREST's `rpc`, which dereferences `this.rest`
 * immediately — hence the message, and hence no request ever leaving the browser.
 *
 * The control that proves the diagnosis is already in the codebase: every other module uses the
 * INLINE form, `(supabase.rpc as unknown as Fn)("name", {...})`, where the method is called as a
 * member of `supabase` and keeps its receiver. Those pages work.
 *
 * The fix is `.bind(supabase)` — minimal, and it makes the captured reference behave exactly like
 * the inline form that is already proven.
 *
 * A systematic sweep of src/ found exactly two sites with this shape; no destructuring of a
 * supabase method, and none passed as a callback. `supabase.auth` is captured in the OAuth consent
 * route, but as an OBJECT whose methods are then called on it, so its receiver is intact.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const SITES = [
  { file: "src/lib/treasury/queries.ts", page: "/accounting/treasury" },
  { file: "src/lib/accounting/mutual-settlement.ts", page: "/accounting/mutual-settlement" },
];

test.describe("OG-92 — supabase.rpc must not be detached from its client", () => {
  for (const { file, page } of SITES) {
    test(`${file} binds rpc (${page})`, () => {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must bind rpc to the client`).toContain("supabase.rpc.bind(supabase)");
    });

    test(`${file} no longer captures rpc bare`, () => {
      const src = readFileSync(file, "utf8");
      // The exact broken shape: an assignment whose right-hand side ends at `supabase.rpc`
      // (optionally through a cast) with no `.bind`. This is what threw before any fetch.
      expect(src, `${file} still captures supabase.rpc without binding it`).not.toMatch(
        /=\s*supabase\.rpc(\s+as\s[^;]*)?;/,
      );
    });
  }

  test("the mechanism itself: a detached method loses its receiver", () => {
    // Non-vacuous grounding. If this ever stopped holding, the two assertions above would be
    // guarding against nothing, so the property they rely on is demonstrated rather than assumed.
    const client = {
      rest: "the transport",
      rpc(this: { rest: string } | undefined) {
        // PostgREST's rpc dereferences this.rest immediately; undefined `this` is the crash.
        return this!.rest;
      },
    };

    expect(client.rpc()).toBe("the transport"); // called as a member — receiver intact

    const detached = client.rpc;
    expect(() => detached()).toThrow(); // exactly the production failure

    const bound = client.rpc.bind(client);
    expect(bound()).toBe("the transport"); // and exactly the fix
  });

  test("the inline form used everywhere else is left alone", () => {
    // Scope guard. The fix is two bindings, not a rewrite of every call site. If this fails,
    // someone has 'tidied' the working modules and widened a one-line fix into a refactor.
    const untouched = [
      "src/components/sales/quotes/QuoteAccountingMarkers.tsx",
      "src/hooks/credit/useDynamicScoring.ts",
      "src/routes/_app.sales.quotes.new.tsx",
    ];
    for (const f of untouched) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} should still use the inline form`).toMatch(
        /\(\s*\n?\s*supabase\.rpc as unknown as/,
      );
      expect(src, `${f} should not have been converted to a bound capture`).not.toContain(
        "supabase.rpc.bind(supabase)",
      );
    }
  });
});
