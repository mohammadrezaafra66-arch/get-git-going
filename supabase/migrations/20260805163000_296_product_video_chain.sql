-- 296: the product video chain (M5.1).
--
-- The flow the owner asked for: a TV is sold -> a video is required -> a task is created ->
-- someone records and uploads it -> the salesperson is informed -> it is sent to the customer ->
-- the fact that it was sent is recorded.
--
-- WHAT ALREADY EXISTED, AND IS THEREFORE EXTENDED RATHER THAN REBUILT (mission control 3)
--
--   * `product_service_types` / `category_required_services` / `sales_quote_item_services`
--     (migration 276). The brief calls this `mandatory_category_services`; **that table does not
--     exist** (R6.0). The model is already generic — a service TYPE joined to a CATEGORY with an
--     `is_mandatory` flag — so "video" is a DATA ROW, not a mechanism. Adding it here means a
--     second category later is an INSERT, never a code change, which is exactly what the brief
--     asked for.
--   * `tasks.proof_requirement` already allows **`product_video`**, and `tasks` holds 0 rows.
--     The capability was modelled and never wired: mission control section 3's pattern, in the
--     very table section 3 names as its example. This migration wires it; it invents no second
--     task system.
--   * The `delivery-receipts` bucket already accepts `video/mp4`, `video/quicktime` and
--     `video/webm` at **100 MB** (migration 263's fix is live, re-verified here). The bucket
--     needs nothing.
--
-- THE ONE GENUINE SCHEMA CHANGE R6 IDENTIFIED: `delivery_receipts.type` allowed only
-- `shipping_receipt` and `delivery_receipt`. A third value `product_video` is added, widening a
-- CHECK rather than creating a parallel storage table.
--
-- DECISIONS THIS MIGRATION MAKES, AND WHY
--
--  1. **The task goes to the `sales` queue.** The brief says to assign it to whoever owns the
--     physical delivery step, and to fall back to the delivery-receipt owner if that is
--     genuinely ambiguous. It IS ambiguous: `delivery_receipts` has **0 rows**, so no history
--     can be read. What is established is that the bucket's INSERT policy already grants
--     admin / manager / **sales**. So `sales` uploads, exactly as it already may — adding a new
--     uploading role would widen access with no evidence for it. If the owner says store or
--     shipping staff film the TV, the change is one `assigned_queue` value plus one policy.
--
--  2. **All three records are kept, each for what it is good at**, which R6 listed as UNKNOWN:
--     the `tasks` row is the WORK ITEM (it appears in someone's queue), the `delivery_receipts`
--     row is the FILE and its review lifecycle, and `product_video_chain` is the RECORD OF
--     TRUTH for the stage. Collapsing them would mean either a task that cannot hold a file or a
--     file row that cannot express "notified but not yet sent".
--
--  3. **Stage transitions are enforced in a TRIGGER, not only in the RPCs** (rule 2.5), because
--     a direct PostgREST PATCH bypasses any rule living only in an RPC. Writing a stage over
--     itself is not a transition and is allowed through untouched — the migration-278
--     double-tick lesson.
--
--  4. **Every transition is recorded, never inferred.** `product_video_chain_events` gets one row
--     per stage change, written by a trigger, so "which sold TVs are still waiting for a video?"
--     and "when did this one get sent?" are both single queries.
--
--  5. **Notification goes through `notification_events`**, the only one of the project's four
--     notification tables with a demonstrated write path (3 000+ rows across nine event types).
--     No fourth parallel system.
--
-- Rollback: docs/verification/296-down.sql
SET client_encoding='UTF8';

-- ------------------------------------------------------- the service, as data ----
INSERT INTO public.product_service_types (code, name_fa, is_active, sort_order)
SELECT 'product_video', 'ویدئوی محصول', true,
       COALESCE((SELECT MAX(sort_order) FROM public.product_service_types), 0) + 1
 WHERE NOT EXISTS (SELECT 1 FROM public.product_service_types WHERE code = 'product_video');

-- The TV category requires it. This row is DATA: another category is an INSERT, not a migration
-- of code. `slug` is the portable identifier (the name is Persian, the uuid is per-environment).
INSERT INTO public.category_required_services
  (category_id, service_type_id, is_mandatory, display_text, is_active)
SELECT c.id, st.id, true, 'برای این کالا باید ویدئوی محصول ضبط و برای مشتری ارسال شود.', true
  FROM public.categories c
  CROSS JOIN public.product_service_types st
 WHERE c.slug = 'tv' AND st.code = 'product_video'
   AND NOT EXISTS (
     SELECT 1 FROM public.category_required_services x
      WHERE x.category_id = c.id AND x.service_type_id = st.id);

-- ------------------------------------ delivery_receipts learns a third document ----
ALTER TABLE public.delivery_receipts DROP CONSTRAINT IF EXISTS delivery_receipts_type_check;
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_type_check
  CHECK (type = ANY (ARRAY['shipping_receipt'::text, 'delivery_receipt'::text,
                           'product_video'::text]));

-- ...and so does the function that creates them.
--
-- ⛔ The first draft of this migration wrote its own INSERT into `delivery_receipts`. That was
-- wrong twice over: `review_deadline` is NOT NULL with **no default** on the live table, so the
-- insert simply failed; and more importantly `create_delivery_receipt` already exists and does
-- three things a raw INSERT does not — it reads the review timer out of `workflow_settings`,
-- computes the deadline from it, and writes the `delivery_receipt_status_history` row. Bypassing
-- it would have been a parallel implementation of the very thing rule 14 forbids, and the
-- history row would simply have been missing.
--
-- So the existing function is EXTENDED. Rule 2.3: it is ~59 lines carrying Persian messages, so
-- it is patched from its LIVE definition rather than retyped — one literal changes, the anchor is
-- asserted to match exactly once, and the '?' count is compared before and after so a corrupted
-- byte cannot slip in unnoticed. Snapshot: docs/verification/pre-296/create_delivery_receipt.live.sql
DO $patch$
DECLARE
  _def text;
  _new text;
  _anchor text := 'if p_type not in (''shipping_receipt'',''delivery_receipt'') then';
  _repl  text := 'if p_type not in (''shipping_receipt'',''delivery_receipt'',''product_video'') then';
  _q_before integer;
  _q_after integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_delivery_receipt';
  IF _def IS NULL THEN
    RAISE EXCEPTION 'create_delivery_receipt does not exist; 296 cannot extend it';
  END IF;

  -- Already widened by an earlier run of this migration: nothing to do, stay idempotent.
  IF position(_repl IN _def) > 0 THEN
    RETURN;
  END IF;

  IF (length(_def) - length(replace(_def, _anchor, ''))) / length(_anchor) <> 1 THEN
    RAISE EXCEPTION 'the type whitelist anchor did not match exactly once; refusing to guess';
  END IF;

  _q_before := length(_def) - length(replace(_def, '?', ''));
  _new := replace(_def, _anchor, _repl);
  _q_after := length(_new) - length(replace(_new, '?', ''));
  IF _q_after <> _q_before THEN
    RAISE EXCEPTION 'the patch changed the number of question marks: persian text was corrupted';
  END IF;

  EXECUTE _new;
END
$patch$;

-- ---------------------------------------------------------------- the chain ----
CREATE TABLE IF NOT EXISTS public.product_video_chain (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_item_id       uuid NOT NULL REFERENCES public.sales_quote_items(id) ON DELETE CASCADE,
  quote_id            uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  product_id          uuid,
  stage               text NOT NULL DEFAULT 'required'
                      CHECK (stage IN ('required', 'task_created', 'video_uploaded',
                                       'salesperson_notified', 'sent_to_customer',
                                       'confirmed_sent')),
  task_id             uuid,
  delivery_receipt_id uuid,
  storage_path        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_video_chain_one_per_line UNIQUE (quote_item_id)
);

COMMENT ON TABLE public.product_video_chain IS
  'ASAN M5.1: one row per sales-quote line that requires a product video. The record of truth for which stage the video is at.';

CREATE INDEX IF NOT EXISTS product_video_chain_stage_idx ON public.product_video_chain (stage);
CREATE INDEX IF NOT EXISTS product_video_chain_quote_idx ON public.product_video_chain (quote_id);

CREATE TABLE IF NOT EXISTS public.product_video_chain_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id   uuid NOT NULL REFERENCES public.product_video_chain(id) ON DELETE CASCADE,
  from_stage text,
  to_stage   text NOT NULL,
  actor_id   uuid,
  note       text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ⛔ `clock_timestamp()`, deliberately, and NOT `now()`.
--
-- `now()` is the TRANSACTION timestamp: it is identical for every row written inside one
-- transaction. Two of this chain's transitions — 'required' when the line is created, and
-- 'task_created' when the quote is accepted — can and do land in the same transaction, and the
-- upload RPC writes two more. Ordered by `now()` they all tie, and the history reads back in an
-- arbitrary order: the phase test saw exactly that, `required > salesperson_notified >
-- task_created > video_uploaded`, which is not what happened.
--
-- A chain whose whole purpose is "each transition is recorded, not inferred" must be able to say
-- what order they happened in. `clock_timestamp()` advances within a transaction, so it can.
-- Stated as an ALTER as well as in the CREATE, so re-applying this migration fixes a table that
-- already exists with the wrong default.
ALTER TABLE public.product_video_chain_events
  ALTER COLUMN created_at SET DEFAULT clock_timestamp();

COMMENT ON TABLE public.product_video_chain_events IS
  'ASAN M5.1: one row per stage transition. The chain is observable because each step is recorded, never inferred from timestamps.';

CREATE INDEX IF NOT EXISTS product_video_chain_events_chain_idx
  ON public.product_video_chain_events (chain_id, created_at);

ALTER TABLE public.product_video_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_video_chain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_video_chain_select ON public.product_video_chain;
CREATE POLICY product_video_chain_select ON public.product_video_chain
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role,
                                               'sales'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS product_video_chain_events_select ON public.product_video_chain_events;
CREATE POLICY product_video_chain_events_select ON public.product_video_chain_events
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role,
                                               'sales'::app_role, 'accountant'::app_role]));

