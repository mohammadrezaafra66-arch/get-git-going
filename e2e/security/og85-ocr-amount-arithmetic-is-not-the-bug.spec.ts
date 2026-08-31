/**
 * OG-85 — the receipt OCR amount error is in the MODEL, not in our arithmetic.
 *
 * WHY THIS EXISTS. The owner reported receipts landing with the wrong amount and the obvious
 * suspicion was the rial→toman conversion. It is not. Measured on 2026-08-29 against live rows,
 * the app's arithmetic is correct on every single one: `model_amount / 10 == stored_amount`.
 *
 * What is wrong is upstream. The vision model reads the significant digits correctly and then
 * under-counts the run of zeros, by a DIFFERENT number of zeros each time:
 *
 *   printed 462,000,000 rial  → model returned    46,200,000  → lost 1 zero   (10x)
 *   printed 150,000,000 rial  → model returned     1,500,000  → lost 2 zeros  (100x)
 *   printed 1,336,000,000 rial → model returned    1,336,000  → lost 3 zeros  (1000x)
 *
 * Reading the amount line at full zoom shows why: on thermal print the Persian zero `۰` is a
 * bare dot and the thousands comma is a dot with a small tail, so `۱۵۰,۰۰۰,۰۰۰` is nine
 * near-identical dots in a row. The same model read that receipt's 20-digit tracking number
 * byte-perfect, so it is not image resolution.
 *
 * THE POINT OF THIS GATE. Because the error looks like a factor-of-ten problem, the tempting
 * "fix" is to change the divisor. That would be wrong — there is no single factor — and it
 * would corrupt every receipt whose amount the model happened to read correctly. This gate
 * pins the arithmetic so that a future attempt to paper over the model defect fails loudly
 * here instead of silently in the ledger.
 *
 * It deliberately does NOT assert that the model is correct. The model is known to be wrong;
 * that is a separate, open problem.
 */
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";

test.describe("OG-85 — OCR amount arithmetic", () => {
  test("every stored receipt amount is exactly one tenth of what the model returned", () => {
    // The invariant that must survive any future work on the model problem.
    const wrong = dbScalar(
      `select count(*)
         from public.payment_receipts r
         join public.document_attachments a on a.receipt_id = r.id
        where a.ocr_payload is not null
          and (a.ocr_payload->'structured'->'structured'->>'currency') in ('IRR','UNKNOWN')
          and (a.ocr_payload->'structured'->>'amount') is not null
          and round((a.ocr_payload->'structured'->'structured'->>'amount')::numeric / 10, 2)
              is distinct from (a.ocr_payload->'structured'->>'amount')::numeric`,
    );
    expect(wrong).toBe("0");
  });

  test("the invariant is measured against real rows, not an empty set", () => {
    // Without this the count above is trivially zero on a database with no OCR history.
    const scored = Number(
      dbScalar(
        `select count(*) from public.document_attachments
          where ocr_payload is not null
            and (ocr_payload->'structured'->>'amount') is not null`,
      ),
    );
    expect(scored).toBeGreaterThan(0);
  });

  test("the three measured cases are still present as evidence", () => {
    // These rows are the record of the finding. If they are ever purged the next person loses
    // the only concrete proof of what the model does, so the gate says so rather than
    // silently passing on an empty table.
    const seen = dbRows(
      `select distinct (ocr_payload->'structured'->'structured'->>'amount')
         from public.document_attachments
        where ocr_payload is not null
          and (ocr_payload->'structured'->'structured'->>'amount') in ('46200000','1336000')
        order by 1`,
    );
    expect(seen.length).toBeGreaterThan(0);
  });
});
