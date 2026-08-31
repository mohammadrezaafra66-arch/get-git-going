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
 *
 * ─── WHAT WAS TRIED AFTERWARDS, AND WHAT IT COST TO LEARN ───────────────────────────────
 *
 * 1. A SYNTHETIC FIXTURE DOES NOT REPRODUCE THE FAILURE. Four prompts (the current one, plus
 *    verbatim-with-separators, digit-count, and an explicit input/output example) were each run
 *    three times against a generated Persian slip printed 462,000,000 rial, and then three more
 *    times each against a blurred, downscaled, low-contrast copy meant to imitate thermal
 *    print. Twenty-four runs, twenty-four correct — INCLUDING the current prompt. The fixture
 *    renders in Vazirmatn, where a zero is a clean ring; on real thermal paper it is a bare dot
 *    that a thousands comma is barely distinguishable from. So the experiment could not tell
 *    the prompts apart, and choosing between them stays [UNKNOWN].
 *
 *    The general lesson, which outlives this bug: A TEST THAT DOES NOT REPRODUCE THE FAILING
 *    CONDITION PROVES NOTHING BY BEING GREEN. Twenty-four green runs said only that the
 *    fixture was easy.
 *
 * 2. LOCAL OCR IS NOT VIABLE ON THIS HARDWARE. There is no discrete GPU — only an integrated
 *    Intel UHD 730 — and Ollama reports `in_VRAM=0.0GB` for every loaded model, i.e. pure CPU
 *    inference. Measured for one trivial token: 7B → 9.6s, 14B → 67.6s, and the 24B vision
 *    model (qwen3.6, the only vision model installed) timed out after 180s. RAM is not the
 *    constraint: 127.7GB total, 76.7GB free. Phase 7's goal of local OCR is not reachable on
 *    this server as configured.
 *
 * 3. LIGHTER VISION MODELS NOT TESTED: moondream, llava:7b, qwen2-vl:7b, minicpm-v. By the
 *    timings above a ~7B model would land near 10-20s, which is borderline usable — but their
 *    accuracy on Persian numerals is [UNKNOWN] and nothing here should be read as endorsing
 *    one. None was installed; Ollama's configuration was not touched.
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
