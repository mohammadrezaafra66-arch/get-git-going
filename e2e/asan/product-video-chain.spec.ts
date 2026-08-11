import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID } from "../helpers/pgrest";

/**
 * M5.1 — the product video chain.
 *
 * **Why almost everything here runs inside `BEGIN … ROLLBACK`.**
 *
 * The chain starts when a quote is *accepted*, and accepting a quote also fires
 * `trg_sales_quotes_stock_out`, which deducts real inventory. This database has a **default
 * warehouse** (`ایران ری`), so `effective_line_warehouse` always resolves and the deduction
 * always happens — there is no way to accept a test quote without moving live stock. Reversing a
 * stock movement by hand afterwards is precisely the kind of "clean-up" that leaves inventory
 * subtly wrong.
 *
 * So the acceptance path is exercised in a transaction that is rolled back, with each verdict
 * written into a temp table and `SELECT`ed back before the rollback — the probe shape migration
 * 290's spec had to learn, because psql sends `RAISE NOTICE` to stderr where the helper cannot
 * see it. Nothing this spec does survives it: no quote, no task, no stock movement, no
 * notification, no storage object.
 *
 * The rows that are *meant* to be permanent — the `product_video` service type and the TV
 * category's requirement — are asserted directly, outside any transaction.
 */

const MARK = `${E2E_PREFIX}PVIDEO`;

/** Run a probe transaction and return its stdout. Everything inside is rolled back. */
function probe(body: string): string {
  return dbExecE2e(
    `-- ${MARK} rolled-back probe
     BEGIN;
     SET LOCAL "request.jwt.claims" = '{"sub":"${ADMIN_USER_ID}","role":"authenticated"}';
     -- Plain CREATE TEMP TABLE, with no ON COMMIT clause: the write helper rejects any SQL whose
     -- text matches its destructive-keyword list anywhere, including inside a clause and even
     -- inside a comment explaining why. The ROLLBACK below discards this table regardless.
     CREATE TEMP TABLE verdict (k text, v text);
     ${body}
     SELECT k || '=' || v AS out FROM verdict ORDER BY k;
     ROLLBACK;`,
  );
}

/**
 * SQL fragment: build a draft quote with one line of the given product, and make sure that
 * product is in stock in the default warehouse first.
 *
 * The stocking is necessary, not incidental: accepting a quote runs `apply_stock_movement`, which
 * refuses when the warehouse holds less than the line asks for — «موجودی کافی نیست». The TV
 * products hold 0. Stocking inside the probe is safe precisely because the whole transaction is
 * rolled back, so live inventory never moves in either direction.
 */
const makeQuote = (varName: string, productName: string) => `
  INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
  SELECT public.default_warehouse_id(), ${productName}, 10
   ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = warehouse_stock.quantity + 10;

  INSERT INTO sales_quotes (customer_name, customer_phone, status, subtotal_amount,
                            discount_amount, final_amount, customer_person_id)
  SELECT '${MARK}_${varName}', '09120000000', 'draft', 1000000, 0, 1000000,
         (SELECT customer_person_id FROM sales_quotes WHERE customer_person_id IS NOT NULL LIMIT 1);
  INSERT INTO sales_quote_items (quote_id, product_id, title_snapshot, quantity, unit_price,
                                 line_total, source)
  -- product_price, because sales_quote_items_identity requires a real product for that source
  -- and a free-text name for manual/quick_price. A TV line is a product.
  SELECT q.id, p.id, p.name, 1, 1000000, 1000000, 'product_price'::sales_quote_item_source
    FROM sales_quotes q, products p
   WHERE q.customer_name = '${MARK}_${varName}'
     AND p.id = ${productName};
`;

const TV_PRODUCT =
  "(SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.slug = 'tv' LIMIT 1)";
const NON_TV_PRODUCT =
  "(SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.slug <> 'tv' LIMIT 1)";

