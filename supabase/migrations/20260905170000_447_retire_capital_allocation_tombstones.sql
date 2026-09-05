SET client_encoding='UTF8';

-- 447 (B-1): retire the four capital-allocation tombstones.
--
-- All four bodies are nothing but a RAISE EXCEPTION redirecting the caller to
-- hold_credit / release_credit (M11). They are unreachable no-ops that remain
-- granted to anon, so they widen the API surface for no behaviour.
--
-- Zero-reference verified 2026-09-05 across all four frontend call idioms in
-- src/ and server/ (712 TS/TSX files) and across pg_proc, pg_views, pg_matviews,
-- pg_policies (qual + with_check), pg_trigger, pg_constraint, pg_attrdef and
-- pg_indexes in every schema.
--
-- No CASCADE anywhere: if anything does depend on these, the DROP errors and the
-- whole migration rolls back rather than destroying the dependent object.
--
-- Live replacements, deliberately untouched:
--   public.hold_credit(uuid,numeric,uuid,uuid)
--   public.release_credit(uuid,numeric,uuid,uuid)

DROP FUNCTION public.hold_capital_allocation(uuid, numeric, uuid, uuid);
DROP FUNCTION public.consume_capital_allocation(uuid, numeric, uuid, uuid);
DROP FUNCTION public.release_capital_allocation(uuid, numeric, uuid, uuid);
DROP FUNCTION public.refund_capital_allocation(uuid, numeric, uuid, uuid);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname IN
    ('hold_capital_allocation','consume_capital_allocation',
     'release_capital_allocation','refund_capital_allocation');
  IF n <> 0 THEN RAISE EXCEPTION '447: expected 0 tombstones remaining, found %', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname IN ('hold_credit','release_credit');
  IF n <> 2 THEN RAISE EXCEPTION '447: replacements missing, expected 2 found %', n; END IF;
END $$;
