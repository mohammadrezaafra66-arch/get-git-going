SET client_encoding='UTF8';

-- 397 — receipt OCR reads the slip with the LOCAL vision model, not a cloud one.
--
-- WHAT IS TRUE TODAY, measured 2026-08-26 on the test database:
--   ai_usage_routes: service_key='receipt_ocr.vision' -> provider 'gpt-messenger'
--                    (kind=openai_compatible, base_url=https://api.openai.com/v1),
--                    is_enabled=true, fallback_enabled=true.
--   ai_providers:    'ollama' (kind=ollama, http://192.168.170.8:11434) is ACTIVE and its
--                    vision_model is already 'qwen3.6:latest', which is present on the host.
--
-- So the mechanism was built correctly and pointed the wrong way: the most sensitive image
-- in the system goes to a third party first, and the local model that was configured for
-- exactly this job is only reached when the cloud call fails.
--
-- WHY THIS IS NOT A STYLE PREFERENCE.
-- `docs/ocr/requirements.md` states, under Privacy, that the uploaded image "may contain a
-- full bank account number, a name and a signature", and requires that payload never be
-- logged anywhere it could escape. Sending that same image to api.openai.com is the larger
-- version of the risk that section is about. The owner's Phase-1 answer names the engine
-- directly: qwen3.6 (vision) reads the image, and if it proves insufficient the fallback is
-- qwen2.5:14b post-processing the extracted TEXT — a second LOCAL model, not a cloud one.
--
-- WHY fallback_enabled BECOMES false FOR THIS USAGE ONLY.
-- With fallback on, a transient Ollama failure silently re-routes the slip to OpenAI, which
-- is the exact outcome this migration exists to prevent — and it would also hide the failure,
-- when the owner's instruction was to TRY qwen3.6 and REPORT if it does not work. A silent
-- cloud failover makes that report impossible. This is safe because checklist item 7.7 is
-- explicit that OCR failing must never block manual entry: a refused OCR degrades to typing
-- the fields by hand, which is the documented behaviour, not an outage.
-- Reversing this is one UPDATE if the owner disagrees; the row is named in the report.
--
-- SCOPE: this migration touches ONE row of a routing table. It changes no other usage —
-- messenger, knowledge base, purchase advisor and ad copy keep their current providers,
-- because none of them handles a banking document and that is the distinction being drawn.
-- No provider is disabled, no key is touched, nothing is deleted.
--
-- Selected BY NAME, never by id: provider and route ids differ between databases, and a
-- hardcoded uuid would silently no-op wherever it did not match.

DO $$
DECLARE
  v_ollama uuid;
  v_before text;
  v_after  text;
BEGIN
  SELECT id INTO v_ollama FROM public.ai_providers
   WHERE name = 'ollama' AND kind = 'ollama' AND is_active;

  -- A missing local provider must ABORT rather than quietly leave the cloud route in place;
  -- a migration that "succeeds" while changing nothing is how a fix gets reported as shipped.
  IF v_ollama IS NULL THEN
    RAISE EXCEPTION '397: no active ollama provider found; refusing to leave receipt OCR pointed at a cloud provider without saying so';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ai_providers
                  WHERE id = v_ollama AND coalesce(trim(vision_model),'') <> '') THEN
    RAISE EXCEPTION '397: the ollama provider has no vision_model configured; qwen3.6 cannot be reached';
  END IF;

  SELECT coalesce(p.name,'(none)') || ' fallback=' || r.fallback_enabled
    INTO v_before
    FROM public.ai_usage_routes r LEFT JOIN public.ai_providers p ON p.id = r.provider_id
   WHERE r.service_key = 'receipt_ocr.vision' AND r.capability = 'vision';

  -- The route row is seeded by an earlier migration, but insert-if-absent so this is correct
  -- on a database where it was never created.
  INSERT INTO public.ai_usage_routes (service_key, capability, provider_id, is_enabled, fallback_enabled)
  VALUES ('receipt_ocr.vision', 'vision', v_ollama, true, false)
  -- The primary key is (service_key) ALONE; naming (service_key, capability) here
  -- fails with "no unique or exclusion constraint matching the ON CONFLICT", which the
  -- dry run caught. Capability is still asserted in the verification below.
  ON CONFLICT (service_key) DO UPDATE
     SET provider_id = EXCLUDED.provider_id,
         is_enabled = true,
         fallback_enabled = false,
         capability = EXCLUDED.capability,
         updated_at = now();

  SELECT coalesce(p.name,'(none)') || ' fallback=' || r.fallback_enabled
    INTO v_after
    FROM public.ai_usage_routes r LEFT JOIN public.ai_providers p ON p.id = r.provider_id
   WHERE r.service_key = 'receipt_ocr.vision' AND r.capability = 'vision';

  RAISE NOTICE '397: receipt_ocr.vision % -> %', coalesce(v_before,'(no row)'), v_after;

  -- Prove the intent rather than trusting the UPDATE's own report.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_usage_routes r JOIN public.ai_providers p ON p.id = r.provider_id
     WHERE r.service_key = 'receipt_ocr.vision' AND r.capability = 'vision'
       AND p.kind = 'ollama' AND r.is_enabled AND NOT r.fallback_enabled
  ) THEN
    RAISE EXCEPTION '397: receipt OCR is still not pinned to a local vision provider';
  END IF;

  -- And that nothing else moved. Only this one usage was in scope.
  IF EXISTS (
    SELECT 1 FROM public.ai_usage_routes
     WHERE service_key <> 'receipt_ocr.vision' AND updated_at > now() - interval '10 seconds'
  ) THEN
    RAISE EXCEPTION '397: another usage route changed; this migration is scoped to receipt OCR alone';
  END IF;
END
$$;
