SET client_encoding='UTF8';

-- ============================================================================
-- 278 — forward fix for a defect the LIVE verification of 277 found.
--       (277 is applied; migrations are never edited — rule 6.)
--
-- SYMPTOM
--   Ticking an already-completed marketing task a second time returned
--   HTTP 200 and the UI cheerfully said «ثبت شد. امتیاز شما به‌روزرسانی شد.»
--   On-the-wire test 10 expected a refusal and got success.
--
-- ROOT CAUSE
--   `complete_marketing_task` unconditionally ran
--       UPDATE tasks SET status='done' ... WHERE id = p_task_id
--   On a task that is ALREADY 'done', that statement changes nothing, so in
--   trg_marketing_task_guard this branch fires first:
--       IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW;
--   and the guard returns before ever reaching its
--       IF OLD.status = 'done' THEN RAISE ...
--   check. The early return is itself correct and must stay — it is what lets
--   unrelated column edits through — but it means "no transition" can never be
--   distinguished from "forbidden transition" inside the trigger.
--
-- WHY THIS WAS NOT A SCORING BUG
--   Verified on the live stack before fixing: the AFTER trigger guards with
--   `IF NEW.status <> 'done' OR OLD.status = 'done' THEN RETURN NEW`, so the
--   second tick emitted NO second employee_score_events row and awarded no
--   extra XP. The count stayed at exactly one promotion_completed event.
--   The defect was therefore a HONESTY defect, not a double-scoring one: the
--   system told the user it had recorded something it had not.
--
-- FIX
--   Decide it in the RPC, which already holds the row under FOR UPDATE and so
--   knows the current status without an extra query. The trigger is left
--   exactly as 277 wrote it — it remains the backstop for every non-RPC path,
--   and the two are not in conflict: the trigger polices TRANSITIONS, the RPC
--   polices the REQUEST.
--
-- Migration impact : replaces one function body. Signature unchanged, so no
--                    DROP is needed and no caller breaks.
-- RLS impact       : none.
-- Audit impact     : none.
-- Live snapshot    : docs/verification/pre-278/complete_marketing_task.sql
-- ============================================================================

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

  -- 278: terminal states are answered HERE. The guard trigger cannot do it,
  -- because writing 'done' over 'done' is not a transition and its
  -- unchanged-status early return fires first.
  IF v_task.status = 'done' THEN
    RAISE EXCEPTION 'این وظیفهٔ بازاریابی قبلاً تکمیل شده است.' USING ERRCODE = '42501';
  END IF;

  IF v_task.status = 'expired' THEN
    RAISE EXCEPTION 'این وظیفهٔ بازاریابی منقضی شده است و دیگر قابل ثبت نیست. کار ناتمام به روز بعد منتقل نمی‌شود.'
      USING ERRCODE = '42501';
  END IF;

  IF v_task.status = 'canceled' THEN
    RAISE EXCEPTION 'این وظیفهٔ بازاریابی لغو شده است.' USING ERRCODE = '42501';
  END IF;

  -- Wrong-day is still left to trg_marketing_task_guard: it IS a transition,
  -- the trigger already names both dates in its message, and duplicating the
  -- rule here would create exactly the kind of second copy that drifts.
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
  'تیک‌زدن وظیفهٔ بازاریابی توسط مسئول آن، بدون مدرک و بدون تأیید مدیر (۲۲۴). وضعیت‌های پایانی (انجام‌شده/منقضی/لغو) در همین تابع رد می‌شوند (۲۷۸).';

REVOKE ALL ON FUNCTION public.complete_marketing_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_marketing_task(uuid) TO authenticated;
