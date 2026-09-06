/**
 * Wave 5 · [U] — «پخش حساب», the allocation workbench, end to end.
 *
 * The page at `/accounting/allocation-workbench` puts the receivables column, the payables
 * column and a new allocation column side by side. This spec covers the loop the accountant
 * actually walks: create an allocation, follow it up twice (the second time with a promise
 * date), record a PARTIAL payment against the beneficiary's purchase, watch the row go unfunded
 * when the promise comes due unpaid, and read the audit trail that records all of it.
 *
 * ## Why the money half runs in SQL and not through the browser
 *
 * `pay_purchase_with_voucher` POSTS a payment voucher and an immutable journal entry. RULE 12 —
 * `e2e/security/rule12-no-gate-creates-posted-documents.spec.ts` — is unambiguous: a spec that
 * creates a financial document does it inside `BEGIN … ROLLBACK`, or it does not create one.
 * Neither the voucher nor its journal entry can be deleted afterwards («سند ثبت‌شده فقط با سند
 * برگشتی اصلاح می‌شود»), so a browser-driven payment here would leave permanent residue on every
 * run — which is exactly how OG-56's stuck pair came to exist.
 *
 * `inRolledBackTx` cannot commit, so this half creates nothing at all. A UI click runs on its own
 * connection and cannot join that transaction, so the honest split is: the database loop is
 * verified here, and the PAGE — that it exists, that it renders its three columns, and that it
 * admits and refuses the right roles — is verified in the browser below. Neither half pretends to
 * be the other.
 *
 * ## Why every browser case builds a COLD session
 *
 * `beforeLoad` runs only on the server. On a cold direct navigation it is the ONLY guard that
 * runs for that page view, and it cannot see a Supabase session that lives in `localStorage` —
 * so it never refuses. What actually refuses in the browser is `RouteRoleGate`, reading
 * `staticData.gate`. A warm session exercises the one path that never had the defect. The pattern
 * is taken from `e2e/security/s2r-tier1-routes-refuse-a-cold-session.spec.ts:70-100`.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { IDS, SCENARIO, inRolledBackTx, say } from "../helpers/tx";

const ROUTE = "/accounting/allocation-workbench";
const HEADING = "پخش حساب";
const PASSWORD = "AfraTest!1404";

/** The supplier's PERSON, from the shared scenario. `create_allocation_row` takes a person. */
const SUPPLIER_PERSON = "bbbbbbbb-0000-4000-8000-000000000003";
const PURCHASE = "eeeeeeee-0000-4000-8000-00000000f001";

/* ───────────────────────────── the database loop ───────────────────────────── */

