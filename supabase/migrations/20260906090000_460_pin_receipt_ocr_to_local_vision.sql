SET client_encoding='UTF8';

-- 460 - stop receipt images leaving the network.
--
-- ASCII-only by design. Persian in a migration cannot survive the transport.
--
-- WHAT IS TRUE TODAY, measured 2026-09-06 on the `afrakala` database:
--
--   ai_usage_routes: service_key='receipt_ocr.vision', capability='vision',
--                    provider_id = NULL, is_enabled = true, fallback_enabled = false.
--                    It is the ONLY route of the eight with fallback_enabled = false.
--   ai_providers:    0fbe576a-9ef3-475b-92e7-fabd981a7d5d  'for ocr'  openai_compatible
--                      https://api.openai.com/v1   is_active=t  priority=1
--                      vision_model=gpt-4o  capabilities={vision}  secret_id IS NOT NULL
--                    d30816a9-8ff0-4d0e-8f25-0661f8cbea61  'ollama'   ollama
--                      http://192.168.170.8:11434  is_active=t  priority=10
--                      vision_model=qwen3.6:latest  capabilities={chat,embeddings,vision}
--
-- WHY THAT IS AN ACTIVE LEAK AND NOT A THEORETICAL ONE.
-- `applyUsageRoute` in `src/lib/ai/client.server.ts` returns early on a NULL provider_id:
--
--     if (!route) return providers;
--     if (!route.is_enabled) return [];
--     if (!route.provider_id) return providers;   // <-- fallback_enabled is NEVER read
--
-- `listProvidersFor` orders by priority ascending, so the unpinned route resolves to the
-- WHOLE candidate list led by priority 1 - the OpenAI provider, which holds a live key.
-- Every receipt image therefore goes to api.openai.com. `ai_provider_health` records
-- provider 0fbe576a / vision as last_status='ok', last_ok_at=2026-08-31 12:56:59+00,
-- 4413 ms. That is a completed round trip to a third party carrying a bank slip.
--
-- HOW THE PIN WENT MISSING - this is a REGRESSION, not an omission.
-- Migration 397 (`20260826230000_397_receipt_ocr_routes_to_local_vision.sql`) set this exact
-- provider_id to the ollama row and would have RAISEd had it not stuck. Migration 401
-- (`20260827030000_401_ollama_declares_vision_so_the_pin_resolves.sql`) re-asserted
-- `IF v_route_id IS NULL THEN RAISE EXCEPTION` and passed. So the pin was applied and was
-- non-NULL as late as 401. No migration after 401 touches `ai_usage_routes` at all
-- (grep over supabase/migrations: only 214, 281, 378, 379, 380, 397, 401 and the original
-- seed mention the table). The row timestamps say what happened instead:
--
--   2026-08-28 06:34:07  ai_provider_health: ollama/vision -> 'unavailable', timeout, 15001 ms
--   2026-08-28 06:37:41  ALL SEVEN remaining ai_usage_routes rows updated in one transaction,
--                        provider_id cleared to NULL - including receipt_ocr.vision
--   2026-08-28 06:48:04  ai_providers row 'for ocr' CREATED: api.openai.com, priority 1, keyed
--   2026-08-28 06:50:05  first receipt image uploaded under the new routing
--
-- Local vision timed out, the pins were cleared out-of-band, and a keyed cloud provider was
-- inserted at the best priority eleven minutes later. `fallback_enabled = false` survived
-- untouched, which is why the row still LOOKS pinned. This migration restores 397's intent
-- and closes the door 397 could not know about.
--
-- WHAT THIS MIGRATION DOES - two changes, both explicit owner decisions:
--   1. Re-pin receipt_ocr.vision to the LOCAL ollama provider.
--   2. Set is_active = false on the OpenAI provider.
--
-- (2) is safe and is scoped: that provider declares capabilities = {vision} and ONLY
-- {vision}, and `receipt_ocr.vision` is the ONLY route in ai_usage_routes with
-- capability = 'vision'. Deactivating it therefore removes no candidate from any chat or
-- embeddings route. It is belt-and-braces against the same class of bug: with the provider
-- inactive, `listProvidersFor` filters it out at the SQL level, so even a future NULL
-- provider_id, a dropped route row, or a caller that passes no usageKey at all cannot
-- resolve a receipt image to api.openai.com.
--
-- The stored key is NOT touched. `secret_id` and `key_prefix` are left exactly as they are,
-- so the owner can reactivate the provider with one UPDATE if this decision is reversed.
-- Nothing is deleted anywhere in this migration.
--
-- ACCEPTED CONSEQUENCE: ollama/vision last reported `unavailable` (timeout) on 2026-08-28.
-- Receipt OCR may therefore fail locally and degrade to manual entry. Degraded local OCR is
-- the accepted outcome; images leaving the network is not.
--
-- Rows are addressed BY ID because the owner named these two ids specifically, but each id
-- is asserted to still carry the identity recorded above before it is written, so a
-- mismatched or missing row ABORTS instead of silently no-opping.

