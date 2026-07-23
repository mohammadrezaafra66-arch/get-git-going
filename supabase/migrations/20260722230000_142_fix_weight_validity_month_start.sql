-- =====================================================================
-- 142 - Align scoring weight validity dates with month-start semantics
-- =====================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- public.calculate_dynamic_score() normalizes its period to the first of the
-- month (v_period := date_trunc('month', ...)) and resolves weights with
-- `valid_from <= v_period`. Weight rows were being written with
-- valid_from = CURRENT_DATE, so any weight created mid-month was invisible to
-- scoring for the rest of that month. On 2026-07-22 this left every customer
-- and salesperson with total_active_weight = 0 and weighted_score = 0.
--
-- This migration corrects the DATA and the INSERT PATHS. It does NOT change
-- how calculate_dynamic_score, run_daily_capital_allocation, or
-- calculate_customer_realtime_credit resolve periods.
--
-- ---------------------------------------------------------------------
-- BACKUP TO TAKE BEFORE THIS MIGRATION:
--
--     CREATE TABLE IF NOT EXISTS public.dynamic_parameter_weights_backup_142 AS
--       SELECT * FROM public.dynamic_parameter_weights;
--
-- Historical local backup name, kept for reference:
--
--     CREATE TABLE IF NOT EXISTS public.dynamic_parameter_weights_backup_20260722 AS
--       SELECT * FROM public.dynamic_parameter_weights;
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
--   1) Restore any closed, non-month-covering rows deleted by this migration:
--
--     INSERT INTO public.dynamic_parameter_weights
--     SELECT b.*
--       FROM public.dynamic_parameter_weights_backup_142 b
--      WHERE b.valid_to IS NOT NULL
--        AND NOT EXISTS (
--          SELECT 1
--            FROM generate_series(
--                   date_trunc('month', b.valid_from)::date,
--                   date_trunc('month', b.valid_to)::date,
--                   interval '1 month'
--                 ) AS month_start
--           WHERE b.valid_from <= month_start::date
--             AND b.valid_to >= month_start::date
--        )
--        AND NOT EXISTS (
--          SELECT 1
--            FROM public.dynamic_parameter_weights w
--           WHERE w.id = b.id
--        );
--
--   2) Restore valid_from from the backup, by primary key:
--
--     UPDATE public.dynamic_parameter_weights w
--        SET valid_from = b.valid_from
--       FROM public.dynamic_parameter_weights_backup_142 b
--      WHERE b.id = w.id;
--
--   3) Restore the column default:
--
--     ALTER TABLE public.dynamic_parameter_weights
--       ALTER COLUMN valid_from SET DEFAULT CURRENT_DATE;
--
--   4) Restore the three function bodies by re-applying their previous
--      definitions. The pre-change definitions are the ones live immediately
--      before this migration:
--        - public.upsert_dynamic_parameter_weight(uuid,numeric,boolean)
--            (used v_today := CURRENT_DATE for valid_from, valid_to, and the
--             same-period comparison)
--        - public.create_dynamic_scoring_parameter_v2(text,text,text,numeric,text)
--            (from migration 20260722180000_141_2, weight insert used v_today)
--        - public.create_dynamic_scoring_parameter(text,text,numeric,text)
--            (weight insert used v_today)
--
-- ---------------------------------------------------------------------
-- SCOPE NOTE (Option A)
--
-- Only rows with valid_to IS NULL are backfilled. Two customer parameters
-- (customer_payment_discipline, customer_profit_3m) each carry a superseded
-- row closed at 2026-07-13. Backfilling those too would make both the retired
-- and the current weight valid for period 2026-07-01, double-counting those
-- parameters and producing a total active weight of 1.350 instead of 1.000.
-- The superseded rows keep valid_from = 2026-07-12 and stay excluded.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0.1 Remove closed weight ranges that never cover a month-start period.
--
-- calculate_dynamic_score resolves one period per month, always normalized
-- to that month's first day. A closed row that does not contain any such
-- first-of-month date never affected scoring. Keeping those rows can make
-- the later month-start backfill fail on fresh databases because the GiST
-- exclusion constraint still sees range overlap after normalization.
--
-- This is intentionally semantic: no parameter code or audited date is
-- hardcoded. Rows that covered even one month-start boundary are preserved.
-- ---------------------------------------------------------------------
DELETE FROM public.dynamic_parameter_weights w
 WHERE w.valid_to IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM generate_series(
              date_trunc('month', w.valid_from)::date,
              date_trunc('month', w.valid_to)::date,
              interval '1 month'
            ) AS month_start
      WHERE w.valid_from <= month_start::date
        AND w.valid_to >= month_start::date
   );

