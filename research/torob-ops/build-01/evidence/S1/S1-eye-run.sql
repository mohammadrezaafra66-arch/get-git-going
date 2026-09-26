SET client_encoding TO 'UTF8';
SELECT id, status, started_at, finished_at, products_attempted, products_succeeded, products_failed, products_skipped, skip_reasons
FROM public.torob_eye_runs
ORDER BY started_at DESC LIMIT 3;
SELECT count(*) AS snaps FROM public.torob_offer_snapshots;
