-- =========================================================
-- Phase: Amin Hozoor Board — Access Control + Online Presence
-- =========================================================

-- 1) Access requests table
CREATE TABLE IF NOT EXISTS public.pricing_board_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_key text NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pba_status_check CHECK (status IN ('pending','approved','rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS pba_unique_user_board
  ON public.pricing_board_access_requests(board_key, user_id);
CREATE INDEX IF NOT EXISTS pba_status_idx ON public.pricing_board_access_requests(status);
CREATE INDEX IF NOT EXISTS pba_requested_at_idx ON public.pricing_board_access_requests(requested_at DESC);

ALTER TABLE public.pricing_board_access_requests ENABLE ROW LEVEL SECURITY;

-- Helper function: is current user a board manager?
CREATE OR REPLACE FUNCTION public.is_board_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','accountant')
  );
$$;

-- Helper: is user an approved board viewer? (manager auto-approved)
CREATE OR REPLACE FUNCTION public.is_board_approved(_user_id uuid, _board_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_board_manager(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.pricing_board_access_requests
      WHERE user_id = _user_id
        AND board_key = _board_key
        AND status = 'approved'
    );
$$;

-- RLS: insert own request only
CREATE POLICY pba_insert_own ON public.pricing_board_access_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Select: own row OR managers
CREATE POLICY pba_select_own_or_mgr ON public.pricing_board_access_requests
  FOR SELECT USING (auth.uid() = user_id OR public.is_board_manager(auth.uid()));
-- Update: only managers (status / review_note / reviewer)
CREATE POLICY pba_update_managers ON public.pricing_board_access_requests
  FOR UPDATE USING (public.is_board_manager(auth.uid()))
  WITH CHECK (public.is_board_manager(auth.uid()));

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS pba_touch_updated_at ON public.pricing_board_access_requests;
CREATE TRIGGER pba_touch_updated_at
  BEFORE UPDATE ON public.pricing_board_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 2) Viewer sessions table
CREATE TABLE IF NOT EXISTS public.pricing_board_viewer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_key text NOT NULL,
  user_id uuid NOT NULL,
  sale_price_type_id uuid,
  entered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One active session per (board_key, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS pbvs_unique_active
  ON public.pricing_board_viewer_sessions(board_key, user_id)
  WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS pbvs_last_seen_idx
  ON public.pricing_board_viewer_sessions(board_key, last_seen_at DESC);

ALTER TABLE public.pricing_board_viewer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pbvs_insert_own ON public.pricing_board_viewer_sessions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_board_approved(auth.uid(), board_key)
  );
CREATE POLICY pbvs_update_own ON public.pricing_board_viewer_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY pbvs_select_own_or_mgr ON public.pricing_board_viewer_sessions
  FOR SELECT USING (auth.uid() = user_id OR public.is_board_manager(auth.uid()));


-- 3) notification_events (future-ready, internal only)
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid,
  channel text NOT NULL DEFAULT 'internal',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ne_event_type_idx ON public.notification_events(event_type);
CREATE INDEX IF NOT EXISTS ne_status_idx ON public.notification_events(status);
CREATE INDEX IF NOT EXISTS ne_created_at_idx ON public.notification_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ne_user_id_idx ON public.notification_events(user_id);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

-- Insert: any authenticated user can insert events (for own actions); managers can insert any
CREATE POLICY ne_insert_auth ON public.notification_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
-- Select: own events OR managers see all
CREATE POLICY ne_select_own_or_mgr ON public.notification_events
  FOR SELECT USING (auth.uid() = user_id OR public.is_board_manager(auth.uid()));
-- Update: only managers (mark processed)
CREATE POLICY ne_update_mgr ON public.notification_events
  FOR UPDATE USING (public.is_board_manager(auth.uid()))
  WITH CHECK (public.is_board_manager(auth.uid()));


-- 4) Tighten pricing_board_settings RLS (in case missing/loose)
ALTER TABLE public.pricing_board_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pbs_update_managers ON public.pricing_board_settings;
DROP POLICY IF EXISTS pbs_insert_managers ON public.pricing_board_settings;
DROP POLICY IF EXISTS pbs_select_auth ON public.pricing_board_settings;
CREATE POLICY pbs_select_auth ON public.pricing_board_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pbs_insert_managers ON public.pricing_board_settings
  FOR INSERT WITH CHECK (public.is_board_manager(auth.uid()));
CREATE POLICY pbs_update_managers ON public.pricing_board_settings
  FOR UPDATE USING (public.is_board_manager(auth.uid()))
  WITH CHECK (public.is_board_manager(auth.uid()));
