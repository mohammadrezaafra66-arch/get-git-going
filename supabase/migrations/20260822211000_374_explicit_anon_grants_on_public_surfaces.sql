-- 374 — make the `anon` grants on the genuinely public surfaces explicit and traceable (OG-25).
--
-- WHY. Migration 373 closes the tap for future objects but changes nothing that already exists. The
-- four tables below, and one function, are read as `anon` by routes that a visitor reaches with no
-- session at all. Today they are readable only because of the schema default 373 just closed —
-- nobody decided it. After this migration they are readable because this file says so and names the
-- consumer. That is the whole point of OG-25: a public grant becomes a written decision instead of
-- an accident of the schema.
--
-- EVERY GRANT BELOW IS A NO-OP IN THE CATALOGUE TODAY, AND THAT IS DELIBERATE. `anon` already holds
-- `arwdDxt` on all four tables and `EXECUTE` on the function, so `relacl` and `proacl` will not
-- change. Nothing about the running system moves. What changes is the record.
--
-- HOW THE LIST WAS DERIVED. Not from the mission brief — from the code, re-derived. The G-1 mission
-- enumerated only the flat dotted route filenames (`api.public.bot.*.ts`), missed the nested
-- `src/routes/api/public/` tree, and shipped two false claims and one live HTTP 500 because of it.
-- Here all 31 route files outside `_app` were enumerated with `find` — flat and nested together —
-- and each was classified by which Supabase client it constructs, because that is what decides the
-- role a grant resolves as:
--
--   supabaseAdmin (client.server.ts)                    -> service role, bypasses RLS, no anon dependency
--   SUPABASE_PUBLISHABLE_KEY with no Authorization      -> anon
--   browser client outside _app with no session         -> anon
--
-- Result, confirming the input analysis on both counts:
--
--   * All EIGHT `api.public.bot.*` routes use supabaseAdmin only. They do NOT depend on `anon`.
--   * `api.healthz`, `api.version`, `sitemap[.]xml`, `index`, `mcp`, `[.mcp]/*`, `[.well-known]/*`,
--     `unauthorized`, `__root` issue no database query at all.
--   * `login`, `register`, `reset-password`, `pending-approval`, the Lovable OAuth consent page use
--     the browser client for `auth.*` only, not for table reads.
--   * Exactly TWO surfaces read tables as `anon`.
--
-- GRANT SELECT ONLY. Never INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. Where a table already
-- holds a wider `anon` grant than SELECT it is LEFT AS IT IS — narrowing existing objects is the
-- batched REVOKE the owner excluded from this mission. The discrepancy is recorded in
-- `docs/research/anon-grant-audit.md` instead.
--
-- ROLLBACK: docs/verification/374-down.sql. Read its header before running it — reversing 374 alone
-- narrows these four objects BELOW their pre-mission state and would break /api/public/products. To
-- roll this mission back, run 373-down and leave 374-down alone.

SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------------
-- Surface 1 — GET /api/public/products
--   src/routes/api/public/products.ts. An unauthenticated, Access-Control-Allow-Origin: *
--   server handler. Builds its client from SUPABASE_PUBLISHABLE_KEY with persistSession:false and
--   no Authorization header, so its `products` query resolves as `anon` and is filtered by the two
--   deliberate anon policies on that table: `products_public_read` (is_active) and
--   `public_api_read_active_products` (is_active AND stock_status <> 'unavailable').
--   Baseline 2026-08-22: HTTP 200, 199 products released to anon out of 355 total.
--   NOTE: this route's price lookup uses the SERVICE ROLE and is held behind
--   PUBLISH_PUBLIC_PRICES=false pending OG-29. It does not depend on any grant here, and this
--   migration must not change that — the feed stays at zero prices.
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.products TO anon;

-- ---------------------------------------------------------------------------
-- Surface 2 — GET /public/sale-lists/<id>
--   src/routes/public.sale-lists.$listId.tsx -> src/lib/public/get-public-sale-list.ts, which
--   imports the BROWSER client `@/integrations/supabase/client`. Outside the `_app` shell and with
--   no session that client sends the publishable key with no user token, so every read below
--   resolves as `anon`.
--
--   The page reads: sale_lists, sale_price_types, sale_list_items, products, brands, categories,
--   and calls rpc('refresh_sale_list_prices').
--
--   `products` is granted above and serves both surfaces.
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.brands           TO anon;  -- get-public-sale-list.ts:113, brand name per item
GRANT SELECT ON TABLE public.categories       TO anon;  -- get-public-sale-list.ts:118, category name per item
GRANT SELECT ON TABLE public.sale_price_types TO anon;  -- get-public-sale-list.ts:56, the list's price-type title

GRANT EXECUTE ON FUNCTION public.refresh_sale_list_prices(uuid) TO anon;
  -- get-public-sale-list.ts:50. SECURITY DEFINER; the page calls it before reading the items so the
  -- prices it shows are current. anon already holds EXECUTE; this records why.

-- ---------------------------------------------------------------------------
-- DELIBERATELY ABSENT: sale_lists and sale_list_items.
--
-- `anon` holds NO SELECT on either — measured 2026-08-22:
--
--   sale_lists       anon: DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE   (SELECT absent)
--   sale_list_items  anon: DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE   (SELECT absent)
--   GET /rest/v1/sale_lists      as anon -> HTTP 401
--   GET /rest/v1/sale_list_items as anon -> HTTP 401
--
-- So the public sale-list page is ALREADY BROKEN for an anonymous visitor, and has been since before
-- this mission. Granting SELECT here would FIX a broken public surface. The owner's instruction for
-- exactly this case is explicit: record it as an Owner-Gate and hand it back, do not fix it. It is
-- raised as an Owner-Gate in docs/execution/00-progress.md.
--
-- Note also that `anon` sees ZERO rows of `sale_price_types` (RLS: `sale_price_types_auth_read` is
-- {authenticated}, `sale_price_types_read` requires admin/manager/accountant), so even the grant
-- above yields no rows to an anonymous caller. The grant is still correct to record — it says which
-- consumer needs the table — but it does not make the page work, and it is not meant to.
-- ---------------------------------------------------------------------------
