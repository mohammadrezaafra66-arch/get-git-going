import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

/**
 * ASAN M4.1 — stable Asan document numbering.
 *
 * The owner is starting Asan from 1. What must hold: a document exported once keeps its number
 * forever, two documents never share a number, and a number consumed by a document that is
 * later cancelled is burned rather than handed to the next document.
 *
 * API-level on purpose. Every rule here lives in the database — a SECURITY DEFINER function
 * plus two unique constraints plus a table with no write policy at all — precisely so that no
 * client can dodge it, so the honest test is the one that tries to dodge it.
 */

const MARK = `${E2E_PREFIX}ASAN_NUM`;
/** Deterministic fake source ids: these documents do not exist, which is the point — numbering
 *  must not depend on the source row, so that a burned number survives its document. */
const DOC_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const DOC_B = "aaaaaaaa-0000-4000-8000-00000000000b";
const DOC_C = "aaaaaaaa-0000-4000-8000-00000000000c";
const PAR_1 = "aaaaaaaa-0000-4000-8000-0000000000d1";
const PAR_2 = "aaaaaaaa-0000-4000-8000-0000000000d2";
const PURCHASE_DOC = "aaaaaaaa-0000-4000-8000-00000000000f";
const ALL_FAKE = [DOC_A, DOC_B, DOC_C, PAR_1, PAR_2, PURCHASE_DOC];

let adminJwt: string;
let salesJwt: string | null = null;
let quoteId: string | null = null;

// OG-46: the register's high-water mark per doc_type, read from the live database at spec start
// rather than assumed to be zero. See the note in beforeAll.
const numbersBaseline = { sales: 0, purchase: 0 };
let rowsBaseline = 0;

async function assign(jwt: string, docType: string, sourceId: string) {
  return rest<number>(jwt, "/rpc/asan_assign_document_number", {
    method: "POST",
    body: JSON.stringify({ _doc_type: docType, _source_id: sourceId }),
  });
}

async function assignOk(docType: string, sourceId: string): Promise<number> {
  const res = await assign(adminJwt, docType, sourceId);
  expect(res.status, res.text).toBeLessThan(300);
  return Number(res.body);
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const salesUser = await userWithRole(adminJwt, "sales");
  salesJwt = salesUser ? mintJwt(salesUser) : null;

  // OG-46: this used to require the whole table to be EMPTY, on the reasoning that otherwise
  // "the first document gets 1" is not a test of anything. That reasoning was right and the
  // implementation was wrong: it pinned a global count, so the first real Asan export anyone
  // performed made this spec unrunnable. The live table now holds two rows — one
  // `accounting_document` and one `sales_invoice`, both number 1.
  //
  // The property under test is not "the register starts at 1", it is "each doc_type has its
  // OWN register and hands out CONSECUTIVE numbers". That survives a non-empty table if the
  // expected values are computed from the register's current high-water mark instead of
  // assumed. Captured here, per doc_type, by an independent query.
  numbersBaseline.sales = Number(
    dbScalar("select coalesce(max(asan_number), 0) from asan_export_numbers where doc_type = 'sales_invoice'"),
  );
  numbersBaseline.purchase = Number(
    dbScalar("select coalesce(max(asan_number), 0) from asan_export_numbers where doc_type = 'purchase_invoice'"),
  );
  rowsBaseline = Number(dbScalar("select count(*) from asan_export_numbers"));
});

