SET client_encoding TO 'UTF8';

-- ============================================================================
-- 543 — Calm Mind Task System (لایهٔ داده)
-- ============================================================================
-- جداول جدید: work_topics / work_items / work_merge_suggestions
-- عمداً از public.tasks جداست — هیچ ALTER روی tasks.
--
-- مسیر برگشت (فقط روی کپی): docs/verification/543-down.sql
--   DROP FUNCTION ... ; DROP TABLE work_merge_suggestions, work_items, work_topics CASCADE;
--   DELETE FROM role_permissions WHERE module = 'work';
-- ============================================================================

SET lock_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0) نقش‌ها: ماژول work برای همهٔ roleها (ردیف خالی = درِ باز — قانون 2.5 / 291)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'work',
       r.role_name IN ('admin', 'manager', 'sales', 'accountant', 'viewer'),
       r.role_name IN ('admin', 'manager', 'sales', 'accountant', 'viewer'),
       r.role_name IN ('admin', 'manager', 'sales', 'accountant', 'viewer'),
       r.role_name IN ('admin', 'manager'),
       false,
       r.role_name IN ('admin', 'manager'),
       r.role_name IN ('admin', 'manager')
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'work'
 );

-- ---------------------------------------------------------------------------
-- 1) work_topics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'closed')),
  owner_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.work_topics IS
  'Calm Mind: موضوع/پروندهٔ کاری. جدا از public.tasks.';

CREATE INDEX IF NOT EXISTS idx_work_topics_status
  ON public.work_topics (status);
CREATE INDEX IF NOT EXISTS idx_work_topics_owner
  ON public.work_topics (owner_id)
  WHERE owner_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_work_topics_updated_at ON public.work_topics;
CREATE TRIGGER trg_work_topics_updated_at
  BEFORE UPDATE ON public.work_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.work_topics ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) work_items  (وظیفهٔ Calm Mind — نه public.tasks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  body                  text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'testing', 'done', 'cancelled')),
  kind                  text NOT NULL DEFAULT 'note'
                          CHECK (kind IN ('question', 'change_request', 'bug', 'note')),
  priority              text NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('low', 'normal', 'high')),
  group_name            text,
  section               text,
  assignee_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  creator_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL
                          DEFAULT auth.uid(),
  intake_summary        text,
  intake_transcript     text,
  acceptance_criteria   text,
  claimed_due_at        timestamptz,
  decision_bucket       text
                          CHECK (decision_bucket IS NULL
                                 OR decision_bucket IN ('today_decide', 'today_do', 'waiting')),
  decision_bucket_date  date,
  work_mode             text NOT NULL DEFAULT 'request'
                          CHECK (work_mode IN ('request', 'executable')),
  impact_level          text NOT NULL DEFAULT 'none'
                          CHECK (impact_level IN ('none', 'low', 'medium', 'high', 'blocker')),
  impact_if_missed      text,
  topic_id              uuid REFERENCES public.work_topics(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

COMMENT ON TABLE public.work_items IS
  'Calm Mind task row. Never confuse with public.tasks (operations board).';

CREATE INDEX IF NOT EXISTS idx_work_items_status
  ON public.work_items (status);
CREATE INDEX IF NOT EXISTS idx_work_items_assignee
  ON public.work_items (assignee_id)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_creator
  ON public.work_items (creator_id)
  WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_decision
  ON public.work_items (decision_bucket, decision_bucket_date)
  WHERE decision_bucket IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_topic
  ON public.work_items (topic_id)
  WHERE topic_id IS NOT NULL;
-- اسکن شباهت روی آیتم‌های باز
CREATE INDEX IF NOT EXISTS idx_work_items_open_similarity
  ON public.work_items (created_at DESC)
  WHERE status NOT IN ('done', 'cancelled');

-- قوانین کسب‌وکار در تریگر (نه فقط CHECK) — [A-3]
CREATE OR REPLACE FUNCTION public.work_items_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  -- creator همیشه روی insert = auth.uid() (اگر نشست هست)
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.creator_id := auth.uid();
    END IF;
    IF NEW.creator_id IS NULL THEN
      RAISE EXCEPTION 'work_items: creator_id required'
        USING ERRCODE = 'not_null_violation';
    END IF;
  END IF;

  -- ۱) in_progress بدون ETA ممنوع
  IF NEW.status = 'in_progress' AND NEW.claimed_due_at IS NULL THEN
    RAISE EXCEPTION 'work_items: claimed_due_at required when status=in_progress'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ۲) decision_bucket → تاریخ تهران اگر خالی
  IF NEW.decision_bucket IS NULL THEN
    NEW.decision_bucket_date := NULL;
  ELSIF NEW.decision_bucket_date IS NULL THEN
    NEW.decision_bucket_date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  END IF;

  -- ۴) completed_at
  IF NEW.status = 'done' THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'done' AND NEW.status IS DISTINCT FROM 'done' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_work_items_before_write ON public.work_items;