let chainBaseline = 0;
let taskBaseline = 0;
let stockBaseline = 0;

test.beforeAll(() => {
  chainBaseline = Number(dbScalar("select count(*) from product_video_chain"));
  taskBaseline = Number(dbScalar("select count(*) from tasks"));
  stockBaseline = Number(dbScalar("select count(*) from stock_movements"));
});

test.afterAll(() => {
  // Nothing should have escaped a rolled-back transaction. Asserted rather than assumed — that
  // is the whole safety argument of this spec.
  expect(Number(dbScalar("select count(*) from product_video_chain")), "rule 2.10").toBe(
    chainBaseline,
  );
  expect(Number(dbScalar("select count(*) from tasks")), "no task may survive").toBe(taskBaseline);
  expect(
    Number(dbScalar("select count(*) from stock_movements")),
    "and above all, no inventory may have moved",
  ).toBe(stockBaseline);
  expect(
    Number(dbScalar(`select count(*) from sales_quotes where customer_name like '${MARK}%'`)),
  ).toBe(0);
  expect(Number(dbScalar("select count(*) from delivery_receipts"))).toBe(0);
});

// -------------------------------------------------- the requirement, as permanent data ----

test("the video requirement is data, not code", () => {
  // R6: the service model is already generic, so "video" is a row. A second category later is an
  // INSERT rather than a migration of logic — which is exactly what the brief asked for.
  expect(
    Number(dbScalar("select count(*) from product_service_types where code = 'product_video'")),
  ).toBe(1);

  const req = dbRows(
    "select c.slug from category_required_services crs join categories c on c.id = crs.category_id join product_service_types st on st.id = crs.service_type_id where st.code = 'product_video' and crs.is_mandatory and crs.is_active",
  );
  expect(req, "the TV category requires a product video").toEqual(["tv"]);

  // The brief names `mandatory_category_services`; that table does not exist (R6.0). Anything
  // written against it would fail at once, so assert the real names are what is in use.
  expect(
    Number(
      dbScalar(
        "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'mandatory_category_services'",
      ),
    ),
    "the brief's table name is still fictional; 296 built against the real ones",
  ).toBe(0);
});

test("the bucket already accepts video, so no bucket change was needed", () => {
  const limit = Number(
    dbScalar("select file_size_limit from storage.buckets where id = 'delivery-receipts'"),
  );
  expect(limit, "100 MB — the largest limit in the system").toBeGreaterThanOrEqual(50 * 1024 * 1024);
  const mimes = dbScalar(
    "select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'delivery-receipts'",
  );
  expect(mimes).toContain("video/mp4");
  expect(mimes).toContain("video/quicktime");
  expect(mimes).toContain("video/webm");
});

test("delivery_receipts learned a third type, and only a third", () => {
  const def = dbScalar(
    "select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.delivery_receipts'::regclass and conname = 'delivery_receipts_type_check'",
  );
  expect(def).toContain("product_video");
  expect(def).toContain("shipping_receipt");
  expect(def).toContain("delivery_receipt");
});

// ------------------------------------------------------------ the chain, rolled back ----

