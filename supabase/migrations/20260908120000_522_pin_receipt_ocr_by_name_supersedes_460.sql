SET client_encoding='UTF8';

-- 522 - pin receipt OCR to the LOCAL vision provider, addressing rows BY NAME.
--       Supersedes migration 460 on the production database.
--
-- ASCII-only by design, exactly as 460 is: every string here is an assertion for a future
-- reader, not a UI string, so the file cannot be damaged by an encoding-mangling transport.
--
-- ============================================================================================
-- WHY THIS FILE EXISTS  (owner decision D-62, 2026-09-08)
-- ============================================================================================
-- Migration 460 addresses its two rows by hard-coded UUID:
--
--     v_ollama := 'd30816a9-8ff0-4d0e-8f25-0661f8cbea61'
--     v_openai := '0fbe576a-9ef3-475b-92e7-fabd981a7d5d'
--
-- Its own header says those ids were "measured 2026-09-06 on the afrakala database" - the
-- TEST database. They do not exist on production, whose rows are (owner reading, 2026-09-07):
--
--     f6a5bc04-9c89-42a1-9bfe-dd3258313a0b  'gpt'     openai_compatible  is_active=f  {vision}
--     e07894ce-e804-443c-9873-040c312c48d5  'ollama'  ollama             is_active=t  {chat,embeddings}
--
-- So 460 does not merely no-op on production - it ABORTS, on its very first assertion,
-- because the id it looks for is absent. Measured on the rehearsal database
-- (docs/missions/prodprep/R4-R5-results.md section 5.1); the manual fix was simulated in the
-- most favourable form available and 460 still raised:
--
--     ERROR:  460: the local ollama provider d30816a9-8ff0-4d0e-8f25-0661f8cbea61 is missing,
--             inactive, does not declare vision, or has no vision_model; refusing to leave
--             receipt OCR pointed at a cloud provider
--
-- 460 is therefore SKIPPED on production and a ledger row is recorded for it noting that this
-- migration superseded it. 460's file is NOT edited (CLAUDE.md rule 6).
--
-- ============================================================================================
-- WHAT THIS MIGRATION ENFORCES, AND WHAT IT DELIBERATELY DOES NOT
-- ============================================================================================
-- The goal 460 was written for is a SECURITY goal, stated in its header: receipt images must
-- stop leaving the network. That goal reduces to two facts about the data:
--
--   1. receipt_ocr.vision resolves to the LOCAL ollama provider, enabled, fallback OFF.
--   2. No ACTIVE provider that is not that local row can serve vision.
--
-- Both are enforced below, by NAME, conditionally, so a database that already satisfies them
-- is left byte-for-byte alone. The owner reached this state by hand on 2026-09-07; this
-- migration makes that state durable and re-assertable rather than re-performing it.
--
-- THREE THINGS THIS MIGRATION REFUSES TO DO, each because 460 doing it is what broke it:
--
--   * It does NOT require the pinned provider to declare the vision capability.
--     Production's ollama row declares {chat,embeddings} and NOT vision. 460 asserts vision
--     and so aborts. Whether the local model should advertise vision is a configuration
--     decision about a model, not a security fix, and it is not taken here. The consequence is
--     REPORTED loudly instead: with no vision-capable active provider, listProvidersFor
--     returns an empty candidate list and receipt OCR is effectively OFF, degrading to manual
--     entry. That is 460's own "ACCEPTED CONSEQUENCE" paragraph, and it is the safe direction
--     of failure - a receipt that is not read is better than a receipt sent to a third party.
--
--   * It does NOT touch base_url. Production's ollama base_url has never been measured by
--     anyone; the only readings we have are of id, name, kind, is_active and capabilities.
--     Rewriting a URL nobody has read would be a blind change to the path receipt images
--     travel. NOTE for the run: migration 475 (order 37 of 74) independently requires
--     base_url LIKE 'http://192.168.170.8:11434%', so if production's row differs, 475
--     fails and that is an owner decision at 475 - not something this file should paper over.
--
--   * It does NOT delete or alter any stored credential. secret_id and key_prefix on the
--     cloud provider are left exactly as they are, so deactivation stays reversible with one
--     UPDATE, precisely as 460 intended.
--
-- IDEMPOTENCY IS THE POINT. Every write below carries an IS DISTINCT FROM predicate, so on a
-- database already in the desired state ROW_COUNT is 0, updated_at does not move, and the
-- audit triggers installed by 475 fire nothing. 460's two UPDATEs are UNCONDITIONAL and rewrite
-- updated_at even when the value does not change; this file does not repeat that.
-- ============================================================================================