CREATE TRIGGER trg_work_items_before_write
  BEFORE INSERT OR UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.work_items_before_write();

DROP TRIGGER IF EXISTS trg_work_items_updated_at ON public.work_items;
CREATE TRIGGER trg_work_items_updated_at
  BEFORE UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) work_merge_suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_merge_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id  uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  target_item_id  uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  score           numeric NOT NULL,
  reason          text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (source_item_id <> target_item_id)
);

COMMENT ON TABLE public.work_merge_suggestions IS
  'Calm Mind: پیشنهاد ادغام تکراری. پذیرش فقط با RPC صریح — هرگز خودکار.';

-- جفت pending یکتا با ترتیب نرمال‌شده
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_merge_suggestions_pending_pair
  ON public.work_merge_suggestions (
    LEAST(source_item_id, target_item_id),
    GREATEST(source_item_id, target_item_id)
  )
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_work_merge_suggestions_source
  ON public.work_merge_suggestions (source_item_id);
CREATE INDEX IF NOT EXISTS idx_work_merge_suggestions_target
  ON public.work_merge_suggestions (target_item_id);
CREATE INDEX IF NOT EXISTS idx_work_merge_suggestions_status
  ON public.work_merge_suggestions (status);

ALTER TABLE public.work_merge_suggestions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4) helper: آیا کاربر فعلی این work_item را می‌بیند؟ (هم‌تراز RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_can_see_item(_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.work_items wi
     WHERE wi.id = _item_id
       AND (
         public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
         OR wi.creator_id = auth.uid()
         OR wi.assignee_id = auth.uid()
       )
  );
$fn$;

REVOKE ALL ON FUNCTION public.work_can_see_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_can_see_item(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_can_see_item(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS — work_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_items_select ON public.work_items;
CREATE POLICY work_items_select ON public.work_items
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR creator_id = auth.uid()
    OR assignee_id = auth.uid()
  );

DROP POLICY IF EXISTS work_items_insert ON public.work_items;
CREATE POLICY work_items_insert ON public.work_items
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND creator_id = auth.uid()
  );

DROP POLICY IF EXISTS work_items_update ON public.work_items;
CREATE POLICY work_items_update ON public.work_items
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR creator_id = auth.uid()
    OR assignee_id = auth.uid()
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR creator_id = auth.uid()
    OR assignee_id = auth.uid()
  );

DROP POLICY IF EXISTS work_items_delete ON public.work_items;
CREATE POLICY work_items_delete ON public.work_items
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

-- ---------------------------------------------------------------------------
-- 6) RLS — work_topics
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_topics_select ON public.work_topics;
CREATE POLICY work_topics_select ON public.work_topics
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.work_items wi
       WHERE wi.topic_id = work_topics.id
         AND (
           public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
           OR wi.creator_id = auth.uid()
           OR wi.assignee_id = auth.uid()
         )
    )
  );

DROP POLICY IF EXISTS work_topics_insert ON public.work_topics;
CREATE POLICY work_topics_insert ON public.work_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

DROP POLICY IF EXISTS work_topics_update ON public.work_topics;
CREATE POLICY work_topics_update ON public.work_topics
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR owner_id = auth.uid()
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS work_topics_delete ON public.work_topics;
CREATE POLICY work_topics_delete ON public.work_topics
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