test("selling a TV creates the chain and a video task in the sales queue", () => {
  const out = probe(`
    ${makeQuote("TV", TV_PRODUCT)}

    -- The line exists: migration 276's trigger should already have attached the mandatory
    -- service, and 296's trigger should have seeded the chain at 'required'.
    INSERT INTO verdict
    SELECT 'a_service_attached', count(*)::text FROM sales_quote_item_services s
      JOIN sales_quote_items i ON i.id = s.quote_item_id
      JOIN sales_quotes q ON q.id = i.quote_id
      JOIN product_service_types st ON st.id = s.service_type_id
     WHERE q.customer_name = '${MARK}_TV' AND st.code = 'product_video';

    INSERT INTO verdict
    SELECT 'b_stage_before_sale', COALESCE(max(ch.stage), '<none>') FROM product_video_chain ch
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_TV';

    -- Sell it.
    -- draft -> sent -> accepted: sales_quotes_validate_status refuses the direct jump, so the
    -- probe walks the legal path rather than pretending one exists.
    UPDATE sales_quotes SET status = 'sent' WHERE customer_name = '${MARK}_TV';
    UPDATE sales_quotes SET status = 'accepted' WHERE customer_name = '${MARK}_TV';

    INSERT INTO verdict
    SELECT 'c_stage_after_sale', COALESCE(max(ch.stage), '<none>') FROM product_video_chain ch
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_TV';

    INSERT INTO verdict
    SELECT 'd_task_queue', COALESCE(max(t.assigned_queue), '<none>') FROM tasks t
      JOIN product_video_chain ch ON ch.task_id = t.id
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_TV';

    INSERT INTO verdict
    SELECT 'e_task_proof', COALESCE(max(t.proof_requirement), '<none>') FROM tasks t
      JOIN product_video_chain ch ON ch.task_id = t.id
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_TV';

    -- Every transition recorded, never inferred: 'required' on insert, then 'task_created'.
    INSERT INTO verdict
    SELECT 'f_events', string_agg(e.to_stage, '>' ORDER BY e.created_at, e.to_stage)
      FROM product_video_chain_events e
      JOIN product_video_chain ch ON ch.id = e.chain_id
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_TV';
  `);

  expect(out).toContain("a_service_attached=1");
  expect(out).toContain("b_stage_before_sale=required");
  expect(out).toContain("c_stage_after_sale=task_created");
  // The delivery-receipt owner, per the brief's own fallback — `delivery_receipts` has no history
  // to infer a physical-delivery owner from, and `sales` already holds the bucket's INSERT policy.
  expect(out).toContain("d_task_queue=sales");
  expect(out).toContain("e_task_proof=product_video");
  expect(out).toContain("f_events=required>task_created");
});

test("a quote with no TV product creates no video task at all", () => {
  const out = probe(`
    ${makeQuote("NOTV", NON_TV_PRODUCT)}
    UPDATE sales_quotes SET status = 'sent' WHERE customer_name = '${MARK}_NOTV';
    UPDATE sales_quotes SET status = 'accepted' WHERE customer_name = '${MARK}_NOTV';

    INSERT INTO verdict
    SELECT 'a_chains', count(*)::text FROM product_video_chain ch
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_NOTV';

    INSERT INTO verdict
    SELECT 'b_video_tasks', count(*)::text FROM tasks t
     WHERE t.proof_requirement = 'product_video'
       AND t.reference_id IN (SELECT i.id FROM sales_quote_items i
                                JOIN sales_quotes q ON q.id = i.quote_id
                               WHERE q.customer_name = '${MARK}_NOTV');
  `);
  expect(out).toContain("a_chains=0");
  expect(out).toContain("b_video_tasks=0");
});

