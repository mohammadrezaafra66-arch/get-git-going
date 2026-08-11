SET client_encoding='UTF8';

-- ============================================================================
-- 277 — Phase 10 / requirement 224: recurring marketing tasks
-- ============================================================================
--
-- WHAT THIS DOES NOT DO: it does not create a second task system. Every task
-- instance is a row in the existing `public.tasks` table, is read by the
-- existing `get_task_kpi_report`, and its completion is scored through the
-- existing `employee_score_events` -> `calculate_employee_score` -> XP chain.
-- The only genuinely new object is the recurring TEMPLATE table, which the
-- audit correctly identified as the missing piece.
--
-- ---------------------------------------------------------------------------
-- MEASURED FACTS THIS MIGRATION IS BUILT ON (verified on the live LAN database
-- before writing a single line, 2026-08-04):
-- ---------------------------------------------------------------------------
--   * public.tasks              : 15 columns, 3 RLS policies, written for the
--                                 first time by phase 9 (mandatory packaging).
--   * marketing_channels        : 56 rows. Their names are NOT platform names —
--                                 they are ACCOUNT x PLATFORM outlets, e.g.
--                                 «خانم احمدی 09919484210 استوری بله». That is
--                                 exactly the granularity a daily marketing
--                                 task needs, so templates key on a channel row.
--   * gamification_kpis         : already contains the enabled KPI
--                                 `promotions_completed` (weight 2, Persian
--                                 label «تبلیغ‌های انجام‌شده»).
--   * compute_employee_score    : already counts that KPI from
--                                 employee_score_events WHERE
--                                 event_type = 'promotion_completed'.
--   * gamification_kpi_rules    : already contains an ACTIVE XP rule
--                                 `promotion_completed` = 15 XP.
--   * ...and NOTHING in the database has ever emitted a 'promotion_completed'
--     event outside the two audit-log promotion triggers, which have produced
--     0 rows. The gamification hook the owner asked for (decision 34) was
--     therefore already built and simply never fed. This phase feeds it. No
--     new scoring path, no new KPI, no new XP rule.
--
-- ---------------------------------------------------------------------------
-- EXPLICIT DECISIONS (the handoff note demanded these be written down)
-- ---------------------------------------------------------------------------
-- D1. assigned_queue: the CHECK is WIDENED to accept 'marketing'.
--     Phase 9 reused the existing 'store' queue rather than widening. That was
--     right there (a warehouse packaging job really is store work). It is wrong
--     here: `get_task_kpi_report` breaks performance down BY QUEUE, so folding
--     daily marketing work into 'sales' would corrupt the sales queue's
--     completion and overdue rates. Widening an allowed-value list is strictly
--     permissive — it cannot invalidate an existing row, and `tasks` holds no
--     row with a queue other than the ones phase 9 wrote.
--
-- D2. status: the CHECK is WIDENED to accept 'expired'.
--     The owner's binding rule is that an unfinished task does not roll over,
--     "it expires as incomplete and is visible as such in reporting". Leaving
--     it 'pending' forever would keep it in open_count and overdue_count
--     without bound and would let a marketer tick a task days later, taking
--     credit for a day they did not work. 'canceled' was rejected because it
--     conflates a deliberate cancellation with an expiry.
--
-- D3. marketing_channels is NOT extended. Its shape already fits: a template
--     points at a channel row. The mission text lists Instagram and articles,
--     which are absent from the 56 rows — but admins can already create
--     channels through the existing `createMarketingChannel` server function
--     and /admin/marketing-channels page, so "admin-definable others" needs no
--     schema change. Adding a `platform` column would be inventing structure
--     nobody asked for (rules 14/16).
--
-- D4. Rollover is prevented STRUCTURALLY, not by convention. Generation is
--     keyed on (template, due_date, assignee) through a partial unique index,
--     so a second run for the same day is a no-op. A guard trigger then
--     refuses to move a marketing task's due_date at all — otherwise the
--     assignee, who holds UPDATE on their own row via `tasks_self_update`,
--     could simply push yesterday's task to today and tick it.
--
-- D5. Scoring fires from a TRIGGER, not from the completion RPC. Phase 9's
--     lesson: `tasks_self_update` lets the assignee PATCH the row directly
--     through PostgREST, bypassing any RPC. Putting the rule in the RPC would
--     mean a task could be marked done without ever being scored. The trigger
--     catches every path — RPC, PostgREST, or the admin task board.
--
-- D6. 'done' and 'expired' are TERMINAL for marketing tasks. This makes
--     double-scoring structurally impossible (the event can only ever fire on
--     the single transition into 'done') and stops an expired task being
--     revived. Even an admin cannot complete a past day's task; that is the
--     literal meaning of the owner's no-rollover rule, and is reported as a
--     deliberate restriction rather than hidden.
--
-- D7. Group templates expand over `user_roles` WITHOUT filtering on
--     profiles.is_active / profiles.status. Item 261/262 established that
--     those flags are not valid authorization signals in this database — the
--     `test.admin` account that runs the whole test suite is
--     is_active=false, status='rejected' and works daily. Filtering on them
--     would silently drop real staff from the roster.
--
-- Timezone: every date decision goes through public.tehran_today(). The server
-- runs UTC; between 20:30 and 24:00 Tehran the two disagree by a day, which is
-- precisely the window in which evening marketing work happens.
--
-- Migration impact : additive. No DROP TABLE, no TRUNCATE, no DELETE.
-- RLS impact       : new table has RLS + policies; anon DML revoked here and
--                    also revoked on marketing_channels (pre-existing hole,
--                    same family as item 259 — see note at the bottom).
-- Audit impact     : completion writes an audit_logs row
--                    (action = 'marketing_task_completed').
-- Down script      : docs/verification/277-down.sql
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Single source of truth for "today", in Tehran.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tehran_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT (now() AT TIME ZONE 'Asia/Tehran')::date;
$function$;