test("the allocation loop: create → follow up twice → partial payment → unfunded → audit", () => {
  // One purchase of 10,000,000 with a real payment term, so it has a due date and an
  // outstanding balance the partial payment can move.
  const body = `
${SCENARIO}
DO $probe$
DECLARE
  _alloc uuid;
  _term  uuid;
  _r     record;
BEGIN
  SELECT id INTO _term FROM public.payment_terms WHERE days IS NOT NULL ORDER BY days LIMIT 1;
  INSERT INTO public.purchases (id, supplier_id, status, total_amount, quantity, purchase_date, payment_term_id)
  VALUES ('${PURCHASE}', '${IDS.supplier}', 'draft', 10000000, 1, CURRENT_DATE - 60, _term);

  -- 1 · create. payer_person_id is NOT sent: a trigger derives it from customers.person_id.
  _alloc := public.create_allocation_row(
    '${IDS.customerWithCode}', '${SUPPLIER_PERSON}',
    5000000, CURRENT_DATE, 'high', 'IR000111', NULL, '${PURCHASE}');

  SELECT * INTO _r FROM public.list_allocation_rows(CURRENT_DATE, 500, 0) l WHERE l.id = _alloc;
  ${say(
    `'created|status=' || COALESCE(_r.status,'NULL') || '|unfunded=' || _r.is_unfunded::text` +
      ` || '|amount=' || _r.amount::text || '|priority=' || _r.priority` +
      ` || '|payer=' || _r.payer_name || '|beneficiary=' || _r.beneficiary_name`,
  )}

  -- 2 · first follow-up, no promise date.
  PERFORM public.set_allocation_row_status(_alloc, 'خبر می‌ده');
  SELECT * INTO _r FROM public.list_allocation_rows(CURRENT_DATE, 500, 0) l WHERE l.id = _alloc;
  ${say(
    `'followup1|status=' || _r.status || '|unfunded=' || _r.is_unfunded::text` +
      ` || '|promised=' || COALESCE(_r.promised_at::text,'NULL')`,
  )}

  -- 3 · second follow-up, WITH a promise date the database requires for this status —
  --     and the promise is already yesterday, so it has come due unpaid.
  PERFORM public.set_allocation_row_status(_alloc, 'شنبه واریز می‌کنه', CURRENT_DATE - 1, 'قول داد');
  SELECT * INTO _r FROM public.list_allocation_rows(CURRENT_DATE, 500, 0) l WHERE l.id = _alloc;
  ${say(
    `'followup2|status=' || _r.status || '|unfunded=' || _r.is_unfunded::text` +
      ` || '|promised=' || _r.promised_at::text || '|note=' || COALESCE(_r.promised_note,'NULL')`,
  )}

  -- 4 · the partial payment (migration 478). 4,000,000 against a 10,000,000 debt.
  SELECT v.outstanding_amount, v.confirmed_paid_amount, v.is_paid INTO _r
    FROM public.vw_supplier_payables v WHERE v.purchase_id = '${PURCHASE}';
  ${say(
    `'pay_before|outstanding=' || _r.outstanding_amount::text` +
      ` || '|paid=' || _r.confirmed_paid_amount::text || '|is_paid=' || _r.is_paid::text`,
  )}

  PERFORM public.pay_purchase_with_voucher(
    '${PURCHASE}', '${IDS.bank}', CURRENT_DATE, 'cash', 4000000);

  SELECT v.outstanding_amount, v.confirmed_paid_amount, v.is_paid INTO _r
    FROM public.vw_supplier_payables v WHERE v.purchase_id = '${PURCHASE}';
  ${say(
    `'pay_after|outstanding=' || _r.outstanding_amount::text` +
      ` || '|paid=' || _r.confirmed_paid_amount::text || '|is_paid=' || _r.is_paid::text` +
      ` || '|paid_at=' || COALESCE((SELECT p.paid_at::text FROM public.purchases p WHERE p.id = '${PURCHASE}'),'NULL')`,
  )}

  -- 5 · the audit trail. One row for the creation, one per status change.
  INSERT INTO probe
    SELECT 'audit|' || a.action FROM public.audit_logs a
     WHERE a.entity_type = 'allocation' AND a.entity_id = _alloc::text
     ORDER BY a.created_at, a.action;
END
$probe$;
`;

  const out = inRolledBackTx(body);
  const at = (prefix: string) => {
    const line = out.find((l) => l.startsWith(prefix));
    expect(line, `no probe line starting with "${prefix}" in:\n${out.join("\n")}`).toBeTruthy();
    return line as string;
  };

  // A fresh row has NOT been followed up. That is an absence, not a sixth state — the
  // five in the constraint are closed by owner decision D-20.
  expect(at("created|")).toContain("status=NULL");
  expect(at("created|"), "a brand-new row is not unfunded").toContain("unfunded=false");
  expect(at("created|")).toContain("amount=5000000");
  expect(at("created|")).toContain("priority=high");
  // The names come from `persons.display_name` via the payer's customer -> person trigger,
  // which proves payer_person_id was derived rather than sent.
  expect(at("created|")).toContain("payer=P8 With Code");
  expect(at("created|")).toContain("beneficiary=P8 Supplier");

  expect(at("followup1|")).toContain("status=خبر می‌ده");
  expect(at("followup1|"), "a status with no promise cannot make a row unfunded").toContain(
    "unfunded=false",
  );
  expect(at("followup1|")).toContain("promised=NULL");

  expect(at("followup2|")).toContain("status=شنبه واریز می‌کنه");
  expect(at("followup2|")).toContain("note=قول داد");
  // THE FLAG, and it is only a flag: nothing was reallocated ([U] D-21). It is computed on
  // read, so a promise coming due overnight needs no scheduled job.
  expect(
    at("followup2|"),
    "a promise that came due yesterday and was not paid must flag the row unfunded",
  ).toContain("unfunded=true");

  // Migration 478's whole point: 4m against a 10m debt leaves 6m and does NOT settle it.
  expect(at("pay_before|")).toBe("pay_before|outstanding=10000000.00|paid=0|is_paid=false");
  expect(at("pay_after|")).toContain("outstanding=6000000.00");
  expect(at("pay_after|")).toContain("paid=4000000");
  expect(at("pay_after|"), "a partly paid purchase is not paid").toContain("is_paid=false");
  expect(
    at("pay_after|"),
    "paid_at marks SETTLEMENT, so a partial payment must not stamp it",
  ).toContain("paid_at=NULL");

  const audit = out.filter((l) => l.startsWith("audit|"));
  expect(audit, "every allocation action must leave an audit row").toEqual([
    "audit|allocation_created",
    "audit|allocation_status_changed",
    "audit|allocation_status_changed",
  ]);
});