DO $pin$
DECLARE
  v_ollama        uuid;
  v_ollama_caps   text[];
  v_ollama_url    text;
  v_ollama_model  text;
  v_gpt           uuid;
  v_gpt_active    boolean;
  v_gpt_secret    uuid;
  v_n             int;
  v_rows          int;
  v_changes       int := 0;
  v_vision_routes int;
BEGIN
  -- ---------------------------------------------------------------------------------------
  -- 1. Resolve the LOCAL provider by name. Exactly one row must answer to it; two rows named
  --    'ollama' would make "the local provider" ambiguous and this must not guess.
  -- ---------------------------------------------------------------------------------------
  SELECT count(*) INTO v_n
    FROM public.ai_providers WHERE name = 'ollama' AND kind = 'ollama';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '522: expected exactly one provider named ollama of kind ollama, found %. Receipt OCR cannot be pinned to an ambiguous or absent local provider', v_n;
  END IF;

  SELECT id, capabilities, base_url, vision_model
    INTO v_ollama, v_ollama_caps, v_ollama_url, v_ollama_model
    FROM public.ai_providers WHERE name = 'ollama' AND kind = 'ollama';

  IF NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE id = v_ollama AND is_active) THEN
    RAISE EXCEPTION '522: the local provider ollama (%) is not active; pinning receipt OCR to an inactive provider would resolve to an empty candidate list', v_ollama;
  END IF;

  -- ---------------------------------------------------------------------------------------
  -- 2. The route row must exist. If it does not, there is nothing to pin and silently doing
  --    nothing would be indistinguishable from success.
  -- ---------------------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_usage_routes
     WHERE service_key = 'receipt_ocr.vision' AND capability = 'vision'
  ) THEN
    RAISE EXCEPTION '522: there is no receipt_ocr.vision / vision route row to pin';
  END IF;

  SELECT count(*) INTO v_vision_routes
    FROM public.ai_usage_routes WHERE capability = 'vision';

  -- ---------------------------------------------------------------------------------------
  -- 3. Change 1 - the pin. Conditional: no row is written if all three fields already agree.
  -- ---------------------------------------------------------------------------------------
  UPDATE public.ai_usage_routes
     SET provider_id      = v_ollama,
         is_enabled       = true,
         fallback_enabled = false,
         updated_at       = now()
   WHERE service_key = 'receipt_ocr.vision'
     AND capability   = 'vision'
     AND (provider_id      IS DISTINCT FROM v_ollama
       OR is_enabled       IS DISTINCT FROM true
       OR fallback_enabled IS DISTINCT FROM false);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_changes := v_changes + v_rows;
  IF v_rows = 0 THEN
    RAISE NOTICE '522: receipt_ocr.vision was ALREADY pinned to the local ollama provider %, enabled, fallback off - no change', v_ollama;
  ELSE
    RAISE NOTICE '522: receipt_ocr.vision re-pinned to the local ollama provider % (% row)', v_ollama, v_rows;
  END IF;

  -- ---------------------------------------------------------------------------------------
  -- 4. Change 2 - the cloud provider named 'gpt' must not be active. Absent is acceptable:
  --    the test database calls its cloud row 'for ocr', and a database with no cloud provider
  --    at all already satisfies the invariant. Only a row that IS present and IS active is a
  --    finding, and only then does the scope argument for deactivating it need to hold.
  -- ---------------------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.ai_providers WHERE name = 'gpt';
  IF v_n > 1 THEN
    RAISE EXCEPTION '522: expected at most one provider named gpt, found %', v_n;
  END IF;

  IF v_n = 1 THEN
    SELECT id, is_active, secret_id INTO v_gpt, v_gpt_active, v_gpt_secret
      FROM public.ai_providers WHERE name = 'gpt';

    IF v_gpt_active THEN
      -- Deactivating is only in scope while the row serves vision and nothing else, and while
      -- vision has exactly one route. Both were true when 460 was written; assert rather than
      -- assume, and only at the moment a write is actually required.
      IF EXISTS (
        SELECT 1 FROM public.ai_providers
         WHERE id = v_gpt AND EXISTS (SELECT 1 FROM unnest(capabilities) c WHERE c <> 'vision')
      ) THEN
        RAISE EXCEPTION '522: provider gpt (%) declares a capability other than vision; deactivating it would affect a non-vision route and is out of scope', v_gpt;
      END IF;
      IF v_vision_routes <> 1 THEN
        RAISE EXCEPTION '522: expected exactly one vision usage route before deactivating the cloud provider, found %. The scope argument no longer holds', v_vision_routes;
      END IF;

      UPDATE public.ai_providers
         SET is_active = false, updated_at = now()
       WHERE id = v_gpt AND is_active IS DISTINCT FROM false;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_changes := v_changes + v_rows;
      RAISE NOTICE '522: provider gpt (%) deactivated (% row); its stored key is untouched', v_gpt, v_rows;
    ELSE
      RAISE NOTICE '522: provider gpt (%) was ALREADY inactive - no change', v_gpt;
    END IF;
  ELSE
    RAISE NOTICE '522: no provider named gpt on this database - nothing to deactivate';
  END IF;

  RAISE NOTICE '522: total rows written = %', v_changes;

  -- ---------------------------------------------------------------------------------------
  -- 5. Report the capability gap rather than aborting on it. See the header.
  -- ---------------------------------------------------------------------------------------
  IF NOT ('vision' = ANY (coalesce(v_ollama_caps, ARRAY[]::text[]))) THEN
    RAISE NOTICE '522: NOTE - the pinned local provider % declares capabilities %, which do NOT include vision. Receipt OCR will resolve to an empty candidate list and degrade to manual entry. This is the safe direction of failure and is NOT corrected here; advertising vision on the local model is a separate owner decision', v_ollama, v_ollama_caps;
  ELSIF coalesce(trim(v_ollama_model), '') = '' THEN
    RAISE NOTICE '522: NOTE - the pinned local provider % declares vision but has no vision_model set; OCR will not resolve', v_ollama;
  END IF;

  RAISE NOTICE '522: local provider base_url is % (NOT modified here; migration 475 requires it to match http://192.168.170.8:11434)', coalesce(v_ollama_url, '(null)');