-- Deliberately no INSERT/UPDATE/DELETE policy on either table. Every write goes through the
-- SECURITY DEFINER functions below, so a direct PostgREST call cannot skip a stage (rule 2.5).

-- ------------------------------------------------- the transition guard (rule 2.5) ----
CREATE OR REPLACE FUNCTION public.tg_product_video_chain_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  _order text[] := ARRAY['required', 'task_created', 'video_uploaded',
                         'salesperson_notified', 'sent_to_customer', 'confirmed_sent'];
  _from  integer;
  _to    integer;
BEGIN
  -- Writing a stage over itself is not a transition (the migration-278 lesson). Let it through
  -- untouched so a double-tick is a no-op rather than an error the UI reports as success.
  IF OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  _from := array_position(_order, OLD.stage);
  _to   := array_position(_order, NEW.stage);

  IF _to IS NULL THEN
    RAISE EXCEPTION 'مرحلهٔ «%» برای زنجیرهٔ ویدئوی محصول معتبر نیست', NEW.stage
      USING ERRCODE = '22023';
  END IF;

  IF _to <> _from + 1 THEN
    RAISE EXCEPTION 'زنجیرهٔ ویدئوی محصول فقط یک مرحله جلو می‌رود: از «%» نمی‌توان به «%» رفت',
      OLD.stage, NEW.stage USING ERRCODE = '22023';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_product_video_chain_transition ON public.product_video_chain;
