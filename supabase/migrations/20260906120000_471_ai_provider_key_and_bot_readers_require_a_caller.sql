SET client_encoding='UTF8';

-- 471 - ai_get_provider_key stops handing plaintext AI keys to anon, and the last two
--       key-id-only bot readers get the same treatment the four writers got in 468.
--
-- ASCII-ONLY BY DESIGN. Every string this file adds is an API-level refusal, not a UI string.
--
-- ============================================================================
-- 1. THE SERIOUS ONE: ai_get_provider_key(p_provider_id uuid)
-- ============================================================================
--
-- Measured live 2026-09-06 on afrakala-lan-db / database `afrakala`:
--
--   prosecdef = true
--   proacl    = postgres=X/supabase_admin supabase_admin=X/supabase_admin
--               anon=X/supabase_admin service_role=X/supabase_admin
--   has_function_privilege: anon=TRUE  authenticated=false  service_role=true
--
-- Its body, in full, from pg_get_functiondef - there is no caller check of any kind:
--
--     SELECT secret_id INTO v_secret_id
--       FROM public.ai_providers WHERE id = p_provider_id AND is_active;
--     IF v_secret_id IS NULL THEN RETURN NULL; END IF;
--     SELECT decrypted_secret INTO v_key
--       FROM vault.decrypted_secrets WHERE id = v_secret_id;
--     RETURN v_key;
--
-- WHAT AN UNAUTHENTICATED CALLER COULD OBTAIN BEFORE THIS MIGRATION, PLAINLY:
-- the plaintext API key of any active AI provider - the actual secret string billed to this
-- company - by POSTing one uuid to /rest/v1/rpc/ai_get_provider_key with nothing but the
-- published anon key. No session, no password, no role. SECURITY DEFINER carries the read
-- straight through vault.decrypted_secrets, which the caller cannot read directly. The uuid
-- is not itself readable by anon (ai_providers is admin-only PERMISSIVE), so this was a
-- capability-URL rather than a one-request compromise - but a provider id is not a secret,
-- and it appears in admin URLs, logs and screenshots.
--
-- AFTER THIS MIGRATION an unauthenticated caller gets 42501 twice over: `anon` no longer
-- holds EXECUTE, and even if it did, the first statement of the body refuses any caller whose
-- JWT role is not exactly `service_role`.
--
-- ---------------------------------------------------------------------------
-- 1a. CORRECTION: THIS IS NOT A REGRESSION. Nothing re-granted anon.
-- ---------------------------------------------------------------------------
--
-- The brief that commissioned this file asked me to say in the header that the anon grant was
-- a regression and to find what re-granted it. I looked, and the evidence says otherwise. The
-- correction is recorded here rather than quietly adopted.
--
-- `grep -rn ai_get_provider_key supabase/migrations` returns FOUR lines in the whole history,
-- all in the creating migration 20260724130000_153_ai_providers_and_key_vault.sql:
--
--     311: CREATE OR REPLACE FUNCTION public.ai_get_provider_key(p_provider_id uuid)
--     381: REVOKE ALL ON FUNCTION public.ai_get_provider_key(uuid) FROM public;
--     382: REVOKE ALL ON FUNCTION public.ai_get_provider_key(uuid) FROM authenticated;
--     383: GRANT  EXECUTE ON FUNCTION public.ai_get_provider_key(uuid) TO service_role;
--
-- No later migration mentions it, and there is no blanket `GRANT ... ON ALL FUNCTIONS ...
-- TO anon` anywhere in supabase/migrations. The grant was never issued by anyone. It was
-- applied automatically at CREATE time by the schema's FUNCTIONS default privilege, which
-- migration 393 documents in its own header:
--
--     "pg_default_acl carries, for supabase_admin in schema public:
--        objtype 'f' | {postgres=X, anon=X, authenticated=X, service_role=X}
--      ... every function created by supabase_admin in public is executable by an anonymous
--      caller the moment it exists, with no GRANT written anywhere."
--
-- 153 ran 2026-07-24. 393 closed that default privilege on 2026-08-26, a month later - and
-- `pg_default_acl` today confirms it is closed: `supabase_admin | public | f |
-- postgres=X authenticated=X service_role=X`, no anon. So the window was open when this
-- function was born and has since been shut for NEW functions; 393 did not retroactively
-- strip the grants already handed out.
--
-- The reason 153's revoke did not catch it is the exact mirror of the trap migration 381
-- documented in the other direction. 381 says `REVOKE ... FROM anon` alone is not enough
-- because the bare `=X` PUBLIC entry survives. Here `REVOKE ALL ... FROM public` alone was
-- not enough because the EXPLICIT `anon=X` entry survives. The proacl proves which happened:
-- ai_get_provider_key has `anon=X` and NO bare `=X` - 153's revoke of PUBLIC worked exactly
-- as written and simply never addressed anon. Every untouched bot_* function in section 2
-- carries BOTH, which is what an unrevoked function looks like.
--
-- So: an incomplete revoke in the creating migration, not an escalation afterwards, and not
-- something 436 missed. The fix is the same either way, which is why it is written the same.
--
-- ---------------------------------------------------------------------------
-- 1b. WHY REVOKING IS SAFE, AND WHY THE BODY GUARD IS NOT OPTIONAL
-- ---------------------------------------------------------------------------
--
-- The only caller in the entire repo is src/lib/ai/client.server.ts:167-171, in a file whose
-- own header says "Never import this from browser code - it reads provider keys":
--
--     const { data, error } = await supabaseAdmin.rpc("ai_get_provider_key" as never,
--                                                     { p_provider_id: providerId } as never);
--
-- and `supabaseAdmin` is built in src/integrations/supabase/client.server.ts:57 as
-- createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). No database function calls it either
-- (pg_proc.prosrc scan: no hits outside itself), and there is no pg_cron in this database, so
-- there is no scheduled or trigger-driven caller whose JWT would be absent.
--
-- The body guard exists because a grant is one careless statement from coming back, and this
-- function hands out credentials. It uses the positive form migration 469 established:
--
--     IF COALESCE(auth.role(), '') <> 'service_role' THEN
--       RAISE EXCEPTION '...' USING ERRCODE = '42501';
--     END IF;
--
-- The COALESCE is load-bearing, not decoration: a caller presenting no JWT at all leaves the
-- setting unset, auth.role() returns NULL, and `NULL <> 'service_role'` evaluates to NULL -
-- which `IF` treats as false, so an unguarded comparison would FALL THROUGH and hand the key
-- to precisely the caller it was written to stop. Comparing the COALESCEd value makes the
-- no-JWT case refuse like every other non-service caller.
--
-- ============================================================================
-- 2. THE TWO REMAINING KEY-ID-ONLY BOT READERS
-- ============================================================================
--
--   bot_get_product_for_key(p_key_id uuid, p_product_id uuid)
--   bot_list_products_for_key(p_key_id uuid, p_label_id uuid,
--                             p_updated_since timestamptz, p_page integer, p_page_size integer)
--
-- Both DEFINER, both anon=t with the bare `=X` PUBLIC entry, and both take the key ID as the
-- whole credential - the same defect 468 closed in the four writers, in the read half of the
-- API. Their entire access check:
--
--   bot_get_product_for_key   EXISTS(... bot_api_key_label_access kla WHERE kla.api_key_id = p_key_id)
--                             else RAISE 'forbidden_product'
--   bot_list_products_for_key EXISTS(SELECT 1 FROM bot_api_key_label_access WHERE api_key_id = p_key_id)
--                             else RAISE 'forbidden_no_labels'
--
-- THEY LOOK LIKE THEY CHECK is_active AND THEY DO NOT - the identical trap 468 documented.
-- The only `is_active` in bot_get_product_for_key is at body line 55:
--   `JOIN public.sale_price_types spt ON ... WHERE pcp.product_id = p.id AND spt.is_active = true`
-- - the PRICE TYPE's flag. Same at line 82 of bot_list_products_for_key. Neither body
-- references bot_api_keys at all.
--
-- Call sites confirmed the same way as 468 - authenticate first, then RPC as service_role:
--
--   src/routes/api.public.bot.products.$productId.ts:38  authenticateBot(extractBotKey(request))
--   src/routes/api.public.bot.products.$productId.ts:73  supabaseAdmin.rpc("bot_get_product_for_key")
--   src/routes/api.public.bot.products.ts:21             authenticateBot(extractBotKey(request))
--   src/routes/api.public.bot.products.ts:81             supabaseAdmin.rpc("bot_list_products_for_key")
--
-- grep over src/ finds no other caller. Both get 468's key-validity block verbatim, reusing
-- bot_authenticate_key's exact strings so src/server/bot-api.ts:23-28 keeps mapping them to
-- Persian 401s rather than falling through to the unmapped-error 500 at bot-api.ts:245.
--
-- ONE REAL BEHAVIOUR CHANGE, MEASURED BEFORE WRITING IT. bot_api_key_label_access holds 10
-- rows. Nine map to keys that are is_active with expires_at NULL. ONE maps to a key that is
-- is_active but whose expires_at is already in the past:
--
--   is_active | no_expiry | expired | orphan | count
--   t         | f         | t       | f      |   1
--   t         | t         | f       | f      |   9
--
-- After this migration that mapping's key is refused with `expired_key`. That breaks no
-- working request: bot_authenticate_key ALREADY refuses that key at the front door
-- (`IF _expires IS NOT NULL AND _expires < now() THEN RAISE EXCEPTION 'expired_key'`), so any
-- bot presenting the raw key is stopped at src/server/bot-api.ts:286 long before the RPC. All
-- this migration does is make the back door agree with the front door. It is stated here
-- because it is a real difference from 468, where the single live mapping was fully valid.
--
-- ============================================================================
-- 3. THE REST OF THE bot_* FAMILY - what I revoked, what I left, and why
-- ============================================================================
--
-- Three more are anon=t with a bare `=X`. All three are revoked from anon and PUBLIC here,
-- because none has a legitimate anonymous caller. NONE of the three gets a body change, and
-- the reasons differ per function:
--
--   bot_key_stats_today()            ALREADY GUARDED. Body opens with
--                                    `IF NOT has_any_role(auth.uid(), ARRAY['admin','manager'])
--                                     THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'`.
--                                    anon has a NULL uid, has_any_role returns false (EXISTS,
--                                    never NULL), so it already refused. Called from the
--                                    browser at _app.bot-api-keys.index.tsx:146 and
--                                    _app.bot-api-keys.usage.tsx:170 - `authenticated` stays.
--
--   bot_suspicious_ips(p_limit int)  ALREADY GUARDED, identical shape, verified in its body.
--                                    Called from _app.bot-api-keys.usage.tsx:154 - the same
--                                    browser path, so `authenticated` stays.
--
--   bot_check_rate_limit(uuid,text)  NO body check is added, DELIBERATELY, and a key-validity
--                                    block here would be a BUG. Its whole purpose includes the
--                                    unauthenticated path: the body branches
--                                    `ELSIF p_ip IS NOT NULL THEN -- Unauthenticated IP-based
--                                    limit (failed attempts)`, and src/server/bot-api.ts:73-82
--                                    declares `keyId: string | null` and passes NULL on exactly
--                                    that path. Requiring a valid key would make the rate
--                                    limiter throw on the requests it exists to throttle.
--                                    Revoking anon is enough: its only caller is
--                                    src/server/bot-api.ts:79 via supabaseAdmin.
--
-- bot_authenticate_key is NOT touched at all - it is the raw-key entry point and is already
-- anon=f. It appears in the before/after evidence purely as an unchanged control.
--
-- `authenticated` is left in place everywhere in this file, exactly as in 468. Two of these
-- six genuinely need it (the two admin dashboard readers), and for the rest removing it is a
-- wider change than this row owns. Handed forward, not silently done.
--
-- ============================================================================
-- 4. THE BODIES ARE THE DEPLOYED ONES, DIFFED AGAINST GIT FIRST
-- ============================================================================
--
--   ai_get_provider_key       <- 20260724130000_153_ai_providers_and_key_vault   identical
--   bot_get_product_for_key   <- 20260509104248_1f3746f8-...                     identical
--   bot_list_products_for_key <- 20260509104248_1f3746f8-...                     identical
--
-- "identical" means every executable line matches; the only differences are
-- pg_get_functiondef's own rendering (signature reflowed onto one line, `timestamptz` printed
-- as `timestamp with time zone`, `$$` printed as `$function$`, `SET search_path = public`
-- printed as `SET search_path TO 'public'`). There is no drift between database and git.
--
-- ============================================================================
-- 5. ORDERING, AND WHAT BREAKS IF THIS IS WRONG
-- ============================================================================
--
-- The REVOKEs come AFTER every CREATE OR REPLACE, never before. Reversing the two halves
-- would leave all of them reachable again and the file would still apply cleanly.
--
-- If the ai_get_provider_key guard is wrong, every AI feature in the product stops: no
-- provider key is ever returned and each call falls to `if (error) return null` at
-- client.server.ts:172. That is why the comparison is copied from 469 rather than invented,
-- and why service_role EXECUTE is asserted before and after. If the two bot revokes are
-- wrong, the public bot product API returns permission denied for every read.

