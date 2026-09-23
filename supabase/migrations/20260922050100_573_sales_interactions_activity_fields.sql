SET client_encoding='UTF8';

-- ============================================================================
-- 573 - sales_interactions activity fields + backfill (Wave 4 D1)
-- ============================================================================
-- Adds: activity_type_id, due_at, due_has_time, original_due_at, done_at, result_note.
-- deal_id already exists from 564 — do NOT recreate FK; ADD COLUMN IF NOT EXISTS only.
-- Owner of activity = salesperson_id; creator = author_id (no new columns).
-- Backfill activity_type_id for kind IN ('call','note') without changing kind:
--   note → sort_order 0 (simple note)
--   call + call_logs.direction='outbound' → sort_order 2 (outbound call)
--   call otherwise → sort_order 1 (inbound call)
--   request → leave activity_type_id NULL
-- Legacy follow-ups: copy next_follow_up_at → due_at + original_due_at, due_has_time=true
--   when next_follow_up_at IS NOT NULL AND due_at IS NULL (call/note only).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/573_sales_interactions_activity_fields.sql
-- ============================================================================

SET lock_timeout = '60s';

-- deal_id already from 564; keep idempotent mention only
ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS deal_id uuid NULL;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS activity_type_id uuid NULL;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS due_at timestamptz NULL;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS due_has_time boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS original_due_at timestamptz NULL;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS done_at timestamptz NULL;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS result_note text NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_interactions_activity_type_id_fkey'
      AND conrelid = 'public.sales_interactions'::regclass
  ) THEN
    ALTER TABLE public.sales_interactions
      ADD CONSTRAINT sales_interactions_activity_type_id_fkey
      FOREIGN KEY (activity_type_id) REFERENCES public.sales_activity_types(id);
  END IF;
END
$do$;

COMMENT ON COLUMN public.sales_interactions.activity_type_id IS
  'FK to sales_activity_types. Mapped for call/note; NULL for request deals. Migration 573.';

COMMENT ON COLUMN public.sales_interactions.due_at IS
  'Activity due timestamp. Legacy next_follow_up_at copied on backfill when present. Migration 573.';

COMMENT ON COLUMN public.sales_interactions.due_has_time IS
  'True when due_at includes a clock time. Migration 573.';

COMMENT ON COLUMN public.sales_interactions.original_due_at IS
  'First due_at preserved across postpone. Migration 573.';

COMMENT ON COLUMN public.sales_interactions.done_at IS
  'When activity marked done. Migration 573.';

COMMENT ON COLUMN public.sales_interactions.result_note IS
  'Result text on activity completion. Migration 573.';

COMMENT ON COLUMN public.sales_interactions.salesperson_id IS
  'Activity owner (مسئول انجام این فعالیت) / deal responsible. No separate owner column. Migration 573 note.';

COMMENT ON COLUMN public.sales_interactions.author_id IS
  'Activity/deal creator. No separate creator column. Migration 573 note.';

-- Indexes for D4/D5 (deal_id index already from 564)
CREATE INDEX IF NOT EXISTS sales_interactions_salesperson_due_open_idx
  ON public.sales_interactions (salesperson_id, due_at)
  WHERE done_at IS NULL;

CREATE INDEX IF NOT EXISTS sales_interactions_activity_type_id_idx
  ON public.sales_interactions (activity_type_id)
  WHERE activity_type_id IS NOT NULL;

-- Backfill activity_type_id (idempotent: only where NULL)
UPDATE public.sales_interactions si
SET activity_type_id = t.id
FROM public.sales_activity_types t
WHERE si.kind = 'note'
  AND si.activity_type_id IS NULL
  AND t.sort_order = 0;

UPDATE public.sales_interactions si
SET activity_type_id = t.id
FROM public.sales_activity_types t
WHERE si.kind = 'call'
  AND si.activity_type_id IS NULL
  AND t.sort_order = 2
  AND EXISTS (
    SELECT 1
    FROM public.call_logs cl
    WHERE cl.id = si.call_log_id
      AND cl.direction = 'outbound'
  );

UPDATE public.sales_interactions si
SET activity_type_id = t.id
FROM public.sales_activity_types t
WHERE si.kind = 'call'
  AND si.activity_type_id IS NULL
  AND t.sort_order = 1;

-- Legacy follow-ups → due_* (least invasive; only when due_at still null)
UPDATE public.sales_interactions
SET due_at = next_follow_up_at,
    original_due_at = next_follow_up_at,
    due_has_time = true
WHERE kind IN ('call', 'note')
  AND next_follow_up_at IS NOT NULL
  AND due_at IS NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_interactions'
      AND column_name = 'activity_type_id'
  ) THEN
    RAISE EXCEPTION '573: activity_type_id missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_interactions'
      AND column_name = 'due_at'
  ) THEN
    RAISE EXCEPTION '573: due_at missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_interactions'
      AND column_name = 'due_has_time'
  ) THEN
    RAISE EXCEPTION '573: due_has_time missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_interactions'
      AND column_name = 'original_due_at'
  ) THEN
    RAISE EXCEPTION '573: original_due_at missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_interactions'
      AND column_name = 'done_at'
  ) THEN
    RAISE EXCEPTION '573: done_at missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_interactions'
      AND column_name = 'result_note'
  ) THEN
    RAISE EXCEPTION '573: result_note missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_interactions_activity_type_id_fkey'
      AND conrelid = 'public.sales_interactions'::regclass
  ) THEN
    RAISE EXCEPTION '573: sales_interactions_activity_type_id_fkey missing';
  END IF;
  -- request rows must remain unmapped
  IF EXISTS (
    SELECT 1 FROM public.sales_interactions
    WHERE kind = 'request' AND activity_type_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION '573: request rows must keep activity_type_id NULL';
  END IF;
  -- call/note must be mapped
  IF EXISTS (
    SELECT 1 FROM public.sales_interactions
    WHERE kind IN ('call', 'note') AND activity_type_id IS NULL
  ) THEN
    RAISE EXCEPTION '573: call/note rows missing activity_type_id after backfill';
  END IF;
END
$do$;
