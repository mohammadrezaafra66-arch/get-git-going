/**
 * D-1 / D-3 — the ledger wizard must not decide, on the owner's behalf, which
 * file a document is booked against.
 *
 * Why a NODE unit test and not a browser test: both defects live in a pure
 * function, and the browser cannot reach either of them today.
 *
 *   - D-1's refusal needs a person who has an Asan code but NO customer file.
 *     Measured on the test database on 2026-09-04: `persons=91 customers=88`,
 *     and all three persons without a customer file
 *     (`E2E_AUDIT_20260729_UI299_{Supp,Inact,Miss}Person`) have no Asan code
 *     either, so `lookupParty` returns `missing_asan` and stops two checks
 *     earlier. The guard is unreachable through the UI on today's data.
 *   - D-3's silent supplier-first pick IS reachable (15 people hold both a
 *     customer and a supplier file), but only on the payment/dual branches, and
 *     what it produced was a *plausible wrong answer*, never an error — a
 *     browser assertion could only re-read the value the code chose.
 *
 * So the honest probe is the decision function itself.
 *
 * Run:
 *   npx playwright test e2e/unit/ledger-wizard-party-pick.spec.ts \
 *     --config=e2e/unit/playwright.unit.config.ts
 */
import { test, expect } from "@playwright/test";

import {
  noFileMessage,
  pickPartyFile,
  selectPartyFile,
  partyFiles,
} from "../../src/features/ledger-wizard/lookup";
import type { LookupState, PartyHit } from "../../src/features/ledger-wizard/types";

const CUST = "11111111-1111-4111-8111-111111111111";
const SUPP = "22222222-2222-4222-8222-222222222222";
const EXT = "33333333-3333-4333-8333-333333333333";

test.describe("D-3 — a person with several files is never resolved silently", () => {
  test("dual-role person on the payment/dual branch is handed back for the operator to choose", () => {
    const outcome = pickPartyFile("any", CUST, SUPP, null);
    // BEFORE this change `pickKind` walked supplier -> external_party -> customer
    // and returned { kind: "supplier" } here, with no trace that a customer file
    // also existed. Every payment to any of the 15 dual-role people was booked
    // against the supplier file because of that ordering alone.
    expect(outcome.outcome).toBe("choose");
    if (outcome.outcome !== "choose") return;
    expect(outcome.options.map((o) => o.kind)).toEqual(["customer", "supplier"]);
  });

  test("all three files present -> all three offered, none preferred", () => {
    const outcome = pickPartyFile("any", CUST, SUPP, EXT);
    expect(outcome.outcome).toBe("choose");
    if (outcome.outcome !== "choose") return;
    expect(outcome.options.map((o) => o.kind)).toEqual(["customer", "supplier", "external_party"]);
    expect(outcome.options.map((o) => o.roleId)).toEqual([CUST, SUPP, EXT]);
  });

  test("supplier + external party, no customer -> still a choice, not the old supplier-first", () => {
    const outcome = pickPartyFile("any", null, SUPP, EXT);
    expect(outcome.outcome).toBe("choose");
  });

  test("exactly one file is used without asking — a choice with one answer is not a choice", () => {
    expect(pickPartyFile("any", CUST, null, null)).toEqual({
      outcome: "picked",
      file: { kind: "customer", roleId: CUST },
    });
    expect(pickPartyFile("any", null, SUPP, null)).toEqual({
      outcome: "picked",
      file: { kind: "supplier", roleId: SUPP },
    });
    expect(pickPartyFile("any", null, null, EXT)).toEqual({
      outcome: "picked",
      file: { kind: "external_party", roleId: EXT },
    });
  });

  test("no file at all -> refusal, and it reports what the person does hold (nothing)", () => {
    const outcome = pickPartyFile("any", null, null, null);
    expect(outcome).toEqual({ outcome: "none", available: [] });
  });
});