-- ----------------------------------------------------------------------------
-- ai_get_provider_key
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_get_provider_key(p_provider_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret_id uuid;
  v_key       text;
BEGIN
  -- 471: service_role only. This function returns a decrypted vault secret, so it does not
  -- rely on its EXECUTE grant alone. The COALESCE is required: with no JWT auth.role() is
  -- NULL and `NULL <> 'service_role'` is NULL, which IF treats as false and falls through.
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: ai_get_provider_key is callable only by the service role'
      USING ERRCODE = '42501';
  END IF;

  SELECT secret_id INTO v_secret_id
    FROM public.ai_providers WHERE id = p_provider_id AND is_active;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE id = v_secret_id;

  RETURN v_key;
END;
$function$
;

-- ----------------------------------------------------------------------------
-- bot_get_product_for_key
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_get_product_for_key(p_key_id uuid, p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_result jsonb;
BEGIN

  -- 468: key validity, defence in depth. Runs BEFORE the table-access lookup.
  -- Message strings match bot_authenticate_key exactly; src/server/bot-api.ts maps them.
  DECLARE
    _bot_key_active  boolean;
    _bot_key_expires timestamptz;
  BEGIN
    SELECT k.is_active, k.expires_at
      INTO _bot_key_active, _bot_key_expires
    FROM public.bot_api_keys k
    WHERE k.id = p_key_id;

    IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
    IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
    IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
      RAISE EXCEPTION 'expired_key';
    END IF;
  END;
  SELECT EXISTS (
    SELECT 1
    FROM public.product_label_links pll
    JOIN public.bot_api_key_label_access kla ON kla.label_id = pll.label_id
    WHERE pll.product_id = p_product_id AND kla.api_key_id = p_key_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'forbidden_product';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'sku', p.sku,
    'name', p.name,
    'description', p.description,
    'technical_notes', p.technical_notes,
    'status', p.status,
    'stock_status', p.stock_status,
    'unit', p.unit,
    'color', p.color,
    'capacity', p.capacity,
    'model', p.model,
    'primary_spec', p.primary_spec,
    'updated_at', p.updated_at,
    'created_at', p.created_at,
    'brand', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.brands b WHERE b.id = p.brand_id),
    'category', (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM public.categories c WHERE c.id = p.category_id),
    'labels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'color', l.color))
      FROM public.product_label_links pll
      JOIN public.product_labels l ON l.id = pll.label_id
      WHERE pll.product_id = p.id
    ), '[]'::jsonb),
    'prices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sale_price_type_id', spt.id,
        'sale_price_type_title', spt.title,
        'rounded_sale_price', pcp.rounded_sale_price,
        'final_sale_price', pcp.final_sale_price,
        'computed_at', pcp.computed_at
      ))
      FROM public.product_computed_prices pcp
      JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
      WHERE pcp.product_id = p.id AND spt.is_active = true
    ), '[]'::jsonb),
    'attributes', COALESCE((
      SELECT jsonb_object_agg(cpa.attribute_key, pcav.value)
      FROM public.product_category_attribute_values pcav
      JOIN public.category_product_attributes cpa ON cpa.id = pcav.category_attribute_id
      WHERE pcav.product_id = p.id
    ), '{}'::jsonb)
  ) INTO v_result
  FROM public.products p
  WHERE p.id = p_product_id;

  RETURN v_result;
