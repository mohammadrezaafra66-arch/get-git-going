/**
 * S-5 — a guarded route must ALSO carry the client-side gate, because on this app the server-side
 * guard cannot decide and never re-runs in the browser.
 *
 * ## What was measured, and how it differs from what was assumed
 *
 * The assumption going in was a race: `requireAnyRole` / `requireAdmin` / `requirePermission`
 * each contained
 *
 *     if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
 *
 * and a guard that RETURNS is a guard that PASSED, so a cold session would see the page for as
 * long as the roles query took.
 *
 * **That half is FIXED and this header used to describe it as if it were live — corrected in wave
 * 2.** The line is gone from `staging`: `settleRoles()` (src/lib/rbac/route-guards.ts:79-109) now
 * awaits the role load, and all three guards refuse an unsettled snapshot with
 * `redirect({ to: "/unauthorized" })` at `:126`, `:160` and `:194`. Client-side navigation is
 * therefore correct today. Anyone still reading this file for a roles-loading race is reading
 * about a bug that no longer exists.
 *
 * **What remains open is the SSR fail-open, and only that.** `resolveAuthWithRetry():15` returns
 * null when `typeof window === "undefined"`, and each guard then does
 * `if (!resolved) return { user: null, roles: [] }` (`:114`, `:151`, `:185`). A returning guard is
 * a passing guard. Instrumented on 2026-09-06 with a `console.warn` at the top of
 * `requireAnyRole`, a cold `viewer` opening `/admin/persons-cleanup` directly produced exactly one
 * line, and it came from the dev server's stdout, not the browser console:
 *
 *     [GATEPROBE] requireAnyRole ran; isBrowser= false [ 'admin' ]
 *
 * The guard ran ONCE, on the server, where the Supabase session lives in `localStorage` and is
 * invisible. The browser then hydrated and rendered the page; the client guard never ran at all.
 * So for a direct navigation the exposure is **permanent for that page view**, not a window that
 * closes: the cold `viewer` sat on `/admin/persons-cleanup` showing 93 person rows for the full
 * 20-second observation and never redirected.
 *
 * ## Why this test asserts on staticData rather than driving a browser
 *
 * `RouteRoleGate` (src/components/layout/RouteRoleGate.tsx) already exists, is already mounted in
 * `_app.tsx` around the `<Outlet/>`, and already implements the fail-closed client check —
 * holding on "در حال بررسی دسترسی…" while roles load and refusing afterwards. It reads the
 * requirement from `staticData.gate`. A browser test can only ever sample a few routes; reading
 * the route files finds every one of them at once, and it is the same fact. The browser half is
 * covered separately and for real by `og-bot-api-keys-cold-gate.spec.ts` and
 * `s2r-tier1-routes-refuse-a-cold-session.spec.ts`.
 *
 * ## The census, corrected
 *
 * The previous header said *"149 route files call one of the three guards; 19 carry
 * `staticData`"*. **Both numbers were wrong.** 149 is a bare-substring count that sweeps in three
 * files which only *mention* a guard inside a prose comment (`_app.accounting.receipts.create`,
 * `_app.api-keys`, `_app.gamification.achievements`), and 19 predates four `staticData` additions.
 * Re-derived on 2026-09-06 by call site, with word boundaries and no overlaps between the kinds:
 *
 *     requirePermission(  73          requireAnyRole(  60          requireAdmin(  15
 *     union of the three: 148 guarded route files
 *     carrying staticData: 23   ->   125 guarded but ungated
 *
 * ## Scope — the owner decision has now been taken
 *
 * The previous header said rolling `staticData.gate` out beyond the wave-4 routes was *"an owner
 * decision that has not been taken"*. **It was taken for security wave 2**
 * (docs/missions/security2/CONTRACTS.md §1 decision 1, §10): every route the wave-2 investigation
 * classified as **tier 1** — money, credit, roles/permissions, API keys, PII, or a destructive
 * control — is gated, and tiers 2 and 3 are carried forward as a named backlog rather than
 * asserted here. So this spec is still not "every guarded route", and it says which routes it is
 * and why.
 *
 * ## Why the assertions below are DERIVED and not just a list
 *
 * A hand-written list only ever catches the routes somebody remembered. Three of the four blocks
 * below need no list at all, so a NEWLY ADDED tier-1 route with no gate fails on its own:
 *
 *   1. every `requireAdmin()` route must carry `gate: { kind: "admin" }` — the guard names the
 *      requirement completely, so there is nothing to look up;
 *   2. every route whose body touches a tier-1 data marker (credit scoring, role administration,
 *      API keys, the person register) must be gated somewhere on its matched chain;
 *   3. no route may carry a gate without still calling a guard.
 *
 * Only the tier-1 REGISTRY is written out, and it is written from the **live `role_permissions`
 * table** rather than from the route files, precisely so that it is an independent statement. A
 * test that derived its expected value from the same text it is checking would assert only that
 * the file equals itself.
 *
 * ## The trap this registry exists to prevent
 *
 * `allowed` mirrors the LIVE `role_permissions` table, never `src/lib/rbac/roles.ts`. The two
 * disagree on 13 modules (wave-2 investigation, §"Static-table divergences"). The worst is
 * `pricing`: live grants view to admin, manager, accountant, **sales and purchase_specialist** —
 * five roles — where the static table names three. A gate copied from the static table would deny
 * every real salesperson on ~15 routes. The static table is deliberately NOT repaired in wave 2
 * (CONTRACTS decision 3); it is reported and handed forward.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.join(process.cwd(), "src", "routes");

const routeFiles = () => fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".tsx"));
const read = (file: string) => fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");

const CALLS_A_GUARD = /require(?:AnyRole|Admin|Permission)\s*\(/;

/**
 * Pull the `gate:` value out of a route file's `staticData`, brace-balanced.
 *
 * Returned as source text rather than parsed: one gate deliberately references a constant
 * (`allowed: ALLOWED_ROLES`) so that it cannot drift from the guard, and `JSON.parse` would have
 * to reject it or the registry would have to duplicate the very array the reference exists to
 * avoid duplicating.
 */
