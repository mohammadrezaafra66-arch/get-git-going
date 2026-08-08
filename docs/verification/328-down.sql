SET client_encoding='UTF8';

-- Down-script for migration 328 (person FK registry gate).
--
-- 328 added four functions and one event trigger. It changed no data and no existing
-- object, so reverting is a plain drop.
--
-- ⚠️ THINK BEFORE RUNNING THIS. The gate exists because the same mistake shipped three
-- times (migrations 271, 287 and 319), each time silently disabling person merging for
-- the whole system until someone noticed. Removing it restores that exposure.
--
-- The legitimate reason to run this is that the gate itself is wrong -- for example
-- person_merge's `_registry` literal was reshaped and person_merge_registry_keys() can no
-- longer parse it. In that case the correct fix is usually to UPDATE the extractor, not
-- to delete the gate. Note the extractor is deliberately fail-loud: if it cannot find the
-- registry block it raises rather than returning zero keys, because a gate that quietly
-- passes is worse than no gate.
--
-- If you need to bypass it for exactly one statement (rare, and you should be sure):
--     ALTER EVENT TRIGGER trg_person_fk_registry_gate DISABLE;
--     ... your DDL ...
--     ALTER EVENT TRIGGER trg_person_fk_registry_gate ENABLE;
--     SELECT public.assert_person_fk_registry();   -- and prove you left it balanced

DROP EVENT TRIGGER IF EXISTS trg_person_fk_registry_gate;
DROP FUNCTION IF EXISTS public.tg_person_fk_registry_gate();
DROP FUNCTION IF EXISTS public.assert_person_fk_registry();
DROP FUNCTION IF EXISTS public.person_fk_registry_report();
DROP FUNCTION IF EXISTS public.person_merge_registry_keys();
