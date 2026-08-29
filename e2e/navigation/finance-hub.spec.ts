/**
 * مرکز مالی — the finance section is one entry, and the hub reaches everything.
 *
 * WHY THIS EXISTS. Collapsing a sidebar section is easy to get wrong in a way that stays
 * invisible until someone in the wrong role sees a page they should not. The rule this gate
 * defends is that the hub must not re-derive permissions: it calls `isNavigationEntryPermitted`,
 * the same predicate the sidebar uses minus its `hiddenFromMenu` clause. A hand-written role
 * list would miss `adminOnly`, `allowedRoles`, and the `role_permissions` rows read at runtime.
 *
 * The assertions are source-level plus one against the live `role_permissions` table, which is
 * the runtime authority for module visibility. The registry cannot be imported here: it pulls in
 * `lucide-react`, which needs a React runtime that a node-context spec does not have.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";

const HUB_ROUTE = "/accounting/receipts/create";

/** The twelve destinations the hub must reach, from the owner's brief. */
const HUB_DESTINATIONS = [
  `${HUB_ROUTE}?branch=receipt`,
  `${HUB_ROUTE}?branch=payment`,
  `${HUB_ROUTE}?branch=dual`,
  "/purchases/create",
  "/persons",
  "/warehouses",
  "/accounting/treasury",
  "/sales/credit-customers",
  "/accounting/salesperson-scoring",
  "/accounting/dynamic-capital",
  "/sales/credit-rules",
  "/sales/customers/credit-training",
] as const;

const hubSource = readFileSync("src/components/finance/FinanceHub.tsx", "utf8");
const modulesSource = readFileSync("src/components/layout/primary-modules.ts", "utf8");
const registrySource = readFileSync("src/lib/navigation/registry.ts", "utf8");

/** The `paths:` array of the finance module, as written. */
function financePaths(): string[] {
  const start = modulesSource.indexOf('key: "finance"');
  expect(start, "the finance module must still exist").toBeGreaterThan(-1);
  const block = modulesSource.slice(start, start + 2000);
  const arr = block.slice(block.indexOf("paths:"), block.indexOf("],", block.indexOf("paths:")));
  return [...arr.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test.describe("finance hub", () => {
  test("the finance sidebar section has exactly one entry, and it is the hub", () => {
    expect(financePaths()).toEqual([HUB_ROUTE]);
  });

  test("all twelve destinations are present on the hub", () => {
    for (const dest of HUB_DESTINATIONS) {
      expect(hubSource, `hub is missing ${dest}`).toContain(`"${dest}"`);
    }
    // Non-vacuous: a hub file that lost its links would fail the loop, but an empty
    // destination list would pass it. Pin the count too.
    expect(HUB_DESTINATIONS).toHaveLength(12);
  });

  test("a sales-only user cannot see the accounting destinations", () => {
    // The owner's hard rule: تخصیص سرمایه must not reach a sales user. Asserted against the
    // live table that decides it at runtime, not against a role list restated here.
    const salesCanViewAccounting = dbScalar(
      `select can_view::text from public.role_permissions
        where role_name = 'sales' and module = 'accounting'`,
    );
    expect(salesCanViewAccounting).toBe("false");

    // And the same column must be true for accountant, otherwise the assertion above would
    // pass simply because the row is missing or the module never grants anyone.
    const accountantCanViewAccounting = dbScalar(
      `select can_view::text from public.role_permissions
        where role_name = 'accountant' and module = 'accounting'`,
    );
    expect(accountantCanViewAccounting).toBe("true");
  });

  test("the three accounting destinations really are behind the accounting module", () => {
    // Ties the previous test to these specific pages: if one were moved to a module sales can
    // view, the permission check above would still pass while the page leaked.
    for (const route of [
      "/accounting/dynamic-capital",
      "/accounting/salesperson-scoring",
      "/accounting/treasury",
    ]) {
      const idx = registrySource.indexOf(`to: "${route}"`);
      expect(idx, `${route} must be in the registry`).toBeGreaterThan(-1);
      expect(registrySource.slice(idx, idx + 300)).toContain('module: "accounting"');
    }
  });

  test("the hub filters every destination through the shared predicate", () => {
    // Guards the rule itself: if someone swaps the call for a hard-coded role list this fails
    // even while the rendered output happens to look right.
    expect(hubSource).toContain("isNavigationEntryPermitted");
    expect(hubSource).toContain("hasPermissionEx");
    expect(hubSource, "the hub must not restate role names").not.toMatch(
      /roles\.includes\("admin"\)/,
    );
  });

  test("hiddenFromMenu was not used to remove the old entries", () => {
    // Using it would have hidden these destinations from the hub as well, because
    // isNavigationEntryVisible short-circuits on it before any role is considered.
    for (const route of ["/accounting/treasury", "/accounting/dynamic-capital", "/persons"]) {
      const idx = registrySource.indexOf(`to: "${route}"`);
      expect(idx, `${route} must be in the registry`).toBeGreaterThan(-1);
      expect(
        registrySource.slice(idx, idx + 400),
        `${route} must not have been hidden from the menu`,
      ).not.toContain("hiddenFromMenu: true");
    }
  });

  test("the removed routes still exist — they left the menu, not the app", () => {
    // Constraint 2: a direct link or an existing bookmark must keep working.
    for (const f of [
      "src/routes/_app.accounting.receipts.tsx",
      "src/routes/_app.accounting.receivables.tsx",
      "src/routes/_app.accounting.payables.tsx",
      "src/routes/_app.accounting.purchase-payments.tsx",
      "src/routes/_app.accounting.payment-vouchers.tsx",
      "src/routes/_app.accounting.bank-accounts.tsx",
      "src/routes/_app.accounting.mutual-settlement.tsx",
      "src/routes/_app.accounting.external-parties.tsx",
    ]) {
      expect(() => readFileSync(f, "utf8"), `${f} must still exist`).not.toThrow();
    }
  });

  test("the wizard can be opened straight on a branch", () => {
    const routeSource = readFileSync("src/routes/_app.accounting.receipts.create.tsx", "utf8");
    expect(routeSource).toContain("validateSearch");
    expect(routeSource).toContain("initialBranch={branch}");
    const wizardSource = readFileSync("src/features/ledger-wizard/DocumentWizard.tsx", "utf8");
    expect(wizardSource).toContain("initialBranch");
    // Absent the prop the wizard must still start at step 1, which is what keeps every
    // existing entry point behaving as before.
    expect(wizardSource).toContain("useState(initialBranch ? 2 : 1)");
  });
});
