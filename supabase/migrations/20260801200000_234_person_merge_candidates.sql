SET client_encoding='UTF8';

-- =============================================================================
-- 234 — Phase 6.8: person merge-candidates queue
-- =============================================================================
--
-- WHY
--   Migration 233 refused to auto-merge identities during the backfill. That was
--   the right call — merging two persons because they share a phone number is
--   irreversible and phone numbers get reassigned, shared between a company and
--   its owner, and mistyped. But refusing to merge is only half an answer: the
--   suspected duplicates have to be visible to a human, or they are simply lost.
--
--   This table is that queue. It records suspicion, never acts on it.
--
-- SCOPE
--   Schema + data only. A merge UI and a merge RPC are deliberately out of
--   scope; nothing here mutates persons. `status` exists so a reviewer can mark
--   a pair resolved once that UI is built.
--
-- WHY THE PAIRS ARE DERIVED, NOT HAND-FED
--   Populating from a hard-coded pair would go stale the moment another
--   duplicate appears. The seed below queries person_identifiers for any
--   normalized value held by more than one person, so it finds today's known
--   case (+989122270261 — «محمدرضا افرا» vs «تست دستی من», created by the 233
--   backfill) and anything else already present, without naming either.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.person_merge_candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id_a  uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  person_id_b  uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  detail       text,
  status       text NOT NULL DEFAULT 'pending',
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT person_merge_candidates_status_check
    CHECK (status = ANY (ARRAY['pending', 'merged', 'rejected', 'not_duplicate'])),
  -- Canonical ordering: a < b. Without this the same pair could be stored twice
  -- (a,b) and (b,a) and the unique index below would not catch it.
  CONSTRAINT person_merge_candidates_ordered_pair CHECK (person_id_a < person_id_b),
  CONSTRAINT person_merge_candidates_distinct CHECK (person_id_a <> person_id_b)
);

COMMENT ON TABLE public.person_merge_candidates IS
  'Phase 6.8 (234). Suspected duplicate person pairs awaiting human review. Nothing in this table mutates persons - it records suspicion only. Pairs are stored with person_id_a < person_id_b so a pair cannot be recorded twice in opposite order.';
COMMENT ON COLUMN public.person_merge_candidates.reason IS
  'Machine-readable rule that flagged the pair, e.g. shared_identifier.';
COMMENT ON COLUMN public.person_merge_candidates.detail IS
  'Human-readable evidence, e.g. the shared normalized identifier value.';
COMMENT ON COLUMN public.person_merge_candidates.status IS
  'pending | merged | rejected | not_duplicate. Only a reviewer moves it off pending.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_merge_candidates_pair
  ON public.person_merge_candidates (person_id_a, person_id_b);
CREATE INDEX IF NOT EXISTS person_merge_candidates_status_idx
  ON public.person_merge_candidates (status) WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_person_merge_candidates_updated_at ON public.person_merge_candidates;
CREATE TRIGGER trg_person_merge_candidates_updated_at
  BEFORE UPDATE ON public.person_merge_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- -----------------------------------------------------------------------------
-- RLS — this exposes the fact that two identity records may be the same person,
-- so it is not world-readable. Mirrors the person_aliases policy shape.
-- -----------------------------------------------------------------------------
ALTER TABLE public.person_merge_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_merge_candidates_select_privileged ON public.person_merge_candidates;
CREATE POLICY person_merge_candidates_select_privileged
  ON public.person_merge_candidates FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']));

DROP POLICY IF EXISTS person_merge_candidates_insert_privileged ON public.person_merge_candidates;
CREATE POLICY person_merge_candidates_insert_privileged
  ON public.person_merge_candidates FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']));

DROP POLICY IF EXISTS person_merge_candidates_update_privileged ON public.person_merge_candidates;
CREATE POLICY person_merge_candidates_update_privileged
  ON public.person_merge_candidates FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']));

-- No DELETE policy on purpose: a reviewed pair is an audit record. Resolve it by
-- setting status, do not remove the evidence that it was ever flagged.

-- -----------------------------------------------------------------------------
-- SEED — derive pairs from shared normalized identifiers.
-- Idempotent: ON CONFLICT DO NOTHING against the canonical pair index.
-- -----------------------------------------------------------------------------
INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail)
SELECT LEAST(x.person_id, y.person_id),
       GREATEST(x.person_id, y.person_id),
       'shared_identifier',
       'شناسهٔ مشترک: ' || x.kind || ' = ' || x.value_normalized
  FROM public.person_identifiers x
  JOIN public.person_identifiers y
    ON y.kind = x.kind
   AND y.value_normalized = x.value_normalized
   AND y.person_id <> x.person_id
 WHERE x.status <> 'revoked'
   AND y.status <> 'revoked'
   AND x.person_id < y.person_id
 GROUP BY LEAST(x.person_id, y.person_id), GREATEST(x.person_id, y.person_id),
          x.kind, x.value_normalized
ON CONFLICT (person_id_a, person_id_b) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Report what was queued. Not an assertion: zero candidates is a valid state.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_total   integer;
  v_pending integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status = 'pending')
    INTO v_total, v_pending
    FROM public.person_merge_candidates;
  RAISE NOTICE 'Merge candidates: % total, % pending review.', v_total, v_pending;
END
$$;

NOTIFY pgrst, 'reload schema';