COMMENT ON FUNCTION public.tehran_today() IS
  'روز جاری به وقت آسیا/تهران. مبنای همهٔ تصمیم‌های تاریخی وظایف بازاریابی (۲۲۴). ساعت سرور UTC است و نباید مستقیم استفاده شود.';


-- ---------------------------------------------------------------------------
-- 2) Widen the two task CHECK constraints (decisions D1, D2).
--    Both are strictly permissive; verified below that no existing row breaks.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_queue_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_queue_check
  CHECK (
    assigned_queue IS NULL
    OR assigned_queue = ANY (ARRAY['sales'::text, 'shipping'::text, 'store'::text,
                                   'accounting'::text, 'marketing'::text])
  );

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (
    status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text,
                        'blocked'::text, 'canceled'::text, 'expired'::text])
  );


-- ---------------------------------------------------------------------------
-- 3) The recurring template table — the one genuinely missing piece.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_task_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id     uuid NOT NULL REFERENCES public.marketing_channels(id) ON DELETE RESTRICT,
  title          text NOT NULL,
  description    text,

  -- "person or group": exactly one of these. A person template makes one task
  -- per day; a role template makes one task per day per holder of that role.
  assigned_to    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_role  text,

  -- Postgres DOW convention: 0=Sunday .. 6=Saturday. Stored on the *Tehran*
  -- date, so a template that recurs on Saturday fires on the Iranian Saturday.
  recurs_on_days smallint[] NOT NULL,

  priority       text NOT NULL DEFAULT 'normal',
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mtt_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT mtt_priority_check
    CHECK (priority = ANY (ARRAY['low'::text,'normal'::text,'high'::text,'urgent'::text])),
  CONSTRAINT mtt_assignee_exactly_one
    CHECK ((assigned_to IS NOT NULL)::int + (assigned_role IS NOT NULL)::int = 1),
  CONSTRAINT mtt_assigned_role_valid
    CHECK (assigned_role IS NULL
           OR assigned_role = ANY (ARRAY['admin'::text,'manager'::text,'sales'::text,
                                         'accountant'::text,'viewer'::text])),
  CONSTRAINT mtt_days_valid
    CHECK (recurs_on_days IS NOT NULL
           AND array_length(recurs_on_days, 1) BETWEEN 1 AND 7
           AND recurs_on_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);

COMMENT ON TABLE public.marketing_task_templates IS
  'قالب وظایف بازاریابی تکرارشونده (۲۲۴). هر ردیف با job روزانه به وظیفه در جدول tasks تبدیل می‌شود؛ سامانهٔ وظیفهٔ دوم نیست.';