-- ---------------------------------------------------------------------
-- PRE-CHECK: refuse to run if the proposed backfill would leave any
-- parameter with more than one weight row valid for the current period.
-- This recomputes the Stage 1.4 overlap test against live data, so the
-- migration aborts if the data changed since the audit.
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  v_period date := date_trunc('month', CURRENT_DATE)::date;
  v_bad    int;
  v_rows   int;
BEGIN
  WITH proposed AS (
    SELECT w.parameter_id, w.weight, w.valid_to,
           CASE WHEN w.valid_to IS NULL
                THEN date_trunc('month', w.valid_from)::date
                ELSE w.valid_from
           END AS valid_from
      FROM public.dynamic_parameter_weights w
  )
  SELECT count(*) INTO v_bad
    FROM (
      SELECT pr.parameter_id
        FROM proposed pr
        JOIN public.dynamic_scoring_parameters p ON p.id = pr.parameter_id
       WHERE p.is_active
         AND pr.valid_from <= v_period
         AND (pr.valid_to IS NULL OR pr.valid_to >= v_period)
       GROUP BY pr.parameter_id
      HAVING count(*) > 1
    ) x;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'ABORT: proposed backfill would leave % parameter(s) with more than one weight row valid for period %. Data changed since the audit; re-audit before applying.',
      v_bad, v_period;
  END IF;

  SELECT count(*) INTO v_rows
    FROM public.dynamic_parameter_weights
   WHERE valid_to IS NULL
     AND valid_from <> date_trunc('month', valid_from)::date;

  RAISE NOTICE 'Pre-check OK. Rows to backfill: % (expected 16).', v_rows;
  IF v_rows <> 16 THEN
    RAISE WARNING 'Backfill row count % differs from the audited expectation of 16.', v_rows;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------
-- 3.1 Guarded backfill (Option A): current/open weight rows only.
-- ---------------------------------------------------------------------
UPDATE public.dynamic_parameter_weights
   SET valid_from = date_trunc('month', valid_from)::date
 WHERE valid_to IS NULL
   AND valid_from <> date_trunc('month', valid_from)::date;

-- ---------------------------------------------------------------------
-- 3.2 Insert path 4 of 4: the column default.
-- ---------------------------------------------------------------------
ALTER TABLE public.dynamic_parameter_weights
  ALTER COLUMN valid_from SET DEFAULT date_trunc('month', CURRENT_DATE)::date;

