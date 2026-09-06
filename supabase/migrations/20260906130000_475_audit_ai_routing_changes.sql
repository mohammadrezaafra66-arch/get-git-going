SET client_encoding='UTF8';

-- 475 - a change to the AI routing tables can no longer happen without a receipt.
--
-- ASCII-only by design. Persian in a migration cannot survive the transport.
--
-- ---------------------------------------------------------------------------------------
-- THE GAP, MEASURED 2026-09-06 ON THE `afrakala` DATABASE
-- ---------------------------------------------------------------------------------------
--
-- Nothing writes `audit_logs` when `ai_usage_routes` changes. Nothing at the DATABASE level
-- writes it when `ai_providers` changes either. Both statements were measured, not assumed:
--
--   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--    WHERE NOT tgisinternal AND tgrelid IN ('ai_usage_routes'::regclass,'ai_providers'::regclass);
--     -> trg_ai_usage_routes_updated_at  BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()
--     -> trg_ai_providers_updated_at     BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()
--   Two triggers, both timestamp bookkeeping. Neither writes an audit row.
--
--   SELECT count(*) FROM audit_logs WHERE entity_type LIKE 'ai_usage_route%';  -> 0
--
-- On 2026-08-28 06:37:41 all seven remaining `ai_usage_routes` rows had `provider_id`
-- cleared to NULL in a single transaction. `audit_logs` holds ZERO rows for it. The row
-- timestamps are the only surviving evidence that it happened, and they cannot say who did
-- it, what the values were before, or whether it was one action or seven.
--
-- That clearing was the owner's own operational action. THE AUDIT GAP IS THE FINDING, NOT
-- THE ACT. What makes the gap load-bearing is what came after it: migration 460 re-pinned
-- `receipt_ocr.vision` to the LAN Ollama provider precisely so that receipt images stop
-- leaving the network. Today that pin can be undone by one UPDATE with no trace of who did
-- it or what it was before. This migration closes exactly that.
--
-- ---------------------------------------------------------------------------------------
-- WHAT ALREADY EXISTS, AND WHY THIS IS NOT A SECOND MECHANISM (CLAUDE.md rule 14)
-- ---------------------------------------------------------------------------------------
--
-- `ai_providers` does have SOME coverage, but it is APPLICATION-level and partial:
-- `admin_upsert_ai_provider` and `admin_delete_ai_provider` (both SECURITY DEFINER RPCs,
-- both role-gated) write `audit_logs` rows with entity_type = 'ai_provider'. Eight such rows
-- exist. Two properties make them insufficient:
--
--   1. They only fire when the change comes THROUGH THE RPC. A direct UPDATE - by
--      `service_role` over PostgREST, by `psql`, by a future function - writes nothing.
--      That is the same class of hole the 2026-08-28 clearing went through.
--   2. They record only the NEW value:
--        {"kind":"openai_compatible","name":"for ocr","is_active":true,"key_changed":true,...}
--      There is no before-state, so they cannot answer "what was it before?" - which is the
--      only question that matters when a pin is silently reverted.
--
-- This migration therefore adds a DATABASE-level trigger, which is a guarantee the RPC
-- cannot give, and it does NOT touch either RPC. Both writers coexist. The consequence is
-- deliberate and stated here so nobody reports it later as a bug: an admin editing a
-- provider through the UI will now produce the RPC's row AND one or two trigger rows (the
-- RPC issues a second UPDATE when a key is set or cleared). The rows are kept separable by
-- entity_type - see the naming rule below - so neither writer's history is polluted.
--
-- ---------------------------------------------------------------------------------------
-- WHAT THIS MIGRATION CHANGES
-- ---------------------------------------------------------------------------------------
--
--   1. CREATE OR REPLACE FUNCTION public.audit_ai_routing_change() - one trigger function
--      serving both tables, branching on TG_TABLE_NAME. One mechanism, not two.
--   2. CREATE TRIGGER trg_audit_ai_usage_routes  AFTER INSERT OR UPDATE OR DELETE
--   3. CREATE TRIGGER trg_audit_ai_providers     AFTER INSERT OR UPDATE OR DELETE
--
-- No table is created, altered or dropped. No row of `ai_usage_routes` or `ai_providers` is
-- read-modified-written by this migration. Nothing is deleted anywhere.
--
-- ---------------------------------------------------------------------------------------
-- WHAT IT DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------------------
--
-- * It does NOT touch `admin_upsert_ai_provider` / `admin_delete_ai_provider`. Removing
--   their audit write is an application change and is out of this migration's scope.
--
-- * It does NOT extend `public.is_valid_audit_entity_type(text)`. That function LOOKS like
--   the whitelist an audit writer must register with. It is dead, measured four ways:
--     - callers in pg_proc (prosrc ILIKE)                                  -> 0
--     - CHECK constraints referencing it                                   -> 0
--     - RLS policies referencing it                                        -> 0
--     - CHECK constraints of any kind on audit_logs.entity_type            -> 0
--       (audit_logs carries exactly two constraints: its PK and the actor_id FK)
--   The proof it is not merely unused but WRONG: the most common live entity_type,
--   `price_calculation_snapshots` with 8,372 rows, is not in its list. Adding two names to a
--   list that is already missing dozens would create the false impression that the list is
--   authoritative, which is the more expensive mistake. It is left exactly as it is, and the
--   fact that it is dead is recorded here instead. (Note in passing: 'ai_provider' is
--   already in that list; 'ai_usage_route' is not. Neither fact has any runtime effect.)
--
-- * It does NOT constrain grants on the new function. House style for audit trigger
--   functions is the default ACL - `audit_settlement_types`, `audit_daily_capital_inputs`
--   and `audit_credit_rule_change` all carry
--   `{=X/supabase_admin,anon=X,authenticated=X,service_role=X,postgres=X}`. A REVOKE would
--   buy nothing here: PostgreSQL refuses to call a `RETURNS trigger` function from SQL
--   ("trigger functions can only be called as triggers"), so the EXECUTE grant is not a
--   callable surface. If that judgement is ever reversed, the REVOKEs must come AFTER the
--   CREATE OR REPLACE, because CREATE OR REPLACE silently restores default grants.
--
-- * It does NOT record credential material. See the redaction rule below.
--
-- ---------------------------------------------------------------------------------------
-- WHO THE ACTOR IS - the part that is easy to get wrong
-- ---------------------------------------------------------------------------------------
--
-- `auth.uid()` is NULL on exactly the path this trigger exists to catch. The application's
-- own writer proves it: `src/lib/ai/providers.functions.ts:234` performs the route upsert
-- through `supabaseAdmin`, i.e. the `service_role` key, whose JWT carries no `sub`. A naive
-- `actor_id := auth.uid()` would therefore stamp NULL on every real admin edit made from the
-- AI settings screen - an audit row that records nothing for the normal case.
--
-- `audit_logs.actor_id` is `uuid REFERENCES auth.users(id)`, so there is no sentinel value
-- available; an unknown actor MUST be NULL. The trigger does three things about that:
--
--   1. It falls back to the row's own actor column when there is one. `ai_usage_routes`
--      carries `updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`, and the
--      application sets it explicitly (`updated_by: context.userId`) even though it writes
--      as service_role. That column is the real actor for the service-role path.
--      `ai_providers` has NO `updated_by` - only `created_by` - so `created_by` is used as
--      a fallback for INSERT only. Using it on UPDATE or DELETE would name the row's
--      CREATOR as the person who changed it, which is worse than recording nothing.
--
--   2. It records `actor_source` in the diff, so a reader always knows whether `actor_id`
--      came from the JWT ('jwt'), from the row ('row.updated_by' / 'row.created_by'), or
--      could not be determined ('unknown'). An actor that is asserted without saying where
--      it came from is not evidence.
--
--   3. When the actor is genuinely unknowable it records the DATABASE identity instead, in
--      `diff->'db_identity'`: `session_user` (the login role - `authenticator` for anything
--      arriving through PostgREST, `supabase_admin` or `postgres` for a direct psql
--      session), the SET ROLE target from `current_setting('role')`, and the `role` claim of
--      the JWT. Note `current_user` is deliberately NOT recorded: inside a SECURITY DEFINER
--      function it is always the function owner and says nothing about the caller.
--      That triple separates "PostgREST as service_role" from "PostgREST as authenticated"
--      from "somebody at a psql prompt", which is as far as the database can honestly go.
--
-- SO, PLAINLY: when the actor is unknowable, `actor_id` is NULL and the row still names the
-- database identity that made the change. It never guesses a user.
--
-- FK safety: if the resolved actor is not present in `auth.users` the trigger stores NULL in
-- `actor_id` and puts the rejected id in `diff->>'actor_id_unverified'`. Without that guard
-- a stale JWT for a deleted user would make the audit INSERT fail on the foreign key and
-- take the caller's UPDATE down with it. An audit trigger must never be the reason a
-- legitimate write fails.
--
-- ---------------------------------------------------------------------------------------
-- WHAT A READER OF A FUTURE audit_logs ROW WILL BE ABLE TO RECONSTRUCT
-- ---------------------------------------------------------------------------------------
--
-- From one row, with no joins and without the surrounding rows:
--
--   * WHICH table and WHICH row      - entity_type, entity_id (service_key / provider uuid)
--   * WHAT KIND of change            - action = insert | update | delete
--   * WHAT IT WAS BEFORE             - diff->'old', the complete prior row
--   * WHAT IT BECAME                 - diff->'new', the complete resulting row
--   * WHICH COLUMNS ACTUALLY MOVED   - diff->'changed', excluding the `updated_at` that
--                                      set_updated_at() bumps on every UPDATE
--   * WHO                            - actor_id + diff->>'actor_source', or db_identity
--   * WHEN                           - created_at
--
-- And for `ai_usage_routes` specifically, the two fields that make the OCR question
-- answerable at a glance rather than through a join into a table that may itself have
-- changed since:
--
--   * diff->>'provider_before' / 'provider_after'  - the provider NAME
--   * diff->>'provider_base_url_before' / '..._after' - the provider BASE URL
--
-- The base URL is the field that says whether receipt images stayed on the LAN. A row
-- reading `"provider_base_url_before": "http://192.168.170.8:11434"` next to
-- `"provider_base_url_after": "https://api.openai.com/v1"` is self-explanatory; a pair of
-- uuids is not. These are resolved AT TRIGGER TIME because that is the last moment the
-- provider row is guaranteed to still exist - `ai_usage_routes.provider_id` is
-- `ON DELETE SET NULL`, so deleting a provider silently NULLs the route, and the name would
-- be unrecoverable afterwards. When the lookup cannot resolve, the field is null and the
-- uuid remains legible in diff->'old' / diff->'new'.
--
-- ---------------------------------------------------------------------------------------
-- CREDENTIAL REDACTION - non-negotiable
-- ---------------------------------------------------------------------------------------
--
-- `ai_providers.key_prefix` holds up to 12 leading characters of the live API key
-- (`admin_upsert_ai_provider` sets it to `left(key, 6)`). `secret_id` points into
-- `vault.secrets`. NEITHER is copied into `diff`. Both keys are stripped from `old` and
-- `new` and replaced by three booleans that preserve every security-relevant fact without
-- the material:
--
--   has_key_before / has_key_after  - was a credential attached
--   key_changed                     - did the credential reference move
--
-- So "an unkeyed provider suddenly acquired a key" and "the key was swapped" remain
-- visible; the key does not. `audit_logs` is admin-read-only (policy `admins read audit
-- logs`), but that is a second line of defence, not a licence to store secrets in it.
--
-- ---------------------------------------------------------------------------------------
-- ENTITY_TYPE NAMING - why plural, and why it is not the RPC's 'ai_provider'
-- ---------------------------------------------------------------------------------------
--
-- The trigger writes entity_type = 'ai_usage_routes' and 'ai_providers' - the TABLE names.
-- The two existing trigger-written audit families use exactly that form
-- (`audit_settlement_types` -> 'settlement_types'; `audit_credit_rule_change` ->
-- 'credit_scoring_rules'), so this is house style, not invention. It also keeps these rows
-- cleanly separable from the RPC's singular 'ai_provider' rows, which means an admin edit
-- producing both does not look like one event recorded twice with contradictory detail.
-- `action` is `lower(TG_OP)` - insert / update / delete - matching
-- `audit_daily_capital_inputs`.
--
-- ---------------------------------------------------------------------------------------
-- WHAT WOULD BREAK IF THIS WERE WRONG
-- ---------------------------------------------------------------------------------------
--
-- The trigger sits in the write path of both tables, so a fault in it does not degrade
-- auditing - it BLOCKS the write. Specifically:
--
--   * An unhandled error in the trigger body aborts the caller's INSERT/UPDATE/DELETE. The
--     AI settings screen would stop saving, and any migration touching either table would
--     abort. This is why the actor is validated against `auth.users` before being stored,
--     and why the JWT claim is parsed inside an exception handler: those are the only two
--     inputs the trigger cannot control.
--   * If it were SECURITY INVOKER instead of DEFINER, the `audit_logs` INSERT would be
--     evaluated under the caller's RLS. The only INSERT policy on `audit_logs` is
--     `auth.uid() = actor_id`, which is false for a NULL actor - so the service_role path
--     this trigger exists to catch would fail closed and take the write with it. DEFINER
--     with owner `supabase_admin` (rolbypassrls = true) is load-bearing, not decoration.
--   * If `SET search_path TO 'public'` were dropped, a caller with a hostile search_path
--     could shadow `audit_logs`. Every audit trigger function in this database sets it.
--   * If the AFTER timing became BEFORE, `diff->'new'` would record values that a later
--     BEFORE trigger (`set_updated_at`) or a constraint could still change or reject, so
--     the audit row could describe a write that never landed.
--
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_ai_routing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old          jsonb;
  v_new          jsonb;
  v_entity_id    text;
  v_actor        uuid;
  v_actor_raw    uuid;
  v_actor_src    text;
  v_unverified   text := NULL;
  v_changed      jsonb;
  v_extra        jsonb := '{}'::jsonb;
  v_jwt_role     text  := NULL;
  v_set_role     text  := NULL;
  v_prov_old     uuid;
  v_prov_new     uuid;
  v_name_old     text;
  v_name_new     text;
  v_url_old      text;
  v_url_new      text;