END
$pin$;

-- ==============================================================================================
-- Verification, in the SAME transaction, re-reading from disk rather than trusting the UPDATEs'
-- own reports. The invariants asserted here are STATE-based and contain no UUID, so they hold on
-- production, on the test database and on a restored rehearsal clone alike.
-- ==============================================================================================
DO $verify$
DECLARE
  v_ollama   uuid;
  v_route    uuid;
  v_enabled  boolean;
  v_fallback boolean;
  v_n        int;
  v_leak     text;
BEGIN
  SELECT id INTO v_ollama
    FROM public.ai_providers WHERE name = 'ollama' AND kind = 'ollama';

  -- 1. The route resolves to the local provider, enabled, fallback off.
  SELECT provider_id, is_enabled, fallback_enabled
    INTO v_route, v_enabled, v_fallback
    FROM public.ai_usage_routes
   WHERE service_key = 'receipt_ocr.vision' AND capability = 'vision';

  IF v_route IS NULL THEN
    RAISE EXCEPTION '522 VERIFY: receipt_ocr.vision provider_id is NULL - applyUsageRoute early-returns the whole priority-ordered candidate list, which is the leak this closes';
  END IF;
  IF v_route <> v_ollama THEN
    RAISE EXCEPTION '522 VERIFY: receipt_ocr.vision is pinned to %, expected the local ollama provider %', v_route, v_ollama;
  END IF;
  IF NOT v_enabled THEN
    RAISE EXCEPTION '522 VERIFY: receipt_ocr.vision is_enabled is false';
  END IF;
  IF v_fallback THEN
    RAISE EXCEPTION '522 VERIFY: receipt_ocr.vision fallback_enabled is true; a local timeout would silently re-route the slip to a cloud provider';
  END IF;

  -- 2. THE SECURITY INVARIANT: no ACTIVE provider other than the pinned local row can serve
  --    vision. This is what stops a receipt image reaching a third party, and unlike 460's
  --    "exactly one active vision provider" it is satisfied by a database whose local model
  --    does not advertise vision - which is production's actual state.
  SELECT string_agg(name || ' (' || id::text || ')', ', ') INTO v_leak
    FROM public.ai_providers
   WHERE is_active
     AND 'vision' = ANY (capabilities)
     AND id <> v_ollama;
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION '522 VERIFY: these ACTIVE providers still declare vision and are not the local pinned row: %. A receipt image could resolve to one of them', v_leak;
  END IF;

  -- 3. A provider named gpt, if present, is inactive.
  SELECT count(*) INTO v_n FROM public.ai_providers WHERE name = 'gpt' AND is_active;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '522 VERIFY: provider gpt is still active';
  END IF;

  -- 4. Deactivation must not have destroyed a credential.
  IF EXISTS (SELECT 1 FROM public.ai_providers WHERE name = 'gpt' AND secret_id IS NULL) THEN
    RAISE NOTICE '522 VERIFY: NOTE - provider gpt has no secret_id. This migration never clears one, so it was already absent';
  END IF;

  RAISE NOTICE '522 VERIFY: receipt_ocr.vision is pinned to the local provider %, enabled, fallback off; zero active non-local providers declare vision', v_ollama;
END
$verify$;