DO $$
DECLARE
  v_ollama  uuid := 'd30816a9-8ff0-4d0e-8f25-0661f8cbea61';
  v_openai  uuid := '0fbe576a-9ef3-475b-92e7-fabd981a7d5d';
  v_before  text;
  v_after   text;
  v_rows    int;
BEGIN
  -- Assert the local destination is the row we think it is, and that it can actually serve
  -- vision. A pin to a provider the capability filter drops resolves to an empty list, which
  -- is the failure mode migration 401 exists to document.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_providers
     WHERE id = v_ollama
       AND kind = 'ollama'
       AND base_url = 'http://192.168.170.8:11434'
       AND is_active
       AND 'vision' = ANY (capabilities)
       AND coalesce(trim(vision_model), '') <> ''
  ) THEN
    RAISE EXCEPTION '460: the local ollama provider % is missing, inactive, does not declare vision, or has no vision_model; refusing to leave receipt OCR pointed at a cloud provider', v_ollama;
  END IF;

  -- Assert the row being deactivated is the cloud provider, and that deactivating it is in
  -- fact scoped. If it ever grew a second capability, or a second vision route appeared,
  -- the blast radius claimed in the header would no longer hold and this must stop.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_providers
     WHERE id = v_openai
       AND kind = 'openai_compatible'
       AND base_url = 'https://api.openai.com/v1'
  ) THEN
    RAISE EXCEPTION '460: provider % is not the expected api.openai.com row; refusing to deactivate an unidentified provider', v_openai;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ai_providers
     WHERE id = v_openai
       AND EXISTS (SELECT 1 FROM unnest(capabilities) c WHERE c <> 'vision')
  ) THEN
    RAISE EXCEPTION '460: provider % declares a capability other than vision; deactivating it would affect a non-vision route and is out of scope', v_openai;
  END IF;

  IF (SELECT count(*) FROM public.ai_usage_routes WHERE capability = 'vision') <> 1 THEN
    RAISE EXCEPTION '460: expected exactly one vision usage route; found %. The scope argument for deactivating the cloud provider no longer holds', (SELECT count(*) FROM public.ai_usage_routes WHERE capability = 'vision');
  END IF;

  SELECT coalesce(p.name, '(none)') || ' fallback=' || r.fallback_enabled || ' enabled=' || r.is_enabled
    INTO v_before
    FROM public.ai_usage_routes r
    LEFT JOIN public.ai_providers p ON p.id = r.provider_id
   WHERE r.service_key = 'receipt_ocr.vision' AND r.capability = 'vision';

  IF v_before IS NULL THEN
    RAISE EXCEPTION '460: there is no receipt_ocr.vision route row to pin';
  END IF;

  -- Change 1: restore the pin.
  UPDATE public.ai_usage_routes
     SET provider_id      = v_ollama,
         is_enabled       = true,
         fallback_enabled = false,
         updated_at       = now()
   WHERE service_key = 'receipt_ocr.vision' AND capability = 'vision';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '460: expected to pin exactly 1 route row, updated %', v_rows;
  END IF;

  -- Change 2: take the cloud provider out of every candidate list. The key is NOT touched.
  UPDATE public.ai_providers
     SET is_active  = false,
         updated_at = now()
   WHERE id = v_openai;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '460: expected to deactivate exactly 1 provider row, updated %', v_rows;
  END IF;

  SELECT coalesce(p.name, '(none)') || ' fallback=' || r.fallback_enabled || ' enabled=' || r.is_enabled
    INTO v_after
    FROM public.ai_usage_routes r
    LEFT JOIN public.ai_providers p ON p.id = r.provider_id
   WHERE r.service_key = 'receipt_ocr.vision' AND r.capability = 'vision';

  RAISE NOTICE '460: receipt_ocr.vision % -> %', v_before, v_after;

  -- Nothing else may have moved. Only this one usage and one provider were in scope.
  IF EXISTS (
    SELECT 1 FROM public.ai_usage_routes
     WHERE service_key <> 'receipt_ocr.vision'
       AND updated_at > now() - interval '10 seconds'
  ) THEN
    RAISE EXCEPTION '460: another usage route changed; this migration is scoped to receipt OCR alone';
  END IF;
END
$$;