BEGIN
  -- Build the row snapshots as jsonb FIRST. Everything below reads from these rather than
  -- from OLD/NEW directly, because PL/pgSQL raises "record is not assigned yet" if NEW is
  -- touched during DELETE (or OLD during INSERT), and branching on TG_OP for every field
  -- read is how that bug gets written.
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  -- ---- credential redaction, ai_providers only -------------------------------------
  IF TG_TABLE_NAME = 'ai_providers' THEN
    v_extra := v_extra || jsonb_build_object(
      'has_key_before', CASE WHEN v_old IS NULL THEN NULL ELSE (v_old->>'secret_id') IS NOT NULL END,
      'has_key_after',  CASE WHEN v_new IS NULL THEN NULL ELSE (v_new->>'secret_id') IS NOT NULL END,
      'key_changed',    CASE WHEN v_old IS NULL OR v_new IS NULL THEN NULL
                             ELSE (v_old->>'secret_id') IS DISTINCT FROM (v_new->>'secret_id')
                                  OR (v_old->>'key_prefix') IS DISTINCT FROM (v_new->>'key_prefix')
                        END
    );
    IF v_old IS NOT NULL THEN v_old := v_old - 'secret_id' - 'key_prefix'; END IF;
    IF v_new IS NOT NULL THEN v_new := v_new - 'secret_id' - 'key_prefix'; END IF;
  END IF;

  -- ---- entity_id -------------------------------------------------------------------
  -- ai_usage_routes is keyed by service_key (text, PRIMARY KEY); ai_providers by id (uuid).
  -- There is no `id` column on ai_usage_routes, so a COALESCE(NEW.id, OLD.id) shape - the
  -- one audit_daily_capital_inputs uses - would not even compile against it.
  IF TG_TABLE_NAME = 'ai_usage_routes' THEN
    v_entity_id := coalesce(v_new->>'service_key', v_old->>'service_key');
  ELSE
    v_entity_id := coalesce(v_new->>'id', v_old->>'id');
  END IF;

  -- ---- actor ------------------------------------------------------------------------
  v_actor_raw := auth.uid();
  IF v_actor_raw IS NOT NULL THEN
    v_actor_src := 'jwt';
  ELSIF TG_TABLE_NAME = 'ai_usage_routes' THEN
    -- The application writes this column explicitly even when writing as service_role.
    v_actor_raw := nullif(coalesce(v_new->>'updated_by', v_old->>'updated_by'), '')::uuid;
    v_actor_src := CASE WHEN v_actor_raw IS NULL THEN 'unknown' ELSE 'row.updated_by' END;
  ELSIF TG_OP = 'INSERT' THEN
    -- ai_providers has no updated_by. created_by is only honest on INSERT.
    v_actor_raw := nullif(v_new->>'created_by', '')::uuid;
    v_actor_src := CASE WHEN v_actor_raw IS NULL THEN 'unknown' ELSE 'row.created_by' END;
  ELSE
    v_actor_src := 'unknown';
  END IF;

  -- actor_id is FK -> auth.users(id). Never let a stale or synthetic id abort the caller's
  -- write; record it as text instead and leave actor_id NULL.
  IF v_actor_raw IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_actor_raw) THEN
      v_actor := v_actor_raw;
    ELSE
      v_unverified := v_actor_raw::text;
      v_actor_src  := v_actor_src || ':not-a-user';
    END IF;
  END IF;

  -- ---- database identity, always recorded -------------------------------------------
  -- current_user is NOT recorded: inside SECURITY DEFINER it is always this function's
  -- owner and describes the trigger, not the caller.
  BEGIN
    v_jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  EXCEPTION WHEN others THEN
    v_jwt_role := NULL;   -- claims absent or not JSON; a direct psql session, typically
  END;
  v_set_role := nullif(current_setting('role', true), '');

  -- ---- which columns actually moved --------------------------------------------------
  -- updated_at is excluded: set_updated_at() bumps it on every UPDATE, so leaving it in
  -- would make `changed` non-empty for a write that changed nothing a reader cares about.
  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(jsonb_agg(e.key ORDER BY e.key), '[]'::jsonb)
      INTO v_changed
      FROM jsonb_each(v_new) e
     WHERE e.key <> 'updated_at'
       AND v_old->e.key IS DISTINCT FROM e.value;
  END IF;

  -- ---- readable provider identity for route rows --------------------------------------
  IF TG_TABLE_NAME = 'ai_usage_routes' THEN
    v_prov_old := nullif(v_old->>'provider_id', '')::uuid;
    v_prov_new := nullif(v_new->>'provider_id', '')::uuid;
    IF v_prov_old IS NOT NULL THEN
      SELECT p.name, p.base_url INTO v_name_old, v_url_old
        FROM public.ai_providers p WHERE p.id = v_prov_old;
    END IF;
    IF v_prov_new IS NOT NULL THEN
      SELECT p.name, p.base_url INTO v_name_new, v_url_new
        FROM public.ai_providers p WHERE p.id = v_prov_new;
    END IF;
    v_extra := v_extra || jsonb_build_object(
      'provider_before',          v_name_old,
      'provider_after',           v_name_new,
      'provider_base_url_before', v_url_old,
      'provider_base_url_after',  v_url_new
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    v_actor,
    TG_TABLE_NAME,
    v_entity_id,
    lower(TG_OP),
    jsonb_build_object(
      'table',                 TG_TABLE_NAME,
      'op',                    TG_OP,
      'old',                   v_old,
      'new',                   v_new,
      'changed',               v_changed,
      'actor_source',          v_actor_src,
      'actor_id_unverified',   v_unverified,
      'db_identity', jsonb_build_object(
        'session_user', session_user,
        'set_role',     v_set_role,
        'jwt_role',     v_jwt_role
      )
    ) || v_extra
  );

  -- AFTER trigger: the return value is ignored, but returning the row keeps the shape
  -- consistent with every other audit trigger in this database.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.audit_ai_routing_change() IS
  'Migration 475. AFTER-row audit trigger for ai_usage_routes and ai_providers. Writes one '
  'audit_logs row per change carrying the complete before and after state, the columns that '
  'moved, the actor (JWT, else the row''s own updated_by/created_by, else NULL plus the '
  'database identity), and the resolved provider name and base URL for route rows. '
  'Credential columns secret_id and key_prefix are stripped and replaced by presence '
  'booleans. See the migration header for why it does not extend is_valid_audit_entity_type.';

