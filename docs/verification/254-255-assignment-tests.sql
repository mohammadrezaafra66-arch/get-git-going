SET client_encoding='UTF8';
-- =============================================================================
-- Issue 219 / C4.3 — purchase request assignment: database + security
-- Everything runs inside a transaction that is ROLLED BACK.
--
-- Role fixtures matter here. The database has ZERO users with the
-- purchase_specialist role, so the specialist steps of the chain cannot be
-- tested without creating one. That grant happens inside this transaction and
-- disappears with the ROLLBACK: no real user's roles are changed permanently.
-- The same applies to the default-assignee setting, which is written and
-- restored by the rollback rather than by cleanup code that could itself fail.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE t(seq serial, name text, passed boolean, detail text);
CREATE TEMP TABLE fx(k text PRIMARY KEY, v text);

-- ---- actors, resolved from live data ----------------------------------------
INSERT INTO fx VALUES ('admin','05098088-2849-43f4-8eb5-7c473c3832ec');

INSERT INTO fx SELECT 'manager', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='manager' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id AND x.role='admin') LIMIT 1;

-- A PURE sales account. Several users hold sales AND admin; picking one of
-- those would satisfy every permission check through the admin branch and make
-- the "sales is refused" assertions meaningless.
INSERT INTO fx SELECT 'sales', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='sales' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id AND x.role IN ('admin','manager','purchase_specialist'))
 LIMIT 1;

INSERT INTO fx SELECT 'accountant', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='accountant' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id AND x.role IN ('admin','manager','purchase_specialist'))
 LIMIT 1;

-- Active on purpose: an inactive viewer would be refused by the activity check
-- before the role check ever ran, and the test would pass for the wrong reason.
INSERT INTO fx SELECT 'viewer', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role='viewer' AND p.is_active AND p.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=ur.user_id AND x.role IN ('admin','manager','purchase_specialist'))
 LIMIT 1;

-- An inactive account that WOULD otherwise qualify by role, so the test proves
-- the activity check fires rather than the role check.
INSERT INTO fx SELECT 'inactive_admin', ur.user_id::text FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.role IN ('admin','manager') AND (NOT p.is_active OR p.status <> 'active') LIMIT 1;

-- The specialist fixture: an otherwise-unprivileged active account, granted the
-- role for the duration of this transaction only.
--
-- It must NOT be one of the accounts already chosen above. Without that
-- exclusion the specialist grant can land on the very user the suite is using
-- as its "pure sales" example, and every "a salesperson may not be the
-- assignee" test then passes them — because they really are a specialist now.
INSERT INTO fx SELECT 'spec', p.id::text FROM public.profiles p
 WHERE p.is_active AND p.status='active'
   AND p.id::text NOT IN (SELECT v FROM fx)
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=p.id AND x.role IN ('admin','manager'))
 ORDER BY p.created_at, p.id LIMIT 1;

INSERT INTO public.user_roles(user_id, role)
SELECT v::uuid, 'purchase_specialist' FROM fx WHERE k='spec'
ON CONFLICT DO NOTHING;

-- A second specialist, so "deterministic choice" means something.
INSERT INTO fx SELECT 'spec2', p.id::text FROM public.profiles p
 WHERE p.is_active AND p.status='active'
   AND p.id::text NOT IN (SELECT v FROM fx)
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id=p.id AND x.role IN ('admin','manager'))
 ORDER BY p.created_at DESC, p.id DESC LIMIT 1;

INSERT INTO public.user_roles(user_id, role)
SELECT v::uuid, 'purchase_specialist' FROM fx WHERE k='spec2'
ON CONFLICT DO NOTHING;

INSERT INTO fx SELECT 'product', id::text FROM public.products WHERE status='active' LIMIT 1;