-- Verification, in the SAME transaction, re-reading both rows from disk rather than trusting
-- the UPDATEs' own reports. This reproduces what `listProvidersFor('vision', {usageKey:
-- 'receipt_ocr'})` will actually compute, because the whole failure being closed is a
-- configuration that looked correct and resolved somewhere else.
DO $verify$
DECLARE
  v_ollama    uuid := 'd30816a9-8ff0-4d0e-8f25-0661f8cbea61';
  v_openai    uuid := '0fbe576a-9ef3-475b-92e7-fabd981a7d5d';
  v_route     uuid;
  v_fallback  boolean;
  v_enabled   boolean;
  v_active    boolean;
  v_secret    uuid;
  v_prefix    text;
  v_cands     int;
  v_url       text;
BEGIN
  -- 1. The route row is pinned to the local provider, still enabled, still fallback-off.
  SELECT provider_id, fallback_enabled, is_enabled
    INTO v_route, v_fallback, v_enabled
    FROM public.ai_usage_routes
   WHERE service_key = 'receipt_ocr.vision' AND capability = 'vision';

  IF v_route IS NULL THEN
    RAISE EXCEPTION '460 VERIFY: receipt_ocr.vision provider_id is still NULL - applyUsageRoute would early-return the whole priority-ordered list';
  END IF;
  IF v_route <> v_ollama THEN
    RAISE EXCEPTION '460 VERIFY: receipt_ocr.vision is pinned to %, expected the local ollama provider %', v_route, v_ollama;
  END IF;
  IF NOT v_enabled THEN
    RAISE EXCEPTION '460 VERIFY: receipt_ocr.vision is_enabled is false; OCR would be switched off rather than routed locally';
  END IF;
  IF v_fallback THEN
    RAISE EXCEPTION '460 VERIFY: receipt_ocr.vision fallback_enabled is true; a local timeout would silently re-route the slip to a cloud provider';
  END IF;

  -- 2. The pinned provider must SURVIVE the capability filter that runs BEFORE the route is
  --    applied, and it must be local. A pin to a filtered-out row resolves to an empty list.
  SELECT is_active, base_url INTO v_active, v_url
    FROM public.ai_providers
   WHERE id = v_route AND kind = 'ollama' AND 'vision' = ANY (capabilities);
  IF NOT coalesce(v_active, false) THEN
    RAISE EXCEPTION '460 VERIFY: the pinned provider is not an active, vision-declaring, local ollama row - applyUsageRoute would return [] and OCR would be silently disabled';
  END IF;
  IF v_url IS NULL OR v_url NOT LIKE 'http://192.168.170.8:11434%' THEN
    RAISE EXCEPTION '460 VERIFY: the pinned provider base_url is %, which is not the LAN Ollama host', coalesce(v_url, '(null)');
  END IF;

  -- 3. The cloud provider is inactive, so it cannot appear in ANY candidate list - including
  --    for a caller that passes no usageKey and therefore gets no route applied at all.
  SELECT is_active, secret_id, key_prefix INTO v_active, v_secret, v_prefix
    FROM public.ai_providers WHERE id = v_openai;
  IF v_active IS NULL THEN
    RAISE EXCEPTION '460 VERIFY: the api.openai.com provider row % has vanished; it was meant to be deactivated, not deleted', v_openai;
  END IF;
  IF v_active THEN
    RAISE EXCEPTION '460 VERIFY: the api.openai.com provider % is still active and still outranks the local provider on priority', v_openai;
  END IF;

  -- 4. The key was explicitly NOT to be destroyed. Assert it is still there.
  IF v_secret IS NULL THEN
    RAISE EXCEPTION '460 VERIFY: the stored key reference on % was removed; this migration must deactivate the provider without destroying its credential', v_openai;
  END IF;

  -- 5. The final shape of the candidate list: exactly one active provider declares vision,
  --    and it is the LAN Ollama host.
  SELECT count(*) INTO v_cands
    FROM public.ai_providers
   WHERE is_active AND 'vision' = ANY (capabilities);
  IF v_cands <> 1 THEN
    RAISE EXCEPTION '460 VERIFY: expected exactly 1 active vision-capable provider after this migration, found %', v_cands;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ai_providers
     WHERE is_active AND 'vision' = ANY (capabilities) AND base_url NOT LIKE 'http://192.168.170.8:11434%'
  ) THEN
    RAISE EXCEPTION '460 VERIFY: an active vision-capable provider exists that is not the LAN Ollama host';
  END IF;

  RAISE NOTICE '460 VERIFY: receipt_ocr.vision is pinned to LOCAL % with fallback off; api.openai.com provider is inactive with its key intact (secret_id present, prefix %)', v_url, coalesce(v_prefix, '(none)');
END
$verify$;