END;
$function$
;

-- ----------------------------------------------------------------------------
-- bot_list_products_for_key
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_list_products_for_key(p_key_id uuid, p_label_id uuid DEFAULT NULL::uuid, p_updated_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(total_count bigint, product jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offset integer := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,50));
  v_limit  integer := LEAST(100, GREATEST(1, COALESCE(p_page_size,50)));
  v_has_any boolean;
BEGIN

  -- 468: key validity, defence in depth. Runs BEFORE the table-access lookup.
  -- Message strings match bot_authenticate_key exactly; src/server/bot-api.ts maps them.
  DECLARE
    _bot_key_active  boolean;
    _bot_key_expires timestamptz;
  BEGIN
    SELECT k.is_active, k.expires_at
      INTO _bot_key_active, _bot_key_expires
    FROM public.bot_api_keys k
    WHERE k.id = p_key_id;

    IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
    IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
    IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
      RAISE EXCEPTION 'expired_key';
    END IF;
  END;
  -- Confirm key has at least one allowed label
  SELECT EXISTS (SELECT 1 FROM public.bot_api_key_label_access WHERE api_key_id = p_key_id) INTO v_has_any;
  IF NOT v_has_any THEN
    RAISE EXCEPTION 'forbidden_no_labels';
  END IF;

  -- If specific label requested, ensure it's in allowlist
  IF p_label_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bot_api_key_label_access
                   WHERE api_key_id = p_key_id AND label_id = p_label_id) THEN
      RAISE EXCEPTION 'forbidden_label';
    END IF;
  END IF;

  RETURN QUERY
  WITH allowed AS (
    SELECT label_id FROM public.bot_api_key_label_access WHERE api_key_id = p_key_id
  ),
  matched AS (
    SELECT DISTINCT pll.product_id
    FROM public.product_label_links pll
    JOIN allowed a ON a.label_id = pll.label_id
    WHERE p_label_id IS NULL OR pll.label_id = p_label_id
  ),
  base AS (
    SELECT p.*
    FROM public.products p
    JOIN matched m ON m.product_id = p.id
    WHERE (p_updated_since IS NULL OR p.updated_at >= p_updated_since)
  ),
  counted AS (SELECT count(*)::bigint AS c FROM base),
  page AS (
    SELECT * FROM base ORDER BY updated_at DESC NULLS LAST, id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT c FROM counted) AS total_count,
    jsonb_build_object(
      'id', pg.id,
      'sku', pg.sku,
      'name', pg.name,
      'description', pg.description,
      'status', pg.status,
      'stock_status', pg.stock_status,
      'unit', pg.unit,
      'color', pg.color,
      'capacity', pg.capacity,
      'model', pg.model,
      'primary_spec', pg.primary_spec,
      'updated_at', pg.updated_at,
      'brand', (SELECT jsonb_build_object('id', b.id, 'name', b.name)
                FROM public.brands b WHERE b.id = pg.brand_id),
      'category', (SELECT jsonb_build_object('id', c.id, 'name', c.name)
                   FROM public.categories c WHERE c.id = pg.category_id),
      'labels', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'color', l.color))
        FROM public.product_label_links pll
        JOIN public.product_labels l ON l.id = pll.label_id
        WHERE pll.product_id = pg.id
      ), '[]'::jsonb),
      'prices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sale_price_type_id', spt.id,
          'sale_price_type_title', spt.title,
          'rounded_sale_price', pcp.rounded_sale_price,
          'final_sale_price', pcp.final_sale_price,
          'computed_at', pcp.computed_at
        ))
        FROM public.product_computed_prices pcp
        JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
        WHERE pcp.product_id = pg.id AND spt.is_active = true
      ), '[]'::jsonb)
    ) AS product
  FROM page pg;
