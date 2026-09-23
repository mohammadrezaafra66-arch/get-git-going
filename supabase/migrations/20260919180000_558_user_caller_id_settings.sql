SET client_encoding='UTF8';
SET lock_timeout = '60s';

-- ============================================================================
-- user_caller_id_settings — per-user Caller ID popup preferences
-- + widen call_ring_events SELECT so inbound (and filtered outbound) can
--   reach every authenticated user who enabled the feature in the app.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_caller_id_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  show_inbound boolean NOT NULL DEFAULT true,
  show_outbound boolean NOT NULL DEFAULT true,
  show_others_outbound boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_caller_id_settings IS
  'Per-user Caller ID popup preferences (enable, inbound/outbound filters). '
  'No row means app defaults: enabled, inbound+outbound on, others outbound off.';

ALTER TABLE public.user_caller_id_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_caller_id_settings_select_own ON public.user_caller_id_settings;
CREATE POLICY user_caller_id_settings_select_own ON public.user_caller_id_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_caller_id_settings_insert_own ON public.user_caller_id_settings;
CREATE POLICY user_caller_id_settings_insert_own ON public.user_caller_id_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_caller_id_settings_update_own ON public.user_caller_id_settings;
CREATE POLICY user_caller_id_settings_update_own ON public.user_caller_id_settings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.user_caller_id_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.user_caller_id_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_caller_id_settings TO authenticated;
GRANT ALL ON TABLE public.user_caller_id_settings TO service_role;

-- Live rings: every authenticated user may read (client filters by preferences).
-- Writes remain service_role-only (no authenticated write policies).
DROP POLICY IF EXISTS call_ring_events_select_authenticated ON public.call_ring_events;
CREATE POLICY call_ring_events_select_authenticated ON public.call_ring_events
  FOR SELECT TO authenticated
  USING (true);

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_caller_id_settings'
  ) THEN
    RAISE EXCEPTION 'user_caller_id_settings missing';
  END IF;
END
$do$;
