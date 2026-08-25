-- 389 — close the SECURITY DEFINER path that still handed `anon` a product `sku`, repair
-- migration 388's gate, and reconcile migration 380's census with the privilege 388 changed.
-- Completes OG-49; creates nothing.
--
-- ============================================================================
-- MIGRATION 388 DID NOT CLOSE OG-49. THE COLUMN REVOKE WAS NOT THE ONLY DOOR.
-- ============================================================================
--
-- 388 narrowed `anon`'s SELECT on `products` to nine columns and verified every direct path —
-- `select=*`, per-column, `order=`-only, filter-only, embeds — all `42501`. An independent
-- reviewer then extracted `sku` anyway, using nothing but the published anon key. Reproduced
-- here before writing this file:
--
--   public.find_duplicate_product(uuid,uuid,text,text,text,uuid)
--     secdef=true  volatility=s  anon_EXECUTE=true  PUBLIC_EXECUTE=true
--     returns: TABLE(id uuid, name text, sku text)
--     body has an auth guard? false
--
-- **SECURITY DEFINER bypasses both layers 388 relies on** — the column grants and RLS — because
-- the function body runs as `supabase_admin`. And four of its five inputs are columns 388
-- deliberately KEEPS readable, so the attacker does not even have to guess:
--
--   step 1, as anon:  /rest/v1/products?select=brand_id,category_id,capacity
--                     -> [{"brand_id":"c1a39a59-…","category_id":"a93be3f8-…","capacity":"24000"}]
--   step 2, as anon:  /rest/v1/rpc/find_duplicate_product?p_brand_id=…&p_category_id=…&p_capacity=24000
--                     -> [{"id":"dffc51af-…","name":"کولر24هزارجنرال گلد","sku":"AFK-2026-00003"}]
--
-- The reviewer measured the blast radius at 126 of the 355 anon-visible rows with `p_color`
-- omitted, and only 11 distinct colour values exist, so the rest is recoverable in a handful of
-- guesses per product. **388's own claim — "every anon path was enumerated" — is what should
-- have caught this, and did not.** A narrow public view instead of column grants would not have
-- closed it either: a definer function bypasses both mechanisms equally.
--
-- ============================================================================
-- IT IS THE ONLY ONE, AND THAT WAS ESTABLISHED BY SWEEP, NOT BY SPOT-CHECK
-- ============================================================================
--
-- Every function `anon` may execute whose body or result mentions one of the 19 revoked columns
-- was enumerated from the catalogue — 27 of them — and every STABLE one with no guard matched
-- by static search was then CALLED as `anon` to settle it behaviourally. The VOLATILE ones were
-- read rather than called, because calling them writes:
--
--   mi_get_emerging_products / mi_get_price_movers / mi_get_seller_favorite_products /
--   mi_get_seller_top_products / mi_get_top_checked_today / mi_get_trending_products
--       -> {"code":"P0001","message":"unauthenticated"}   guarded; the static search missed the
--                                                          guard's form, the call settled it
--   asan_list_sales_export / search_product_ids / get_sales_search_products -> guarded
--   bot_get_product_for_key / bot_list_products_for_key   -> key-gated; `bot_api_keys` returns
--                                                            [] to anon, so the chain is closed
--   products_assign_sku / sync_product_price_observatory_row -> trigger functions, not callable
--                                                            as an endpoint
--   find_duplicate_product                                -> **the one that answered**
--
-- ============================================================================
-- WHY TWO REVOKES AND NOT ONE
-- ============================================================================
--
-- `proacl` reads `{=X/supabase_admin, supabase_admin=X, anon=X, authenticated=X, service_role=X,
-- postgres=X}`. The leading `=X` is PUBLIC. **PostgreSQL grants EXECUTE on functions to PUBLIC
-- by default**, so `REVOKE … FROM anon` alone leaves `has_function_privilege('anon', …)` TRUE
-- and achieves nothing — that is exactly the trap migration 381 had to be written twice for.
--
-- And the real caller does not break. There is exactly one:
-- `src/lib/products/duplicate-check.ts:23`, through the browser client, i.e. `authenticated`.
-- Measured inside BEGIN … ROLLBACK before writing this file: after revoking `anon` and `PUBLIC`,
-- `authenticated` is still TRUE, because it holds its own explicit grant. So this file adds no
-- compensating GRANT — adding one would be granting something that was never taken away.
--
-- ============================================================================
-- 388 ALSO BROKE MIGRATION 380, THE LIVE OG-25 GATE. THIS FILE RECONCILES IT.
-- ============================================================================
--
-- Migration 380 is the authoritative gate of the OG-25 lineage (378 -> 379 -> 380). Run against
-- the post-388 database it FAILS, and it is right to:
--
--   ERROR:  380: the anon privilege census drifted.
--     expected-but-absent : {"r:products=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"}
--     found-but-unexpected: {"r:products=DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE"}
--
-- That is 380 doing exactly its job: it pins the privilege SET per object so that an unintended
-- change is caught. 388 changed one deliberately and never updated the pin. **Every possible fix
-- for OG-49 hits this** — removing `anon`'s table-level SELECT is the point of the mission, and a
-- narrow view instead of column grants would have moved the same census row plus added an object
-- the census must also carry. The census is designed to be amended by whoever legitimately
-- changes a privilege. 388 simply did not amend it.
--
-- **AND A SECOND, SHARPER CONFLICT.** 380's check 3 forbids the exact construct 388 is built
-- from:
--
--   "The rule: anon may hold a column privilege ONLY where it already holds the same privilege
--    at table level. A column grant that reaches further than the table grant is invisible to
--    check 2 by construction, because a column ACL never moves relacl."
--
-- Its reasoning is sound and worth preserving: a column grant can smuggle access PAST a census
-- that only reads `relacl`. But the rule as written cannot tell that case apart from 388's,
-- which uses column grants to grant strictly LESS than the table grant it replaced. One is
-- access escaping the census; the other is access being withdrawn. 380 raises on both.
--
-- **So this file retires migration 380's check 2 census row for `r:products` and its check 3,
-- and asserts the corrected invariant below in their place.** 380's checks 1 and 4 stand.
--
-- REPLAY CAVEAT, stated rather than buried: on a full in-order replay, 380 still runs before
-- this file and would still abort on the stale census row. An applied migration is not edited
-- (AGENTS.md rule 6), so that cannot be fixed from here. It is the same limitation migration 385
-- recorded for 384's check-1 message, and it sits on top of the programme's already-broken
-- replay path — `supabase_migrations.schema_migrations` does not carry 374 through 389 at all.
--
-- ============================================================================
-- WHAT THIS FILE DOES NOT TOUCH
-- ============================================================================
--
-- `anon` can execute 740 functions in `public`, 345 of them SECURITY DEFINER. That surface is
-- OG-31's — the FUNCTIONS default privilege — and narrowing it wholesale is a decision nobody
-- has taken. This file revokes ONE function, the one measured to leak a column OG-49 names.
--
-- `calculate_adjusted_price` is anon-executable, VOLATILE and reads `received_at` internally,
-- but returns a price rather than a column and was not called (calling a VOLATILE function
-- writes). Recorded as unresolved rather than claimed safe.
--
-- ROLLBACK: docs/verification/389-down.sql — written from the captured `proacl` and dry-run
-- proved BEFORE this file was applied. Note that running it RE-OPENS this leak.