function extractGate(src: string): string | null {
  const staticIdx = src.indexOf("staticData:");
  if (staticIdx < 0) return null;
  const gateIdx = src.indexOf("gate:", staticIdx);
  if (gateIdx < 0) return null;
  const start = src.indexOf("{", gateIdx);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

/**
 * Compare gates by meaning, not by layout. Prettier wraps a gate whose single line would exceed
 * 100 characters, so the five-role `pricing` gates are three lines and the two-role ones are one,
 * and a trailing comma appears only in the wrapped form.
 */
const canon = (s: string) => s.replace(/\s+/g, "").replace(/,(?=[}\]])/g, "");

/**
 * The gates on a route's whole matched chain, mirroring what `RouteRoleGate` actually does:
 * `useMatches()` returns every matched route and the component refuses if ANY of their gates
 * fails, so a gate on a layout route protects its children.
 *
 * TanStack's flat file convention encodes nesting in the dots, and a segment ending in `_` opts
 * OUT of its parent layout — `_app.persons_.$personId` is not a child of `_app.persons`, which is
 * why it needs its own gate while `_app.bot-api-keys.index` does not.
 */
function gateChain(file: string, present: Set<string>): string[] {
  const gates: string[] = [];
  const segs = file.replace(/\.tsx$/, "").split(".");
  while (segs.length > 0) {
    const name = `${segs.join(".")}.tsx`;
    if (present.has(name)) {
      const g = extractGate(read(name));
      if (g) gates.push(g);
    }
    segs.pop();
    if (segs.length > 0 && segs[segs.length - 1].endsWith("_")) break;
  }
  return gates;
}