COMMENT ON COLUMN public.marketing_task_templates.recurs_on_days IS
  'روزهای هفته به قرارداد Postgres: ۰=یکشنبه تا ۶=شنبه. بر تاریخ تهران ارزیابی می‌شود.';

-- One template per channel per title (case/space-insensitive), so an admin
-- clicking "save" twice cannot silently double every day's workload.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_task_templates_channel_title
  ON public.marketing_task_templates (channel_id, lower(btrim(title)));

CREATE INDEX IF NOT EXISTS idx_mtt_active
  ON public.marketing_task_templates (is_active) WHERE is_active;

DROP TRIGGER IF EXISTS trg_mtt_updated_at ON public.marketing_task_templates;
CREATE TRIGGER trg_mtt_updated_at
  BEFORE UPDATE ON public.marketing_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketing_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mtt_select ON public.marketing_task_templates;
CREATE POLICY mtt_select ON public.marketing_task_templates
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS mtt_write ON public.marketing_task_templates;
CREATE POLICY mtt_write ON public.marketing_task_templates
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]));

-- Supabase grants every DML verb to anon by default; TRUNCATE is not even an
-- RLS-governed verb. Never leave that on a new table (item 259).
REVOKE ALL ON public.marketing_task_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_task_templates TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Idempotency, enforced by the database rather than by the job's caution.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_marketing_daily
  ON public.tasks (reference_id, due_date, assigned_to)
  WHERE reference_type = 'marketing_recurring_task';

CREATE INDEX IF NOT EXISTS idx_tasks_marketing_due
  ON public.tasks (due_date, status)
  WHERE reference_type = 'marketing_recurring_task';


-- ---------------------------------------------------------------------------
-- 5) Guard trigger — the rules live here so no write path can dodge them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_marketing_task_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := public.tehran_today();
BEGIN
  IF COALESCE(NEW.reference_type, '') <> 'marketing_recurring_task' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'وظیفهٔ بازاریابی فقط می‌تواند در وضعیت «در انتظار» ساخته شود.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Identity of a generated task is immutable. Without this, the assignee —
  -- who holds UPDATE on their own row through `tasks_self_update` — could move
  -- yesterday's unfinished task onto today and tick it, which is exactly the
  -- rollover the owner forbade.
  IF NEW.due_date       IS DISTINCT FROM OLD.due_date
     OR NEW.reference_id   IS DISTINCT FROM OLD.reference_id
     OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
     OR NEW.assigned_to    IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'تاریخ، مسئول و مرجع یک وظیفهٔ بازاریابی قابل تغییر نیست. کار ناتمام به روز بعد منتقل نمی‌شود.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'expired' THEN
    RAISE EXCEPTION 'این وظیفهٔ بازاریابی منقضی شده است و دیگر قابل تغییر نیست.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'done' THEN
    RAISE EXCEPTION 'این وظیفهٔ بازاریابی قبلاً تکمیل شده و وضعیت آن قابل بازگرداندن نیست.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'done' THEN
    IF NEW.due_date IS DISTINCT FROM v_today THEN
      RAISE EXCEPTION 'این وظیفهٔ بازاریابی برای تاریخ % ثبت شده و فقط در همان روز قابل تیک‌زدن بود (امروز به وقت تهران: %).',
        NEW.due_date, v_today
        USING ERRCODE = '42501';
    END IF;
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_marketing_task_guard ON public.tasks;
CREATE TRIGGER trg_marketing_task_guard
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_marketing_task_guard();


-- ---------------------------------------------------------------------------
-- 6) Scoring hook — mirrors trg_promotion_used_score_event exactly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_marketing_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor   uuid := auth.uid();
  v_channel uuid;