SET client_encoding = 'UTF8';

REVOKE EXECUTE ON FUNCTION public.find_duplicate_product(uuid, uuid, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_product(uuid, uuid, text, text, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- gate — a REPAIR of migration 388's gate, not a second gate. **388's checks 1
-- and 3 are retired by this file**; its checks 2, 4, 5 and 6 stand.
--
-- WHY THEY NEEDED REPAIRING. 388 checked two NAMED LISTS — nine public columns
-- must be readable, nineteen internal ones must not. The reviewer defeated it
-- in the obvious way: add a NEW column to `products` and grant it to `anon`.
-- It is in neither list, so nothing looks at it and the gate reports OK while
-- `anon` reads it. Checking a list is not the same as checking a set.
--
-- The repair asserts CLOSURE instead: the set of columns `anon` can actually
-- read, computed over every live column, must equal exactly the nine. A column
-- added tomorrow and granted is then caught by construction rather than by
-- somebody remembering to update a list.
--
-- What 388's gate got right and this keeps: it is an EFFECT test throughout, so
-- it sees through a grant made to PUBLIC rather than to `anon` — the reviewer
-- attacked it that way twice and it held both times. Five earlier gates in this
-- programme fell to exactly that distinction.
-- ---------------------------------------------------------------------------

DO $chk$
DECLARE
  actual   text[];
  expected text[] := ARRAY['brand_id','capacity','category_id','description','id','is_active',
                           'model','name','stock_status'];
  bad      text;
  n        int;
BEGIN
  ---------------------------------------------------------------------------
  -- A0. EXISTENCE FIRST, and the order is not cosmetic. `has_function_privilege`
  --     RAISES on a name that does not resolve rather than returning false, so
  --     with this check further down a renamed or dropped function aborted the
  --     migration with a raw `function ... does not exist` and no hint about
  --     which assertion was in play. Found by renaming the function in an attack
  --     run against this very gate. It fails either way — the safe outcome — but
  --     an operator reading the wrong error looks in the wrong place, which is
  --     the defect migration 382 was written to fix in 381's success notice.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'find_duplicate_product';
  IF n = 0 THEN
    RAISE EXCEPTION '389: find_duplicate_product does not exist. Every assertion below is about that function, so they would raise something unhelpful against nothing';
  END IF;

  ---------------------------------------------------------------------------
  -- A. REPLACES 388 CHECKS 1 AND 3. Set equality, computed over every live
  --    column, in both directions at once.
  ---------------------------------------------------------------------------
  SELECT array_agg(a.attname ORDER BY a.attname) INTO actual
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND has_column_privilege('anon', 'public.products', a.attname, 'SELECT');

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION '389: anon-readable product columns are %, expected exactly %. Either an internal column became readable — including one added after this gate was written, which is what 388''s named-list checks could not see — or a public one was lost and /api/public/products now answers 500', actual, expected;
  END IF;

  ---------------------------------------------------------------------------
  -- B. The definer door. By EFFECT, which is the only test that sees a PUBLIC
  --    grant; `grantee = 'anon'` would report success while PUBLIC kept it open.
  ---------------------------------------------------------------------------
  IF has_function_privilege('anon', 'public.find_duplicate_product(uuid,uuid,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '389: anon can still EXECUTE find_duplicate_product. It is SECURITY DEFINER and returns products.sku, so definer rights walk straight past migration 388''s column revoke and past RLS. Remember a REVOKE from anon alone does not remove the PUBLIC grant';
  END IF;
  IF has_function_privilege('public', 'public.find_duplicate_product(uuid,uuid,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '389: PUBLIC still holds EXECUTE on find_duplicate_product, so every role including anon still reaches it';
  END IF;

  ---------------------------------------------------------------------------
  -- C. THE OTHER DIRECTION. The one real caller must keep working. Without
  --    this, revoking from everybody would pass — the failure mode M4's gate
  --    386 was sent back for.
  ---------------------------------------------------------------------------
  IF NOT has_function_privilege('authenticated', 'public.find_duplicate_product(uuid,uuid,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '389: authenticated LOST EXECUTE on find_duplicate_product. Its one caller, src/lib/products/duplicate-check.ts, runs as authenticated through the browser client — this migration was meant to close anon and nothing else';
  END IF;

  ---------------------------------------------------------------------------
  -- E. REPLACES MIGRATION 380'S CHECK 3, narrowed to what that rule was for.
  --    380 forbids any anon column privilege without the matching table
  --    privilege. The danger it names is a column grant reaching PAST a census
  --    that only reads relacl — access escaping. 388's grants do the opposite:
  --    they are strictly narrower than the table grant they replaced. So the
  --    corrected invariant is not "no column grants" but "no column grant on an
  --    object outside the one this programme deliberately narrowed".
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT c.relname || '.' || a.attname, ', ') INTO bad
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) pr
   WHERE ns.nspname = 'public' AND c.relkind IN ('r','v','m','p','f')
     AND c.relname <> 'products'
     AND has_column_privilege('anon', c.oid, a.attname, pr)
     AND NOT has_table_privilege('anon', c.oid, pr);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '389: anon holds a COLUMN privilege without the matching table privilege on %. Outside public.products that is a column grant reaching past the relacl census, which is what migration 380 check 3 was written to catch', bad;
  END IF;

  ---------------------------------------------------------------------------
  -- F. And on `products` itself the narrowing must stay a NARROWING. A column
  --    grant for a privilege anon does NOT hold at table level is only safe
  --    because it is SELECT and SELECT was deliberately removed; any OTHER
  --    privilege appearing at column level here would be 380's original danger.
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT a.attname || ':' || pr, ', ') INTO bad
    FROM pg_attribute a
    CROSS JOIN unnest(ARRAY['INSERT','UPDATE','REFERENCES']) pr
   WHERE a.attrelid = 'public.products'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND has_column_privilege('anon', 'public.products', a.attname, pr)
     AND NOT has_table_privilege('anon', 'public.products', pr);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '389: anon holds a non-SELECT COLUMN privilege on products without it at table level: %. Only the SELECT narrowing is sanctioned here', bad;
  END IF;

  RAISE NOTICE '389 OK: the set of product columns anon can read is EXACTLY the 9 public ones, asserted as set equality over every live column rather than against two named lists — a column added tomorrow and granted to anon now fails this gate; anon and PUBLIC both lost EXECUTE on find_duplicate_product, closing the SECURITY DEFINER path that returned products.sku past migration 388''s column revoke; and authenticated keeps it, so its one real caller still works. Retires migration 388 checks 1 and 3, and migration 380''s check 2 census row for r:products plus its check 3, replacing the latter with a rule that tells access escaping a census apart from access being withdrawn. 388 checks 2, 4, 5, 6 and 380 checks 1 and 4 stand';
END
$chk$;
