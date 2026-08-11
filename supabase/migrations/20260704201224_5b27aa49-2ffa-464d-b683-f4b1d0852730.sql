CREATE INDEX IF NOT EXISTS idx_pricing_recompute_queue_status_enqueued
ON public.pricing_recompute_queue (status, enqueued_at DESC)
WHERE status IN ('pending', 'failed');