test.describe("D-1 — the receipt refusal states its real condition, not a policy", () => {
  test("a supplier-only payer is refused, and the message names the customer file as the gap", () => {
    const outcome = pickPartyFile("customer", null, SUPP, null);
    expect(outcome).toEqual({
      outcome: "none",
      available: [{ kind: "supplier", roleId: SUPP }],
    });
    if (outcome.outcome !== "none") return;

    const msg = noFileMessage("رضا", "customer", outcome.available);

    // The sentence that had to go. «دریافت فقط از مشتری ثبت می‌شود» asserts a
    // POLICY — "a receipt is only ever recorded from a customer" — which the
    // owner's OG-16 contradicts outright. What is actually true is narrower and
    // temporary: create_receipt(p_customer_id uuid) is keyed to customers.id,
    // so today's implementation needs that one file.
    expect(msg).not.toContain("دریافت فقط از مشتری ثبت می‌شود");
    expect(msg).not.toContain("این شخص مشتری نیست");

    // What it must say instead: the condition, the files held, and the remedy.
    expect(msg).toContain("رضا");
    expect(msg).toContain("پروندهٔ مشتری ندارد");
    expect(msg).toContain("تأمین‌کننده");
    expect(msg).toContain("بسازید");
  });

  test("a payer with NO file at all gets the same remedy, not a role verdict", () => {
    const msg = noFileMessage("زهرا", "customer", []);
    expect(msg).not.toContain("این شخص مشتری نیست");
    expect(msg).toContain("هیچ پرونده‌ای");
    expect(msg).toContain("بسازید");
  });

  test("a payer who has a customer file is accepted, dual role or not", () => {
    expect(pickPartyFile("customer", CUST, null, null)).toEqual({
      outcome: "picked",
      file: { kind: "customer", roleId: CUST },
    });
    // The receipt branch is the one place where a preference is legitimate: the
    // RPC takes customers.id and nothing else, so there is no decision to make.
    expect(pickPartyFile("customer", CUST, SUPP, EXT)).toEqual({
      outcome: "picked",
      file: { kind: "customer", roleId: CUST },
    });
  });
});

test.describe("partyFiles ordering is stable and complete", () => {
  test("order is customer, supplier, external party, and absent files are omitted", () => {
    expect(partyFiles(CUST, SUPP, EXT).map((f) => f.kind)).toEqual([
      "customer",
      "supplier",
      "external_party",
    ]);
    expect(partyFiles(null, SUPP, null).map((f) => f.kind)).toEqual(["supplier"]);
    expect(partyFiles(null, null, null)).toEqual([]);
  });
});

function hit(kind: PartyHit["kind"], roleId: string): PartyHit {
  return {
    personId: "44444444-4444-4444-8444-444444444444",
    displayName: "شخص دو نقشه",
    asanCode: "A-1",
    kind,
    roleId,
    customerId: CUST,
    supplierId: SUPP,
    externalPartyId: null,
  };
}

test.describe("selectPartyFile — only the operator's own pick resolves a choice", () => {
  const choosing: LookupState = {
    status: "choose_role",
    query: "A-1",
    party: null,
    options: [hit("customer", CUST), hit("supplier", SUPP)],
    missingName: "شخص دو نقشه",
    message: "…",
  };

  test("picking the customer file yields an advanceable ok state on that file", () => {
    const next = selectPartyFile(choosing, CUST);
    expect(next.status).toBe("ok");
    expect(next.party?.kind).toBe("customer");
    expect(next.party?.roleId).toBe(CUST);
    expect(next.message).toBeNull();
  });

  test("picking the supplier file yields the supplier document, not the first option", () => {
    const next = selectPartyFile(choosing, SUPP);
    expect(next.status).toBe("ok");
    expect(next.party?.kind).toBe("supplier");
  });

  test("an unknown roleId cannot fabricate a party", () => {
    expect(selectPartyFile(choosing, "not-an-option")).toEqual(choosing);
  });

  test("a state that is not a choice is returned untouched", () => {
    const refused: LookupState = {
      status: "wrong_role",
      query: "x",
      party: null,
      options: [],
      missingName: "رضا",
      message: "…",
    };
    expect(selectPartyFile(refused, CUST)).toEqual(refused);
  });
});