DROP TRIGGER IF EXISTS trg_audit_ai_usage_routes ON public.ai_usage_routes;
CREATE TRIGGER trg_audit_ai_usage_routes
  AFTER INSERT OR UPDATE OR DELETE ON public.ai_usage_routes
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_routing_change();

DROP TRIGGER IF EXISTS trg_audit_ai_providers ON public.ai_providers;
CREATE TRIGGER trg_audit_ai_providers
  AFTER INSERT OR UPDATE OR DELETE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_routing_change();

-- ---------------------------------------------------------------------------------------
-- Verification, in the SAME transaction, re-read from the catalogue rather than trusting
-- the statements above. This block writes NOTHING to either table: the behavioural proof is
-- run separately inside an explicit BEGIN ... ROLLBACK, because migration 475 must not
-- modify a single row of the two tables it protects.
-- ---------------------------------------------------------------------------------------
DO $verify$
DECLARE
  v_n     int;
  v_def   text;
BEGIN
  -- 1. The function exists, is DEFINER, is owned by a role that can write past the
  --    audit_logs RLS, and pins its search_path.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'audit_ai_routing_change';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '475 VERIFY: expected exactly 1 audit_ai_routing_change function, found %', v_n;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'audit_ai_routing_change';
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION '475 VERIFY: audit_ai_routing_change is not SECURITY DEFINER; the audit_logs INSERT would be evaluated under the caller RLS and a NULL-actor write would fail closed';
  END IF;
  IF v_def NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION '475 VERIFY: audit_ai_routing_change does not pin search_path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.proname = 'audit_ai_routing_change' AND r.rolbypassrls
  ) THEN
    RAISE EXCEPTION '475 VERIFY: audit_ai_routing_change is owned by a role without BYPASSRLS; the only INSERT policy on audit_logs is auth.uid() = actor_id, which a NULL actor fails';
  END IF;

  -- 2. Exactly one audit trigger on each table, AFTER, FOR EACH ROW, covering all three ops.
  FOR v_def IN
    SELECT pg_get_triggerdef(t.oid)
      FROM pg_trigger t
     WHERE NOT t.tgisinternal
       AND t.tgname IN ('trg_audit_ai_usage_routes','trg_audit_ai_providers')
  LOOP
    IF v_def NOT LIKE '%AFTER INSERT OR DELETE OR UPDATE%'
       AND v_def NOT LIKE '%AFTER INSERT OR UPDATE OR DELETE%' THEN
      RAISE EXCEPTION '475 VERIFY: trigger does not cover all three operations: %', v_def;
    END IF;
    IF v_def NOT LIKE '%FOR EACH ROW%' THEN
      RAISE EXCEPTION '475 VERIFY: trigger is not FOR EACH ROW: %', v_def;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.ai_usage_routes'::regclass, 'public.ai_providers'::regclass)
     AND t.tgfoid = 'public.audit_ai_routing_change()'::regprocedure;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '475 VERIFY: expected 2 audit triggers across the two tables, found %', v_n;
  END IF;

  -- 3. The pre-existing set_updated_at triggers must still be there. This migration adds a
  --    mechanism; it does not replace one.
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgname IN ('trg_ai_usage_routes_updated_at','trg_ai_providers_updated_at');
  IF v_n <> 2 THEN
    RAISE EXCEPTION '475 VERIFY: the two set_updated_at triggers are no longer both present (found %); 475 must not disturb them', v_n;
  END IF;

  -- 4. The OCR pin that motivated this row is untouched by this migration.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_usage_routes r
      JOIN public.ai_providers p ON p.id = r.provider_id
     WHERE r.service_key = 'receipt_ocr.vision'
       AND r.capability = 'vision'
       AND r.is_enabled
       AND NOT r.fallback_enabled
       AND p.kind = 'ollama'
       AND p.base_url LIKE 'http://192.168.170.8:11434%'
  ) THEN
    RAISE EXCEPTION '475 VERIFY: receipt_ocr.vision is no longer pinned, enabled and fallback-off against the LAN Ollama provider. 475 does not write to this table, so this means the state changed underneath it - stop and investigate before trusting the audit trail';
  END IF;

  RAISE NOTICE '475 VERIFY: audit_ai_routing_change installed on ai_usage_routes and ai_providers; set_updated_at triggers intact; receipt_ocr.vision still pinned to the LAN Ollama provider';
END
$verify$;
