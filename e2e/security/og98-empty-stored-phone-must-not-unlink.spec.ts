/**
 * OG-98 — an empty stored phone must not break the customer link.
 *
 * THE BUG, MEASURED ON PRODUCTION (docs/audit/quote-customer-link-20260904.md):
 * 1663 of 1700 customers have no phone on file. Picking one of them sets
 * selectedCustomer.phone to "" (selectCustomer coalesces NULL to the empty string). The
 * salesperson then types the customer's number into the form, and the link rule compares
 *
 *     ""  ===  "09123456789"
 *
 * which is false, so linkedCustomerId goes null and the quote is written with customer_id NULL.
 * Silently: no warning, no badge change the salesperson is looking at, nothing. 154 quotes have
 * already lost their link this way, and the 43-migration set did not cause it — the link rate was
 * 24% before and 17% after.
 *
 * WHY THIS TEST EVALUATES THE SOURCE RATHER THAN DRIVING A BROWSER. The rule lives inline in a
 * useMemo, so there is nothing to import. Driving the UI would need the fixed code deployed to the
 * test server, and that server currently runs a different branch — a browser run there would grade
 * the wrong code and report green for the wrong reason. So this extracts the real expression from
 * the real file and evaluates it. If someone edits the rule, this reads the edit, not a copy.
 */
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const FILE = "src/routes/_app.sales.quotes.new.tsx";

/**
 * Pull the body of the linkedCustomerId useMemo out of the source and run it against a fake
 * customer. Returns whatever the memo would return for these inputs.
 */
function linkFor(input: {
  stored: string;
  typedName: string;
  typedPhone: string;
  storedName?: string;
}): string | null {
  const src = readFileSync(FILE, "utf8");
  const start = src.indexOf("const linkedCustomerId = useMemo(");
  expect(start, `${FILE} must still declare linkedCustomerId as a useMemo`).toBeGreaterThan(-1);
  const body = src.slice(src.indexOf("{", start) + 1, src.indexOf("}, [selectedCustomer", start));

  const selectedCustomer = {
    id: "CUST-1",
    name: input.storedName ?? input.typedName,
    phone: input.stored,
  };
  // eslint-disable-next-line no-new-func -- deliberately evaluating the shipped expression
  const run = new Function("selectedCustomer", "customerName", "customerPhone", body);
  return run(selectedCustomer, input.typedName, input.typedPhone) as string | null;
}

test.describe("OG-98 — a customer with no stored phone still links", () => {
  test("THE BUG: empty stored phone + typed number must still link", () => {
    // This is the 1663-customer case. It FAILS on the unfixed rule.
    const id = linkFor({ stored: "", typedName: "شرکت نمونه", typedPhone: "09123456789" });
    expect(id, "an empty stored phone must not clear the customer link").toBe("CUST-1");
  });

  test("and a NULL-shaped empty value behaves the same", () => {
    // selectCustomer coalesces NULL to "", but a blank-with-spaces value reaches the same place.
    const id = linkFor({ stored: "   ", typedName: "شرکت نمونه", typedPhone: "0912 345 6789" });
    expect(id, "a whitespace-only stored phone is still no phone").toBe("CUST-1");
  });

  test("a stored phone that MATCHES still links — formatting differences included", () => {
    // Non-vacuous grounding: the rule's original purpose still works.
    const id = linkFor({
      stored: "09123456789",
      typedName: "شرکت نمونه",
      typedPhone: "0912-345-6789",
    });
    expect(id, "normalised equal phones must link").toBe("CUST-1");
  });

  test("A REAL DIVERGENCE STILL CLEARS THE LINK — this is the money-safety half", () => {
    // The fix must not become "always link". A stored number that disagrees with the typed one is
    // exactly the case the original rule was written for: a stale id must never attach a payment
    // to the wrong customer.
    const id = linkFor({
      stored: "09123456789",
      typedName: "شرکت نمونه",
      typedPhone: "09990000000",
    });
    expect(id, "two different real numbers must not link").toBeNull();
  });

  test("a changed NAME still clears the link", () => {
    const id = linkFor({
      stored: "",
      storedName: "شرکت الف",
      typedName: "شرکت ب",
      typedPhone: "09123456789",
    });
    expect(id, "the name half of the rule is untouched").toBeNull();
  });
});
