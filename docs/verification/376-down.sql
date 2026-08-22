-- 376-down.sql — reverse migration 376 (explicit anon grant for the registration form).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7).
--
-- WHAT 376 DID. `GRANT SELECT ON public.profile_field_definitions TO anon`, naming
-- `src/routes/register.tsx` as the consumer. Like migration 374, this was a no-op in the catalogue
-- on the day it ran — anon already held `arwdDxt` on that table through the schema default that 373
-- closed. Its purpose is the record, not the privilege.
--
-- WHY IT EXISTS SEPARATELY FROM 374. 374 was written from a route-file classification that missed
-- this surface: `register.tsx` constructs the browser client only for `auth.*`, and the table read
-- happens one import away, in `src/lib/profile-fields/queries.ts`. A transitive walk of every
-- non-`_app` route found it afterwards. 374 was already applied and committed, and this repository
-- does not edit an applied migration (AGENTS.md rule 6), so the missing grant ships here.
--
-- THE SAME ASYMMETRY AS 374-down APPLIES. Running this file revokes SELECT from anon, which narrows
-- the table BELOW its pre-mission state and would break the registration form for a logged-out
-- visitor. Pre-mission state, read from the live catalogue 2026-08-22:
--
--   profile_field_definitions  anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   anon sees 4 of 5 rows, via the deliberate policy
--   "Public can read register form fields" -> (is_active = true AND show_on_register = true)
--
-- To roll this mission back, run 373-down and leave this file alone.

SET client_encoding = 'UTF8';

REVOKE SELECT ON TABLE public.profile_field_definitions FROM anon;
