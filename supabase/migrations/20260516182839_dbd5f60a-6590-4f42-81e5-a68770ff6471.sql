-- BOT-MATCHING-SCHEMA: schema for matching market products to AfraKala products
-- This phase only creates schema + base RPCs. No scraper, no Bot API change,
-- no enforcement, no real matching, no UI.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.market_match_source AS ENUM ('torob','purchista','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.market_match_status AS ENUM ('pending','needs_review','approved','rejected','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.market_match_actor AS ENUM ('system','human','imported','bot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Main table
-- COMMENT: production bot may ONLY use rows where match_status='approved'.
-- Fuzzy name matching alone is NOT sufficient to set status='approved'.
-- pending/needs_review rows must NEVER trigger an observatory upsert.
CREATE TABLE IF NOT EXISTS public.market_product_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name public.market_match_source NOT NULL,
  source_product_url text NULL,
  source_product_id text NULL,
  source_title text NOT NULL,
  normalized_source_title text NULL,
  afrakala_product_id uuid NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  afrakala_product_name_snapshot text NULL,
  match_status public.market_match_status NOT NULL DEFAULT 'pending',
  confidence_score numeric(5,2) NULL,
  matched_by public.market_match_actor NOT NULL DEFAULT 'system',
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  reject_reason text NULL,
  notes text NULL,
  last_seen_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mpm_source_ref_present
    CHECK (source_product_url IS NOT NULL OR source_product_id IS NOT NULL),
  CONSTRAINT mpm_confidence_range
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  CONSTRAINT mpm_approved_requires_afrakala
    CHECK (match_status <> 'approved' OR afrakala_product_id IS NOT NULL)
);

COMMENT ON TABLE public.market_product_matches IS
  'Mapping of market source products (Torob/Purchista/...) to AfraKala internal products. Production bot MAY ONLY consume rows where match_status=approved. Fuzzy title matching alone MUST NOT auto-approve.';
COMMENT ON COLUMN public.market_product_matches.match_status IS
  'Only "approved" allows downstream observatory upsert. pending/needs_review/rejected/disabled are excluded.';
COMMENT ON COLUMN public.market_product_matches.afrakala_product_id IS
  'FK to products(id). ON DELETE RESTRICT to prevent silent loss of audit trail.';
COMMENT ON COLUMN public.market_product_matches.confidence_score IS
  '0..100 heuristic score. Not authoritative; human review required for approval.';

-- Unique constraints (partial)
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpm_source_url
  ON public.market_product_matches (source_name, source_product_url)
  WHERE source_product_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpm_source_id
  ON public.market_product_matches (source_name, source_product_id)
  WHERE source_product_id IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mpm_source_status
  ON public.market_product_matches (source_name, match_status);
CREATE INDEX IF NOT EXISTS idx_mpm_afrakala_product
  ON public.market_product_matches (afrakala_product_id);
CREATE INDEX IF NOT EXISTS idx_mpm_last_seen
  ON public.market_product_matches (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_mpm_normalized_title_trgm
  ON public.market_product_matches USING gin (normalized_source_title gin_trgm_ops)
  WHERE normalized_source_title IS NOT NULL;

-- 6. Event log
CREATE TABLE IF NOT EXISTS public.market_product_match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.market_product_matches(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_status public.market_match_status NULL,
  new_status public.market_match_status NULL,
  actor public.market_match_actor NOT NULL DEFAULT 'system',
  actor_user_id uuid NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.market_product_match_events IS
  'Audit log of market_product_matches lifecycle. Do not write secrets or PII into details.';

CREATE INDEX IF NOT EXISTS idx_mpme_match ON public.market_product_match_events (match_id);
CREATE INDEX IF NOT EXISTS idx_mpme_type ON public.market_product_match_events (event_type);
CREATE INDEX IF NOT EXISTS idx_mpme_created ON public.market_product_match_events (created_at);

-- 7. updated_at trigger (reuse existing helper)
DROP TRIGGER IF EXISTS trg_mpm_updated_at ON public.market_product_matches;
CREATE TRIGGER trg_mpm_updated_at
  BEFORE UPDATE ON public.market_product_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. status change / created event log trigger
CREATE OR REPLACE FUNCTION public.log_market_product_match_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.market_product_match_events
      (match_id, event_type, old_status, new_status, actor, details)
    VALUES
      (NEW.id, 'created', NULL, NEW.match_status, NEW.matched_by,
       jsonb_build_object('source_name', NEW.source_name));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.match_status IS DISTINCT FROM OLD.match_status THEN
      INSERT INTO public.market_product_match_events
        (match_id, event_type, old_status, new_status, actor, actor_user_id, details)
      VALUES
        (NEW.id, 'status_changed', OLD.match_status, NEW.match_status,
         COALESCE(NEW.matched_by,'system'::public.market_match_actor),
         NEW.reviewed_by, '{}'::jsonb);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mpm_event_log ON public.market_product_matches;
CREATE TRIGGER trg_mpm_event_log
  AFTER INSERT OR UPDATE ON public.market_product_matches
  FOR EACH ROW EXECUTE FUNCTION public.log_market_product_match_event();

-- 9. RPC: resolve_market_product_match (READ-ONLY, approved only)
CREATE OR REPLACE FUNCTION public.resolve_market_product_match(
  p_source_name public.market_match_source,
  p_source_product_url text DEFAULT NULL,
  p_source_product_id text DEFAULT NULL
) RETURNS TABLE (
  match_id uuid,
  afrakala_product_id uuid,
  match_status public.market_match_status,
  confidence_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source_product_id IS NOT NULL THEN
    RETURN QUERY
      SELECT m.id, m.afrakala_product_id, m.match_status, m.confidence_score
      FROM public.market_product_matches m
      WHERE m.source_name = p_source_name
        AND m.source_product_id = p_source_product_id
        AND m.match_status = 'approved'
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_source_product_url IS NOT NULL THEN
    RETURN QUERY
      SELECT m.id, m.afrakala_product_id, m.match_status, m.confidence_score
      FROM public.market_product_matches m
      WHERE m.source_name = p_source_name
        AND m.source_product_url = p_source_product_url
        AND m.match_status = 'approved'
      LIMIT 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.resolve_market_product_match(public.market_match_source, text, text) IS
  'Returns ONLY approved matches for a given source identifier. Never creates or updates rows. Intended for production bot consumption gate.';

REVOKE ALL ON FUNCTION public.resolve_market_product_match(public.market_match_source, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_market_product_match(public.market_match_source, text, text) TO service_role;

-- 10. RPC: upsert_market_product_match_candidate (writes to review queue only)
CREATE OR REPLACE FUNCTION public.upsert_market_product_match_candidate(
  p_source_name public.market_match_source,
  p_source_product_url text,
  p_source_product_id text,
  p_source_title text,
  p_normalized_source_title text DEFAULT NULL,
  p_confidence_score numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS TABLE (
  match_id uuid,
  match_status public.market_match_status,
  created_or_updated text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.market_product_matches%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_source_product_url IS NULL AND p_source_product_id IS NULL THEN
    RAISE EXCEPTION 'source_product_url or source_product_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_source_title IS NULL OR length(btrim(p_source_title)) = 0 THEN
    RAISE EXCEPTION 'source_title is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_confidence_score IS NOT NULL
     AND (p_confidence_score < 0 OR p_confidence_score > 100) THEN
    RAISE EXCEPTION 'confidence_score must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lookup by source_product_id first, then by URL
  IF p_source_product_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.market_product_matches
    WHERE source_name = p_source_name
      AND source_product_id = p_source_product_id
    LIMIT 1;
  END IF;
  IF v_existing.id IS NULL AND p_source_product_url IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.market_product_matches
    WHERE source_name = p_source_name
      AND source_product_url = p_source_product_url
    LIMIT 1;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.market_product_matches
       SET source_title = p_source_title,
           normalized_source_title = COALESCE(p_normalized_source_title, normalized_source_title),
           confidence_score = COALESCE(p_confidence_score, confidence_score),
           notes = COALESCE(p_notes, notes),
           last_seen_at = now()
     WHERE id = v_existing.id
     RETURNING id, market_product_matches.match_status INTO v_id, match_status;
    created_or_updated := 'updated';
    match_id := v_id;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Insert new candidate with safe status. NEVER 'approved'.
  INSERT INTO public.market_product_matches (
    source_name, source_product_url, source_product_id,
    source_title, normalized_source_title,
    confidence_score, notes, last_seen_at,
    match_status, matched_by
  ) VALUES (
    p_source_name, p_source_product_url, p_source_product_id,
    p_source_title, p_normalized_source_title,
    p_confidence_score, p_notes, now(),
    'pending'::public.market_match_status,
    'bot'::public.market_match_actor
  )
  RETURNING id, market_product_matches.match_status INTO v_id, match_status;

  created_or_updated := 'created';
  match_id := v_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.upsert_market_product_match_candidate(
  public.market_match_source, text, text, text, text, numeric, text) IS
  'Inserts/updates a source product into the review queue. NEVER sets status=approved. NEVER auto-links afrakala_product_id. Used by bot ingestion only.';

REVOKE ALL ON FUNCTION public.upsert_market_product_match_candidate(
  public.market_match_source, text, text, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_market_product_match_candidate(
  public.market_match_source, text, text, text, text, numeric, text) TO service_role;

-- 11. RLS — enable, deny by default. Reviewer UI policies will be added in a later phase.
ALTER TABLE public.market_product_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_product_match_events ENABLE ROW LEVEL SECURITY;

-- No permissive policies for anon/authenticated yet. service_role bypasses RLS.
-- A future BOT-MATCHING-UI phase will add admin/reviewer policies via has_role().