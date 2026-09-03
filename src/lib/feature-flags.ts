/**
 * Feature flags.
 *
 * Read once at module load from Vite's env. A flag is ON only when its variable is exactly the
 * string "true" — anything else, including an unset variable, leaves it OFF. That way a typo or a
 * missing value fails closed rather than shipping an unfinished behaviour.
 *
 * Rollback for anything guarded here is therefore a deploy-time change, not a code revert: unset
 * the variable (or set it to anything but "true") and rebuild.
 */

function envFlag(name: string): boolean {
  const raw = (import.meta.env as Record<string, string | undefined>)[name];
  return raw === "true";
}

/**
 * Sales quote form: the customer is chosen from the registry and the name and phone become
 * read-only, the link survives edits to the customer file, and detaching is an explicit act.
 *
 * WHAT THIS REPLACES. The form used to keep the customer link only while the typed name and phone
 * still string-matched the picked record (_app.sales.quotes.new.tsx, the linkedCustomerId memo).
 * The server never asked for that: create_sales_quote_with_items contains zero references to
 * customers.name or customers.phone in its 337 lines, and decides ownership from p_customer_id
 * alone. The rule originated in migration 147's one-time historical backfill, where guessing a link
 * from strings was reasonable, and was carried into the live form the next day, where it is not —
 * there the id is already known.
 *
 * WHY IT SHIPS WITH THE PHONE BUTTON. 51 of 86 active customers have no phone on file. Making the
 * link stick without also offering "add a phone to the customer file" would leave 59% of the
 * register unsellable, because the RPC still requires a non-empty phone.
 */
export const FEATURE_QUOTE_CUSTOMER_PICKER = envFlag("VITE_FEATURE_QUOTE_CUSTOMER_PICKER");

/**
 * Sales quote form: send the customer's name and phone FROM THE CUSTOMER RECORD rather than from
 * what the salesperson typed.
 *
 * DELIBERATELY OFF, AND IT IS NOT READY TO TURN ON. It is blocked on a number, not on code:
 * 51 of 86 active customers currently have no phone, and none of them has a mobile identifier to
 * copy one from either. Reading the phone from the record today would send an empty string into a
 * function that requires a non-empty one, and 59% of the customer file would become unsellable.
 *
 * TURN THIS ON ONLY WHEN "active customers with no phone" has reached zero, or an approved
 * exception list. Filling those numbers is operational work for the team — there is no data in the
 * system to script it from.
 */
/**
 * Sales quote form: a salesperson must tick a named commitment before a quote with no customer
 * file can be saved.
 *
 * SEPARATE FROM THE PICKER FLAG, AND OFF BY DEFAULT, BECAUSE OF A NUMBER. On production 150 of 196
 * quotes — 76% — have no customer file. So the commitment tick does not land on an edge case, it
 * lands on three quarters of daily work. That was invisible from the test database, where only 3
 * of 63 quotes are guests, and it is the reason this is its own switch: the picker, the read-only
 * fields and the add-phone button can ship without changing how most of the day already works.
 *
 * IT CONTROLS BOTH COPIES OR IT CONTROLS NEITHER. The commitment exists in two places — the block
 * on the form, and the variant inside QuoteCreationBlockDialog. Gating only the first would move
 * the checkbox rather than remove it, which is the weaker design the form's own comment argues
 * against. One flag, both sites.
 *
 * WHAT IT DOES NOT GATE: guest_no_link itself. Recording a quote with no customer file under its
 * own reason, instead of borrowing "accounting approval" from a department that never approved it,
 * is worth having whether or not a commitment is demanded on top.
 */
export const FEATURE_QUOTE_GUEST_COMMITMENT = envFlag("VITE_FEATURE_QUOTE_GUEST_COMMITMENT");

export const FEATURE_QUOTE_IDENTITY_FROM_RECORD = envFlag(
  "VITE_FEATURE_QUOTE_IDENTITY_FROM_RECORD",
);