test.afterAll(() => {
  // The burn test deliberately deletes its quote, so its mapping row can no longer be found
  // *through* sales_quotes — that survival is the property under test. Clean it by the id we
  // captured, or it outlives the phase (rule 2.10).
  const ids = [...ALL_FAKE, ...(quoteId ? [quoteId] : [])].map((x) => `'${x}'`).join(",");
  dbExecE2e(
    `-- ${MARK} cleanup
     delete from asan_export_numbers where source_id in (${ids})
        or source_id in (select id from sales_quotes where customer_name like '${MARK}%');
     delete from sales_quote_items where quote_id in
        (select id from sales_quotes where customer_name like '${MARK}%');
     delete from sales_quotes where customer_name like '${MARK}%';`,
  );
  // OG-46: was `toBe(0)`, which asserted the whole register was empty — true only on a database
  // no real Asan export had ever touched. The cleanup above deletes exactly the rows this spec
  // minted, so the honest assertion is that the register is back to the height it had when the
  // spec started, captured by an independent query in beforeAll.
  expect(
    Number(dbScalar("select count(*) from asan_export_numbers")),
    "rule 2.10 — this spec's rows are gone and no pre-existing row was harmed",
  ).toBe(rowsBaseline);
  expect(
    Number(dbScalar(`select count(*) from sales_quotes where customer_name like '${MARK}%'`)),
  ).toBe(0);
});

test("three documents receive consecutive numbers, in order", async () => {
  // OG-46: was `toBe(1)/(2)/(3)`. The register is shared with real Asan exports, so absolute
  // numbers were only ever correct on an untouched database. Consecutiveness from wherever the
  // register currently stands is the actual guarantee, and it is the stronger assertion: it
  // still fails if the RPC skips, repeats or reorders.
  expect(await assignOk("sales_invoice", DOC_A)).toBe(numbersBaseline.sales + 1);
  expect(await assignOk("sales_invoice", DOC_B)).toBe(numbersBaseline.sales + 2);
  expect(await assignOk("sales_invoice", DOC_C)).toBe(numbersBaseline.sales + 3);
});

test("a document exported twice keeps its number", async () => {
  const again = await assignOk("sales_invoice", DOC_A);
  expect(again, "re-export must not mint a new number").toBe(numbersBaseline.sales + 1);
  expect(
    Number(dbScalar(`select count(*) from asan_export_numbers where source_id = '${DOC_A}'`)),
    "and must not create a second mapping row",
  ).toBe(1);
});

test("each document type has its own register", async () => {
  // Sales has advanced by three above; the purchase register must be untouched by that and hand
  // out ITS next number. OG-46: was `toBe(1)`, which silently also asserted that no purchase
  // invoice had ever been exported. Comparing against the purchase register's own baseline keeps
  // the real claim — the two registers are independent — and drops the accidental one.
  expect(await assignOk("purchase_invoice", PURCHASE_DOC)).toBe(numbersBaseline.purchase + 1);
});

test("two simultaneous assignments receive two different numbers", async () => {
  const [a, b] = await Promise.all([
    assign(adminJwt, "sales_invoice", PAR_1),
    assign(adminJwt, "sales_invoice", PAR_2),
  ]);
  expect(a.status, a.text).toBeLessThan(300);
  expect(b.status, b.text).toBeLessThan(300);
  expect(Number(a.body)).not.toBe(Number(b.body));
  expect(Math.abs(Number(a.body) - Number(b.body)), "consecutive, not colliding").toBe(1);

  const all = dbRows("select asan_number from asan_export_numbers where doc_type='sales_invoice'");
  expect(new Set(all).size, "no two sales documents share a number").toBe(all.length);
});

test("a duplicate number cannot be inserted even from inside the database", () => {
  // The verdict is written to a temp table and SELECTed back rather than RAISEd as a NOTICE:
  // psql sends notices to stderr, which the helper does not capture, so a notice-based probe
  // would report nothing and look like a failure whatever the database actually did.
  const out = dbExecE2e(
    `-- ${MARK} duplicate-number probe
     CREATE TEMP TABLE probe_verdict (verdict text);
     DO $t$ BEGIN
       BEGIN
         INSERT INTO public.asan_export_numbers (doc_type, source_id, asan_number)
         SELECT 'sales_invoice', gen_random_uuid(), asan_number
           FROM public.asan_export_numbers WHERE doc_type = 'sales_invoice' LIMIT 1;
         INSERT INTO probe_verdict VALUES ('PROBE_FAILED_duplicate_accepted');
       EXCEPTION WHEN unique_violation THEN
         INSERT INTO probe_verdict VALUES ('PROBE_OK_duplicate_rejected');
       END;
     END $t$;
     SELECT verdict FROM probe_verdict;`,
  );
  expect(out).toContain("PROBE_OK_duplicate_rejected");
  expect(out).not.toContain("PROBE_FAILED");
});