CREATE TRIGGER trg_product_video_chain_transition
  BEFORE UPDATE ON public.product_video_chain
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_video_chain_transition();

CREATE OR REPLACE FUNCTION public.tg_product_video_chain_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.product_video_chain_events (chain_id, from_stage, to_stage, actor_id)
    VALUES (NEW.id, NULL, NEW.stage, auth.uid());
    RETURN NEW;
  END IF;

  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.product_video_chain_events (chain_id, from_stage, to_stage, actor_id)
    VALUES (NEW.id, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_product_video_chain_log ON public.product_video_chain;
CREATE TRIGGER trg_product_video_chain_log
  AFTER INSERT OR UPDATE ON public.product_video_chain
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_video_chain_log();

-- ------------------------------------------- stage 1: the requirement is recorded ----
-- Migration 276's own trigger attaches every mandatory service to a new quote line. This hooks
-- the same event, so a video requirement appears the moment the line does — whether the line was
-- created by the RPC or by a direct API call.
CREATE OR REPLACE FUNCTION public.tg_product_video_chain_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _quote_id uuid;
  _product_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.product_service_types st
                  WHERE st.id = NEW.service_type_id AND st.code = 'product_video') THEN
    RETURN NEW;
  END IF;

  SELECT i.quote_id, i.product_id INTO _quote_id, _product_id
    FROM public.sales_quote_items i WHERE i.id = NEW.quote_item_id;
  IF _quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.product_video_chain (quote_item_id, quote_id, product_id)
  VALUES (NEW.quote_item_id, _quote_id, _product_id)
  ON CONFLICT (quote_item_id) DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_product_video_chain_seed ON public.sales_quote_item_services;