END;
$function$
;

-- ----------------------------------------------------------------------------
-- GRANTS - and these MUST come after every CREATE OR REPLACE above, because
-- CREATE OR REPLACE FUNCTION restores the default grants. Both `FROM anon` and
-- `FROM PUBLIC` are issued on every function: the bare `=X/supabase_admin` entry
-- is the PUBLIC grant and survives `REVOKE ... FROM anon` untouched, and the
-- explicit `anon=X` entry survives `REVOKE ... FROM PUBLIC` untouched. Migration
-- 153 issued only the second half for ai_get_provider_key, which is precisely why
-- that function was still anon-callable two months later (header section 1a).
--
-- service_role is NOT revoked anywhere here - it is the only legitimate caller of
-- ai_get_provider_key and the bot API's own path for the rest.
-- authenticated is NOT revoked anywhere here - see header section 3.
-- bot_authenticate_key is NOT touched.
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.ai_get_provider_key(p_provider_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_get_provider_key(p_provider_id uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bot_get_product_for_key(p_key_id uuid, p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_get_product_for_key(p_key_id uuid, p_product_id uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bot_list_products_for_key(p_key_id uuid, p_label_id uuid, p_updated_since timestamp with time zone, p_page integer, p_page_size integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_list_products_for_key(p_key_id uuid, p_label_id uuid, p_updated_since timestamp with time zone, p_page integer, p_page_size integer) FROM PUBLIC;

-- The three below get no body change - see header section 3 for the per-function reason.
REVOKE EXECUTE ON FUNCTION public.bot_check_rate_limit(p_key_id uuid, p_ip text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_check_rate_limit(p_key_id uuid, p_ip text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bot_key_stats_today() FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_key_stats_today() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bot_suspicious_ips(p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_suspicious_ips(p_limit integer) FROM PUBLIC;