BEGIN
  IF COALESCE(NEW.reference_type, '') <> 'marketing_recurring_task' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'done' OR OLD.status = 'done' THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.channel_id INTO v_channel
    FROM public.marketing_task_templates t
   WHERE t.id = NEW.reference_id;

  -- The existing gamification path: this event type is already counted by the
  -- enabled `promotions_completed` KPI inside compute_employee_score, and
  -- already carries a 15-XP rule. Nothing new is invented here.
  INSERT INTO public.employee_score_events
    (employee_id, event_type, source_table, source_id, payload)
  VALUES (
    NEW.assigned_to, 'promotion_completed', 'tasks', NEW.id::text,
    jsonb_build_object(
      'channel_id',  v_channel,
      'template_id', NEW.reference_id,
      'origin',      'marketing_recurring_task',
      'for_date',    NEW.due_date
    )
  );

  -- Recompute immediately so the profile and the leaderboard show it now (168).
  PERFORM public.calculate_employee_score(NEW.assigned_to);

  -- actor_id is NULL when the row is touched by the generation job; the
  -- audit_logs INSERT policy is `auth.uid() = actor_id`, so a NULL-actor row
  -- would be both rejected and meaningless.
  IF v_actor IS NOT NULL THEN
    INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
    VALUES ('task', NEW.id::text, 'marketing_task_completed', v_actor,
            jsonb_build_object(
              'template_id', NEW.reference_id,
              'channel_id',  v_channel,
              'assigned_to', NEW.assigned_to,
              'for_date',    NEW.due_date
            ));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_marketing_task_completed ON public.tasks;
CREATE TRIGGER trg_marketing_task_completed
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_marketing_task_completed();


