-- 388 — close OG-49: narrow `anon`'s SELECT on `public.products` to the public columns only.
--
-- ============================================================================
-- WHAT WAS LEAKING
-- ============================================================================
--
-- M5 measured it (PR #344, `docs/research/m5-public-surfaces.md`): the curated endpoint
-- `/api/public/products` publishes seven keys, but any holder of the published anon key calling
-- PostgREST directly got **355 rows × 28 columns**. Re-measured here before changing anything:
--
--   sku              355/355   'AFK-2026-00001'      internal stock-keeping code
--   created_by       355/355   uuid                  five distinct values, ALL resolving to
--   updated_by       353/355   uuid                  real staff profiles
--   base_currency    355/355   'aed'                 the currency stock is bought in
--   product_type     355/355   'foreign'             sourcing signal, domestic vs imported
--   dedup_key        349/355   '<uuid>|<hash>'       carries OTHER records' internal ids
--   status           355/355   'active'              internal lifecycle, distinct from is_active
--   promotion_weight 355/355   1                     internal ranking weight
--   accounting_code    5/355   '7009'                accounting ledger code
--   technical_notes    1/355 · torob_url 1/355 · barcode 0/355 · received_at 0/355 · category 0/355
--
-- **No price or cost column exists on this table at all** — prices live in
-- `product_computed_prices`. So this was never an OG-29 violation, and OG-29's zero-price
-- behaviour is untouched here.
--
-- ============================================================================
-- THE TWO LAYERS, AND WHICH ONE THIS TOUCHES
-- ============================================================================
--
-- Column visibility and row visibility are separate, and only one of them is this migration's.
-- Measured:
--
--   COLUMN layer : `anon` holds TABLE-level `arwdDxt` (relacl `anon=arwdDxt/postgres`), and
--                  `attacl` is empty on every column — the 28 rows
--                  `information_schema.column_privileges` shows are derived from that table
--                  grant, not from explicit column grants. So all 28 columns were readable.
--   ROW layer    : RLS is enabled (FORCE off) and two permissive policies admit `anon` —
--                  `products_public_read` USING (is_active = true) and
--                  `public_api_read_active_products` USING (is_active AND stock_status <>
--                  'unavailable'). Permissive policies OR together, so the first alone yields
--                  the 355 rows.
--
-- **This migration changes the COLUMN layer only.** The 355 rows stay 355 rows. Narrowing the
-- row set is OG-30's decision about the blanket `anon` grants, not this one's — and this file
-- deliberately does not touch `anon`'s INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on the
-- table either, for the same reason. (Those are inert today: no `anon` write policy exists, so
-- RLS refuses the write even though the grant is present. Recorded, not fixed.)
--
-- ============================================================================
-- WHY COLUMN GRANTS AND NOT A PUBLIC VIEW
-- ============================================================================
--
-- A narrow view was the alternative. Column grants were chosen because they are the smaller
-- change and because the specific risk that makes column grants dangerous does not exist here.
--
-- That risk is `select=*`: with column grants, a caller asking for every column gets `42501`
-- instead of a narrowed row. Every `anon` path was enumerated before deciding, and none of them
-- does that:
--
--   /api/public/products          .select("id, name, model, capacity, stock_status, is_active")
--   get-public-sale-list.ts:100   .select("id, name, description, brand_id, category_id")
--   e2e specs using ANON_KEY      products?select=id   and   products?select=id,name
--
-- PostgREST also requires SELECT on any column used in `order=` or as a filter even when it is
-- not in the output, which is how a revoke breaks a query whose result never named the column.
-- Checked: the endpoint orders by `name` and filters on `is_active` and `stock_status`, and all
-- three are in the keep-list below.
--
-- The view route also carried two hazards this one avoids. `CREATE OR REPLACE VIEW` silently
-- DROPS `reloptions` — measured on this database during M4, where it would have reverted
-- migration 370's `security_invoker` with no privilege change for any check to notice. And a
-- new object has to be re-verified against OG-25's default-privilege closure rather than
-- assumed safe.
--
-- ============================================================================
-- THE KEEP-LIST, NAMED IN BOTH DIRECTIONS
-- ============================================================================
--
-- The owner's OG-49 decision: `anon` may see product identity and presentation — name, brand,
-- category, price, and the fields `/api/public/products` already returns.
--
-- KEPT (9): id, name, model, capacity, stock_status, is_active   — the endpoint's own six
--           brand_id, category_id                                — "brand" and "category"
--           description                                          — `get-public-sale-list.ts`
--                                                                   needs it; that path is dead
--                                                                   today (its `sale_lists`
--                                                                   SELECT fails 42501 first,
--                                                                   OG-32) but revoking it now
--                                                                   would plant a failure for
--                                                                   whoever repairs OG-32
--
-- REVOKED (19): sku, accounting_code, created_by, updated_by, dedup_key, base_currency,
--               product_type, status, promotion_weight, technical_notes, torob_url, barcode,
--               received_at, category, color, primary_spec, unit, created_at, updated_at
--
-- This is written as a keep-list, not a revoke-list, and that is deliberate: a column added to
-- `products` tomorrow is NOT granted to `anon` by a keep-list, whereas a revoke-list would let
-- it through silently. It fails closed.
--
-- `color`, `primary_spec` and `unit` are presentation attributes and a case could be made for
-- keeping them. They are revoked because no measured `anon` path asks for them, and the owner
-- asked for the minimum that closes the leak. Adding them back is one GRANT.
--
-- ============================================================================
-- OUT OF SCOPE, AND FOUND WHILE MEASURING — NOT FIXED HERE
-- ============================================================================
--
-- `anon` also reads `public.categories`, all 12 rows, including **`base_margin_percent`,
-- populated on 12 of 12 at 15.0** — the base markup the business applies. That is a commercial
-- secret and arguably worse than anything on this table, but it is a different table and the
-- owner's OG-49 decision names product columns. Raised as an Owner-Gate with its evidence
-- rather than fixed under a decision that does not cover it.
--
-- Object owner: supabase_admin. Grantor of the existing table grant is `postgres`.
-- ROLLBACK: docs/verification/388-down.sql — written from the live captured state and dry-run
-- proved BEFORE this file was applied, including a full forward-then-down inverse test showing
-- `relacl` and `attacl` both return byte-identical.

SET client_encoding = 'UTF8';

-- ORDER MATTERS, AND THE OBVIOUS ORDER IS THE WRONG ONE.
--
-- The first draft of this file put the GRANT first, reasoning that revoking first would leave
-- an instant with no SELECT at all and `/api/public/products` — which runs as `anon`, verified
-- in Phase 0 — would answer 500 to anything arriving in that window. **This gate caught that
-- draft**, and both halves of the reasoning were wrong:
--
--   * `REVOKE SELECT ON <table> FROM <role>` removes column-level SELECT as well as
--     table-level. Granting columns and then revoking the table washes the column grants
--     straight back out, leaving `anon` with nothing. The gate's check 3 reported exactly that:
--     "anon LOST a public product column: brand_id, capacity, category_id, description, id…".
--   * There is no window to protect against. This migration is applied with
--     `--single-transaction`, so both statements land atomically and no reader ever observes
--     the intermediate state.
--
-- So: REVOKE the table grant first, then GRANT the nine columns.
REVOKE SELECT ON public.products FROM anon;

GRANT SELECT (
  id,
  name,
  model,
  capacity,
  stock_status,
  is_active,
  brand_id,
  category_id,
  description
) ON public.products TO anon;

-- ---------------------------------------------------------------------------
-- gate — the ONE assertion this mission is allowed.
--
-- Three properties, and it is two-sided on purpose. M4's gate 386 failed independent review for
-- asserting only the direction that OPENS a guard: a change that emptied the surface for
-- everyone passed it. A change that empties `products` for real users must FAIL here.
--
-- Everything below is an EFFECT test — `has_column_privilege` rather than reading `attacl` and
-- believing it. Five consecutive gates in this programme fell to asking the catalogue who is
-- named instead of what the caller can actually do.
-- ---------------------------------------------------------------------------

DO $chk$
DECLARE
  c        text;
  bad      text;
  n        int;
  public_cols   text[] := ARRAY['id','name','model','capacity','stock_status','is_active',
                                'brand_id','category_id','description'];
  internal_cols text[] := ARRAY['sku','accounting_code','created_by','updated_by','dedup_key',
                                'base_currency','product_type','status','promotion_weight',
                                'technical_notes','torob_url','barcode','received_at','category',
                                'color','primary_spec','unit','created_at','updated_at'];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. CLOSED. No internal column is reachable by anon, by name, by effect.
  ---------------------------------------------------------------------------
  SELECT string_agg(x, ', ' ORDER BY x) INTO bad
    FROM unnest(internal_cols) x
   WHERE has_column_privilege('anon', 'public.products', x, 'SELECT');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '388: anon can still read internal product column(s): %. OG-49 says an unauthenticated caller must not reach them', bad;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Table-level SELECT is gone, which is what makes `select=*` fail rather
  --    than quietly returning everything. A leftover table grant would make
  --    check 1 pass and the leak remain, because a table grant covers every
  --    column including ones added later.
  ---------------------------------------------------------------------------
  IF has_table_privilege('anon', 'public.products', 'SELECT') THEN
    RAISE EXCEPTION '388: anon still holds TABLE-level SELECT on products, so every column — including any added tomorrow — is readable and the column grants below are decoration';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. STILL OPEN where it must be. The endpoint's own six columns plus the
  --    three the sale-list path needs. If this fails, /api/public/products
  --    answers 500 and OG-29's surface is broken rather than protected.
  ---------------------------------------------------------------------------
  SELECT string_agg(x, ', ' ORDER BY x) INTO bad
    FROM unnest(public_cols) x
   WHERE NOT has_column_privilege('anon', 'public.products', x, 'SELECT');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '388: anon LOST a public product column: %. /api/public/products runs as anon and selects id, name, model, capacity, stock_status, is_active, orders by name and filters on is_active and stock_status — losing any of them returns 500, which is emptying the surface rather than closing it', bad;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. UNCHANGED for real users. `authenticated` must still reach every
  --    column. This is the direction gate 386 forgot.
  ---------------------------------------------------------------------------
  SELECT string_agg(a.attname, ', ' ORDER BY a.attname) INTO bad
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND NOT has_column_privilege('authenticated', 'public.products', a.attname, 'SELECT');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '388: authenticated LOST product column(s): %. This migration was meant to narrow anon and nothing else', bad;
  END IF;

  ---------------------------------------------------------------------------
  -- 5. The row layer did not move. This migration touches columns only; if the
  --    anon row policies changed too, something wider than intended happened.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'products'
     AND cmd = 'SELECT' AND roles::text LIKE '%anon%';
  IF n <> 2 THEN
    RAISE EXCEPTION '388: expected 2 anon SELECT policies on products (products_public_read, public_api_read_active_products), found %. The row layer moved and this migration should not have touched it', n;
  END IF;

  ---------------------------------------------------------------------------
  -- 6. Not vacuous. If the column set were empty both loops above would pass
  --    against nothing.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF n < array_length(public_cols,1) + array_length(internal_cols,1) THEN
    RAISE EXCEPTION '388: products has only % live columns, fewer than the % this gate names — the classification is stale and the assertions above are asserting against a table that has changed', n, array_length(public_cols,1) + array_length(internal_cols,1);
  END IF;

  RAISE NOTICE '388 OK: anon can read exactly the 9 public product columns and none of the 19 internal ones, checked by effect per column; anon holds no TABLE-level SELECT, so select=* fails and a column added tomorrow is not granted; authenticated still reaches all % columns; and the two anon row policies are untouched, so the 355-row row layer is unchanged — this migration narrowed columns only', n;
END
$chk$;