-- ---------------------------------------------------------------------
-- 3.2 Insert path 1 of 4: upsert_dynamic_parameter_weight
--
-- Body copied verbatim from the live definition, with the weight-validity
-- handling moved from day granularity to month granularity:
--
--   v_month := date_trunc('month', CURRENT_DATE)::date
--
--   * new weight rows are inserted with valid_from = v_month
--   * the "already edited in this period" branch compares against v_month
--     instead of v_today, so a second edit in the same month updates the
--     current row in place rather than creating a second row
--   * when an open row from an EARLIER month is superseded it is closed at
--     v_month - 1, i.e. the last day of the previous month
--
-- Changing valid_from alone would be incorrect here: the comparison
-- `v_cur_valid_from = v_today` would never match a backfilled row, so every
-- same-month edit would close the current row at valid_to = v_today and insert
-- a second row at valid_from = v_month. Both rows would then satisfy
-- `valid_from <= period AND valid_to >= period`, double-counting the parameter
-- and reintroducing the exact defect this migration removes.
--
-- v_today is retained unchanged for the daily_capital_settings lookup, which
-- is genuinely day-based and must not move to month granularity.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_dynamic_parameter_weight(_parameter_id uuid, _new_weight numeric, _new_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_cur_weight numeric;
  v_cur_valid_from date;
  v_cur_row_id uuid;
  v_today date := CURRENT_DATE;
  v_month date := date_trunc('month', CURRENT_DATE)::date;
  v_setting record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _new_weight IS NULL OR _new_weight < 0 OR _new_weight > 1 THEN
    RAISE EXCEPTION 'INVALID_WEIGHT';
  END IF;

  SELECT jsonb_build_object(
    'is_active', p.is_active,
    'weight', (SELECT w.weight FROM public.dynamic_parameter_weights w
               WHERE w.parameter_id = p.id AND w.valid_to IS NULL
               ORDER BY w.valid_from DESC LIMIT 1)
  )
  INTO v_before
  FROM public.dynamic_scoring_parameters p
  WHERE p.id = _parameter_id;

  IF v_before IS NULL THEN RAISE EXCEPTION 'PARAMETER_NOT_FOUND'; END IF;

  UPDATE public.dynamic_scoring_parameters
     SET is_active = _new_is_active, updated_at = now()
   WHERE id = _parameter_id;

  SELECT id, weight, valid_from
    INTO v_cur_row_id, v_cur_weight, v_cur_valid_from
    FROM public.dynamic_parameter_weights
   WHERE parameter_id = _parameter_id AND valid_to IS NULL
   ORDER BY valid_from DESC LIMIT 1;

  IF v_cur_row_id IS NULL THEN
    INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
    VALUES (_parameter_id, _new_weight, v_month, v_uid);
  ELSIF v_cur_weight <> _new_weight THEN
    IF v_cur_valid_from = v_month THEN
      UPDATE public.dynamic_parameter_weights
         SET weight = _new_weight, created_by = v_uid
       WHERE id = v_cur_row_id;
    ELSE
      UPDATE public.dynamic_parameter_weights SET valid_to = v_month - 1 WHERE id = v_cur_row_id;
      INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
      VALUES (_parameter_id, _new_weight, v_month, v_uid);
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'dynamic_scoring_parameter', _parameter_id, 'parameter_weight_upserted',
          jsonb_build_object('before', v_before,
                             'after', jsonb_build_object('is_active', _new_is_active, 'weight', _new_weight)));

  SELECT capital_date, total_capital, notes
    INTO v_setting
    FROM public.daily_capital_settings
   WHERE capital_date = v_today
   ORDER BY created_at DESC LIMIT 1;

  IF v_setting.capital_date IS NOT NULL THEN
    BEGIN
      PERFORM public.run_daily_capital_allocation(
        v_setting.capital_date, v_setting.total_capital,
        COALESCE(v_setting.notes, 'auto-rerun after weight change'));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (v_uid, 'dynamic_scoring_parameter', _parameter_id, 'auto_reallocation_failed',
              jsonb_build_object('error', SQLERRM));
    END;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3.2 Insert path 2 of 4: create_dynamic_scoring_parameter_v2
