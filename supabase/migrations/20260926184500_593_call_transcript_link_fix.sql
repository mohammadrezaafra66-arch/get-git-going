SET client_encoding='UTF8';

-- ============================================================================
-- 593 — fix link helpers: uuid has no MIN(); pick with LIMIT 2 instead.
-- Replaces only the two functions created in 592. No table changes.
-- ============================================================================

SET lock_timeout = '60s';

CREATE OR REPLACE FUNCTION public.link_transcript_session_live(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  s public.call_transcript_sessions%ROWTYPE;
  n int;
  rid uuid;
  r_linked text;
  r_ext text;
  r_emp uuid;
  method text;
BEGIN
  SELECT * INTO s FROM public.call_transcript_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF s.ring_event_id IS NOT NULL AND s.employee_id IS NOT NULL THEN
    RETURN;
  END IF;

  method := NULL;
  rid := NULL;

  SELECT COUNT(*) INTO n
    FROM public.call_ring_events e
   WHERE e.uniqueid IS NOT DISTINCT FROM s.recording_uniqueid;
  IF n = 1 THEN
    SELECT e.id, e.linkedid, e.extension, e.employee_id
      INTO rid, r_linked, r_ext, r_emp
      FROM public.call_ring_events e
     WHERE e.uniqueid IS NOT DISTINCT FROM s.recording_uniqueid;
    method := 'uniqueid';
  ELSE
    SELECT COUNT(*) INTO n
      FROM public.call_ring_events e
     WHERE e.linkedid IS NOT DISTINCT FROM s.recording_uniqueid;
    IF n = 1 THEN
      SELECT e.id, e.linkedid, e.extension, e.employee_id
        INTO rid, r_linked, r_ext, r_emp
        FROM public.call_ring_events e
       WHERE e.linkedid IS NOT DISTINCT FROM s.recording_uniqueid;
      method := 'linkedid';
    ELSIF s.extension IS NOT NULL AND s.started_at IS NOT NULL THEN
      SELECT COUNT(*) INTO n
        FROM public.call_ring_events e
       WHERE e.extension IS NOT DISTINCT FROM s.extension
         AND e.event_at BETWEEN s.started_at - interval '30 seconds'
                           AND s.started_at + interval '30 seconds';
      IF n = 1 THEN
        SELECT e.id, e.linkedid, e.extension, e.employee_id
          INTO rid, r_linked, r_ext, r_emp
          FROM public.call_ring_events e
         WHERE e.extension IS NOT DISTINCT FROM s.extension
           AND e.event_at BETWEEN s.started_at - interval '30 seconds'
                             AND s.started_at + interval '30 seconds';
        method := 'time_extension';
      ELSE
        rid := NULL;
        method := NULL;
      END IF;
    END IF;
  END IF;

  IF method IS NOT NULL AND rid IS NOT NULL THEN
    UPDATE public.call_transcript_sessions
       SET ring_event_id = COALESCE(ring_event_id, rid),
           linkedid = COALESCE(linkedid, r_linked),
           extension = COALESCE(extension, r_ext),
           employee_id = COALESCE(employee_id, r_emp),
           link_method = COALESCE(link_method, method),
           updated_at = now()
     WHERE id = p_session_id;
  END IF;

  UPDATE public.call_transcript_sessions sess
     SET employee_id = ext.employee_id,
         updated_at = now()
    FROM public.call_log_extensions ext
   WHERE sess.id = p_session_id
     AND sess.employee_id IS NULL
     AND sess.extension IS NOT NULL
     AND ext.extension = sess.extension
     AND ext.employee_id IS NOT NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.link_pending_transcript_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  rec public.call_transcript_sessions%ROWTYPE;
  n int;
  matched_id uuid;
  matched_linked text;
  matched_emp uuid;
  method text;
  updated int := 0;
BEGIN
  FOR rec IN
    SELECT * FROM public.call_transcript_sessions WHERE call_log_id IS NULL
  LOOP
    method := NULL;
    matched_id := NULL;

    SELECT COUNT(*) INTO n
      FROM public.call_logs cl
     WHERE cl.metadata ? 'recording_files'
       AND rec.recording_filename IN (
         SELECT jsonb_array_elements_text(cl.metadata->'recording_files')
       );
    IF n = 1 THEN
      SELECT cl.id, cl.external_id, cl.employee_id
        INTO matched_id, matched_linked, matched_emp
        FROM public.call_logs cl
       WHERE cl.metadata ? 'recording_files'
         AND rec.recording_filename IN (
           SELECT jsonb_array_elements_text(cl.metadata->'recording_files')
         );
      method := 'recording_file';
    ELSE
      SELECT COUNT(*) INTO n
        FROM public.call_logs cl
       WHERE cl.metadata ? 'leg_uniqueids'
         AND rec.recording_uniqueid IN (
           SELECT jsonb_array_elements_text(cl.metadata->'leg_uniqueids')
         );
      IF n = 1 THEN
        SELECT cl.id, cl.external_id, cl.employee_id
          INTO matched_id, matched_linked, matched_emp
          FROM public.call_logs cl
         WHERE cl.metadata ? 'leg_uniqueids'
           AND rec.recording_uniqueid IN (
             SELECT jsonb_array_elements_text(cl.metadata->'leg_uniqueids')
           );
        method := 'leg_uniqueid';
      ELSE
        SELECT COUNT(*) INTO n
          FROM public.call_logs cl
         WHERE cl.external_id IS NOT DISTINCT FROM rec.recording_uniqueid;
        IF n = 1 THEN
          SELECT cl.id, cl.external_id, cl.employee_id
            INTO matched_id, matched_linked, matched_emp
            FROM public.call_logs cl
           WHERE cl.external_id IS NOT DISTINCT FROM rec.recording_uniqueid;
          method := 'linkedid';
        ELSIF rec.extension IS NOT NULL AND rec.started_at IS NOT NULL THEN
          SELECT COUNT(*) INTO n
            FROM public.call_logs cl
           WHERE cl.extension IS NOT DISTINCT FROM rec.extension
             AND cl.started_at BETWEEN rec.started_at - interval '60 seconds'
                                   AND rec.started_at + interval '60 seconds';
          IF n = 1 THEN
            SELECT cl.id, cl.external_id, cl.employee_id
              INTO matched_id, matched_linked, matched_emp
              FROM public.call_logs cl
             WHERE cl.extension IS NOT DISTINCT FROM rec.extension
               AND cl.started_at BETWEEN rec.started_at - interval '60 seconds'
                                     AND rec.started_at + interval '60 seconds';
            method := 'time_extension';
          ELSE
            matched_id := NULL;
            method := NULL;
          END IF;
        ELSE
          matched_id := NULL;
          method := NULL;
        END IF;
      END IF;
    END IF;

    IF method IS NOT NULL AND matched_id IS NOT NULL THEN
      UPDATE public.call_transcript_sessions
         SET call_log_id = matched_id,
             linkedid = COALESCE(linkedid, matched_linked),
             employee_id = COALESCE(employee_id, matched_emp),
             link_method = method,
             status = CASE
               WHEN status = 'final' THEN 'final'
               ELSE 'pending_final'
             END,
             updated_at = now()
       WHERE id = rec.id;
      updated := updated + 1;
    END IF;
  END LOOP;
  RETURN updated;
END
$fn$;

ALTER FUNCTION public.link_transcript_session_live(uuid) OWNER TO supabase_admin;
ALTER FUNCTION public.link_pending_transcript_sessions() OWNER TO supabase_admin;

REVOKE ALL ON FUNCTION public.link_transcript_session_live(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_transcript_session_live(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.link_transcript_session_live(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.link_pending_transcript_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_pending_transcript_sessions() FROM anon;
REVOKE ALL ON FUNCTION public.link_pending_transcript_sessions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_transcript_session_live(uuid) TO supabase_admin;
GRANT EXECUTE ON FUNCTION public.link_pending_transcript_sessions() TO supabase_admin;

DO $gr$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.link_transcript_session_live(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.link_pending_transcript_sessions() TO service_role;
  END IF;
END
$gr$;