CREATE TRIGGER trg_product_video_chain_seed
  AFTER INSERT ON public.sales_quote_item_services
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_video_chain_seed();

-- ------------------------------------------------- stage 2: the sale creates a task ----
-- "A TV is sold" is the accepted transition — the same signal that deducts stock, so the video
-- task and the stock movement always agree about what "sold" means.
CREATE OR REPLACE FUNCTION public.tg_product_video_chain_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _row record;
  _task_id uuid;
  _title text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status::text <> 'accepted' THEN
    RETURN NEW;
  END IF;

  FOR _row IN
    SELECT ch.id, ch.quote_item_id, COALESCE(NULLIF(i.title_snapshot, ''), p.name, 'کالا') AS pname
      FROM public.product_video_chain ch
      JOIN public.sales_quote_items i ON i.id = ch.quote_item_id
      LEFT JOIN public.products p ON p.id = i.product_id
     WHERE ch.quote_id = NEW.id AND ch.stage = 'required'
  LOOP
    _title := 'ضبط ویدئوی محصول: ' || _row.pname;

    INSERT INTO public.tasks
      (title, description, status, priority, due_date, reference_type, reference_id,
       assigned_queue, proof_requirement, created_by)
    VALUES
      (_title,
       'برای پیش‌فاکتور ' || COALESCE(NEW.quote_number, '') ||
         ' باید ویدئوی محصول ضبط و بارگذاری شود.',
       'pending', 'normal', public.tehran_today(), 'sales_quote_item', _row.quote_item_id,
       -- The delivery-receipt owner, per the brief's own fallback. See the header note.
       'sales', 'product_video', auth.uid())
    RETURNING id INTO _task_id;

    UPDATE public.product_video_chain
       SET task_id = _task_id, stage = 'task_created'
     WHERE id = _row.id;
  END LOOP;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_product_video_chain_on_accept ON public.sales_quotes;
CREATE TRIGGER trg_product_video_chain_on_accept
  AFTER UPDATE OF status ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_video_chain_on_accept();