test("no client can mint, edit or delete a number directly", async () => {
  // Assign rather than assume: assignment is idempotent, so this works whether or not the
  // earlier tests in this file ran.
  const own = await assignOk("sales_invoice", DOC_A);

  const insert = await rest(adminJwt, "/asan_export_numbers", {
    method: "POST",
    body: JSON.stringify({ doc_type: "sales_invoice", source_id: PAR_1, asan_number: 999 }),
  });
  expect(insert.status, "the table has no INSERT policy").toBeGreaterThanOrEqual(400);

  const patch = await rest(adminJwt, `/asan_export_numbers?source_id=eq.${DOC_A}`, {
    method: "PATCH",
    body: JSON.stringify({ asan_number: 42 }),
  });
  // PostgREST answers 2xx for a no-op PATCH/DELETE, so read the row rather than trust the code.
  expect(patch.status).toBeGreaterThanOrEqual(200);
  expect(dbScalar(`select asan_number from asan_export_numbers where source_id='${DOC_A}'`)).toBe(
    String(own),
  );

  await rest(adminJwt, `/asan_export_numbers?source_id=eq.${DOC_A}`, { method: "DELETE" });
  expect(
    Number(dbScalar(`select count(*) from asan_export_numbers where source_id='${DOC_A}'`)),
    "a DELETE with no policy silently removes nothing — count, never trust the 204",
  ).toBe(1);
});

test("a salesperson cannot assign a number", async () => {
  test.skip(!salesJwt, "no sales user on this server");
  const res = await assign(salesJwt!, "sales_invoice", "aaaaaaaa-0000-4000-8000-0000000000ee");
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.text).toContain("اجازهٔ شماره‌گذاری");
  expect(
    Number(
      dbScalar(
        "select count(*) from asan_export_numbers where source_id='aaaaaaaa-0000-4000-8000-0000000000ee'",
      ),
    ),
  ).toBe(0);
});

test("cancelling a document burns its number instead of recycling it", async () => {
  dbExecE2e(
    `insert into sales_quotes (customer_name, customer_phone, status, final_amount)
     values ('${MARK}_BURN', '09120000000', 'draft', 1000);`,
  );
  quoteId = dbScalar(`select id from sales_quotes where customer_name = '${MARK}_BURN'`);
  expect(quoteId).toMatch(/[0-9a-f-]{36}/);

  const highWater = Number(
    dbScalar(
      "select coalesce(max(asan_number), 0) from asan_export_numbers where doc_type='sales_invoice'",
    ),
  );
  const numbered = await assignOk("sales_invoice", quoteId);
  expect(numbered).toBe(highWater + 1);

  dbExecE2e(
    `-- ${MARK} cancel
     update sales_quotes set status = 'canceled' where id = '${quoteId}';`,
  );

  expect(
    dbScalar(`select burned_at is not null from asan_export_numbers where source_id='${quoteId}'`),
    "the trigger must record the burn",
  ).toBe("t");

  // The burned number is NOT handed to the next document — that is the whole point.
  const next = await assignOk("sales_invoice", "aaaaaaaa-0000-4000-8000-0000000000f7");
  expect(next).toBe(numbered + 1);
  dbExecE2e(
    `-- ${MARK} probe cleanup
     delete from asan_export_numbers where source_id = 'aaaaaaaa-0000-4000-8000-0000000000f7';`,
  );

  // And deleting the document leaves the evidence behind rather than erasing it.
  dbExecE2e(
    `-- ${MARK} delete
     delete from sales_quotes where id = '${quoteId}';`,
  );
  expect(
    Number(dbScalar(`select count(*) from asan_export_numbers where source_id='${quoteId}'`)),
    "the mapping row must survive its document",
  ).toBe(1);
});