test("uploading advances the stage and informs the salesperson", () => {
  const out = probe(`
    ${makeQuote("UP", TV_PRODUCT)}
    UPDATE sales_quotes SET salesperson_id = '${ADMIN_USER_ID}' WHERE customer_name = '${MARK}_UP';
    UPDATE sales_quotes SET status = 'sent' WHERE customer_name = '${MARK}_UP';
    UPDATE sales_quotes SET status = 'accepted' WHERE customer_name = '${MARK}_UP';

    INSERT INTO verdict
    SELECT 'a_result', (public.product_video_mark_uploaded(
      (SELECT ch.id FROM product_video_chain ch JOIN sales_quotes q ON q.id = ch.quote_id
        WHERE q.customer_name = '${MARK}_UP'),
      'product-videos/test/x.mp4', 'x.mp4', 1024, 'video/mp4'))->>'stage';

    INSERT INTO verdict
    SELECT 'b_stage', ch.stage FROM product_video_chain ch
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_UP';

    -- The file is recorded where files live, with the new type.
    INSERT INTO verdict
    SELECT 'c_receipt_type', COALESCE(max(dr.type), '<none>') FROM delivery_receipts dr
      JOIN product_video_chain ch ON ch.delivery_receipt_id = dr.id
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_UP';

    -- The salesperson is informed through notification_events, the only table with a live write
    -- path. No fourth parallel notification system.
    INSERT INTO verdict
    SELECT 'd_notified', count(*)::text FROM notification_events
     WHERE event_type = 'product_video_ready' AND user_id = '${ADMIN_USER_ID}';

    -- The work item is closed rather than deleted, so the queue keeps its history.
    INSERT INTO verdict
    SELECT 'e_task_status', COALESCE(max(t.status), '<none>') FROM tasks t
      JOIN product_video_chain ch ON ch.task_id = t.id
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_UP';

    INSERT INTO verdict
    SELECT 'f_events', string_agg(e.to_stage, '>' ORDER BY e.created_at, e.to_stage)
      FROM product_video_chain_events e
      JOIN product_video_chain ch ON ch.id = e.chain_id
      JOIN sales_quotes q ON q.id = ch.quote_id WHERE q.customer_name = '${MARK}_UP';
  `);

  expect(out).toContain("a_result=salesperson_notified");
  expect(out).toContain("b_stage=salesperson_notified");
  expect(out).toContain("c_receipt_type=product_video");
  expect(out).toContain("d_notified=1");
  expect(out).toContain("e_task_status=done");
  // Both transitions are logged, not just the final state.
  expect(out).toContain("f_events=required>task_created>video_uploaded>salesperson_notified");
});

test("⛔ a direct write that skips a stage is refused by the trigger, not just by the RPC", () => {
  // Rule 2.5: a rule living only in an RPC is bypassed by a direct PostgREST PATCH. This proves
  // the guard is in the trigger by writing straight to the table.
  const out = probe(`
    ${makeQuote("SKIP", TV_PRODUCT)}
    UPDATE sales_quotes SET status = 'sent' WHERE customer_name = '${MARK}_SKIP';
    UPDATE sales_quotes SET status = 'accepted' WHERE customer_name = '${MARK}_SKIP';

    DO $t$
    DECLARE _id uuid;
    BEGIN
      SELECT ch.id INTO _id FROM product_video_chain ch JOIN sales_quotes q ON q.id = ch.quote_id
       WHERE q.customer_name = '${MARK}_SKIP';
      BEGIN
        -- task_created -> sent_to_customer skips two stages.
        UPDATE product_video_chain SET stage = 'sent_to_customer' WHERE id = _id;
        INSERT INTO verdict VALUES ('a_skip', 'ACCEPTED_BAD');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO verdict VALUES ('a_skip', 'REFUSED');
      END;

      BEGIN
        UPDATE product_video_chain SET stage = 'not_a_stage' WHERE id = _id;
        INSERT INTO verdict VALUES ('b_bogus', 'ACCEPTED_BAD');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO verdict VALUES ('b_bogus', 'REFUSED');
      END;

      -- And going backwards is refused too.
      UPDATE product_video_chain SET stage = 'video_uploaded' WHERE id = _id;
      BEGIN
        UPDATE product_video_chain SET stage = 'task_created' WHERE id = _id;
        INSERT INTO verdict VALUES ('c_backwards', 'ACCEPTED_BAD');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO verdict VALUES ('c_backwards', 'REFUSED');
      END;

      INSERT INTO verdict SELECT 'd_final_stage', stage FROM product_video_chain WHERE id = _id;
    END $t$;
  `);

  expect(out).toContain("a_skip=REFUSED");
  expect(out).toContain("b_bogus=REFUSED");
  expect(out).toContain("c_backwards=REFUSED");
  expect(out).not.toContain("ACCEPTED_BAD");
  expect(out, "the one legal step did happen").toContain("d_final_stage=video_uploaded");
});