-- ---------------------------------- stages 3 and 4: upload, then inform the salesperson ----
CREATE OR REPLACE FUNCTION public.product_video_mark_uploaded(
  _chain_id uuid, _storage_path text, _file_name text, _file_size bigint, _mime_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _ch  record;
  _receipt_id uuid;
  _salesperson uuid;
BEGIN
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role,
                                         'sales'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ بارگذاری ویدئوی محصول را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _storage_path IS NULL OR btrim(_storage_path) = '' THEN
    RAISE EXCEPTION 'مسیر فایل ویدئو الزامی است' USING ERRCODE = '22023';
  END IF;

  SELECT ch.*, q.salesperson_id, q.customer_id
    INTO _ch
    FROM public.product_video_chain ch
    JOIN public.sales_quotes q ON q.id = ch.quote_id
   WHERE ch.id = _chain_id
   FOR UPDATE OF ch;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'زنجیرهٔ ویدئوی محصول پیدا نشد' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: a second upload of the same chain is not an error, it just changes nothing.
  IF _ch.stage <> 'task_created' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'stage', _ch.stage);
  END IF;

  -- Through the existing function, never a raw INSERT: it owns the review timer, the deadline
  -- and the status-history row. See the patch note above.
  _receipt_id := public.create_delivery_receipt(
    'product_video', _storage_path, _file_name, _file_size, _mime_type,
    NULL, _ch.customer_id, 'ویدئوی محصول پیش‌فاکتور');

  UPDATE public.product_video_chain
     SET delivery_receipt_id = _receipt_id, storage_path = _storage_path,
         stage = 'video_uploaded'
   WHERE id = _chain_id;

  -- The task this closes. `done` rather than deleted: the queue keeps its history.
  UPDATE public.tasks SET status = 'done', completed_at = now()
   WHERE id = _ch.task_id AND status <> 'done';

  -- Inform the salesperson through `notification_events` — the only one of the project's four
  -- notification tables with a demonstrated write path. No fourth parallel system.
  _salesperson := _ch.salesperson_id;
  IF _salesperson IS NOT NULL THEN
    INSERT INTO public.notification_events (event_type, user_id, channel, payload, status)
    VALUES ('product_video_ready', _salesperson, 'in_app',
            jsonb_build_object('chain_id', _chain_id, 'quote_id', _ch.quote_id,
                               'quote_item_id', _ch.quote_item_id,
                               'storage_path', _storage_path),
            'pending');
  END IF;

  UPDATE public.product_video_chain SET stage = 'salesperson_notified' WHERE id = _chain_id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'stage', 'salesperson_notified',
                            'delivery_receipt_id', _receipt_id,
                            'notified', _salesperson IS NOT NULL);
END;
$fn$;

REVOKE ALL ON FUNCTION public.product_video_mark_uploaded(uuid, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_video_mark_uploaded(uuid, text, text, bigint, text) TO authenticated;

-- --------------------------------- stages 5 and 6: sent to the customer, and confirmed ----
CREATE OR REPLACE FUNCTION public.product_video_advance(_chain_id uuid, _to_stage text, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _ch  record;
  _expected_from text;
BEGIN
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role,
                                         'sales'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ تغییر مرحلهٔ ویدئوی محصول را ندارید' USING ERRCODE = '42501';
  END IF;

  _expected_from := CASE _to_stage
                      WHEN 'sent_to_customer' THEN 'salesperson_notified'
                      WHEN 'confirmed_sent'   THEN 'sent_to_customer'
                      ELSE NULL
                    END;
  IF _expected_from IS NULL THEN
    RAISE EXCEPTION 'این مرحله از راه دستی قابل ثبت نیست: %', _to_stage USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _ch FROM public.product_video_chain WHERE id = _chain_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'زنجیرهٔ ویدئوی محصول پیدا نشد' USING ERRCODE = 'P0002';
  END IF;

  -- Already there: report success without writing a second event (the 278 double-tick lesson).
  IF _ch.stage = _to_stage THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'stage', _ch.stage);
  END IF;

  IF _ch.stage <> _expected_from THEN
    RAISE EXCEPTION 'این مرحله هنوز نوبتش نیست: زنجیره در «%» است', _ch.stage
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_video_chain SET stage = _to_stage WHERE id = _chain_id;

  IF _note IS NOT NULL AND btrim(_note) <> '' THEN
    UPDATE public.product_video_chain_events SET note = _note
     WHERE chain_id = _chain_id AND to_stage = _to_stage
       AND created_at = (SELECT MAX(created_at) FROM public.product_video_chain_events
                          WHERE chain_id = _chain_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'stage', _to_stage);
END;
$fn$;

REVOKE ALL ON FUNCTION public.product_video_advance(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_video_advance(uuid, text, text) TO authenticated;

-- --------------------------------------------- the one query the owner asked for ----
CREATE OR REPLACE FUNCTION public.product_videos_waiting()
RETURNS TABLE (
  chain_id      uuid,
  quote_id      uuid,
  quote_number  text,
  customer_name text,
  product_name  text,
  stage         text,
  task_id       uuid,
  accepted      boolean,
  created_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT ch.id, ch.quote_id, q.quote_number, q.customer_name,
         COALESCE(NULLIF(i.title_snapshot, ''), p.name, 'کالا'),
         ch.stage, ch.task_id,
         (q.status::text = 'accepted'),
         ch.created_at
    FROM public.product_video_chain ch
    JOIN public.sales_quotes q ON q.id = ch.quote_id
    JOIN public.sales_quote_items i ON i.id = ch.quote_item_id
    LEFT JOIN public.products p ON p.id = i.product_id
   WHERE public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role,
                                               'sales'::app_role, 'accountant'::app_role])
     AND ch.stage <> 'confirmed_sent'
   ORDER BY (q.status::text = 'accepted') DESC, ch.created_at;
$fn$;

REVOKE ALL ON FUNCTION public.product_videos_waiting() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_videos_waiting() TO authenticated;

COMMENT ON FUNCTION public.product_videos_waiting() IS
  'ASAN M5.1: every product-video chain that has not reached confirmed_sent, sold ones first. The owner''s "which sold TVs are still waiting for a video?" in one query.';

-- ------------------------------------------------------------------ permissions ----
-- Rule 2.5: `has_dynamic_permission` grants a module with NO row at all to every role, so an
-- unseeded module is an open door.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'product-videos',
       r.role_name IN ('admin', 'manager', 'sales', 'accountant'),
       false,
       r.role_name IN ('admin', 'manager', 'sales'),
       false, false, false,
       r.role_name = 'admin'
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_name = r.role_name AND rp.module = 'product-videos');

