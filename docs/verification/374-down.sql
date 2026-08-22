-- 374-down.sql — reverse migration 374 (explicit, documented anon grants on the public surfaces).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7).
--
-- WHAT 374 DID. It issued `GRANT SELECT … TO anon` on the four tables that migration 373's Phase 0
-- proved a genuinely public, session-less route reads as `anon`, plus `GRANT EXECUTE` on
-- `refresh_sale_list_prices`. Every one of those privileges was ALREADY held by `anon` through the
-- schema-wide default that 373 closes, so 374 changed nothing in the catalogue on the day it ran —
-- and that is deliberate. Its purpose is to turn four grants that existed only as a schema default
-- into four grants that exist as a written decision naming their consumer, so that a future batched
-- REVOKE (the work the owner deliberately excluded from this mission) has a record of what must be
-- kept.
--
-- WHY THIS FILE IS ALMOST CERTAINLY A NO-OP TOO. Running it revokes SELECT from `anon` on those four
-- tables. But each of them still carries the wider `anon=arwdDxt` grant from before this mission —
-- 374 did not create that and this file does not remove it. In PostgreSQL a REVOKE of SELECT does
-- remove the `r` bit from the aclitem, so running this file WOULD narrow those four objects below
-- their pre-mission state.
--
--   THIS IS THE ONE WAY THIS ROLLBACK IS NOT SYMMETRIC, AND IT MATTERS.
--
-- Reversing 374 alone would break `/api/public/products` — it would leave `anon` unable to SELECT
-- `products`, which is exactly the HTTP 500 that migration 370 caused and the G-1 mission had to fix.
-- If you are rolling this mission back, run 373-down and simply DO NOT run this file: the objects
-- keep the grants they had before the mission and nothing is lost. This file exists so that every
-- migration from 350 onward has a rollback file and the ledger has no gap, not because running it
-- is usually the right move.
--
-- Pre-mission state of each object, read from the live catalogue 2026-08-22
-- (og25-anon-default-privileges-PROGRESS.md §0.4):
--
--   products          anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   brands            anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   categories        anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   sale_price_types  anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   refresh_sale_list_prices(uuid)  anon EXECUTE = true
--
-- To restore that state exactly after running this file, re-grant the removed bits:
--   GRANT SELECT ON TABLE public.products, public.brands, public.categories, public.sale_price_types TO anon;
--   GRANT EXECUTE ON FUNCTION public.refresh_sale_list_prices(uuid) TO anon;
-- which is 374 itself.
--
-- NOT LISTED HERE, ON PURPOSE. `sale_lists` and `sale_list_items` appear nowhere in 374 or in this
-- file. `anon` holds no SELECT on either today, so the public sale-list page is already broken for
-- an anonymous visitor. Granting it would be FIXING a broken public surface, which the owner
-- explicitly excluded from this mission ("record it as an Owner-Gate and hand it back"). Adding
-- them here would not restore a previous state — it would create access that never existed.

SET client_encoding = 'UTF8';

REVOKE SELECT ON TABLE public.products         FROM anon;
REVOKE SELECT ON TABLE public.brands           FROM anon;
REVOKE SELECT ON TABLE public.categories       FROM anon;
REVOKE SELECT ON TABLE public.sale_price_types FROM anon;

REVOKE EXECUTE ON FUNCTION public.refresh_sale_list_prices(uuid) FROM anon;