test("the loop left nothing behind — the transaction really did roll back", () => {
  // The rollback IS the cleanup, so it is asserted rather than assumed. Every count below is
  // taken outside any transaction of ours, and each names a row the loop above created.
  expect(
    dbScalar(
      `select count(*)::text from public.allocation_rows
        where payer_customer_id = '${IDS.customerWithCode}'
           or beneficiary_person_id = '${SUPPLIER_PERSON}'`,
    ),
    "an allocation row survived a rolled-back run",
  ).toBe("0");
  expect(
    dbScalar(`select count(*)::text from public.persons where id = '${SUPPLIER_PERSON}'`),
    "the fixture person was committed — the transaction did not roll back",
  ).toBe("0");
  expect(
    dbScalar(`select count(*)::text from public.purchases where id = '${PURCHASE}'`),
    "the fixture purchase was committed — the transaction did not roll back",
  ).toBe("0");
  expect(
    dbScalar(
      `select count(*)::text from public.payment_vouchers where purchase_id = '${PURCHASE}'`,
    ),
    "a POSTED payment voucher escaped the rolled-back transaction — this is a RULE 12 leak",
  ).toBe("0");
});

/* ───────────────────────────── the gate, as written and as lived ───────────────────────────── */

test("the route carries BOTH halves of the gate, naming the same three roles", () => {
  // `beforeLoad` alone is the security-wave-2 defect: it runs on the server, where the session
  // is unreadable, and never in the browser. `staticData.gate` is what RouteRoleGate enforces
  // client-side. Neither one is sufficient.
  const src = readFileSync("src/routes/_app.accounting.allocation-workbench.tsx", "utf8");
  expect(src).toContain(
    'staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } }',
  );
  expect(src).toContain('requireAnyRole(["admin", "manager", "accountant"])');
  for (const role of ["sales", "viewer", "purchase_specialist", "site"]) {
    expect(src, `${role} must not appear in this route's gate`).not.toContain(`"${role}"`);
  }
});

test("the gate matches the LIVE role_permissions rows, not a hand-written list", () => {
  // The registry entry keys off `module: "accounting"`, and `hasPermissionEx` reads these rows
  // at runtime. A gate copied from `src/lib/rbac/roles.ts` instead of measured here is the
  // single most likely wrong gate in this wave — so it is measured.
  const allowed = dbRows(
    `select role_name from public.role_permissions
      where module = 'accounting' and can_view = true order by role_name`,
  );
  expect(allowed).toEqual(["accountant", "admin", "manager"]);

  const refused = dbRows(
    `select role_name from public.role_permissions
      where module = 'accounting' and can_view = false order by role_name`,
  );
  expect(refused).toContain("sales");
  expect(refused).toContain("viewer");

  // No seed was needed and none was added: the workbench reuses the module that already
  // carries exactly these rows.
  const registry = readFileSync("src/lib/navigation/registry.ts", "utf8");
  const idx = registry.indexOf(`to: "${ROUTE}"`);
  expect(idx, "the workbench must be in the navigation registry").toBeGreaterThan(-1);
  const entry = registry.slice(idx, idx + 220);
  expect(entry).toContain('module: "accounting"');
  // `group` is "finance" — the live NavigationGroupKey every neighbour on this hub uses.
  expect(entry).toContain('group: "finance"');
});

test("the workbench is on the finance hub, and the hub does not restate who may see it", () => {
  const hub = readFileSync("src/components/finance/FinanceHub.tsx", "utf8");
  const idx = hub.indexOf(`to: "${ROUTE}"`);
  expect(idx, "the finance hub must reach the workbench").toBeGreaterThan(-1);
  const item = hub.slice(idx, idx + 240);
  // `kind: "registry"` is what makes the hub defer to `isNavigationEntryPermitted`. A
  // hand-written `allowedRoles` here would be a second, drift-prone copy of the authority.
  expect(item).toContain(`target: { kind: "registry", route: "${ROUTE}" }`);
  expect(item).not.toContain("allowedRoles");
});

