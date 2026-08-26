SET client_encoding='UTF8';

-- 401 — the `ollama` provider must DECLARE the vision capability, or migration 397's pin
-- resolves to nothing and receipt OCR is switched OFF rather than routed locally.
--
-- WHAT 397 ACTUALLY DID, found immediately afterwards and corrected here.
-- 397 pinned `receipt_ocr.vision` to the ollama provider and set `fallback_enabled = false`,
-- which reads exactly like "use the local model and never the cloud". It is not what happened.
--
-- `listProvidersFor(capability)` in `src/lib/ai/client.server.ts` filters BEFORE the route is
-- applied:
--
--     const providers = rows.map(toProvider)
--       .filter((p) => p.capabilities.includes(capability));   // <-- ollama removed here
--     const route = await getUsageRoute(usageKey, capability);
--     return applyUsageRoute(providers, route);
--
-- The ollama row's `capabilities` was `{chat,embeddings}` — no `vision`. So:
--   1. the filter drops ollama from the candidate list entirely;
--   2. `applyUsageRoute` runs `providers.find(p => p.id === route.provider_id)` → **undefined**;
--   3. `if (!selected) return route.fallback_enabled ? providers : []` → fallback is off → **[]**;
--   4. `runWithFailover` sees zero providers → `reason: 'no_provider'`;
--   5. `receipt-ocr.functions.ts` maps that to `{ok:false, disabled:true, reason:'ocr_disabled'}`.
--
-- So receipt OCR was **entirely disabled**, and every layer reported something reasonable while
-- it happened. A pinned route does not guarantee the destination is REACHABLE: if an earlier
-- filter removes the destination, the pin resolves to empty, and fallback-off turns empty into
-- nothing at all.
--
-- THE CAPABILITY IS REAL — verified behaviourally before writing this, not inferred from the
-- model's name. A live call to the LAN host, with an actual `images[]` payload:
--
--     POST http://192.168.170.8:11434/api/generate
--     {"model":"qwen3.6:latest","prompt":"Reply with the single word OK.",
--      "images":["<base64 png>"],"stream":false,"think":false}
--     → HTTP 200, {"response":" OK","done":true,"done_reason":"stop"}
--
-- It accepted the image and answered, so `qwen3.6:latest` genuinely serves vision. Load took
-- ~77s cold, which matters for the gate's timeout and is recorded for that reason.
--
-- WHAT THIS CHANGES: one array on one row. `capabilities` gains 'vision'. No provider is added,
-- enabled, disabled or re-prioritised; no key is touched; no other usage route moves. The cloud
-- provider keeps its own `{chat,vision}` and its own routes — it is simply no longer the only
-- candidate the vision filter can see.

DO $$
DECLARE
  v_before text[];
  v_after  text[];
BEGIN
  SELECT capabilities INTO v_before FROM public.ai_providers
   WHERE name = 'ollama' AND kind = 'ollama';

  IF v_before IS NULL THEN
    RAISE EXCEPTION '401: no ollama provider row; 397''s pin has no destination at all';
  END IF;

  IF 'vision' = ANY (v_before) THEN
    RAISE NOTICE '401: ollama already declares vision (%); nothing to do', array_to_string(v_before, ',');
  ELSE
    UPDATE public.ai_providers
       SET capabilities = array_append(capabilities, 'vision'),
           updated_at   = now()
     WHERE name = 'ollama' AND kind = 'ollama';
  END IF;

  SELECT capabilities INTO v_after FROM public.ai_providers
   WHERE name = 'ollama' AND kind = 'ollama';
  RAISE NOTICE '401: ollama capabilities % -> %',
    array_to_string(v_before, ','), array_to_string(v_after, ',');
END
$$;

-- Assertions. These reproduce what `listProvidersFor('vision')` will actually compute, rather
-- than checking that the string 'vision' appears somewhere — the whole failure being corrected
-- is that a configuration can look right and resolve to nothing.
DO $verify$
DECLARE
  v_candidates int;
  v_route_id   uuid;
  v_resolves   boolean;
  v_model      text;
BEGIN
  -- Step 1 of the real code path: active providers that DECLARE the capability.
  SELECT count(*) INTO v_candidates
    FROM public.ai_providers WHERE is_active AND 'vision' = ANY (capabilities);
  IF v_candidates = 0 THEN
    RAISE EXCEPTION '401: no active provider declares vision; the filter yields an empty list';
  END IF;

  -- Step 2: the pinned provider must SURVIVE that filter. This is the exact condition that
  -- failed before — the row existed, was active, was pinned, and was filtered out.
  SELECT r.provider_id INTO v_route_id
    FROM public.ai_usage_routes r
   WHERE r.service_key = 'receipt_ocr.vision' AND r.capability = 'vision' AND r.is_enabled;
  IF v_route_id IS NULL THEN
    RAISE EXCEPTION '401: receipt_ocr.vision has no enabled route; OCR resolves to no provider';
  END IF;

  SELECT true, p.vision_model INTO v_resolves, v_model
    FROM public.ai_providers p
   WHERE p.id = v_route_id AND p.is_active AND 'vision' = ANY (p.capabilities);
  IF NOT coalesce(v_resolves, false) THEN
    RAISE EXCEPTION '401: the pinned provider does NOT survive the vision filter - applyUsageRoute would return an empty list and OCR would be silently disabled';
  END IF;

  -- Step 3: it must be LOCAL, which is the point of 397 in the first place.
  IF NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE id = v_route_id AND kind = 'ollama') THEN
    RAISE EXCEPTION '401: receipt OCR resolves to a non-local provider';
  END IF;

  IF coalesce(trim(v_model), '') = '' THEN
    RAISE EXCEPTION '401: the resolved local provider has no vision_model set';
  END IF;

  RAISE NOTICE '401: verified - receipt_ocr.vision resolves to a LOCAL provider with model %, and it survives the capability filter', v_model;
END
$verify$;
