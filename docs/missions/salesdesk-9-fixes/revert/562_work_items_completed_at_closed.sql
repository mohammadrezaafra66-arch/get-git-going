SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.work_items_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.creator_id := auth.uid();
    END IF;
    IF NEW.creator_id IS NULL THEN
      RAISE EXCEPTION 'work_items: creator_id required'
        USING ERRCODE = 'not_null_violation';
    END IF;
  END IF;

  IF NEW.status = 'in_progress' AND NEW.claimed_due_at IS NULL THEN
    RAISE EXCEPTION 'work_items: claimed_due_at required when status=in_progress'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.decision_bucket IS NULL THEN
    NEW.decision_bucket_date := NULL;
  ELSIF NEW.decision_bucket_date IS NULL THEN
    NEW.decision_bucket_date := (now() AT TIME ZONE 'Asia/Tehran')::date;
  END IF;

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