-- Body verbatim from the live definition; only the weight insert's
-- valid_from changes from v_today to date_trunc('month', v_today)::date.
-- v_today is retained for the daily_capital_settings lookup.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_dynamic_scoring_parameter_v2(
  _entity_type text,
  _code        text,
  _label_fa    text,
  _weight      numeric,
  _direction   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_today date := CURRENT_DATE;
  v_next_order int;
  v_setting record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')
          OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _entity_type NOT IN ('customer','salesperson') THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE';
  END IF;
  IF _code IS NULL OR btrim(_code) = '' THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  IF _weight IS NULL OR _weight < 0 OR _weight > 1 THEN RAISE EXCEPTION 'INVALID_WEIGHT'; END IF;
  IF _direction NOT IN ('positive','negative') THEN RAISE EXCEPTION 'INVALID_DIRECTION'; END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_next_order
    FROM public.dynamic_scoring_parameters WHERE entity_type = _entity_type;

  INSERT INTO public.dynamic_scoring_parameters
    (entity_type, code, label_fa, direction, is_active, display_order)
  VALUES
    (_entity_type, btrim(_code),
     COALESCE(NULLIF(btrim(_label_fa), ''), btrim(_code)),
     _direction, true, v_next_order)
  RETURNING id INTO v_id;

  INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
  VALUES (v_id, _weight, date_trunc('month', v_today)::date, v_uid);

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'dynamic_scoring_parameter', v_id::text, 'parameter_created',
          jsonb_build_object('entity_type', _entity_type, 'code', _code,
                             'weight', _weight, 'direction', _direction));

  -- Re-run today's allocation so a new parameter takes effect immediately.
  SELECT capital_date, total_capital, notes INTO v_setting
    FROM public.daily_capital_settings WHERE capital_date = v_today
   ORDER BY created_at DESC LIMIT 1;

  IF v_setting.capital_date IS NOT NULL THEN
    BEGIN
      PERFORM public.run_daily_capital_allocation(
        v_setting.capital_date, v_setting.total_capital,
        COALESCE(v_setting.notes, 'auto-rerun after new parameter'));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (v_uid, 'dynamic_scoring_parameter', v_id::text, 'auto_reallocation_failed',
              jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3.2 Insert path 3 of 4: create_dynamic_scoring_parameter (v1)
-- Body verbatim from the live definition; only the weight insert's
-- valid_from changes from v_today to date_trunc('month', v_today)::date.
--
-- NOTE: this v1 function is already non-functional for a separate,
-- pre-existing reason - it inserts into dynamic_scoring_parameters columns
-- `name` and `weight_default`, neither of which exists on the table any more,
-- so every call fails. That defect is left exactly as found; repairing or
-- dropping v1 is out of scope for this migration. The valid_from correction is
-- applied so the function is not left as a future source of the same bug if it
-- is ever repaired.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_dynamic_scoring_parameter(_code text, _label_fa text, _weight numeric, _direction text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_today date := CURRENT_DATE;
  v_next_order int;
  v_setting record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _code IS NULL OR btrim(_code) = '' THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  IF _weight IS NULL OR _weight < 0 OR _weight > 1 THEN RAISE EXCEPTION 'INVALID_WEIGHT'; END IF;
  IF _direction NOT IN ('positive','negative') THEN RAISE EXCEPTION 'INVALID_DIRECTION'; END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_next_order
    FROM public.dynamic_scoring_parameters WHERE entity_type = 'customer';

  INSERT INTO public.dynamic_scoring_parameters(entity_type, code, label_fa, name, direction, is_active, display_order, weight_default)
  VALUES ('customer', btrim(_code), NULLIF(btrim(_label_fa), ''),
          COALESCE(NULLIF(btrim(_label_fa), ''), btrim(_code)), _direction, true, v_next_order, _weight)
  RETURNING id INTO v_id;

  INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
  VALUES (v_id, _weight, date_trunc('month', v_today)::date, v_uid);

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'dynamic_scoring_parameter', v_id, 'parameter_created',
          jsonb_build_object('code', _code, 'weight', _weight, 'direction', _direction));

  SELECT capital_date, total_capital, notes INTO v_setting
    FROM public.daily_capital_settings WHERE capital_date = v_today
   ORDER BY created_at DESC LIMIT 1;

  IF v_setting.capital_date IS NOT NULL THEN
    BEGIN
      PERFORM public.run_daily_capital_allocation(
        v_setting.capital_date, v_setting.total_capital,
        COALESCE(v_setting.notes, 'auto-rerun after new parameter'));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (v_uid, 'dynamic_scoring_parameter', v_id, 'auto_reallocation_failed',
              jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3.3 POST-CHECK
-- Uses the same predicate the scoring path uses: compare against
-- date_trunc('month', CURRENT_DATE), never CURRENT_DATE. Migration 141_2
-- passed a CURRENT_DATE-based post-check while the scoring path saw nothing,
-- which is exactly the false positive being guarded against here.
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  v_period date := date_trunc('month', CURRENT_DATE)::date;
  r record;
  v_seen int := 0;
BEGIN
  FOR r IN
    SELECT p.entity_type, SUM(w.weight) AS total_active_weight, count(*) AS rows_valid
      FROM public.dynamic_parameter_weights w
      JOIN public.dynamic_scoring_parameters p ON p.id = w.parameter_id
     WHERE p.is_active
       AND w.valid_from <= v_period
       AND (w.valid_to IS NULL OR w.valid_to >= v_period)
     GROUP BY p.entity_type
  LOOP
    v_seen := v_seen + 1;
    RAISE NOTICE 'Post-check: entity_type=% rows_valid=% total_active_weight=%',
      r.entity_type, r.rows_valid, r.total_active_weight;
    IF abs(r.total_active_weight - 1.000) > 0.001 THEN
      RAISE EXCEPTION
        'ABORT: entity_type % has total active weight % for period %, expected 1.000 (+/-0.001).',
        r.entity_type, r.total_active_weight, v_period;
    END IF;
  END LOOP;

  IF v_seen <> 2 THEN
    RAISE EXCEPTION
      'ABORT: expected 2 entity types with active weights for period %, found %.', v_period, v_seen;
  END IF;

  RAISE NOTICE 'Post-check OK for period %.', v_period;
END
$do$;

COMMIT;