-- --------------------------------------------------------------------- gate ----
DO $chk$
DECLARE _n integer; _roles integer;
BEGIN
  SELECT count(*) INTO _n FROM public.product_service_types WHERE code = 'product_video';
  IF _n <> 1 THEN RAISE EXCEPTION 'the product_video service type was not created'; END IF;

  SELECT count(*) INTO _n
    FROM public.category_required_services crs
    JOIN public.categories c ON c.id = crs.category_id
    JOIN public.product_service_types st ON st.id = crs.service_type_id
   WHERE c.slug = 'tv' AND st.code = 'product_video' AND crs.is_mandatory;
  IF _n <> 1 THEN RAISE EXCEPTION 'the TV category does not require a product video'; END IF;

  -- The bucket must already accept video. R6 measured it; this asserts it rather than trusting.
  SELECT count(*) INTO _n FROM storage.buckets
   WHERE id = 'delivery-receipts'
     AND 'video/mp4' = ANY (allowed_mime_types)
     AND file_size_limit >= 50 * 1024 * 1024;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'the delivery-receipts bucket does not accept video at a usable size';
  END IF;

  -- Writes must be impossible except through the functions (rule 2.5).
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('product_video_chain', 'product_video_chain_events')
     AND cmd <> 'SELECT';
  IF _n <> 0 THEN RAISE EXCEPTION 'the chain tables must have no write policy, found %', _n; END IF;

  SELECT count(DISTINCT role_name) INTO _roles FROM public.role_permissions;
  SELECT count(*) INTO _n FROM public.role_permissions WHERE module = 'product-videos';
  IF _n <> _roles THEN
    RAISE EXCEPTION 'product-videos must have a row for all % roles, found %', _roles, _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF _n <> 0 THEN RAISE EXCEPTION '% tables in public have RLS disabled', _n; END IF;

  -- Rule 2.1: the Persian in these bodies is what a user reads when a transition is refused.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('tg_product_video_chain_transition', 'product_video_mark_uploaded',
                       'product_video_advance', 'tg_product_video_chain_on_accept')
     AND pg_get_functiondef(p.oid) LIKE '%?%';
  IF _n <> 0 THEN RAISE EXCEPTION 'persian text corrupted on the way in'; END IF;

  -- The widened whitelist really took, and the upload path really goes through the existing
  -- function rather than around it.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'create_delivery_receipt'
     AND pg_get_functiondef(p.oid) LIKE '%product_video%';
  IF _n <> 1 THEN RAISE EXCEPTION 'create_delivery_receipt still refuses product_video'; END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'product_video_mark_uploaded'
     AND pg_get_functiondef(p.oid) LIKE '%create_delivery_receipt%';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'the upload path bypasses create_delivery_receipt; the status-history row would be missing';
  END IF;
END
$chk$;