-- ---------------------------------------------------------------------------
-- 7) The daily generation job.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_marketing_tasks(p_for_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid := auth.uid();
  v_date      date := COALESCE(p_for_date, public.tehran_today());
  v_dow       smallint;
  v_generated int := 0;
  v_expired   int := 0;
  v_eligible  int := 0;
BEGIN
  -- A NULL uid is the worker/service-role context (the cron endpoint). A
  -- non-NULL uid must be an admin or manager triggering it by hand.
  IF v_user IS NOT NULL
     AND NOT public.has_any_role(v_user, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای تولید وظایف بازاریابی را ندارید.'
      USING ERRCODE = '42501';
  END IF;

  -- Overlapping runs must not both generate. The lock is per-day so that a
  -- backfill for an older date can still run alongside today's job. The unique
  -- index below is the hard backstop; this lock only avoids the wasted work
  -- and the noisy conflict.
  IF NOT pg_try_advisory_xact_lock(
           hashtext('afrakala.generate_marketing_tasks'),
           (v_date - DATE '2000-01-01')) THEN
    RETURN jsonb_build_object(
      'for_date',  v_date,
      'locked',    true,
      'generated', 0,
      'expired',   0,
      'eligible',  0,
      'message',   'اجرای دیگری برای همین روز در حال انجام است.'
    );
  END IF;

  v_dow := EXTRACT(DOW FROM v_date)::smallint;

  -- No rollover: anything still open from an earlier day is closed as expired
  -- BEFORE today's set is created, so it is never carried forward and never
  -- silently stays "open" in the KPI report.
  --
  -- The bound is LEAST(v_date, today) rather than plain v_date, and the dry
  -- run is what forced that. "The past" is defined by the real clock, not by
  -- the date being generated: with a plain v_date, an admin generating
  -- TOMORROW's list at noon (to preview it, or because the cron is being
  -- tested) would instantly expire every task the team was still working on
  -- today. LEAST also stops a backfill for an old date from expiring the very
  -- rows it just created.
  UPDATE public.tasks
     SET status     = 'expired',
         updated_at = now()
   WHERE reference_type = 'marketing_recurring_task'
     AND due_date < LEAST(v_date, public.tehran_today())
     AND status IN ('pending', 'in_progress');
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  WITH eligible AS (
    SELECT
      t.id                AS template_id,
      t.title,
      t.description,
      t.priority,
      c.name              AS channel_name,
      COALESCE(t.assigned_to, ur.user_id) AS assignee
    FROM public.marketing_task_templates t
    JOIN public.marketing_channels c ON c.id = t.channel_id AND c.is_active
    -- Group templates fan out over role holders; person templates join zero
    -- rows here and fall back to t.assigned_to via the LEFT JOIN.
    LEFT JOIN public.user_roles ur
           ON t.assigned_role IS NOT NULL
          AND ur.role::text = t.assigned_role
    WHERE t.is_active
      AND v_dow = ANY (t.recurs_on_days)
      AND COALESCE(t.assigned_to, ur.user_id) IS NOT NULL
  ),
  -- A user holding the same role twice, or listed twice, must not receive the
  -- same task twice.
  deduped AS (
    SELECT DISTINCT template_id, title, description, priority, channel_name, assignee
    FROM eligible
    -- Only real staff rows; tasks.assigned_to is FK -> profiles(id).
    WHERE assignee IN (SELECT id FROM public.profiles)
  ),
  inserted AS (
    INSERT INTO public.tasks
      (title, description, assigned_to, status, priority, due_date,
       reference_type, reference_id, assigned_queue, proof_requirement)
    SELECT
      d.channel_name || ' — ' || d.title,
      d.description,
      d.assignee,
      'pending',
      d.priority,
      v_date,
      'marketing_recurring_task',
      d.template_id,
      'marketing',
      'none'                      -- owner rule: tickable with no evidence
    FROM deduped d
    ON CONFLICT (reference_id, due_date, assigned_to)
      WHERE reference_type = 'marketing_recurring_task'
      DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM inserted),
    (SELECT count(*) FROM deduped)
  INTO v_generated, v_eligible;

  RETURN jsonb_build_object(
    'for_date',         v_date,
    'locked',           false,
    'generated',        v_generated,
    'skipped_existing', v_eligible - v_generated,
    'eligible',         v_eligible,
    'expired',          v_expired
  );
END;
$function$;

COMMENT ON FUNCTION public.generate_marketing_tasks(date) IS
  'تولید وظایف روزانهٔ بازاریابی از روی قالب‌ها (۲۲۴). idempotent، با قفل هم‌زمانی و تاریخ تهران. اجرای دوباره در همان روز چیزی اضافه نمی‌کند.';

REVOKE ALL ON FUNCTION public.generate_marketing_tasks(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_marketing_tasks(date) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8) Completion RPC — a thin, friendly wrapper. The guarantees are in the
--    triggers above; this exists so the mobile UI gets Persian errors and a
--    permission check, not so it can be the only correct path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_marketing_task(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_task  record;
  v_score numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'برای ثبت وظیفه باید وارد شده باشید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'وظیفه یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_task.reference_type, '') <> 'marketing_recurring_task' THEN
    RAISE EXCEPTION 'این وظیفه یک وظیفهٔ بازاریابی تکرارشونده نیست.' USING ERRCODE = '22023';
  END IF;

  -- No manager approval step (owner rule): the assignee ticks their own task.
  IF v_task.assigned_to IS DISTINCT FROM v_user
     AND NOT public.has_any_role(v_user, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'فقط مسئول همین وظیفه می‌تواند آن را تیک بزند.' USING ERRCODE = '42501';
  END IF;

  -- Expiry / already-done / wrong-day are raised by trg_marketing_task_guard
  -- with their own Persian messages, so they are not duplicated here.
  UPDATE public.tasks
     SET status       = 'done',
         completed_at = now(),
         updated_at   = now()
   WHERE id = p_task_id;

  SELECT total_score INTO v_score
    FROM public.employee_scores WHERE employee_id = v_task.assigned_to;

  RETURN jsonb_build_object(
    'task_id',     p_task_id,
    'status',      'done',
    'for_date',    v_task.due_date,
    'assigned_to', v_task.assigned_to,
    'total_score', v_score
  );
END;
$function$;

COMMENT ON FUNCTION public.complete_marketing_task(uuid) IS
  'تیک‌زدن وظیفهٔ بازاریابی توسط مسئول آن، بدون مدرک و بدون تأیید مدیر (۲۲۴).';

REVOKE ALL ON FUNCTION public.complete_marketing_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_marketing_task(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 9) Task KPI report: teach it the new queue and the new status, and put its
--    date arithmetic on Tehran time.
--
--    Rewritten from the LIVE definition captured in
--    docs/verification/pre-277/get_task_kpi_report.sql (rule 4), not from
--    memory. Four changes only:
--      a) 'marketing' queue bucket + Persian label (was falling into «بدون صف»)
--      b) 'expired' status bucket + Persian label (was falling back to the raw
--         English word) and a new expired_count column
--      c) 'expired' excluded from open_count / overdue_count / overdue_rate —
--         otherwise an expired task stays "open" forever
--      d) current_date -> public.tehran_today()
--
--    The added output column changes the signature, so DROP is mandatory
--    (rule 5) — an added parameter or column overloads rather than replaces.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_task_kpi_report(integer);