// ------------------------------------------------------------------------------------------------
// 1. DERIVED, no list: every requireAdmin() route carries the admin gate.
// ------------------------------------------------------------------------------------------------
test('every requireAdmin() route carries gate: { kind: "admin" }', () => {
  // `requireAdmin` states its own requirement completely — `roles.includes("admin")` and nothing
  // else — so the client gate is `{ kind: "admin" }` verbatim and can never be the wrong list.
  // Deriving it means a new admin route added next month fails here without anyone editing this
  // file, which a hand-written list could never do.
  const missing = routeFiles()
    .filter((f) => /requireAdmin\s*\(/.test(read(f)))
    .filter((f) => canon(extractGate(read(f)) ?? "") !== canon(`{ kind: "admin" }`));

  expect(
    missing,
    "these route files call requireAdmin() but carry no matching staticData.gate, so on a direct " +
      "navigation — where beforeLoad runs only on the server and returns without refusing — the " +
      "page renders for any signed-in user. Each needs exactly this line:\n" +
      '  staticData: { gate: { kind: "admin" } },\n' +
      `missing: ${missing.join(", ")}`,
  ).toEqual([]);
});

// ------------------------------------------------------------------------------------------------
// 2. The tier-1 registry — written from the live role_permissions table, not from the route files.
// ------------------------------------------------------------------------------------------------

/**
 * Live `role_permissions`, read from the `afrakala` database on 2026-09-06:
 *
 *   sales         view  admin manager accountant sales
 *                 create admin manager accountant sales      update admin manager sales
 *   persons       view  admin manager accountant sales viewer
 *                 create admin manager                       update admin manager
 *   reports       view  admin manager accountant sales purchase_specialist viewer
 *   pricing       view/create/update  admin manager accountant sales purchase_specialist
 *   market-rates  view  admin manager accountant sales
 *   products      update admin manager accountant
 *
 * Every `requirePermission` row below is that set, and NOT the static table's. Every
 * `requireAnyRole` row is the route's own array, which is that route's whole authority — those
 * routes map to no module, or deliberately restrict further than their module does.
 */
const TIER1: { file: string; gate: string; why: string }[] = [
  // --- requirePermission: gate = live role_permissions.<module>.can_<action> --------------------
  {
    file: "_app.sales.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] }`,
    why: "layout for the whole /sales subtree — sales.view",
  },
  {
    file: "_app.sales.quotes.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] }`,
    why: "layout for /sales/quotes; pre-invoice amounts and customer phones — sales.view",
  },
  {
    file: "_app.sales.credit-customers.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] }`,
    why: "open-account credit ceilings per customer — sales.view",
  },
  {
    file: "_app.sales_.customers.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] }`,
    why: "customer directory with phones and audit trail — sales.view",
  },
  {
    file: "_app.sales_.customers_.create.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] }`,
    why: "creates a customer record — sales.create (static table misses accountant)",
  },
  {
    file: "_app.sales_.customers_.$customerId.edit.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "sales"] }`,
    why: "edits a customer record and its persons link — sales.update",
  },
  {
    file: "_app.persons.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "viewer"] }`,
    why: "searches the unified person register — persons.view (PII)",
  },
  {
    file: "_app.persons_.$personId.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "viewer"] }`,
    why: "one person's national id, phones, aliases, merge panel — persons.view (PII)",
  },
  {
    file: "_app.persons_.$personId_.edit.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }`,
    why: "edits a person's identifiers — persons.update (PII, write)",
  },
  {
    file: "_app.persons_.create.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }`,
    why: "creates a person record — persons.create (PII, write)",
  },
  {
    file: "_app.reports.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist", "viewer"] }`,
    why: "receivables summary, receipts, quotes — reports.view (static misses purchase_specialist)",
  },
  {
    file: "_app.pricing.attention.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"] }`,
    why: "supplier cost prices; had NO guard at all before wave 2 — pricing.view",
  },
  {
    file: "_app.pricing.purchase-prices.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"] }`,
    why: "edits supplier purchase (cost) prices — pricing.create (static misses two roles)",
  },
  {
    file: "_app.pricing.currency-rates.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"] }`,
    why: "approves/rejects fetched FX rates, moving every computed price — pricing.view",
  },
  {
    file: "_app.pricing.recompute-prices.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"] }`,
    why: "batch republish of every sale price — pricing.update",
  },
  {
    file: "_app.pricing.sale-lists_.$listId.publish.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"] }`,
    why: "publishes a price list to recipients, outbound and irreversible — pricing.update",
  },
  {
    file: "_app.pricing.market-rates-workshop.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] }`,
    why: "records and re-statuses FX/gold ticks that feed pricing — market-rates.view",
  },
  {
    file: "_app.products.regenerate-names.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant"] }`,
    why: "bulk-rewrites product names by category — products.update (static misses accountant)",
  },

  // --- requireAnyRole: gate = the route's own array, which is its whole authority ----------------
  {
    file: "_app.sales_.customers_.$customerId.credit.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant"] }`,
    why: "one customer's credit ceiling, allocation and full dynamic scoring — halt route",
  },
  {
    file: "_app.sales.credit-rules.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "accountant"] }`,
    why: "the credit scoring rulebook — halt route",
  },
  {
    file: "_app.sales.quotes.new.tsx",
    gate: `{ kind: "anyRole", allowed: ALLOWED_ROLES }`,
    why: "creates a pre-invoice and runs the customer credit check",
  },
  {
    file: "_app.admin.asan-import.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "accountant"] }`,
    why: "imports persons/products from the Asan accounting system",
  },
  {
    file: "_app.admin.asan-export.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "accountant"] }`,
    why: "assigns document numbers and exports accounting documents",
  },
  {
    file: "_app.persons_.merge.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }`,
    why: "merges two person records — irreversible, cascades across every person FK",
  },
  {
    file: "_app.pricing.market-intelligence.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager", "accountant"] }`,
    why: "market index built from purchase_prices",
  },
  {
    file: "_app.admin.delivery-receipts.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }`,
    why: "approves/rejects delivery receipts",
  },
  {
    file: "_app.admin.documents.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }`,
    why: "approves/rejects accounting documents",
  },
  {
    file: "_app.admin.penalties.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }`,
    why: "HR disciplinary records against named staff (PII)",
  },
  {
    file: "_app.admin.phone-collisions.tsx",
    gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }`,
    why: "phone-number collisions across persons (PII)",
  },
];

/** The five routes wave 4 measured on cold `viewer` and `sales` sessions. Kept, not superseded. */
const WAVE4_MEASURED: { file: string; gate: string }[] = [
  { file: "_app.admin.persons-cleanup.tsx", gate: `{ kind: "anyRole", allowed: ["admin"] }` },
  { file: "_app.api-keys.tsx", gate: `{ kind: "admin" }` },
  { file: "_app.presence.tsx", gate: `{ kind: "admin" }` },
  { file: "_app.admin.roles.tsx", gate: `{ kind: "admin" }` },
  { file: "_app.admin.audit.tsx", gate: `{ kind: "anyRole", allowed: ["admin", "manager"] }` },
];

for (const { file, gate, why } of TIER1) {
  test(`⛔ tier 1 — ${file} carries the gate the live table says it should (${why})`, () => {
    const found = extractGate(read(file));
    expect(
      found === null ? "(no staticData.gate at all)" : canon(found),
      `${file} calls a route guard but its client-side gate does not match the live ` +
        `role_permissions answer. On a direct navigation beforeLoad runs only on the server, where ` +
        `it cannot see the localStorage session and returns without refusing, so without the right ` +
        `line here this page renders for any signed-in user.\nexpected: staticData: { gate: ${gate} },`,
    ).toBe(canon(gate));
  });
}

for (const { file, gate } of WAVE4_MEASURED) {
  test(`⛔ wave 4 — ${file} still carries its measured gate`, () => {
    expect(canon(extractGate(read(file)) ?? ""), `${file} lost its wave-4 gate`).toBe(canon(gate));
  });
}

test("the one gate that references a constant still references the right array", () => {
  // _app.sales.quotes.new declares ALLOWED_ROLES for its guard, and the gate reuses it so the two
  // physically cannot drift. The cost of that is that the registry above cannot see the roles, so
  // the array itself is pinned here instead.
  const src = read("_app.sales.quotes.new.tsx");
  expect(
    canon(src).includes(canon(`ALLOWED_ROLES: AppRole[] = ["admin", "manager", "sales"]`)),
    "_app.sales.quotes.new.tsx no longer declares ALLOWED_ROLES as admin/manager/sales, so both " +
      "its beforeLoad guard and its staticData.gate now mean something else",
  ).toBe(true);
});

// ------------------------------------------------------------------------------------------------
// 3. DERIVED, no list: a route that touches tier-1 data must be gated somewhere on its chain.
// ------------------------------------------------------------------------------------------------

/**
 * Tables and RPCs where the wave-2 investigation rated EVERY consumer route tier 1: credit
 * scoring, role administration, API keys, and the person register.
 *
 * Two markers were considered and deliberately left out, because the investigation itself rates
 * their consumers differently and including them would make this test disagree with its own
 * authority: `purchase_prices` (editing cost prices is tier 1, the read-only pricing hub and
 * calculator that also select it are tier 2) and `person_identifiers` (the customer edit page is
 * tier 1, the supplier profile that also renders them is tier 2). Those routes are covered by the
 * registry above and by the tier-2 backlog respectively, not by this tripwire.
 */
const TIER1_DATA_MARKERS = [
  // credit scoring — the wave-2 halt condition
  "dynamic_entity_scores",
  "dynamic_scoring_parameters",
  "dynamic_parameter_weights",
  "customer_capital_allocations_dynamic",
  "get_customer_dynamic_credit",
  // who may do what
  "assign_user_role_txt",
  "revoke_user_role_txt",
  "update_role_permissions",
  // credentials
  "bot_api_keys",
  "admin_upsert_ai_provider",
  "admin_delete_ai_provider",
  // the person register
  "search_visible_persons",
  "person_merge",
  "detect_phone_collisions",
];

test("no guarded route touches tier-1 data without a gate on its matched chain", () => {
  // This is the block that catches a route NOBODY added to the registry. It needs no list of
  // routes at all: it asks what the file touches, and RouteRoleGate's own inheritance rule
  // supplies the rest.
  const present = new Set(routeFiles());
  const naked = routeFiles().filter((f) => {
    const src = read(f);
    if (!CALLS_A_GUARD.test(src)) return false;
    if (!TIER1_DATA_MARKERS.some((m) => src.includes(m))) return false;
    return gateChain(f, present).length === 0;
  });

  expect(
    naked,
    "these route files read or write tier-1 data (credit scoring, role administration, API keys, " +
      "or the person register) and call a server guard, but neither they nor any layout route " +
      "above them carries a staticData.gate — so RouteRoleGate cannot refuse them on a cold " +
      `direct navigation: ${naked.join(", ")}`,
  ).toEqual([]);
});

// ------------------------------------------------------------------------------------------------
// 4. The open half — a gate is worthless without the guard, and both are worthless unattached.
// ------------------------------------------------------------------------------------------------
test("the gate and the guard cannot drift: every gated route still calls a guard", () => {
  // Deleting the beforeLoad call would make every assertion above pass while removing the
  // server-side check entirely, and `staticData` alone enforces nothing on the server.
  //
  // Layout routes are the exception and it is a real one, not a carve-out: `_app.sales.quotes`
  // gates its children by inheritance, so a child may legitimately carry no guard of its own. The
  // check is therefore "a file that carries a GATE must also call a guard" — every file in that
  // set is one somebody wrote both halves of.
  const missing = routeFiles().filter((f) => {
    const src = read(f);
    return extractGate(src) !== null && !CALLS_A_GUARD.test(src);
  });

  expect(
    missing,
    `these carry a staticData.gate but no longer call a route guard, so they are enforced on the ` +
      `client and nowhere else: ${missing.join(", ")}`,
  ).toEqual([]);
});

test("RouteRoleGate is still mounted — the gate data is worthless if nothing reads it", () => {
  // Every assertion above is about DATA. This is the one assertion about the CODE that consumes
  // it: if RouteRoleGate stops wrapping the Outlet, every gate above goes quietly inert while this
  // spec stays green.
  const appLayout = read("_app.tsx");
  expect(
    appLayout.includes("<RouteRoleGate>"),
    "src/routes/_app.tsx no longer wraps <Outlet/> in <RouteRoleGate>, so staticData.gate is " +
      "read by nothing and every client-side route gate is inert",
  ).toBe(true);

  const gate = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "layout", "RouteRoleGate.tsx"),
    "utf8",
  );
  // Fail closed while the answer is unknown — the property the whole row is about.
  expect(
    /rolesLoading \|\| profileLoading \|\| loading/.test(gate),
    "RouteRoleGate no longer holds while roles are loading; it must never render the page " +
      "before the answer is known",
  ).toBe(true);

  // And it must still walk the WHOLE matched chain. Six tier-1 leaves in this wave are gated only
  // by inheritance from a layout route; if this collapsed to "the leaf's own gate", those six
  // would go unguarded while every assertion above stayed green.
  const flat = gate.replace(/\s+/g, " ");
  expect(
    flat.includes("useMatches()") && /const gates = matches ?\.map/.test(flat),
    "RouteRoleGate no longer collects gates from every match, so a gate on a layout route stops " +
      "protecting its children and the inherited tier-1 leaves become unguarded",
  ).toBe(true);
});