test("double-ticking a stage succeeds without writing a second event", () => {
  // The migration-278 lesson: writing a status over itself is not a transition. It must report
  // success — the UI would otherwise show a scary error for a harmless second click — while
  // creating no duplicate history.
  const out = probe(`
    ${makeQuote("DBL", TV_PRODUCT)}
    UPDATE sales_quotes SET salesperson_id = '${ADMIN_USER_ID}' WHERE customer_name = '${MARK}_DBL';
    UPDATE sales_quotes SET status = 'sent' WHERE customer_name = '${MARK}_DBL';
    UPDATE sales_quotes SET status = 'accepted' WHERE customer_name = '${MARK}_DBL';

    DO $t$
    DECLARE _id uuid; _r1 jsonb; _r2 jsonb;
    BEGIN
      SELECT ch.id INTO _id FROM product_video_chain ch JOIN sales_quotes q ON q.id = ch.quote_id
       WHERE q.customer_name = '${MARK}_DBL';
      PERFORM public.product_video_mark_uploaded(_id, 'p/x.mp4', 'x.mp4', 1, 'video/mp4');
      _r1 := public.product_video_advance(_id, 'sent_to_customer', NULL);
      _r2 := public.product_video_advance(_id, 'sent_to_customer', NULL);
      INSERT INTO verdict VALUES ('a_first_changed', (_r1->>'changed'));
      INSERT INTO verdict VALUES ('b_second_ok', (_r2->>'ok'));
      INSERT INTO verdict VALUES ('c_second_changed', (_r2->>'changed'));
      INSERT INTO verdict SELECT 'd_sent_events',
        count(*)::text FROM product_video_chain_events
       WHERE chain_id = _id AND to_stage = 'sent_to_customer';

      -- A second upload of an already-uploaded chain is likewise a no-op, not an error.
      INSERT INTO verdict SELECT 'e_reupload',
        (public.product_video_mark_uploaded(_id, 'p/y.mp4', 'y.mp4', 1, 'video/mp4'))->>'changed';
    END $t$;
  `);

  expect(out).toContain("a_first_changed=true");
  expect(out).toContain("b_second_ok=true");
  expect(out).toContain("c_second_changed=false");
  expect(out, "exactly one event for the stage, however many times it is ticked").toContain(
    "d_sent_events=1",
  );
  expect(out).toContain("e_reupload=false");
});

test("the waiting query answers the owner's question in one call", () => {
  const out = probe(`
    ${makeQuote("W1", TV_PRODUCT)}
    ${makeQuote("W2", TV_PRODUCT)}
    UPDATE sales_quotes SET status = 'sent' WHERE customer_name = '${MARK}_W1';
    UPDATE sales_quotes SET status = 'accepted' WHERE customer_name = '${MARK}_W1';

    -- W1 is sold and waiting; W2 is still a draft and therefore also listed, but marked as not
    -- yet sold, and sold ones sort first.
    INSERT INTO verdict
    SELECT 'a_rows', count(*)::text FROM public.product_videos_waiting()
     WHERE quote_number IS NOT NULL AND customer_name LIKE '${MARK}%';

    INSERT INTO verdict
    SELECT 'b_sold_waiting', count(*)::text FROM public.product_videos_waiting()
     WHERE accepted AND customer_name LIKE '${MARK}%';

    INSERT INTO verdict
    SELECT 'c_first_is_sold', accepted::text FROM public.product_videos_waiting()
     WHERE customer_name LIKE '${MARK}%' LIMIT 1;

    -- Once confirmed, it leaves the list. That is what makes it a "waiting" query rather than a
    -- log of everything.
    DO $t$
    DECLARE _id uuid;
    BEGIN
      SELECT ch.id INTO _id FROM product_video_chain ch JOIN sales_quotes q ON q.id = ch.quote_id
       WHERE q.customer_name = '${MARK}_W1';
      PERFORM public.product_video_mark_uploaded(_id, 'p/x.mp4', 'x.mp4', 1, 'video/mp4');
      PERFORM public.product_video_advance(_id, 'sent_to_customer', 'واتساپ');
      PERFORM public.product_video_advance(_id, 'confirmed_sent', NULL);
    END $t$;

    INSERT INTO verdict
    SELECT 'd_after_confirm', count(*)::text FROM public.product_videos_waiting()
     WHERE accepted AND customer_name LIKE '${MARK}%';

    -- The note the salesperson typed is kept on the transition it belongs to.
    INSERT INTO verdict
    SELECT 'e_note', COALESCE(max(e.note), '<none>') FROM product_video_chain_events e
      JOIN product_video_chain ch ON ch.id = e.chain_id
      JOIN sales_quotes q ON q.id = ch.quote_id
     WHERE q.customer_name = '${MARK}_W1' AND e.to_stage = 'sent_to_customer';
  `);

  expect(out).toContain("a_rows=2");
  expect(out).toContain("b_sold_waiting=1");
  expect(out).toContain("c_first_is_sold=true");
  expect(out).toContain("d_after_confirm=0");
  expect(out).toContain("e_note=واتساپ");
});

