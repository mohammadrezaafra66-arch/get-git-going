-- 286: staging-then-approve import of Asan products.
--
-- Same architecture as 285, reusing `asan_import_batches` with kind='products' rather than
-- building a second batch system. One rule differs, and it is the important one:
--
--   285 (persons): an unmatched row is `new` and creating the person is normal.
--   286 (products): an unmatched row is `unmatched` and **no product is ever created**.
--
-- That is the brief's explicit instruction and it is not an oversight to be "improved" later:
-- Asan carries 7 256 items, AfraKala stocks 355, and the overwhelming majority of Asan's
-- catalogue is not something the owner sells. The function therefore does not merely omit an
-- INSERT -- it measures the product count before and after and raises if it moved, so the
-- guarantee survives a future edit to the function body.
--
-- Matching, per the measured research rather than the brief's own wording:
--   R1.5 measured barcode as 0 % populated on BOTH sides (products.barcode 0/355,
--   `barcode` column 0/7 256), so barcode -- which phase 3.4 calls "the strongest match key"
--   -- is not a strategy that can be tried at all. Exact name matched 0/355. Normalized name
--   matched 3. Those 3 are already linked by migration 283's backfill, so a first import of
--   the real file is expected to confirm them and match nothing else.
--
-- Rollback: docs/verification/286-down.sql
SET client_encoding='UTF8';