-- ---- helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.act(role_key text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _u text;
BEGIN
  SELECT v INTO _u FROM fx WHERE k = role_key;
  IF _u IS NULL THEN RAISE EXCEPTION 'no fixture actor %', role_key; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_u,'role','authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(label text, hint_expected text, body text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _h text; _s text;
BEGIN
  BEGIN
    EXECUTE body;
    INSERT INTO t(name,passed,detail) VALUES (label,false,'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _h = PG_EXCEPTION_HINT, _s = RETURNED_SQLSTATE;
    INSERT INTO t(name,passed,detail)
      VALUES (label, _h = hint_expected, 'sqlstate='||_s||' hint='||COALESCE(_h,'<none>'));
  END;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.mkreq(assignee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  SELECT public.create_purchase_request(
           (SELECT v FROM fx WHERE k='product')::uuid, 3, 'عدد',
           NULL, 'C4TEST', NULL, assignee) INTO _r;
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.setdefault(u uuid) RETURNS void
LANGUAGE sql AS $$
  UPDATE public.shop_settings SET value = COALESCE(u::text,'')
   WHERE key = 'default_purchase_assignee_id';
$$;

-- Not every fixture exists on every database. This one in particular: the only
-- account holding `viewer` also holds a privileged role, so there is no pure
-- viewer to test with. A missing fixture is reported as a skip; it must not
-- abort the transaction and take the other 55 assertions down with it.
CREATE OR REPLACE FUNCTION pg_temp.have(role_key text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM fx WHERE k = role_key AND v IS NOT NULL);
$$;

-- A snapshot of every request's owner, taken before a single test has written
-- anything. Section K compares against this instead of counting rows and hoping
-- the number means something.
CREATE TEMP TABLE snap AS
  SELECT id, assigned_to FROM public.purchase_requests;

-- =============================================================================
-- A. the old behaviour is gone
-- =============================================================================
DO $$
DECLARE _src text; _first_mgr uuid; _assignee uuid; _req_txt text;
BEGIN
  PERFORM pg_temp.setdefault(NULL);
  -- remove every specialist so the chain must reach step 4
  DELETE FROM public.user_roles WHERE role='purchase_specialist';

  SELECT p.id INTO _first_mgr
    FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id
   WHERE p.is_active AND ur.role='manager' ORDER BY p.created_at ASC LIMIT 1;

  PERFORM pg_temp.act('sales');
  -- One call, read twice. Calling mkreq() once per column would create TWO
  -- requests and double every notification counted by A2/A3.
  SELECT (r->>'assignment_source'), (r->>'assigned_to')::uuid, (r->>'request_id')
    INTO _src, _assignee, _req_txt
    FROM (SELECT pg_temp.mkreq() AS r) s;
  INSERT INTO fx VALUES ('req_a', _req_txt);

  INSERT INTO t(name,passed,detail) VALUES
    ('A1 no default, no specialist -> unassigned, NOT the first manager',
     _src='unassigned' AND _assignee IS NULL AND _first_mgr IS NOT NULL,
     'source='||_src||' assignee='||COALESCE(_assignee::text,'NULL')
     ||' (old code would have picked '||COALESCE(_first_mgr::text,'?')||')');
END $$;

DO $$
DECLARE _n int;
BEGIN
  -- Scoped to THIS request. An unscoped count sweeps in every unassigned
  -- request the e2e runs have ever created, and the number stops meaning
  -- anything about the behaviour under test.
  SELECT COUNT(*) INTO _n FROM public.notification_events
   WHERE event_type='purchase_request_unassigned'
     AND payload->>'reference_id' = (SELECT v FROM fx WHERE k='req_a');
  INSERT INTO t(name,passed,detail) VALUES
    ('A2 unassigned request notifies every active admin/manager', _n >= 2, 'notifications='||_n);
END $$;

DO $$
DECLARE _n int; _expected int;
BEGIN
  SELECT COUNT(DISTINCT p.id) INTO _expected FROM public.profiles p
   WHERE p.is_active AND p.status='active'
     AND public.has_any_role(p.id, ARRAY['admin','manager']::text[]);
  SELECT COUNT(*) INTO _n FROM public.notification_events
   WHERE event_type='purchase_request_unassigned'
     AND payload->>'reference_id' = (SELECT v FROM fx WHERE k='req_a');
  INSERT INTO t(name,passed,detail) VALUES
    ('A3 exactly one notification per manager, no duplicates', _n = _expected,
     'sent='||_n||' active managers='||_expected);
END $$;

-- restore the specialist fixtures for the rest of the suite
INSERT INTO public.user_roles(user_id, role)
SELECT v::uuid, 'purchase_specialist' FROM fx WHERE k IN ('spec','spec2')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- B. the resolution chain
-- =============================================================================
DO $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.setdefault(NULL);
  PERFORM pg_temp.act('sales');
  _r := pg_temp.mkreq();
  INSERT INTO t(name,passed,detail) VALUES
    ('B1 no default -> falls back to an active purchase_specialist',
     _r->>'assignment_source'='purchase_specialist_fallback'
     AND (_r->>'assigned_to') IS NOT NULL,
     'source='||(_r->>'assignment_source')||' assignee='||COALESCE(_r->>'assigned_to','NULL'));
END $$;

DO $$
DECLARE _r jsonb; _expected uuid;
BEGIN
  -- the deterministic winner: ORDER BY created_at, id
  SELECT p.id INTO _expected FROM public.profiles p
   WHERE p.is_active AND p.status='active'
     AND public.has_any_role(p.id, ARRAY['purchase_specialist']::text[])
   ORDER BY p.created_at, p.id LIMIT 1;

  PERFORM pg_temp.act('sales');
  _r := pg_temp.mkreq();
  INSERT INTO t(name,passed,detail) VALUES
    ('B2 the specialist fallback is deterministic (created_at, id)',
     (_r->>'assigned_to')::uuid = _expected,
     'got='||COALESCE(_r->>'assigned_to','NULL')||' expected='||COALESCE(_expected::text,'NULL'));
END $$;

DO $$
DECLARE _r jsonb; _def uuid;
BEGIN
  SELECT v::uuid INTO _def FROM fx WHERE k='manager';
  PERFORM pg_temp.setdefault(_def);
  PERFORM pg_temp.act('sales');
  _r := pg_temp.mkreq();
  INSERT INTO t(name,passed,detail) VALUES
    ('B3 a valid default wins over the specialist fallback',
     _r->>'assignment_source'='default_setting' AND (_r->>'assigned_to')::uuid=_def,
     'source='||(_r->>'assignment_source')||' assignee='||COALESCE(_r->>'assigned_to','NULL'));
END $$;

DO $$
DECLARE _n0 int; _n1 int; _r jsonb;
BEGIN
  -- a default pointing at an inactive user must not break anything
  PERFORM pg_temp.setdefault((SELECT v::uuid FROM fx WHERE k='inactive_admin'));
  SELECT COUNT(*) INTO _n0 FROM public.audit_logs
   WHERE action='default_purchase_assignee_invalid';
  PERFORM pg_temp.act('sales');
  _r := pg_temp.mkreq();
  SELECT COUNT(*) INTO _n1 FROM public.audit_logs
   WHERE action='default_purchase_assignee_invalid';
  INSERT INTO t(name,passed,detail) VALUES
    ('B4 an inactive default is skipped, request still created, warning audited',
     _r->>'assignment_source'='purchase_specialist_fallback' AND _n1=_n0+1,
     'source='||(_r->>'assignment_source')||' warnings '||_n0||'->'||_n1);
END $$;

DO $$
DECLARE _r jsonb; _n0 int; _n1 int;
BEGIN
  -- a default pointing at a pure sales user: valid uuid, wrong role
  PERFORM pg_temp.setdefault((SELECT v::uuid FROM fx WHERE k='sales'));
  SELECT COUNT(*) INTO _n0 FROM public.audit_logs
   WHERE action='default_purchase_assignee_invalid';
  PERFORM pg_temp.act('sales');
  _r := pg_temp.mkreq();
  SELECT COUNT(*) INTO _n1 FROM public.audit_logs
   WHERE action='default_purchase_assignee_invalid';
  INSERT INTO t(name,passed,detail) VALUES
    ('B5 a default with an invalid role is skipped and audited',
     _r->>'assignment_source'='purchase_specialist_fallback' AND _n1=_n0+1,
     'source='||(_r->>'assignment_source')||' warnings '||_n0||'->'||_n1);
END $$;

DO $$
DECLARE _r jsonb;
BEGIN
  -- garbage in the settings cell must not raise
  UPDATE public.shop_settings SET value='not-a-uuid'
   WHERE key='default_purchase_assignee_id';
  PERFORM pg_temp.act('sales');
  _r := pg_temp.mkreq();
  INSERT INTO t(name,passed,detail) VALUES
    ('B6 a malformed default value does not break request creation',
     _r->>'assignment_source'='purchase_specialist_fallback',
     'source='||(_r->>'assignment_source'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t(name,passed,detail) VALUES
    ('B6 a malformed default value does not break request creation', false, SQLERRM);
END $$;

-- =============================================================================
-- C. explicit assignment at creation time
-- =============================================================================
DO $$
DECLARE _r jsonb; _target uuid;
BEGIN
  PERFORM pg_temp.setdefault(NULL);
  SELECT v::uuid INTO _target FROM fx WHERE k='spec';
  PERFORM pg_temp.act('admin');
  _r := pg_temp.mkreq(_target);
  INSERT INTO t(name,passed,detail) VALUES
    ('C1 admin may name the assignee explicitly',
     _r->>'assignment_source'='explicit' AND (_r->>'assigned_to')::uuid=_target,
     'source='||(_r->>'assignment_source'));
END $$;

DO $$
DECLARE _r jsonb; _target uuid;
BEGIN
  SELECT v::uuid INTO _target FROM fx WHERE k='spec';
  PERFORM pg_temp.act('manager');
  _r := pg_temp.mkreq(_target);
  INSERT INTO t(name,passed,detail) VALUES
    ('C2 manager may name the assignee explicitly',
     _r->>'assignment_source'='explicit' AND (_r->>'assigned_to')::uuid=_target,
     'source='||(_r->>'assignment_source'));
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_fail(
    'C3 sales cannot choose the assignee','ASSIGN_PERMISSION_DENIED',
    'SELECT pg_temp.mkreq((SELECT v FROM fx WHERE k=''spec'')::uuid)');
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('admin');
  PERFORM pg_temp.expect_fail(
    'C4 a pure sales user cannot be the assignee','ASSIGNEE_ROLE_INVALID',
    'SELECT pg_temp.mkreq((SELECT v FROM fx WHERE k=''sales'')::uuid)');
  PERFORM pg_temp.expect_fail(
    'C5 a pure accountant cannot be the assignee','ASSIGNEE_ROLE_INVALID',
    'SELECT pg_temp.mkreq((SELECT v FROM fx WHERE k=''accountant'')::uuid)');
  IF pg_temp.have('viewer') THEN
    PERFORM pg_temp.expect_fail(
      'C6 a viewer cannot be the assignee','ASSIGNEE_ROLE_INVALID',
      'SELECT pg_temp.mkreq((SELECT v FROM fx WHERE k=''viewer'')::uuid)');
  ELSE
    INSERT INTO t(name,passed,detail) VALUES
      ('C6 a viewer cannot be the assignee', true,
       'skipped: no active account holds viewer without a privileged role');
  END IF;
  PERFORM pg_temp.expect_fail(
    'C7 an inactive user cannot be the assignee','ASSIGNEE_INACTIVE',
    'SELECT pg_temp.mkreq((SELECT v FROM fx WHERE k=''inactive_admin'')::uuid)');
  PERFORM pg_temp.expect_fail(
    'C8 an unknown user cannot be the assignee','ASSIGNEE_NOT_FOUND',
    'SELECT pg_temp.mkreq(gen_random_uuid())');
END $$;

DO $$
DECLARE _r jsonb; _combo uuid;
BEGIN
  -- a combined-role user qualifies through any one of their roles
  SELECT ur.user_id INTO _combo FROM public.user_roles ur
    JOIN public.profiles p ON p.id=ur.user_id
   WHERE ur.role='sales' AND p.is_active AND p.status='active'
     AND EXISTS (SELECT 1 FROM public.user_roles x
                  WHERE x.user_id=ur.user_id AND x.role IN ('admin','manager'))
   LIMIT 1;
  IF _combo IS NULL THEN
    INSERT INTO t(name,passed,detail) VALUES
      ('C9 a combined-role user is a valid assignee', true, 'skipped: no combined-role user');
  ELSE
    PERFORM pg_temp.act('admin');
    _r := pg_temp.mkreq(_combo);
    INSERT INTO t(name,passed,detail) VALUES
      ('C9 a combined-role user is a valid assignee',
       (_r->>'assigned_to')::uuid=_combo, 'assignee='||COALESCE(_r->>'assigned_to','NULL'));
  END IF;
END $$;

-- =============================================================================
-- D. assign / reassign / unassign
-- =============================================================================
DO $$
DECLARE _req uuid; _r jsonb; _a uuid;
BEGIN
  PERFORM pg_temp.setdefault(NULL);
  -- spec2, deliberately: with no default configured the request is born
  -- assigned to spec by the specialist fallback, so assigning it to spec again
  -- would be a no-op and would prove nothing about assignment.
  SELECT v::uuid INTO _a FROM fx WHERE k='spec2';
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;

  PERFORM pg_temp.act('manager');
  _r := public.assign_purchase_request(_req, _a);
  INSERT INTO fx VALUES ('req_d', _req::text);
  INSERT INTO t(name,passed,detail) VALUES
    ('D1 a manager can assign a request',
     (_r->>'changed')::boolean AND (_r->'new_assignee'->>'id')::uuid=_a,
     'changed='||(_r->>'changed')||' to='||COALESCE(_r->'new_assignee'->>'id','NULL'));
END $$;

DO $$
DECLARE _r jsonb; _req uuid; _b uuid; _n0 int; _n1 int;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  -- back to spec: D1 left the request with spec2, so this is a real move
  SELECT v::uuid INTO _b FROM fx WHERE k='spec';
  SELECT COUNT(*) INTO _n0 FROM public.audit_logs
   WHERE entity_id=_req::text AND action='purchase_request_assigned';
  PERFORM pg_temp.act('manager');
  _r := public.assign_purchase_request(_req, _b, 'تغییر مسئول');
  SELECT COUNT(*) INTO _n1 FROM public.audit_logs
   WHERE entity_id=_req::text AND action='purchase_request_assigned';
  INSERT INTO t(name,passed,detail) VALUES
    ('D2 reassignment moves the request and audits exactly once',
     (_r->>'changed')::boolean AND (_r->'new_assignee'->>'id')::uuid=_b AND _n1=_n0+1,
     'to='||COALESCE(_r->'new_assignee'->>'id','NULL')||' audits '||_n0||'->'||_n1);
END $$;

DO $$
DECLARE _r jsonb; _req uuid; _b uuid; _a0 int; _a1 int; _e0 int; _e1 int;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  -- whoever D2 just set: re-sending the same value must change nothing
  SELECT v::uuid INTO _b FROM fx WHERE k='spec';
  SELECT COUNT(*) INTO _a0 FROM public.audit_logs WHERE entity_id=_req::text;
  SELECT COUNT(*) INTO _e0 FROM public.notification_events
   WHERE payload->>'reference_id'=_req::text;

  PERFORM pg_temp.act('manager');
  _r := public.assign_purchase_request(_req, _b);   -- same person again

  SELECT COUNT(*) INTO _a1 FROM public.audit_logs WHERE entity_id=_req::text;
  SELECT COUNT(*) INTO _e1 FROM public.notification_events
   WHERE payload->>'reference_id'=_req::text;

  INSERT INTO t(name,passed,detail) VALUES
    ('D3 reassigning to the same person is a no-op: no audit, no notification',
     (_r->>'changed')::boolean = false AND _a1=_a0 AND _e1=_e0,
     'changed='||(_r->>'changed')||' audits '||_a0||'->'||_a1||' events '||_e0||'->'||_e1);
END $$;

DO $$
DECLARE _r jsonb; _req uuid; _n int;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  PERFORM pg_temp.act('manager');
  _r := public.assign_purchase_request(_req, NULL, 'برداشتن مسئول');
  SELECT COUNT(*) INTO _n FROM public.audit_logs
   WHERE entity_id=_req::text AND action='purchase_request_unassigned';
  INSERT INTO t(name,passed,detail) VALUES
    ('D4 unassign clears the owner and is audited as an unassignment',
     (_r->>'is_unassigned')::boolean AND _n=1,
     'is_unassigned='||(_r->>'is_unassigned')||' audits='||_n);
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_fail('D5 sales cannot assign','ASSIGN_PERMISSION_DENIED',
    format('SELECT public.assign_purchase_request(%L::uuid, (SELECT v FROM fx WHERE k=''spec'')::uuid)', _req));
  PERFORM pg_temp.act('accountant');
  PERFORM pg_temp.expect_fail('D6 accountant cannot assign','ASSIGN_PERMISSION_DENIED',
    format('SELECT public.assign_purchase_request(%L::uuid, (SELECT v FROM fx WHERE k=''spec'')::uuid)', _req));
  IF pg_temp.have('viewer') THEN
    PERFORM pg_temp.act('viewer');
    PERFORM pg_temp.expect_fail('D7 viewer cannot assign','ASSIGN_PERMISSION_DENIED',
      format('SELECT public.assign_purchase_request(%L::uuid, (SELECT v FROM fx WHERE k=''spec'')::uuid)', _req));
  ELSE
    INSERT INTO t(name,passed,detail) VALUES
      ('D7 viewer cannot assign', true, 'skipped: no pure viewer account exists');
  END IF;
  PERFORM pg_temp.act('spec');
  PERFORM pg_temp.expect_fail('D8 a purchase_specialist cannot self-assign','ASSIGN_PERMISSION_DENIED',
    format('SELECT public.assign_purchase_request(%L::uuid, (SELECT v FROM fx WHERE k=''spec'')::uuid)', _req));
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('manager');
  PERFORM pg_temp.expect_fail('D9 an unknown request is rejected','REQUEST_NOT_FOUND',
    'SELECT public.assign_purchase_request(gen_random_uuid(), (SELECT v FROM fx WHERE k=''spec'')::uuid)');
  PERFORM pg_temp.expect_fail('D10 an unknown assignee is rejected','ASSIGNEE_NOT_FOUND',
    format('SELECT public.assign_purchase_request(%L::uuid, gen_random_uuid())',
           (SELECT v FROM fx WHERE k='req_d')));
  PERFORM pg_temp.expect_fail('D11 an inactive assignee is rejected','ASSIGNEE_INACTIVE',
    format('SELECT public.assign_purchase_request(%L::uuid, (SELECT v FROM fx WHERE k=''inactive_admin'')::uuid)',
           (SELECT v FROM fx WHERE k='req_d')));
  PERFORM pg_temp.expect_fail('D12 an invalid-role assignee is rejected','ASSIGNEE_ROLE_INVALID',
    format('SELECT public.assign_purchase_request(%L::uuid, (SELECT v FROM fx WHERE k=''sales'')::uuid)',
           (SELECT v FROM fx WHERE k='req_d')));
END $$;

-- =============================================================================
-- E. concurrency — the lost update
-- =============================================================================
DO $$
DECLARE _req uuid; _a uuid; _b uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  SELECT v::uuid INTO _a FROM fx WHERE k='spec';
  SELECT v::uuid INTO _b FROM fx WHERE k='spec2';

  PERFORM pg_temp.act('manager');
  PERFORM public.assign_purchase_request(_req, _a);   -- current owner is now A

  -- a second manager whose dialog still believes the owner is nobody
  PERFORM pg_temp.expect_fail('E1 a stale expected-assignee is refused','ASSIGNMENT_CONFLICT',
    format('SELECT public.assign_purchase_request(%L::uuid, %L::uuid, NULL, NULL, true)', _req, _b));
END $$;

DO $$
DECLARE _req uuid; _a uuid; _b uuid; _r jsonb; _owner uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  SELECT v::uuid INTO _a FROM fx WHERE k='spec';
  SELECT v::uuid INTO _b FROM fx WHERE k='spec2';
  PERFORM pg_temp.act('manager');
  -- the same call with the CORRECT expectation succeeds
  _r := public.assign_purchase_request(_req, _b, NULL, _a, true);
  SELECT assigned_to INTO _owner FROM public.purchase_requests WHERE id=_req;
  INSERT INTO t(name,passed,detail) VALUES
    ('E2 a correct expected-assignee is accepted',
     (_r->>'changed')::boolean AND _owner=_b,
     'owner='||COALESCE(_owner::text,'NULL'));
END $$;

DO $$
DECLARE _req uuid; _owner uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  -- the first manager's change was NOT silently overwritten by E1
  SELECT assigned_to INTO _owner FROM public.purchase_requests WHERE id=_req;
  INSERT INTO t(name,passed,detail) VALUES
    ('E3 the refused call left the row exactly as the winner set it',
     _owner = (SELECT v::uuid FROM fx WHERE k='spec2'),
     'owner='||COALESCE(_owner::text,'NULL'));
END $$;

DO $$
DECLARE _req uuid; _r jsonb;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_d';
  PERFORM pg_temp.act('manager');
  -- omitting the expectation entirely still works: not every caller has one
  _r := public.assign_purchase_request(_req, (SELECT v::uuid FROM fx WHERE k='spec'));
  INSERT INTO t(name,passed,detail) VALUES
    ('E4 omitting the expectation skips the conflict check', (_r->>'changed')::boolean,
     'changed='||(_r->>'changed'));
END $$;

-- =============================================================================
-- F. a cancelled request
-- =============================================================================
DO $$
DECLARE _req uuid;
BEGIN
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='cancelled' WHERE id=_req;
  PERFORM pg_temp.act('manager');
  PERFORM pg_temp.expect_fail('F1 a cancelled request cannot be reassigned','REQUEST_CANCELLED',
    format('SELECT public.assign_purchase_request(%L::uuid, (SELECT v FROM fx WHERE k=''spec'')::uuid)', _req));
END $$;

DO $$
DECLARE _req uuid; _r jsonb;
BEGIN
  -- a legacy request is ordinary open work and stays assignable
  SELECT id INTO _req FROM public.purchase_requests
   WHERE legacy_no_fulfillment AND status <> 'cancelled' LIMIT 1;
  IF _req IS NULL THEN
    INSERT INTO t(name,passed,detail) VALUES
      ('F2 a legacy request is still assignable', true, 'skipped: no open legacy request');
  ELSE
    PERFORM pg_temp.act('manager');
    _r := public.assign_purchase_request(_req, (SELECT v::uuid FROM fx WHERE k='spec'));
    INSERT INTO fx VALUES ('req_legacy', _req::text);
    INSERT INTO t(name,passed,detail) VALUES
      ('F2 a legacy request is still assignable', (_r->>'request_id') IS NOT NULL,
       'changed='||(_r->>'changed'));
  END IF;
END $$;

-- =============================================================================
-- G. the C3 purchase flow follows the assignment
-- =============================================================================
DO $$
DECLARE _req uuid; _a uuid; _b uuid;
BEGIN
  PERFORM pg_temp.setdefault(NULL);
  SELECT v::uuid INTO _a FROM fx WHERE k='spec';
  SELECT v::uuid INTO _b FROM fx WHERE k='spec2';
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET status='approved' WHERE id=_req;
  PERFORM pg_temp.act('manager');
  PERFORM public.assign_purchase_request(_req, _a);
  INSERT INTO fx VALUES ('req_g', _req::text);

  -- the person who is NOT the assignee is refused
  PERFORM pg_temp.act('spec2');
  PERFORM pg_temp.expect_fail('G1 a non-assignee specialist cannot purchase','NOT_ASSIGNED',
    format('SELECT public.create_purchase(
              (SELECT v FROM fx WHERE k=''product'')::uuid,
              (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
              1000, ''toman'', 1, CURRENT_DATE, NULL, NULL, NULL, NULL,
              %L::uuid, NULL, false, NULL, NULL)', _req));
END $$;

DO $$
DECLARE _req uuid; _res jsonb; _ok boolean := false;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_g';
  PERFORM pg_temp.act('spec');
  _res := public.create_purchase(
    (SELECT v FROM fx WHERE k='product')::uuid,
    (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
    1000, 'toman', 1, CURRENT_DATE, NULL, NULL, NULL, NULL,
    _req, NULL, false, NULL, NULL);
  _ok := (_res->'purchase'->>'id') IS NOT NULL;
  INSERT INTO t(name,passed,detail) VALUES
    ('G2 the assigned specialist CAN purchase against their request', _ok,
     'purchase='||COALESCE(_res->'purchase'->>'id','NULL'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t(name,passed,detail) VALUES
    ('G2 the assigned specialist CAN purchase against their request', false, SQLERRM);
END $$;

DO $$
DECLARE _req uuid; _b uuid;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_g';
  SELECT v::uuid INTO _b FROM fx WHERE k='spec2';
  PERFORM pg_temp.act('manager');
  PERFORM public.assign_purchase_request(_req, _b);
  -- after reassignment the OLD assignee loses the right to buy
  PERFORM pg_temp.act('spec');
  PERFORM pg_temp.expect_fail('G3 after reassignment the previous assignee is refused','NOT_ASSIGNED',
    format('SELECT public.create_purchase(
              (SELECT v FROM fx WHERE k=''product'')::uuid,
              (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
              1000, ''toman'', 1, CURRENT_DATE, NULL, NULL, NULL, NULL,
              %L::uuid, NULL, false, NULL, NULL)', _req));
END $$;

DO $$
DECLARE _req uuid; _res jsonb;
BEGIN
  SELECT v::uuid INTO _req FROM fx WHERE k='req_g';
  PERFORM pg_temp.act('admin');
  _res := public.create_purchase(
    (SELECT v FROM fx WHERE k='product')::uuid,
    (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
    1000, 'toman', 1, CURRENT_DATE, NULL, NULL, NULL, NULL,
    _req, NULL, false, NULL, NULL);
  INSERT INTO t(name,passed,detail) VALUES
    ('G4 admin override still works on a request assigned to someone else',
     (_res->'purchase'->>'id') IS NOT NULL, 'purchase='||COALESCE(_res->'purchase'->>'id','NULL'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t(name,passed,detail) VALUES
    ('G4 admin override still works on a request assigned to someone else', false, SQLERRM);
END $$;

DO $$
DECLARE _req uuid;
BEGIN
  -- an unassigned request: a specialist has no claim on it. The request is
  -- emptied directly rather than by removing anyone's role — stripping roles
  -- here would quietly invalidate the fixtures the later sections rely on.
  PERFORM pg_temp.setdefault(NULL);
  PERFORM pg_temp.act('sales');
  _req := (pg_temp.mkreq()->>'request_id')::uuid;
  UPDATE public.purchase_requests SET assigned_to=NULL, status='approved' WHERE id=_req;
  PERFORM pg_temp.act('spec');
  PERFORM pg_temp.expect_fail('G5 nobody may purchase against an unassigned request','NOT_ASSIGNED',
    format('SELECT public.create_purchase(
              (SELECT v FROM fx WHERE k=''product'')::uuid,
              (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
              1000, ''toman'', 1, CURRENT_DATE, NULL, NULL, NULL, NULL,
              %L::uuid, NULL, false, NULL, NULL)', _req));
  INSERT INTO fx VALUES ('req_unassigned', _req::text);
END $$;

-- =============================================================================
-- H. the settings RPC
-- =============================================================================
DO $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.act('manager');
  _r := public.set_default_purchase_assignee((SELECT v::uuid FROM fx WHERE k='spec'));
  INSERT INTO t(name,passed,detail) VALUES
    ('H1 a manager can set the default despite the admin-only table policy',
     (_r->>'default_assignee_id') IS NOT NULL, 'value='||COALESCE(_r->>'default_assignee_id','NULL'));
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('sales');
  PERFORM pg_temp.expect_fail('H2 sales cannot set the default','ASSIGN_PERMISSION_DENIED',
    'SELECT public.set_default_purchase_assignee((SELECT v FROM fx WHERE k=''spec'')::uuid)');
  PERFORM pg_temp.act('admin');
  -- the accountant fixture serves here: an ordinary account with a role that is
  -- deliberately not on the purchase-assignee list
  PERFORM pg_temp.expect_fail('H3 an invalid user cannot be made the default','ASSIGNEE_ROLE_INVALID',
    'SELECT public.set_default_purchase_assignee((SELECT v FROM fx WHERE k=''accountant'')::uuid)');
END $$;

DO $$
DECLARE _n0 int; _n1 int; _n2 int;
BEGIN
  SELECT COUNT(*) INTO _n0 FROM public.audit_logs
   WHERE action='default_purchase_assignee_changed';
  PERFORM pg_temp.act('admin');
  PERFORM public.set_default_purchase_assignee((SELECT v::uuid FROM fx WHERE k='spec2'));
  SELECT COUNT(*) INTO _n1 FROM public.audit_logs
   WHERE action='default_purchase_assignee_changed';
  PERFORM public.set_default_purchase_assignee((SELECT v::uuid FROM fx WHERE k='spec2'));
  SELECT COUNT(*) INTO _n2 FROM public.audit_logs
   WHERE action='default_purchase_assignee_changed';
  INSERT INTO t(name,passed,detail) VALUES
    ('H4 changing the default audits once; setting the same value again does not',
     _n1=_n0+1 AND _n2=_n1, 'audits '||_n0||'->'||_n1||'->'||_n2);
END $$;

DO $$
DECLARE _before jsonb; _after jsonb; _same boolean;
BEGIN
  -- changing the default must not touch requests that already exist
  SELECT jsonb_agg(jsonb_build_object('id',id,'a',assigned_to) ORDER BY id)
    INTO _before FROM public.purchase_requests;
  PERFORM pg_temp.act('admin');
  PERFORM public.set_default_purchase_assignee((SELECT v::uuid FROM fx WHERE k='spec'));
  SELECT jsonb_agg(jsonb_build_object('id',id,'a',assigned_to) ORDER BY id)
    INTO _after FROM public.purchase_requests;
  _same := _before = _after;
  INSERT INTO t(name,passed,detail) VALUES
    ('H5 changing the default does not backfill existing requests', _same,
     CASE WHEN _same THEN 'all assignments unchanged' ELSE 'ASSIGNMENTS CHANGED' END);
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act('manager');
  PERFORM public.set_default_purchase_assignee(NULL);
  INSERT INTO t(name,passed,detail) VALUES
    ('H6 the default can be cleared',
     public.get_default_purchase_assignee() IS NULL,
     'default='||COALESCE(public.get_default_purchase_assignee()::text,'NULL'));
END $$;

-- =============================================================================
-- I. the unassigned filter
-- =============================================================================
DO $$
DECLARE _n int; _bad int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*), COUNT(*) FILTER (WHERE assigned_to IS NOT NULL) INTO _n, _bad
    FROM public.get_purchase_requests(NULL, NULL, 100, 0, true);
  INSERT INTO t(name,passed,detail) VALUES
    ('I1 the unassigned filter returns only ownerless requests', _n > 0 AND _bad = 0,
     'rows='||_n||' with an owner='||_bad);
END $$;

DO $$
DECLARE _all int; _un int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COUNT(*) INTO _all FROM public.get_purchase_requests(NULL, NULL, 500, 0, false);
  SELECT COUNT(*) INTO _un  FROM public.get_purchase_requests(NULL, NULL, 500, 0, true);
  INSERT INTO t(name,passed,detail) VALUES
    ('I2 the filter narrows rather than replaces the result set', _un < _all,
     'all='||_all||' unassigned='||_un);
END $$;

DO $$
DECLARE _n int;
BEGIN
  -- a salesperson asking for the ownerless list gets nothing, not everything
  PERFORM pg_temp.act('sales');
  SELECT COUNT(*) INTO _n FROM public.get_purchase_requests(NULL, NULL, 100, 0, true);
  INSERT INTO t(name,passed,detail) VALUES
    ('I3 a non-manager cannot use the filter to see other people''s requests', _n = 0,
     'rows='||_n);
END $$;

DO $$
DECLARE _n int; _leak int;
BEGIN
  -- C3 regression: the C4 filter did not disturb visibility or masking
  PERFORM pg_temp.act('sales');
  SELECT COUNT(*) INTO _n FROM public.get_purchase_requests(NULL, NULL, 100, 0, false);
  SELECT COUNT(*) INTO _leak FROM public.get_purchase_requests(NULL, NULL, 100, 0, false) g,
         LATERAL jsonb_array_elements(g.purchase_summaries) e
   WHERE e ? 'purchase_price' OR e ? 'total_amount' OR e ? 'supplier_name';
  INSERT INTO t(name,passed,detail) VALUES
    ('I4 sales still sees its own requests and no financial keys', _leak = 0,
     'rows='||_n||' leaked keys='||_leak);
END $$;

DO $$
DECLARE _rc bigint; _f int;
BEGIN
  PERFORM pg_temp.act('admin');
  SELECT COALESCE(MAX(receipt_count),0) INTO _rc
    FROM public.get_purchase_requests(NULL, NULL, 500, 0, false);
  SELECT COUNT(*) INTO _f FROM public.purchase_request_fulfillments;
  INSERT INTO t(name,passed,detail) VALUES
    ('I5 receipt_count is not inflated by fulfillment rows', _rc = 0 AND _f > 0,
     'max receipt_count='||_rc||' fulfillments='||_f);
END $$;

-- =============================================================================
-- J. security hardening of the new functions
-- =============================================================================
DO $$
DECLARE r record; _bad text := '';
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef,
           array_to_string(p.proconfig,',') AS cfg,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pub
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('assign_purchase_request','create_purchase_request',
                         'is_valid_purchase_assignee','get_default_purchase_assignee',
                         'set_default_purchase_assignee','get_purchase_assignee_options',
                         'get_purchase_requests')
  LOOP
    IF NOT r.prosecdef THEN _bad := _bad || r.proname || ':not-definer '; END IF;
    IF r.cfg IS NULL OR r.cfg NOT LIKE 'search_path=%' THEN
      _bad := _bad || r.proname || ':no-search-path '; END IF;
    IF r.pub THEN _bad := _bad || r.proname || ':public-execute '; END IF;
  END LOOP;
  INSERT INTO t(name,passed,detail) VALUES
    ('J1 every new function is DEFINER, search_path-fixed, and not executable by PUBLIC',
     _bad = '', COALESCE(NULLIF(_bad,''),'all clean'));
END $$;

DO $$
DECLARE _n int;
BEGIN
  -- no dynamic SQL built from user input in the assignment path
  SELECT COUNT(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('assign_purchase_request','create_purchase_request',
                       'set_default_purchase_assignee')
     AND p.prosrc ~* '(EXECUTE\s+format|EXECUTE\s+''|EXECUTE\s+_)';
  INSERT INTO t(name,passed,detail) VALUES
    ('J2 no dynamic SQL in the assignment functions', _n = 0, 'functions using EXECUTE='||_n);
END $$;

DO $$
DECLARE _ok boolean;
BEGIN
  -- the anon role must not reach any of it
  SELECT NOT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) INTO _ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('assign_purchase_request','create_purchase_request',
                       'set_default_purchase_assignee','get_purchase_assignee_options');
  INSERT INTO t(name,passed,detail) VALUES
    ('J3 anon cannot execute any assignment function', COALESCE(_ok,true),
     'anon executable='||COALESCE((NOT _ok)::text,'none'));
END $$;

DO $$
DECLARE _n int;
BEGIN
  PERFORM pg_temp.act('sales');
  BEGIN
    SELECT COUNT(*) INTO _n FROM public.get_purchase_assignee_options();
    INSERT INTO t(name,passed,detail) VALUES
      ('J4 sales cannot list assignee options', false, 'returned '||_n||' rows');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name,passed,detail) VALUES
      ('J4 sales cannot list assignee options', SQLSTATE='42501', 'sqlstate='||SQLSTATE);
  END;
END $$;

DO $$
DECLARE _n int; _bad int;
BEGIN
  PERFORM pg_temp.act('manager');
  SELECT COUNT(*) INTO _n FROM public.get_purchase_assignee_options();
  SELECT COUNT(*) INTO _bad FROM public.get_purchase_assignee_options() o
   WHERE NOT public.is_valid_purchase_assignee(o.user_id);
  INSERT INTO t(name,passed,detail) VALUES
    ('J5 the options list contains only valid assignees', _n > 0 AND _bad = 0,
     'options='||_n||' invalid='||_bad);
END $$;

-- =============================================================================
-- K. existing data untouched
-- =============================================================================
DO $$
DECLARE _moved int; _list text;
BEGIN
  -- Every request that already existed must still have the owner it had, unless
  -- this suite deliberately reassigned it. The earlier version of this test
  -- counted unassigned rows and compared against 1, which quietly started
  -- failing the moment the e2e runs left more ownerless requests behind — it was
  -- measuring the database's history, not this transaction's behaviour.
  SELECT COUNT(*), COALESCE(string_agg(DISTINCT s.id::text, ',' ORDER BY s.id::text), '')
    INTO _moved, _list
  FROM snap s
  JOIN public.purchase_requests r ON r.id = s.id
  WHERE r.assigned_to IS DISTINCT FROM s.assigned_to
    AND s.id::text NOT IN (SELECT v FROM fx WHERE k LIKE 'req\_%');

  INSERT INTO t(name,passed,detail) VALUES
    ('K1 no pre-existing request had its owner changed behind our back',
     _moved = 0, 'moved='||_moved||CASE WHEN _moved>0 THEN ' ids='||left(_list,120) ELSE '' END);
END $$;

DO $$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.purchase_requests
   WHERE assigned_to IS NOT NULL
     AND NOT public.is_valid_purchase_assignee(assigned_to);
  INSERT INTO t(name,passed,detail) VALUES
    ('K2 reporting only: existing assignees that would no longer qualify', true,
     'count='||_n||' (not backfilled by design)');
END $$;

-- =============================================================================
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS r, name, detail
FROM t ORDER BY seq;

SELECT COUNT(*) FILTER (WHERE passed)     AS passed,
       COUNT(*) FILTER (WHERE NOT passed) AS failed,
       COUNT(*)                           AS total
FROM t;

ROLLBACK;