-- ---------------------------------------------------------------------------
-- 7) RLS — work_merge_suggestions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS work_merge_suggestions_select ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_select ON public.work_merge_suggestions
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR (
      public.work_can_see_item(source_item_id)
      AND public.work_can_see_item(target_item_id)
    )
  );

DROP POLICY IF EXISTS work_merge_suggestions_insert ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_insert ON public.work_merge_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND public.work_can_see_item(source_item_id)
    AND public.work_can_see_item(target_item_id)
  );

DROP POLICY IF EXISTS work_merge_suggestions_update ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_update ON public.work_merge_suggestions
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR (
      public.work_can_see_item(source_item_id)
      AND public.work_can_see_item(target_item_id)
    )
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR (
      public.work_can_see_item(source_item_id)
      AND public.work_can_see_item(target_item_id)
    )
  );

DROP POLICY IF EXISTS work_merge_suggestions_delete ON public.work_merge_suggestions;
CREATE POLICY work_merge_suggestions_delete ON public.work_merge_suggestions
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

-- ---------------------------------------------------------------------------
-- 8) Grants — anon هیچ، authenticated CRUD (بدون TRUNCATE — 537)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.work_topics FROM PUBLIC;
REVOKE ALL ON TABLE public.work_topics FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_topics TO authenticated;

REVOKE ALL ON TABLE public.work_items FROM PUBLIC;
REVOKE ALL ON TABLE public.work_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_items TO authenticated;

REVOKE ALL ON TABLE public.work_merge_suggestions FROM PUBLIC;
REVOKE ALL ON TABLE public.work_merge_suggestions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_merge_suggestions TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) RPC: work_morning_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_morning_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_is_mgr  boolean;
  v_today   date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  v_result  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_morning_summary: authentication required'
      USING ERRCODE = '28000';
  END IF;

  v_is_mgr := public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[]);

  WITH visible AS (
    SELECT *
      FROM public.work_items wi
     WHERE v_is_mgr
        OR wi.creator_id = v_uid
        OR wi.assignee_id = v_uid
  ),
  counts AS (
    SELECT
      count(*) FILTER (
        WHERE decision_bucket = 'today_decide'
          AND decision_bucket_date = v_today
          AND status NOT IN ('done', 'cancelled')
      )::int AS today_decide,
      count(*) FILTER (
        WHERE decision_bucket = 'today_do'
          AND decision_bucket_date = v_today
          AND status NOT IN ('done', 'cancelled')
      )::int AS today_do,
      count(*) FILTER (
        WHERE decision_bucket = 'waiting'
          AND status NOT IN ('done', 'cancelled')
      )::int AS waiting,
      count(*) FILTER (
        WHERE status NOT IN ('done', 'cancelled')
      )::int AS open
      FROM visible
  ),
  top_impact AS (
    SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) AS items
      FROM (
        SELECT id, title, status, impact_level, priority, claimed_due_at, decision_bucket
          FROM visible
         WHERE status NOT IN ('done', 'cancelled')
           AND impact_level IN ('medium', 'high', 'blocker')
         ORDER BY
           CASE impact_level
             WHEN 'blocker' THEN 4
             WHEN 'high'    THEN 3
             WHEN 'medium'  THEN 2
             ELSE 1
           END DESC,
           created_at ASC
         LIMIT 5
      ) t
  )
  SELECT jsonb_build_object(
           'today_decide', c.today_decide,
           'today_do',     c.today_do,
           'waiting',      c.waiting,
           'open',         c.open,
           'top_impact',   ti.items,
           'as_of_date',   v_today
         )
    INTO v_result
    FROM counts c, top_impact ti;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_morning_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_morning_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.work_morning_summary() TO authenticated;

COMMENT ON FUNCTION public.work_morning_summary() IS
  'Calm Mind: خلاصهٔ صبح — شمارش سطل‌ها و ۵ آیتم اثرگذار باز، محدود به ردیف‌های قابل‌دید کاربر.';