-- --------------------------------------------------------------- normalizers ----
-- Both are IMMUTABLE and written with ASCII \uXXXX escapes on purpose. A character table is
-- exactly the kind of literal where a corrupted byte would not raise an error -- it would
-- quietly stop folding one letter and silently change which products match, which is far
-- worse than a crash. Escapes cannot be corrupted by an encoding accident.
--
-- Folding, matching R1.5's measurement:
--   NFKC, Arabic->Persian yeh/kaf/heh/hamza forms, Arabic-Indic and Persian digits->Latin,
--   ZWNJ / ZWJ / bidi marks / tatweel / harakat removed, all punctuation and whitespace
--   stripped, casefolded.
CREATE OR REPLACE FUNCTION public.asan_fold_chars(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT translate(
           normalize(coalesce(p, ''), NFKC),
           -- yeh, kaf, teh-marbuta, heh+yeh, alef-maksura, hamza forms, then both digit sets.
           -- Both tables are 30 characters; translate() pairs them positionally.
           U&'\064A\0643\0629\06C0\0649\0623\0625\0622\0624\0626\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9',
           U&'\06CC\06A9\0647\0647\06CC\0627\0627\0627\0648\06CC01234567890123456789'
         );
$fn$;

COMMENT ON FUNCTION public.asan_fold_chars(text) IS
  'ASAN M3.4: NFKC + Arabic->Persian letter folding + digit folding. Shared by the name and code normalizers.';

CREATE OR REPLACE FUNCTION public.asan_normalize_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT nullif(
           regexp_replace(
             regexp_replace(
               lower(public.asan_fold_chars(p)),
               -- tatweel, ZWNJ/ZWJ, bidi marks, harakat and the superscript alef
               U&'[\0640\200B\200C\200D\200E\200F\064B-\0655\0670]+', '', 'g'
             ),
             -- keep only latin alphanumerics and Arabic-script characters
             U&'[^0-9a-z\0600-\06FF]+', '', 'g'
           ),
           ''
         );
$fn$;

COMMENT ON FUNCTION public.asan_normalize_name(text) IS
  'ASAN M3.4: the exact normalisation R1.5 measured at 3 matches out of 355. Matching key only; never stored as display text.';

-- A code is numeric in practice, but it can arrive with Persian digits or stray spacing.
-- Deliberately NOT asan_normalize_name: that strips punctuation, and a future non-numeric
-- code such as `AFK-12` must not silently become `AFK12`.
CREATE OR REPLACE FUNCTION public.asan_normalize_code(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT nullif(btrim(regexp_replace(public.asan_fold_chars(p), '\s+', '', 'g')), '');
$fn$;

-- -------------------------------------------------------------- product rows ----
CREATE TABLE IF NOT EXISTS public.asan_import_product_rows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES public.asan_import_batches(id) ON DELETE CASCADE,
  row_number         integer NOT NULL,
  asan_code          text,
  name               text,
  barcode_raw        text,
  serial_raw         text,
  unit_raw           text,
  classification     text NOT NULL DEFAULT 'unmatched',
  matched_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  match_reason       text,
  conflict_reason    text,
  decision           text NOT NULL DEFAULT 'pending',
  applied_at         timestamptz,
  apply_note         text,
  CONSTRAINT asan_import_product_rows_classification_check
    CHECK (classification = ANY (ARRAY['update'::text, 'conflict'::text, 'unchanged'::text, 'unmatched'::text])),
  CONSTRAINT asan_import_product_rows_decision_check
    CHECK (decision = ANY (ARRAY['pending'::text, 'accept'::text, 'skip'::text]))
);

-- There is deliberately no 'new' classification. See the header.

CREATE UNIQUE INDEX IF NOT EXISTS uq_asan_import_product_rows_batch_row
  ON public.asan_import_product_rows (batch_id, row_number);
CREATE INDEX IF NOT EXISTS asan_import_product_rows_class_idx
  ON public.asan_import_product_rows (batch_id, classification);
-- 7 256 rows per batch are classified set-based against 355 products; this index is what
-- keeps the reset/update statements from re-scanning the whole table per batch.
CREATE INDEX IF NOT EXISTS asan_import_product_rows_batch_idx
  ON public.asan_import_product_rows (batch_id);

-- ------------------------------------------------------------------- guards ----
-- Only an `update` row may be accepted. In a trigger rather than the RPC, so a direct
-- PostgREST PATCH that flips decision to 'accept' on an unmatched or conflicting row is
-- refused too (rule 2.5).
--
-- `applied_at IS NULL` is load-bearing and was found by testing, not by design. Without it
-- the guard refuses the commit function's own bookkeeping write: after linking, the commit
-- stamps `applied_at` and moves the row to `unchanged` while `decision` is still `accept`,
-- which the naive form of this rule reads as "accepting a non-update row" and rejects. The
-- guard's real subject is a row still awaiting application; once applied, the row is a
-- historical record rather than a pending decision.
--
-- This does not open a hole. Setting `applied_at` by hand makes a row *ineligible* for
-- commit -- the commit only ever touches rows with `applied_at IS NULL` -- so the only thing
-- a forged `applied_at` can buy an attacker is having their row ignored.
CREATE OR REPLACE FUNCTION public.tg_asan_product_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.applied_at IS NULL AND NEW.decision = 'accept' AND NEW.classification <> 'update' THEN
    RAISE EXCEPTION 'فقط ردیف‌های «قابل اتصال» قابل تأیید هستند؛ این ردیف % است', NEW.classification
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_asan_product_row_guard ON public.asan_import_product_rows;
CREATE TRIGGER trg_asan_product_row_guard
  BEFORE INSERT OR UPDATE ON public.asan_import_product_rows
  FOR EACH ROW EXECUTE FUNCTION public.tg_asan_product_row_guard();

-- ---------------------------------------------------------------------- RLS ----
ALTER TABLE public.asan_import_product_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asan_product_rows_rw ON public.asan_import_product_rows;
CREATE POLICY asan_product_rows_rw ON public.asan_import_product_rows FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

DROP POLICY IF EXISTS viewer_restricted ON public.asan_import_product_rows;
CREATE POLICY viewer_restricted ON public.asan_import_product_rows AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid())) WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- ------------------------------------------------------------ classification ----
-- Set-based, not a row loop. 7 256 rows through a PL/pgSQL loop would be thousands of
-- statements; this is five.
CREATE OR REPLACE FUNCTION public.asan_classify_product_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _stats jsonb;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 1. reset: every row starts unmatched and earns anything better.
  UPDATE public.asan_import_product_rows
     SET classification = 'unmatched', matched_product_id = NULL,
         match_reason = NULL, conflict_reason = NULL
   WHERE batch_id = p_batch_id AND applied_at IS NULL;

  -- 2. by Asan code already carried by a product. The strongest key and the only one that
  --    means "the same item"; it is also what makes a re-import a no-op.
  UPDATE public.asan_import_product_rows r
     SET classification = 'unchanged', matched_product_id = p.id, match_reason = 'asan_code'
    FROM public.products p
   WHERE r.batch_id = p_batch_id
     AND r.applied_at IS NULL
     AND public.asan_normalize_code(r.asan_code) IS NOT NULL
     AND public.asan_normalize_code(p.accounting_code)
         = public.asan_normalize_code(r.asan_code);

  -- 3. by normalized name, for rows the code did not already resolve.
  WITH staged AS (
    SELECT r.id, public.asan_normalize_name(r.name) AS nn,
           public.asan_normalize_code(r.asan_code) AS code
      FROM public.asan_import_product_rows r
     WHERE r.batch_id = p_batch_id
       AND r.applied_at IS NULL
       AND r.classification = 'unmatched'
  ),
  -- Asan duplicates descriptions against itself: R1.5 measured 60 normalized descriptions
  -- covering 122 of its rows. Those can never be resolved by name alone.
  ambiguous_source AS (
    SELECT nn FROM staged WHERE nn IS NOT NULL GROUP BY nn HAVING count(*) > 1
  ),
  catalogue AS (
    SELECT public.asan_normalize_name(p.name) AS nn, p.id,
           public.asan_normalize_code(p.accounting_code) AS code
      FROM public.products p
  ),
  matched AS (
    SELECT s.id, s.nn, s.code,
           count(c.id) AS hits,
           -- min(uuid) does not exist in Postgres, and reaching for it fails at runtime
           -- rather than at CREATE time. Cast, aggregate, cast back.
           min(c.id::text) AS product_id_text,
           min(c.code) AS product_code
      FROM staged s
      LEFT JOIN catalogue c ON c.nn = s.nn AND s.nn IS NOT NULL
     GROUP BY s.id, s.nn, s.code
  )
  UPDATE public.asan_import_product_rows r
     SET classification = CASE
           WHEN m.hits = 0 THEN 'unmatched'
           WHEN m.nn IN (SELECT nn FROM ambiguous_source) THEN 'conflict'
           WHEN m.hits > 1 THEN 'conflict'
           WHEN m.code IS NULL THEN 'conflict'
           WHEN m.product_code IS NOT DISTINCT FROM m.code THEN 'unchanged'
           WHEN m.product_code IS NOT NULL THEN 'conflict'
           WHEN EXISTS (SELECT 1 FROM public.products q
                         WHERE public.asan_normalize_code(q.accounting_code) = m.code
                           AND q.id::text <> m.product_id_text) THEN 'conflict'
           ELSE 'update' END,
         matched_product_id = CASE WHEN m.hits = 1 THEN m.product_id_text::uuid ELSE NULL END,
         match_reason = CASE WHEN m.hits >= 1 THEN 'normalized_name' ELSE NULL END,
         conflict_reason = CASE
           WHEN m.hits = 0 THEN NULL
           WHEN m.nn IN (SELECT nn FROM ambiguous_source)
             THEN 'چند ردیف در همین فایل آسان شرح یکسانی دارند'
           WHEN m.hits > 1 THEN 'این شرح به بیش از یک کالای افراکالا می‌خورد'
           WHEN m.code IS NULL THEN 'این ردیف کد کالا ندارد'
           WHEN m.product_code IS NOT DISTINCT FROM m.code THEN NULL
           WHEN m.product_code IS NOT NULL THEN 'این کالا از قبل کد آسان دیگری دارد'
           WHEN EXISTS (SELECT 1 FROM public.products q
                         WHERE public.asan_normalize_code(q.accounting_code) = m.code
                           AND q.id::text <> m.product_id_text)
             THEN 'این کد آسان از قبل به کالای دیگری داده شده است'
           ELSE NULL END
    FROM matched m
   WHERE r.id = m.id;

  SELECT jsonb_object_agg(classification, n) INTO _stats
    FROM (SELECT classification, count(*) AS n
            FROM public.asan_import_product_rows WHERE batch_id = p_batch_id
           GROUP BY classification) s;

  UPDATE public.asan_import_batches
     SET stats = coalesce(_stats, '{}'::jsonb)
   WHERE id = p_batch_id;

  RETURN coalesce(_stats, '{}'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_classify_product_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_classify_product_batch(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------- commit ----
CREATE OR REPLACE FUNCTION public.asan_commit_product_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _before  integer;
  _after   integer;
  _linked  integer := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.asan_import_batches
                  WHERE id = p_batch_id AND status = 'staged' AND kind = 'products') THEN
    RAISE EXCEPTION 'این دسته در وضعیت قابل ثبت نیست' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO _before FROM public.products;

  -- The only write this function makes to the catalogue: stamp the Asan code onto a product
  -- that already exists and does not yet carry one. Never the name, never the unit, never an
  -- INSERT.
  WITH accepted AS (
    SELECT r.id AS row_id, r.matched_product_id,
           public.asan_normalize_code(r.asan_code) AS code
      FROM public.asan_import_product_rows r
     WHERE r.batch_id = p_batch_id
       AND r.classification = 'update'
       AND r.decision = 'accept'
       AND r.applied_at IS NULL
       AND r.matched_product_id IS NOT NULL
  ), touched AS (
    UPDATE public.products p
       SET accounting_code = a.code
      FROM accepted a
     WHERE p.id = a.matched_product_id
       AND p.accounting_code IS NULL
    RETURNING p.id
  )
  SELECT count(*) INTO _linked FROM touched;

  UPDATE public.asan_import_product_rows r
     SET applied_at = now(), classification = 'unchanged'
   WHERE r.batch_id = p_batch_id
     AND r.classification = 'update'
     AND r.decision = 'accept'
     AND r.applied_at IS NULL
     AND r.matched_product_id IS NOT NULL;

  SELECT count(*) INTO _after FROM public.products;

  -- The brief's hardest constraint, asserted rather than assumed. If a future edit to this
  -- function ever creates a product, the whole commit rolls back.
  IF _after <> _before THEN
    RAISE EXCEPTION 'ورود کالا هرگز نباید کالای تازه بسازد (قبل: %، بعد: %)', _before, _after
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.asan_import_batches
     SET status = 'committed', committed_at = now(), committed_by = auth.uid(),
         stats = stats || jsonb_build_object('linked', _linked, 'products_before', _before,
                                             'products_after', _after)
   WHERE id = p_batch_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'asan_import', p_batch_id::text, 'asan_products_imported',
          jsonb_build_object('linked', _linked, 'products_before', _before,
                             'products_after', _after));

  RETURN jsonb_build_object('linked', _linked, 'created', 0,
                            'products_before', _before, 'products_after', _after);
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_commit_product_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_commit_product_batch(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------- checks ----
-- No new module: this reuses `asan-import`, which 285 already seeded for every role. The
-- check re-asserts it here so a partial rollback of 285 cannot leave 286 open to everyone
-- through the has_dynamic_permission fallback (rule 2.5).
DO $chk$
DECLARE n integer; roles integer;
BEGIN
  SELECT count(DISTINCT role_name) INTO roles FROM public.role_permissions;
  SELECT count(*) INTO n FROM public.role_permissions WHERE module = 'asan-import';
  IF n <> roles THEN
    RAISE EXCEPTION 'asan-import must have a row for all % roles, found %', roles, n;
  END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION '% tables in public have RLS disabled', n; END IF;

  -- The normalizer must reproduce what R1.5 measured, or the classification below it is
  -- measuring something else. Folding is asserted on constructed input, not on live data.
  IF public.asan_normalize_name(U&'\06CC\0643\0640\0686\0627\0644  \06F1\06F2') <> U&'\06CC\06A9\0686\0627\064412' THEN
    RAISE EXCEPTION 'asan_normalize_name does not fold kaf/tatweel/spaces/persian digits';
  END IF;
  IF public.asan_normalize_name('  Yakh-Chal  (A) ') <> 'yakhchala' THEN
    RAISE EXCEPTION 'asan_normalize_name does not strip punctuation or casefold';
  END IF;
  IF public.asan_normalize_code(U&'\06F2\06F7\06F9\06F9') <> '2799' THEN
    RAISE EXCEPTION 'asan_normalize_code does not fold persian digits';
  END IF;
  IF public.asan_normalize_code('AFK-12') <> 'AFK-12' THEN
    RAISE EXCEPTION 'asan_normalize_code must not strip punctuation from a code';
  END IF;
END
$chk$;
