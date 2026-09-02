/**
 * OG-93 — the quote's link to a customer is the id, not a string match.
 *
 * WHAT IT REPLACES. The form kept the link only while the typed name and phone still
 * string-matched the picked record. The server never asked for that: create_sales_quote_with_items
 * has zero references to customers.name or customers.phone in its 337 lines and decides ownership
 * from p_customer_id alone. The rule was born in migration 147's one-time historical backfill —
 * where guessing a link from strings was reasonable — and was carried into the live form the next
 * day in 732f46e4, where it is not: there the id is already known.
 *
 * Measured before the change: 3 of 63 quotes are true guests, and of the 18 carrying
 * accounting_approval, 16 ARE linked — so only about 2 ever took the detach path. The 92% "drift"
 * figure is not the size of the problem; drift happens AFTER a quote is written, when someone
 * edits the customer file, and that is correct behaviour.
 *
 * Both steps ship together behind one flag. Shipping the picker without the phone button would
 * make 59% of the register unsellable, because 51 of 86 active customers have no phone and the RPC
 * requires one.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const form = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");
const flags = readFileSync("src/lib/feature-flags.ts", "utf8");

test.describe("OG-93 — the customer link is the id", () => {
  test("both behaviours sit behind one flag, and it fails closed", () => {
    expect(flags).toContain("FEATURE_QUOTE_CUSTOMER_PICKER");
    expect(flags).toContain('return raw === "true"');
    expect(form).toContain("FEATURE_QUOTE_CUSTOMER_PICKER");
  });

  test("with the flag on, the link is the id and survives an edited file", () => {
    expect(form).toContain("return guestOverride ? null : selectedCustomer.id;");
  });

  test("the string-match rule is no longer unconditional", () => {
    // It still exists as the flag-off path, deliberately — that is the rollback. What must be gone
    // is it running regardless of the flag.
    const memo = form.slice(
      form.indexOf("const linkedCustomerId"),
      form.indexOf("}, [selectedCustomer"),
    );
    expect(memo).toContain("if (FEATURE_QUOTE_CUSTOMER_PICKER)");
    expect(memo.indexOf("if (FEATURE_QUOTE_CUSTOMER_PICKER)")).toBeLessThan(
      memo.indexOf("nameMatches"),
    );
  });

  test("detaching is an explicit, confirmed act", () => {
    expect(form).toContain('data-testid="quote-detach-open"');
    expect(form).toContain('data-testid="quote-detach-confirm"');
    expect(form).toContain("setGuestOverride(true)");
    // and it is reversible
    expect(form).toContain('data-testid="quote-reattach"');
  });

  test("typing over the identity is impossible while linked", () => {
    expect(form).toContain("const identityLocked = Boolean(");
    expect(form).toContain("readOnly={identityLocked}");
  });

  test("a customer with no phone is blocked, and repaired in the FILE", () => {
    expect(form).toContain("const pickedCustomerHasNoPhone = Boolean(");
    expect(form).toContain('data-testid="quote-add-phone-save"');
    expect(form).toContain('.from("customers")');
    expect(form).toContain(".update({ phone: trimmed })");
    // duplicate control, and cache refresh
    expect(form).toContain("این شماره قبلاً برای مشتری دیگری ثبت شده است.");
    expect(form).toContain("invalidateQueries");
  });

  test("the blocked identity-from-record behaviour is present but OFF", () => {
    // Conflict 2: prepared, never enabled, and the reason is a number not an opinion.
    expect(flags).toContain("FEATURE_QUOTE_IDENTITY_FROM_RECORD");
    expect(flags).toContain("51 of 86 active customers");
    // it must not be wired into the form yet
    expect(form).not.toContain("FEATURE_QUOTE_IDENTITY_FROM_RECORD");
  });

  test("a role that cannot record a guest quote is not offered the detach button", () => {
    // Without this the salesperson detaches, fills the whole form, and is bounced by a server
    // error at the end — a dead end. The server admits admin|manager|sales to create a quote and
    // accepts a detached one only through accounting_approval, so admin and manager are the roles
    // that can actually carry it through.
    expect(form).toContain("const canRecordGuestQuote = hasAnyRole(roles,");
    expect(form).toContain('data-testid="quote-detach-not-permitted"');
    expect(form).toContain("نیاز به تأیید حسابداری دارد");
  });

  test("no persons search was added, and context links are untouched", () => {
    // Conflict 3 was cancelled. Searching persons would show a sales user FEWER records (18 vs 73),
    // and 'repairing' the 56 missing person_context_links would quadruple what sales can see.
    expect(form).not.toContain('.from("persons")');
    expect(form).not.toContain("person_context_links");
  });
});