-- ---------------------------------------------------------------------------
-- 10) RPC: work_set_decision_bucket
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_set_decision_bucket(
  p_item_id uuid,
  p_bucket  text,
  p_date    date DEFAULT NULL
)
RETURNS public.work_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_row   public.work_items;
  v_date  date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_set_decision_bucket: authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_bucket IS NOT NULL AND p_bucket NOT IN ('today_decide', 'today_do', 'waiting') THEN
    RAISE EXCEPTION 'work_set_decision_bucket: invalid bucket %', p_bucket
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.work_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_set_decision_bucket: item not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR v_row.creator_id = v_uid
    OR v_row.assignee_id = v_uid
  ) THEN
    RAISE EXCEPTION 'work_set_decision_bucket: not allowed'
      USING ERRCODE = '42501';
  END IF;

  IF p_bucket IS NULL THEN
    v_date := NULL;
  ELSIF p_date IS NULL THEN
    v_date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  ELSE
    v_date := p_date;
  END IF;

  UPDATE public.work_items
     SET decision_bucket = p_bucket,
         decision_bucket_date = v_date
   WHERE id = p_item_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_set_decision_bucket(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_set_decision_bucket(uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_set_decision_bucket(uuid, text, date) TO authenticated;

COMMENT ON FUNCTION public.work_set_decision_bucket(uuid, text, date) IS
  'Calm Mind: تنظیم سطل تصمیم؛ اگر تاریخ null و سطل غیرnull → امروز تهران؛ اگر سطل null → پاک کردن تاریخ.';

-- ---------------------------------------------------------------------------
-- 11) RPC: work_create_item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_create_item(
  p_title               text,
  p_body                text DEFAULT NULL,
  p_kind                text DEFAULT 'note',
  p_priority            text DEFAULT 'normal',
  p_group_name          text DEFAULT NULL,
  p_section             text DEFAULT NULL,
  p_assignee_id         uuid DEFAULT NULL,
  p_intake_summary      text DEFAULT NULL,
  p_intake_transcript   text DEFAULT NULL,
  p_acceptance_criteria text DEFAULT NULL,
  p_decision_bucket     text DEFAULT NULL,
  p_work_mode           text DEFAULT 'request',
  p_impact_level        text DEFAULT 'none',
  p_impact_if_missed    text DEFAULT NULL,
  p_topic_id            uuid DEFAULT NULL
)
RETURNS public.work_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.work_items;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_create_item: authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_any_role(
       v_uid,
       ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::text[]
     ) THEN
    RAISE EXCEPTION 'work_create_item: role not permitted'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.work_items (
    title, body, kind, priority, group_name, section,
    assignee_id, creator_id,
    intake_summary, intake_transcript, acceptance_criteria,
    decision_bucket, work_mode, impact_level, impact_if_missed, topic_id
  ) VALUES (
    p_title, p_body,
    coalesce(p_kind, 'note'),
    coalesce(p_priority, 'normal'),
    p_group_name, p_section,
    p_assignee_id, v_uid,
    p_intake_summary, p_intake_transcript, p_acceptance_criteria,
    p_decision_bucket,
    coalesce(p_work_mode, 'request'),
    coalesce(p_impact_level, 'none'),
    p_impact_if_missed, p_topic_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_create_item(
  text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_create_item(
  text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_create_item(
  text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.work_create_item(
  text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, uuid
) IS
  'Calm Mind: ساخت آیتم با creator_id=auth.uid().';

-- ---------------------------------------------------------------------------
-- 12) RPC: work_scan_merge_suggestions (Jaccard ساده روی title)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_scan_merge_suggestions(p_item_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_src      public.work_items;
  v_src_tok  text[];
  v_cand     record;
  v_cand_tok text[];
  v_inter    int;
  v_union    int;
  v_score    numeric;
  v_inserted int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_scan_merge_suggestions: authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.work_can_see_item(p_item_id) THEN
    RAISE EXCEPTION 'work_scan_merge_suggestions: not allowed'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_scan_merge_suggestions: item not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_src.status IN ('done', 'cancelled') THEN
    RETURN 0;
  END IF;

  SELECT array_agg(DISTINCT t)
    INTO v_src_tok
    FROM unnest(
      regexp_split_to_array(lower(coalesce(v_src.title, '')), '[[:space:][:punct:]]+')
    ) AS t
   WHERE length(t) >= 2;

  IF v_src_tok IS NULL OR array_length(v_src_tok, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_cand IN
    SELECT wi.*
      FROM public.work_items wi
     WHERE wi.id <> p_item_id
       AND wi.status NOT IN ('done', 'cancelled')
       AND (
         public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
         OR wi.creator_id = v_uid
         OR wi.assignee_id = v_uid
         OR v_src.creator_id = v_uid
         OR v_src.assignee_id = v_uid
       )
  LOOP
    IF NOT public.work_can_see_item(v_cand.id) THEN
      CONTINUE;
    END IF;

    SELECT array_agg(DISTINCT t)
      INTO v_cand_tok
      FROM unnest(
        regexp_split_to_array(lower(coalesce(v_cand.title, '')), '[[:space:][:punct:]]+')
      ) AS t
     WHERE length(t) >= 2;

    IF v_cand_tok IS NULL OR array_length(v_cand_tok, 1) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT count(*)::int INTO v_inter
      FROM (
        SELECT unnest(v_src_tok)
        INTERSECT
        SELECT unnest(v_cand_tok)
      ) x;

    SELECT count(*)::int INTO v_union
      FROM (
        SELECT unnest(v_src_tok)
        UNION
        SELECT unnest(v_cand_tok)
      ) x;

    IF v_union = 0 THEN
      CONTINUE;
    END IF;

    v_score := round((v_inter::numeric / v_union::numeric), 4);
    IF v_score < 0.35 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.work_merge_suggestions (
      source_item_id, target_item_id, score, reason, status
    ) VALUES (
      p_item_id, v_cand.id, v_score,
      format('jaccard_title=%.4f', v_score),
      'pending'
    )
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_scan_merge_suggestions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_scan_merge_suggestions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_scan_merge_suggestions(uuid) TO authenticated;

COMMENT ON FUNCTION public.work_scan_merge_suggestions(uuid) IS
  'Calm Mind Phase 2: اسکن Jaccard ساده روی title؛ فقط پیشنهاد pending می‌سازد — پذیرش خودکار ندارد.';

-- ---------------------------------------------------------------------------
-- 13) RPC: work_accept_merge  (هرگز خودکار)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_accept_merge(
  p_suggestion_id uuid,
  p_keep_item_id  uuid
)
RETURNS public.work_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_sug     public.work_merge_suggestions;
  v_keep    public.work_items;
  v_absorb  public.work_items;
  v_absorb_id uuid;
  v_body    text;
  v_sum     text;
  v_tr      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_accept_merge: authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_sug
    FROM public.work_merge_suggestions
   WHERE id = p_suggestion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_accept_merge: suggestion not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_sug.status <> 'pending' THEN
    RAISE EXCEPTION 'work_accept_merge: suggestion is %', v_sug.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_keep_item_id IS DISTINCT FROM v_sug.source_item_id
     AND p_keep_item_id IS DISTINCT FROM v_sug.target_item_id THEN
    RAISE EXCEPTION 'work_accept_merge: keep id must be source or target'
      USING ERRCODE = '22023';
  END IF;

  v_absorb_id := CASE
    WHEN p_keep_item_id = v_sug.source_item_id THEN v_sug.target_item_id
    ELSE v_sug.source_item_id
  END;

  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR (
      public.work_can_see_item(v_sug.source_item_id)
      AND public.work_can_see_item(v_sug.target_item_id)
    )
  ) THEN
    RAISE EXCEPTION 'work_accept_merge: not allowed'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_keep FROM public.work_items WHERE id = p_keep_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_accept_merge: keep item missing'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_absorb FROM public.work_items WHERE id = v_absorb_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_accept_merge: absorb item missing'
      USING ERRCODE = 'P0002';
  END IF;

  -- فقط admin/manager یا creator/assignee روی keep می‌توانند ادغام کنند
  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR v_keep.creator_id = v_uid
    OR v_keep.assignee_id = v_uid
  ) THEN
    RAISE EXCEPTION 'work_accept_merge: cannot update keep item'
      USING ERRCODE = '42501';
  END IF;

  v_body := coalesce(v_keep.body, '');
  IF v_absorb.body IS NOT NULL AND length(btrim(v_absorb.body)) > 0 THEN
    v_body := nullif(btrim(
      v_body || E'\n\n--- merged from ' || v_absorb.id::text || E' ---\n' || v_absorb.body
    ), '');
  END IF;

  v_sum := coalesce(v_keep.intake_summary, '');
  IF v_absorb.intake_summary IS NOT NULL AND length(btrim(v_absorb.intake_summary)) > 0 THEN
    v_sum := nullif(btrim(
      v_sum || E'\n\n--- merged ---\n' || v_absorb.intake_summary
    ), '');
  END IF;

  v_tr := coalesce(v_keep.intake_transcript, '');
  IF v_absorb.intake_transcript IS NOT NULL AND length(btrim(v_absorb.intake_transcript)) > 0 THEN
    v_tr := nullif(btrim(
      v_tr || E'\n\n--- merged ---\n' || v_absorb.intake_transcript
    ), '');
  END IF;

  UPDATE public.work_items
     SET body = v_body,
         intake_summary = v_sum,
         intake_transcript = v_tr
   WHERE id = p_keep_item_id
   RETURNING * INTO v_keep;

  UPDATE public.work_items
     SET status = 'cancelled'
   WHERE id = v_absorb_id;

  UPDATE public.work_merge_suggestions
     SET status = 'accepted'
   WHERE id = p_suggestion_id;

  RETURN v_keep;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_accept_merge(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_accept_merge(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_accept_merge(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.work_accept_merge(uuid, uuid) IS
  'Calm Mind: پذیرش صریح پیشنهاد ادغام — بدنه/intake را به keep می‌چسباند، absorb را cancelled می‌کند.';

-- ---------------------------------------------------------------------------
-- 14) RPC: work_dismiss_merge (اختیاری)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_dismiss_merge(p_suggestion_id uuid)
RETURNS public.work_merge_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_sug public.work_merge_suggestions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_dismiss_merge: authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_sug
    FROM public.work_merge_suggestions
   WHERE id = p_suggestion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_dismiss_merge: suggestion not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_any_role(v_uid, ARRAY['admin', 'manager']::text[])
    OR (
      public.work_can_see_item(v_sug.source_item_id)
      AND public.work_can_see_item(v_sug.target_item_id)
    )
  ) THEN
    RAISE EXCEPTION 'work_dismiss_merge: not allowed'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.work_merge_suggestions
     SET status = 'dismissed'
   WHERE id = p_suggestion_id
   RETURNING * INTO v_sug;

  RETURN v_sug;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_dismiss_merge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_dismiss_merge(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.work_dismiss_merge(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 15) Assertions
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE
  n int;
  roles int;
  tasks_cols int;
BEGIN
  SELECT count(DISTINCT role_name) INTO roles FROM public.role_permissions;
  SELECT count(*) INTO n FROM public.role_permissions WHERE module = 'work';
  IF n <> roles THEN
    RAISE EXCEPTION '543: work module must have a row for all % roles, found %', roles, n;
  END IF;

  IF to_regclass('public.work_topics') IS NULL
     OR to_regclass('public.work_items') IS NULL
     OR to_regclass('public.work_merge_suggestions') IS NULL THEN
    RAISE EXCEPTION '543: expected tables missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.work_items'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.work_topics'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.work_merge_suggestions'::regclass)
  THEN
    RAISE EXCEPTION '543: RLS must be enabled on all work_* tables';
  END IF;

  -- public.tasks دست‌نخورده (حداقل: هنوز وجود دارد)
  SELECT count(*) INTO tasks_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'tasks';
  IF tasks_cols = 0 THEN
    RAISE EXCEPTION '543: public.tasks unexpectedly missing';
  END IF;
END
$chk$;