/* ───────────────────────────── the browser ───────────────────────────── */

/** A context with no stored session at all. Never pass storageState — that is the blind spot. */
async function coldLogin(
  browser: Browser,
  email: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: undefined, locale: "fa-IR" });
  const page = await context.newPage();
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const authKeys = await page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) =>
      k.includes("auth-token"),
    ),
  );
  expect(authKeys, `${email}: a session was already stored, so this run would not be cold`).toEqual(
    [],
  );

  await page.locator('input[name="email"][type="email"]').waitFor({ state: "visible" });
  await page.locator('input[name="email"][type="email"]').fill(email);
  await page.locator('input[name="password"][type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^ورود$/ }).click();
  await expect(page, `${email}: login should leave /login`).not.toHaveURL(/\/login(?:$|\?)/, {
    timeout: 30_000,
  });
  return { page, close: () => context.close() };
}

async function coldVisit(page: Page) {
  await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  return {
    url: page.url(),
    denied: await page.getByTestId("route-gate-denied").count(),
    checking: await page.getByTestId("route-gate-checking").count(),
    // The page's own <h1>. It has to be the heading and not any text: the app chrome renders
    // for everybody, and the sidebar carries the same label — a substring match would report a
    // false exposure on a page RouteRoleGate had correctly refused.
    heading: await page
      .getByRole("heading", { level: 1, name: HEADING, exact: true })
      .count(),
  };
}

for (const email of ["test.viewer@afrakala.local", "test.sales@afrakala.local"]) {
  const who = email.split("@")[0];
  test(`⛔ cold ${who} is refused at the workbench and never sees it`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, close } = await coldLogin(browser, email);
    try {
      const seen = await coldVisit(page);
      expect(
        seen.heading,
        `${who} saw «${HEADING}» — a role the live role_permissions table refuses`,
      ).toBe(0);
      // A redirect to /unauthorized is a refusal too: it means the client guard ran and threw.
      const redirected = /\/unauthorized/.test(seen.url);
      expect(
        seen.denied + seen.checking + (redirected ? 1 : 0),
        `${who} got neither a refusal, nor the checking state, nor a redirect. The route must ` +
          `fail closed on a cold direct navigation (url was ${seen.url}).`,
      ).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
}

test("the open half — a cold accountant reaches the workbench and all three columns draw", async ({
  browser,
}) => {
  // Without this, refusing everybody would satisfy every assertion above. `accountant` is also
  // the role that catches a gate copied from `src/lib/rbac/roles.ts` rather than measured from
  // `role_permissions`.
  test.setTimeout(180_000);
  const { page, close } = await coldLogin(browser, "test.accountant@afrakala.local");
  try {
    const seen = await coldVisit(page);
    expect(seen.denied, "accountant must not be refused at the workbench").toBe(0);
    expect(seen.heading, `accountant should reach «${HEADING}»`).toBeGreaterThan(0);

    // The three columns are the page. Each is asserted separately so a half-drawn page cannot
    // pass as a whole one.
    await expect(page.getByTestId("wb-col-receivables")).toBeVisible();
    await expect(page.getByTestId("wb-col-allocations")).toBeVisible();
    await expect(page.getByTestId("wb-col-payables")).toBeVisible();

    // Each outer column has resolved to one of its honest states — rows, or a named empty
    // state, or a named error — rather than being stuck on the spinner.
    for (const col of ["wb-receivables", "wb-payables"] as const) {
      const rows = await page
        .getByTestId(col === "wb-receivables" ? "wb-receivable-row" : "wb-payable-row")
        .count();
      const empty = await page.getByTestId(`${col}-empty`).count();
      const failed = await page.getByTestId(`${col}-error`).count();
      expect(
        rows + empty + failed,
        `${col} is still loading after 4s — it resolved to no state at all`,
      ).toBeGreaterThan(0);
      expect(failed, `${col} returned an error for an accountant`).toBe(0);
    }

    // The headline reuses compute_daily_capital and says something either way — a figure when
    // the day's cash inputs exist, and the named reason when they do not.
    await expect(page.getByTestId("wb-capital-suggestion")).toBeVisible();

    // And the hub actually offers it to this role.
    await page.goto("/accounting/receipts/create", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("link", { name: HEADING, exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await close();
  }
});
