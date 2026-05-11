-- PRICE-RT.2: Atomic claim function for the pricing recompute queue.
-- Worker (server route) calls this with service-role to safely lease jobs
-- without double-processing.

CREATE OR REPLACE FUNCTION public.claim_pricing_recompute_jobs(
  _batch_size integer DEFAULT 25,
  _max_attempts integer DEFAULT 3
)
RETURNS SETOF public.pricing_recompute_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _batch_size IS NULL OR _batch_size < 1 THEN
    _batch_size := 25;
  END IF;
  IF _batch_size > 100 THEN
    _batch_size := 100;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.pricing_recompute_queue
    WHERE status = 'pending'
      AND attempts < _max_attempts
    ORDER BY priority ASC, enqueued_at ASC
    LIMIT _batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pricing_recompute_queue q
  SET status = 'processing',
      started_at = now(),
      attempts = q.attempts + 1
  FROM picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pricing_recompute_jobs(integer, integer)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.claim_pricing_recompute_jobs(integer, integer) IS
  'PRICE-RT.2: Atomically claim pending queue rows with FOR UPDATE SKIP LOCKED. Marks them processing and increments attempts. Service-role only.';
