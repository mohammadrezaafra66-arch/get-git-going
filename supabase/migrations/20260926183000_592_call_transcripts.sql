SET client_encoding='UTF8';

-- ============================================================================
-- 592 — call transcript sessions + segments (Phase A STT)
-- Additive only. No DROP/REPLACE of existing objects used by other features.
-- ============================================================================

SET lock_timeout = '60s';

CREATE TABLE public.call_transcript_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_filename text NOT NULL,
  recording_uniqueid text NOT NULL,
  uniqueid text NOT NULL,
  linkedid text,
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  ring_event_id uuid REFERENCES public.call_ring_events(id) ON DELETE SET NULL,
  extension text,
  employee_id uuid,
  direction text,
  prefix text,
  queue text,
  status text NOT NULL DEFAULT 'live',
  link_method text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_transcript_sessions_filename_key UNIQUE (recording_filename),
  CONSTRAINT call_transcript_sessions_status_chk
    CHECK (status IN ('live', 'pending_final', 'final', 'unlinked')),
  CONSTRAINT call_transcript_sessions_direction_chk
    CHECK (direction IS NULL OR direction IN ('inbound', 'outbound')),
  CONSTRAINT call_transcript_sessions_link_method_chk
    CHECK (
      link_method IS NULL
      OR link_method IN (
        'uniqueid',
        'linkedid',
        'recording_file',
        'leg_uniqueid',
        'time_extension'
      )
    )
);

CREATE INDEX idx_call_transcript_sessions_employee_created
  ON public.call_transcript_sessions (employee_id, created_at DESC);
CREATE INDEX idx_call_transcript_sessions_linkedid
  ON public.call_transcript_sessions (linkedid)
  WHERE linkedid IS NOT NULL;
CREATE INDEX idx_call_transcript_sessions_recording_uniqueid
  ON public.call_transcript_sessions (recording_uniqueid);
CREATE INDEX idx_call_transcript_sessions_call_log
  ON public.call_transcript_sessions (call_log_id)
  WHERE call_log_id IS NOT NULL;
CREATE INDEX idx_call_transcript_sessions_unlinked
  ON public.call_transcript_sessions (status)
  WHERE call_log_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_call_ring_events_uniqueid
  ON public.call_ring_events (uniqueid)
  WHERE uniqueid IS NOT NULL;

CREATE TABLE public.call_transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.call_transcript_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  segment_seq integer NOT NULL,
  text text NOT NULL,
  start_ms integer,
  end_ms integer,
  engine text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_transcript_segments_kind_chk
    CHECK (kind IN ('partial', 'committed', 'final')),
  CONSTRAINT call_transcript_segments_seq_kind_key
    UNIQUE (session_id, segment_seq, kind)
);

CREATE INDEX idx_call_transcript_segments_session_seq
  ON public.call_transcript_segments (session_id, segment_seq);

-- RLS: own employee + admin + manager. accountant is NOT in the bypass.
ALTER TABLE public.call_transcript_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transcript_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.call_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transcript_segments FORCE ROW LEVEL SECURITY;

CREATE POLICY call_transcript_sessions_select_own_admin_manager
  ON public.call_transcript_sessions
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::text)
    OR public.has_role((SELECT auth.uid()), 'manager'::text)
  );

CREATE POLICY call_transcript_segments_select_own_admin_manager
  ON public.call_transcript_segments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.call_transcript_sessions s
       WHERE s.id = call_transcript_segments.session_id
         AND (
           s.employee_id = (SELECT auth.uid())
           OR public.has_role((SELECT auth.uid()), 'admin'::text)
           OR public.has_role((SELECT auth.uid()), 'manager'::text)
         )
    )
  );

REVOKE ALL ON TABLE public.call_transcript_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.call_transcript_sessions FROM anon;
REVOKE ALL ON TABLE public.call_transcript_segments FROM PUBLIC;
REVOKE ALL ON TABLE public.call_transcript_segments FROM anon;
GRANT SELECT ON TABLE public.call_transcript_sessions TO authenticated;
GRANT SELECT ON TABLE public.call_transcript_segments TO authenticated;
GRANT ALL ON TABLE public.call_transcript_sessions TO supabase_admin;
GRANT ALL ON TABLE public.call_transcript_segments TO supabase_admin;

-- Live ring match: uniqueid, then linkedid=recording_uniqueid, then
-- extension + event_at within ±30s of started_at iff exactly one row.
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

  SELECT COUNT(*), MIN(e.id), MIN(e.linkedid), MIN(e.extension), MIN(e.employee_id)
    INTO n, rid, r_linked, r_ext, r_emp
    FROM public.call_ring_events e
   WHERE e.uniqueid IS NOT DISTINCT FROM s.recording_uniqueid;
  IF n = 1 THEN
    method := 'uniqueid';
  ELSE
    SELECT COUNT(*), MIN(e.id), MIN(e.linkedid), MIN(e.extension), MIN(e.employee_id)
      INTO n, rid, r_linked, r_ext, r_emp
      FROM public.call_ring_events e
     WHERE e.linkedid IS NOT DISTINCT FROM s.recording_uniqueid;
    IF n = 1 THEN
      method := 'linkedid';
    ELSIF s.extension IS NOT NULL AND s.started_at IS NOT NULL THEN
      SELECT COUNT(*), MIN(e.id), MIN(e.linkedid), MIN(e.extension), MIN(e.employee_id)
        INTO n, rid, r_linked, r_ext, r_emp
        FROM public.call_ring_events e
       WHERE e.extension IS NOT DISTINCT FROM s.extension
         AND e.event_at BETWEEN s.started_at - interval '30 seconds'
                           AND s.started_at + interval '30 seconds';
      IF n = 1 THEN
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

