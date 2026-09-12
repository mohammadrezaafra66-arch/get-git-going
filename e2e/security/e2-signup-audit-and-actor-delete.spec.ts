/**
 * E-2 (530/531/532) — signup writes exactly one audit row, and deleting a user with
 * audit history no longer blocks.
 *
 * WHY THIS EXISTS. Two independent defects, closed by three migrations in the same
 * mission:
 *
 *   531 — `audit_logs.actor_id` referenced `auth.users(id)` with NO ON DELETE action.
 *   `actor_id` IS nullable (verified against `information_schema.columns`), so deleting
 *   a user who had ever performed an audited action raised a foreign-key violation
 *   instead of nulling the reference and letting the row survive.
 *
 *   532 — `auth.users` carried TWO AFTER INSERT triggers bound to the same function,
 *   `handle_new_auth_user()` (`on_auth_user_created` and the redundant
 *   `on_auth_user_created_afrakala`). The function's `profiles` and `user_roles`
 *   inserts are protected by `ON CONFLICT ... DO NOTHING`, but its `audit_logs` insert
 *   is not, so every signup wrote TWO `user_registered` rows. 532 drops the redundant
 *   trigger; `on_auth_user_created` alone still fires the function exactly once.
 *
 * Both are exercised inside ONE rolled-back transaction (rule 12): nothing here is
 * committed, and re-running this spec any number of times leaves no residue.
 *
 * WHY NOT `e2e/helpers/db.ts`. That helper's `assertReadOnlySql` guard rejects any
 * statement that is not `select`/`with`/`show` — by design, so a shared read-only
 * helper cannot quietly repair the state it is supposed to be checking. This spec
 * needs to INSERT a synthetic user and DELETE it, so it uses `inRolledBackTx` from
 * `e2e/helpers/tx.ts` instead, which wraps the whole probe in `BEGIN ... ROLLBACK` and
 * is built for exactly this.
 *
 * Both helpers read the same `E2E_DB_CONTAINER` / `E2E_DB_NAME` / `E2E_DB_USER`
 * environment variables, so this spec runs against whichever database the caller
 * points it at (the LAN test server's `afrakala` by default).
 *
 * NOT RUN. This spec was written and has not been executed under Playwright — the
 * orchestrator owns the Playwright run and the E-2 mission's Playwright sessions were
 * reported stale. It IS provable independently: the same two scenarios were verified
 * by hand against a restored production snapshot (`prod_rehearsal_e2`) before and
 * after migrations 530-532 — see docs/research/convergence/E-2-proof.md, Task 2 and
 * Task 3.
 */
import { expect, test } from "@playwright/test";
import { inRolledBackTx, say } from "../helpers/tx";

const SIGNUP_USER_ID = "00000000-0000-4000-8000-0000000e2532";
const ACTOR_USER_ID = "00000000-0000-4000-8000-0000000e2531";

function probe(): Record<string, string> {
  const lines = inRolledBackTx(
    `
---------------------------------------------------------------- 532: one audit row per signup
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('${SIGNUP_USER_ID}', 'e2-spec-signup@example.invalid',
        '{"full_name":"E2 Spec Signup"}'::jsonb);

DO $probe_signup$
DECLARE
  _rows int;
  _triggers int;
BEGIN
  SELECT count(*) INTO _triggers
    FROM pg_trigger
   WHERE tgrelid = 'auth.users'::regclass
     AND NOT tgisinternal
     AND tgname LIKE 'on_auth_user_created%';

  SELECT count(*) INTO _rows
    FROM public.audit_logs
   WHERE entity_type = 'user'
     AND entity_id = '${SIGNUP_USER_ID}'
     AND action = 'user_registered';

  ${say("'signup_trigger_count=' || _triggers")}
  ${say("'signup_audit_rows=' || _rows")}
END
$probe_signup$;

---------------------------------------------------------------- 531: delete an actor with audit history
INSERT INTO auth.users (id) VALUES ('${ACTOR_USER_ID}');
INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action)
VALUES ('${ACTOR_USER_ID}', 'e2_spec_entity', 'e2-spec-actor-delete', 'e2_spec_action');

DO $probe_actor_delete$
DECLARE
  _msg  text;
  _res  text;
  _actor_after text;
BEGIN
  BEGIN
    DELETE FROM auth.users WHERE id = '${ACTOR_USER_ID}';
    _res := 'ALLOWED';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    _res := 'REFUSED:' || _msg;
  END;

  SELECT COALESCE(actor_id::text, 'NULL') INTO _actor_after
    FROM public.audit_logs
   WHERE entity_id = 'e2-spec-actor-delete';

  ${say("'actor_delete=' || _res")}
  ${say("'actor_after_delete=' || _actor_after")}
END
$probe_actor_delete$;
`,
  );

  const out: Record<string, string> = {};
  for (const l of lines) {
    const i = l.indexOf("=");
    if (i > 0) out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

test.describe("E-2 — signup audit rows and actor deletion (530/531/532)", () => {
  test("auth.users carries exactly one signup trigger after 532", () => {
    const r = probe();
    expect(r["signup_trigger_count"], `probe returned: ${JSON.stringify(r)}`).toBe("1");
  });

  test("a signup writes exactly one user_registered audit row", () => {
    const r = probe();
    expect(r["signup_audit_rows"], `probe returned: ${JSON.stringify(r)}`).toBe("1");
  });

  test("deleting a user with audit history succeeds after 531", () => {
    const r = probe();
    expect(r["actor_delete"], `probe returned: ${JSON.stringify(r)}`).toBe("ALLOWED");
  });

  test("the audit row survives the delete with actor_id nulled", () => {
    const r = probe();
    expect(r["actor_after_delete"], `probe returned: ${JSON.stringify(r)}`).toBe("NULL");
  });
});