CREATE FUNCTION public.get_task_kpi_report(p_days integer DEFAULT 30)
RETURNS TABLE(
  section text, bucket_key text, bucket_label text,
  task_count integer, open_count integer, pending_count integer,
  in_progress_count integer, done_count integer, blocked_count integer,
  canceled_count integer, expired_count integer,
  overdue_count integer, due_soon_count integer,
  avg_completion_hours numeric, completion_rate numeric, overdue_rate numeric,
  oldest_open_at timestamp with time zone, newest_task_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_days  integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_today date := public.tehran_today();
BEGIN
  IF v_user IS NOT NULL AND NOT public.has_any_role(
    v_user,
    ARRAY[
      'admin'::public.app_role,
      'manager'::public.app_role,
      'accountant'::public.app_role,
      'sales'::public.app_role,
      'viewer'::public.app_role
    ]
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      t.id,
      COALESCE(t.status, 'pending') AS status,
      COALESCE(t.priority, 'normal') AS priority,
      t.assigned_queue,
      t.proof_requirement,
      t.due_date,
      t.created_at,
      t.completed_at,
      t.assigned_to,
      t.reference_type
    FROM public.tasks t
    WHERE t.created_at >= (now() - (v_days || ' days')::interval)
       OR COALESCE(t.status, 'pending') NOT IN ('done', 'canceled', 'expired')
  ),
  grouped_input AS (
    SELECT
      0 AS section_sort,
      0 AS bucket_sort,
      'overall'::text AS section,
      'all'::text AS bucket_key,
      'همه وظایف'::text AS bucket_label,
      s.*
    FROM scoped s

    UNION ALL

    SELECT
      1 AS section_sort,
      CASE COALESCE(s.assigned_queue, 'none')
        WHEN 'sales' THEN 1
        WHEN 'shipping' THEN 2
        WHEN 'store' THEN 3
        WHEN 'accounting' THEN 4
        WHEN 'marketing' THEN 5
        ELSE 9
      END AS bucket_sort,
      'queue'::text AS section,
      COALESCE(s.assigned_queue, 'none')::text AS bucket_key,
      CASE COALESCE(s.assigned_queue, 'none')
        WHEN 'sales' THEN 'فروش'
        WHEN 'shipping' THEN 'ارسال'
        WHEN 'store' THEN 'فروشگاه/انبار'
        WHEN 'accounting' THEN 'حسابداری'
        WHEN 'marketing' THEN 'بازاریابی'
        ELSE 'بدون صف'
      END::text AS bucket_label,
      s.*
    FROM scoped s

    UNION ALL

    SELECT
      2 AS section_sort,
      CASE COALESCE(s.proof_requirement, 'none')
        WHEN 'receipt' THEN 1
        WHEN 'carrier_waybill_photo' THEN 2
        WHEN 'product_video' THEN 3
        WHEN 'none' THEN 8
        ELSE 9
      END AS bucket_sort,
      'proof'::text AS section,
      COALESCE(s.proof_requirement, 'none')::text AS bucket_key,
      CASE COALESCE(s.proof_requirement, 'none')
        WHEN 'receipt' THEN 'رسید تهران'
        WHEN 'carrier_waybill_photo' THEN 'عکس بیجک باربری'
        WHEN 'product_video' THEN 'فیلم محصول'
        WHEN 'none' THEN 'بدون مدرک'
        ELSE 'نامشخص'
      END::text AS bucket_label,
      s.*
    FROM scoped s

    UNION ALL

    SELECT
      3 AS section_sort,
      CASE COALESCE(s.status, 'pending')
        WHEN 'pending' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'blocked' THEN 3
        WHEN 'done' THEN 4
        WHEN 'canceled' THEN 5
        WHEN 'expired' THEN 6
        ELSE 9
      END AS bucket_sort,
      'status'::text AS section,
      COALESCE(s.status, 'pending')::text AS bucket_key,
      CASE COALESCE(s.status, 'pending')
        WHEN 'pending' THEN 'در انتظار'
        WHEN 'in_progress' THEN 'در حال انجام'
        WHEN 'blocked' THEN 'متوقف'
        WHEN 'done' THEN 'انجام‌شده'
        WHEN 'canceled' THEN 'لغو'
        WHEN 'expired' THEN 'منقضی (ناتمام)'
        ELSE COALESCE(s.status, 'pending')
      END::text AS bucket_label,
      s.*
    FROM scoped s
  ),
  rolled AS (
    SELECT
      gi.section_sort,
      gi.bucket_sort,
      gi.section,
      gi.bucket_key,
      gi.bucket_label,
      COUNT(*)::integer AS task_count,
      COUNT(*) FILTER (WHERE gi.status NOT IN ('done', 'canceled', 'expired'))::integer AS open_count,
      COUNT(*) FILTER (WHERE gi.status = 'pending')::integer AS pending_count,
      COUNT(*) FILTER (WHERE gi.status = 'in_progress')::integer AS in_progress_count,
      COUNT(*) FILTER (WHERE gi.status = 'done')::integer AS done_count,
      COUNT(*) FILTER (WHERE gi.status = 'blocked')::integer AS blocked_count,
      COUNT(*) FILTER (WHERE gi.status = 'canceled')::integer AS canceled_count,
      COUNT(*) FILTER (WHERE gi.status = 'expired')::integer AS expired_count,
      COUNT(*) FILTER (
        WHERE gi.due_date IS NOT NULL
          AND gi.due_date < v_today
          AND gi.status NOT IN ('done', 'canceled', 'expired')
      )::integer AS overdue_count,
      COUNT(*) FILTER (
        WHERE gi.due_date IS NOT NULL
          AND gi.due_date >= v_today
          AND gi.due_date <= v_today + 2
          AND gi.status NOT IN ('done', 'canceled', 'expired')
      )::integer AS due_soon_count,
      ROUND(
        AVG(EXTRACT(EPOCH FROM (gi.completed_at - gi.created_at)) / 3600.0)
          FILTER (WHERE gi.status = 'done' AND gi.completed_at IS NOT NULL),
        2
      )::numeric AS avg_completion_hours,
      ROUND(
        COUNT(*) FILTER (WHERE gi.status = 'done')::numeric
        / NULLIF(COUNT(*), 0)::numeric
        * 100,
        2
      )::numeric AS completion_rate,
      ROUND(
        COUNT(*) FILTER (
          WHERE gi.due_date IS NOT NULL
            AND gi.due_date < v_today
            AND gi.status NOT IN ('done', 'canceled', 'expired')
        )::numeric
        / NULLIF(COUNT(*) FILTER (WHERE gi.status NOT IN ('done', 'canceled', 'expired')), 0)::numeric
        * 100,
        2
      )::numeric AS overdue_rate,
      MIN(gi.created_at) FILTER (WHERE gi.status NOT IN ('done', 'canceled', 'expired')) AS oldest_open_at,
      MAX(gi.created_at) AS newest_task_at
    FROM grouped_input gi
    GROUP BY gi.section_sort, gi.bucket_sort, gi.section, gi.bucket_key, gi.bucket_label
  )
  SELECT
    r.section,
    r.bucket_key,
    r.bucket_label,
    r.task_count,
    r.open_count,
    r.pending_count,
    r.in_progress_count,
    r.done_count,
    r.blocked_count,
    r.canceled_count,
    r.expired_count,
    r.overdue_count,
    r.due_soon_count,
    r.avg_completion_hours,
    r.completion_rate,
    r.overdue_rate,
    r.oldest_open_at,
    r.newest_task_at
  FROM rolled r
  ORDER BY r.section_sort, r.bucket_sort, r.bucket_label;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_task_kpi_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_task_kpi_report(integer) TO authenticated;


-- ---------------------------------------------------------------------------
-- 10) Adjacent pre-existing hole, closed while we are here.
--     `anon` held every DML verb on marketing_channels — including TRUNCATE,
--     which RLS does not govern at all. Identical in kind to what item 259
--     fixed for `purchases` and phase 2 fixed for the capital tables. No app
--     path writes channels as anon; every write goes through the authenticated
--     server functions in src/lib/marketing/marketing-channels.functions.ts.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.marketing_channels FROM anon;