-- Late CDR match. Step 4 window is ±60s and only when exactly one candidate.
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

    SELECT COUNT(*), MIN(cl.id), MIN(cl.external_id), MIN(cl.employee_id)
      INTO n, matched_id, matched_linked, matched_emp
      FROM public.call_logs cl
     WHERE cl.metadata ? 'recording_files'
       AND rec.recording_filename IN (
         SELECT jsonb_array_elements_text(cl.metadata->'recording_files')
       );
    IF n = 1 THEN
      method := 'recording_file';
    ELSE
      SELECT COUNT(*), MIN(cl.id), MIN(cl.external_id), MIN(cl.employee_id)
        INTO n, matched_id, matched_linked, matched_emp
        FROM public.call_logs cl
       WHERE cl.metadata ? 'leg_uniqueids'
         AND rec.recording_uniqueid IN (
           SELECT jsonb_array_elements_text(cl.metadata->'leg_uniqueids')
         );
      IF n = 1 THEN
        method := 'leg_uniqueid';
      ELSE
        SELECT COUNT(*), MIN(cl.id), MIN(cl.external_id), MIN(cl.employee_id)
          INTO n, matched_id, matched_linked, matched_emp
          FROM public.call_logs cl
         WHERE cl.external_id IS NOT DISTINCT FROM rec.recording_uniqueid;
        IF n = 1 THEN
          method := 'linkedid';
        ELSIF rec.extension IS NOT NULL AND rec.started_at IS NOT NULL THEN
          SELECT COUNT(*), MIN(cl.id), MIN(cl.external_id), MIN(cl.employee_id)
            INTO n, matched_id, matched_linked, matched_emp
            FROM public.call_logs cl
           WHERE cl.extension IS NOT DISTINCT FROM rec.extension
             AND cl.started_at BETWEEN rec.started_at - interval '60 seconds'
                                   AND rec.started_at + interval '60 seconds';
          IF n = 1 THEN
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
    GRANT ALL ON TABLE public.call_transcript_sessions TO service_role;
    GRANT ALL ON TABLE public.call_transcript_segments TO service_role;
    GRANT EXECUTE ON FUNCTION public.link_transcript_session_live(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.link_pending_transcript_sessions() TO service_role;
  END IF;
END
$gr$;

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'call-transcripts',
       r.role_name IN ('admin', 'manager', 'sales', 'accountant'),
       false, false, false, false, false, false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'call-transcripts'
 );

DO $assert$
DECLARE
  _anon_sel boolean;
  _anon_exec boolean;
  _auth_exec boolean;
  _viewer_view boolean;
  _acct_view boolean;
BEGIN
  SELECT has_table_privilege('anon', 'public.call_transcript_sessions', 'SELECT')
    INTO _anon_sel;
  IF _anon_sel THEN
    RAISE EXCEPTION '592: anon must not SELECT call_transcript_sessions';
  END IF;
  SELECT has_table_privilege('anon', 'public.call_transcript_segments', 'SELECT')
    INTO _anon_sel;
  IF _anon_sel THEN
    RAISE EXCEPTION '592: anon must not SELECT call_transcript_segments';
  END IF;
  SELECT has_function_privilege('anon', 'public.link_pending_transcript_sessions()', 'EXECUTE')
    INTO _anon_exec;
  IF _anon_exec THEN
    RAISE EXCEPTION '592: anon must not EXECUTE link_pending_transcript_sessions';
  END IF;
  SELECT has_function_privilege('authenticated', 'public.link_pending_transcript_sessions()', 'EXECUTE')
    INTO _auth_exec;
  IF _auth_exec THEN
    RAISE EXCEPTION '592: authenticated must not EXECUTE link_pending_transcript_sessions';
  END IF;
  SELECT COALESCE(bool_or(can_view), false) INTO _viewer_view
    FROM public.role_permissions
   WHERE module = 'call-transcripts' AND role_name = 'viewer';
  IF _viewer_view THEN
    RAISE EXCEPTION '592: viewer must have can_view=false on call-transcripts';
  END IF;
  SELECT COALESCE(bool_or(can_view), false) INTO _acct_view
    FROM public.role_permissions
   WHERE module = 'call-transcripts' AND role_name = 'accountant';
  IF NOT _acct_view THEN
    RAISE EXCEPTION '592: accountant must have can_view=true on call-transcripts';
  END IF;
END
$assert$;
