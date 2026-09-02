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

  test("every role that can create a quote can also detach", () => {
    // 1-الف. A previous commit hid this control from sales, which closed the walk-in flow. That
    // was a workflow change dressed as a dead-end fix, and it is reverted here. The explicit
    // commitment checkbox and the guest_no_link reason arrive with step 3, not before.
    expect(form).not.toContain("canRecordGuestQuote");
    expect(form).not.toContain("quote-detach-not-permitted");
    expect(form).not.toContain("از این حساب کاربری ممکن نیست");
  });

  test("no env value may contain another variable's name", () => {
    // The class of bug that made a flag report as ON while being OFF: an env file line with no
    // trailing newline swallowed the next variable, so VITE_APP_ENV's value became
    // "testVITE_FEATURE_QUOTE_CUSTOMER_PICKER=true" and the flag key never existed. A grep for the
    // flag name found it inside that value and was mistaken for proof.
    const flagNames = [...flags.matchAll(/envFlag\("([A-Z_]+)"\)/g)].map((m) => m[1]);
    expect(flagNames.length).toBeGreaterThan(0);
    for (const n of flagNames) {
      expect(n, `${n} must be a bare variable name`).toMatch(/^VITE_[A-Z_]+$/);
      expect(n.slice(5), `${n} must not contain a second VITE_ prefix`).not.toContain("VITE_");
    }
    // and the reader must compare against an exact value, never a substring
    expect(flags).toContain('return raw === "true"');
    expect(flags).not.toMatch(/\.includes\(|\.startsWith\(|\.indexOf\(/);
  });

  test("no persons search was added, and context links are untouched", () => {
    // Conflict 3 was cancelled. Searching persons would show a sales user FEWER records (18 vs 73),
    // and 'repairing' the 56 missing person_context_links would quadruple what sales can see.
    expect(form).not.toContain('.from("persons")');
    expect(form).not.toContain("person_context_links");
  });

  test("every flag reaches the bundle: .env -> compose args -> Dockerfile ARG -> Dockerfile ENV", () => {
    // THE GATE THAT WOULD HAVE CAUGHT 2026-09-02. Vite inlines VITE_* at BUILD time, so a flag has
    // to survive four hops to exist in the bundle. Two of them were missing and nothing complained:
    // the compose build arg was passed to a Dockerfile with no matching ARG, so it was dropped
    // silently, and with no ENV line the build process never saw it either. The result is the
    // failure mode that reads as success — the code is correct, the flag is false, the old
    // behaviour ships, and a deploy log full of green says nothing is wrong.
    //
    // Checked from feature-flags.ts outward, so a flag added later is covered without editing this.
    const flags = [
      ...readFileSync("src/lib/feature-flags.ts", "utf8").matchAll(/envFlag\(\s*"(VITE_[A-Z_]+)"/g),
    ].map((m) => m[1]);
    expect(flags.length, "feature-flags.ts should declare at least one flag").toBeGreaterThan(0);

    const dockerfile = readFileSync("Dockerfile", "utf8");
    const compose = readFileSync("deploy/lan/docker-compose.yml", "utf8");

    const composeArgs = compose.split(/\r?\n/).map((l) => l.trim());
    const dockerLines = dockerfile.split(/\r?\n/).map((l) => l.trim());

    for (const flag of flags) {
      expect(
        composeArgs.some((l) => l.startsWith(flag + ":")),
        flag + " must be passed as a build arg in docker-compose.yml",
      ).toBe(true);
      expect(
        dockerLines.some((l) => l === "ARG " + flag),
        flag + " needs an ARG in the Dockerfile, or compose drops the build arg silently",
      ).toBe(true);
      expect(
        dockerLines.some((l) => l.startsWith(flag + "=$" + flag)),
        flag + " needs an ENV line, or the build process never sees it",
      ).toBe(true);
    }
  });
});