// ---------------------------------------------------------------------- access ----

test("the module is seeded for every role and the tables take no direct writes", () => {
  const roles = Number(dbScalar("select count(distinct role_name) from role_permissions"));
  expect(
    Number(dbScalar("select count(*) from role_permissions where module = 'product-videos'")),
    "rule 2.5: an unseeded module is an open door",
  ).toBe(roles);
  expect(
    dbRows(
      "select role_name from role_permissions where module = 'product-videos' and can_view order by role_name",
    ),
  ).toEqual(["accountant", "admin", "manager", "sales"]);

  expect(
    Number(
      dbScalar(
        "select count(*) from pg_policies where schemaname = 'public' and tablename in ('product_video_chain','product_video_chain_events') and cmd <> 'SELECT'",
      ),
    ),
    "every write goes through the SECURITY DEFINER functions",
  ).toBe(0);
});

test("the page keeps the guards and does not run video through the image pipeline", () => {
  const route = fs.readFileSync(path.resolve("src/routes/_app.sales.product-videos.tsx"), "utf8");
  expect(route).toContain('requireAnyRole(["admin", "manager", "sales", "accountant"])');
  // ⛔ `optimize` routes files through prepareCameraImages, which compresses and de-rotates
  // PHOTOGRAPHS. Handing a video to an image pipeline would corrupt it, and the failure would
  // look like a bad upload rather than a wrong flag.
  expect(route).toContain("optimize={false}");
  expect(route).toContain("product_video_mark_uploaded");
  expect(route).toContain("product_videos_waiting");
  expect(route).toContain('const BUCKET = "delivery-receipts"');

  const registry = fs.readFileSync(path.resolve("src/lib/navigation/registry.ts"), "utf8");
  expect(registry).toContain(
    '"/sales/product-videos": ["admin", "manager", "sales", "accountant"]',
  );
  expect(registry).toContain('module: "product-videos"');
});

test("the page renders for an admin and writes nothing by being opened", async ({ page }) => {
  const before = Number(dbScalar("select count(*) from product_video_chain"));
  await page.goto("/sales/product-videos");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "ویدئوی محصول" })).toBeVisible();
  await expect(page.getByText("کالای فروخته‌شده در انتظار ویدئو")).toBeVisible();
  expect(Number(dbScalar("select count(*) from product_video_chain"))).toBe(before);
});

test.describe("a viewer", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

  test("a salesperson reaches the page — this queue is theirs", async ({ page }) => {
    await page.goto("/sales/product-videos");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "ویدئوی محصول" })).toBeVisible();
  });
});
