# OG-61 — the behavioural sweep, and the privilege-escalation path it found

**Date:** 2026-08-26 · **Migration:** 399 · **Gate:**
`e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts` · production لمس نشد

---

## 1. The finding, stated first because it is the point

Verified live on the test database and rolled back:

```sql
SET ROLE anon;
SELECT public.revoke_user_role_txt('<a real admin uuid>', 'admin');
-- admin role rows: 14 -> 13
```

**An unauthenticated caller stripped the admin role from a real administrator.** PostgREST
exposes every function in `public`, so this required no credentials at all — only the ability
to reach the API. Repeated across `user_roles`, it locks the company out of its own system.

After migration 399 the identical call returns `permission denied for function
revoke_user_role_txt` and the count stays at 14. Re-verified in a fresh session, outside the
migration that made the change.

---

## 2. How the set was chosen — option (c), not a blanket sweep

The owner's instruction was to **narrow** OG-61 using OG-62's method, and to forbid a global
revoke. That produced a much smaller and much better-evidenced target than the row implied.

| Step | Result |
|---|---|
| Scope: `SECURITY DEFINER` **and** anon-executable | **314**, not 713 — 713 counted every anon-executable function regardless of definer |
| 63 STABLE: **called as `anon`** inside a rollback | 44 **refused from inside their own bodies**, 2 NULL-shaped, 3 "DATA" |
| Those 3, judged on **value not row count** (OG-62's lesson) | `("")`, `({})`, `({})` — **empty**. **Not one STABLE function leaks.** Nothing to revoke. |
| 251 VOLATILE: **bodies read** | 119 are trigger functions (not directly invocable), 96 carry a guard |
| Remainder | **26** |
| Those 26, **called as `anon`** inside a rollback | **19 executed with no authorization error. ZERO were denied.** |
| The other 7 | failed on **NULL arguments** — a failure of the argument, not of authorization. **Not evidence of safety**, so they are included. |

**The owner's original reasoning is confirmed by measurement:** 713 was the *ceiling* of the
exposure, not its size. The real number of functions needing a revoke was 26, and the number of
STABLE readers leaking data was **zero**.

### Deliberately untouched

- **The 11 boolean RLS helpers.** RLS policies call them; revoking EXECUTE breaks the policies
  that enforce access. Excluded by owner instruction and by the sweep query itself.
- **A bare global revoke stays forbidden.** Mission 4 measured why: it strips EXECUTE from
  *every* role rather than `anon`, and reaches schemas in no list — `pgbouncer.get_auth()`
  depends entirely on its PUBLIC grant, and killing it kills connection pooling.

### Why revoking was safe, checked per function rather than assumed

Every one of the 26 carries an **explicit `authenticated=X` grant** separate from the PUBLIC
`=X` grant, so removing `anon` and `PUBLIC` leaves `authenticated` and `service_role` exactly
as they were. Two looked like exceptions and were not:

- **`bot_authenticate_key`** appears to require anon access — a bot presenting a raw key is
  unauthenticated. It does not: its only caller (`src/server/bot-api.ts:286`) goes through
  `supabaseAdmin`, the service role. Revoking `anon` closes an offline brute-force oracle
  against `bot_api_keys` without touching the real path.
- **`expire_pending_documents`** is called from the messenger inquiry flow
  (`src/lib/messenger/inquiry-status.ts`) as an authenticated user, which keeps working.

---

## 3. What 399 does NOT fix — OG-74

The 26 still have **no internal authorization check**. `authenticated` means *every logged-in
user*, so a `sales` or `viewer` account can still call `revoke_user_role_txt` and strip an
administrator.

This was left open on purpose: revoking `authenticated` would break the legitimate callers, and
the correct fix is authorization *inside* 26 bodies — a behavioural change, and 26 separate
business questions about which role each should require. `revoke_user_role_txt` is obviously
admin-only; `enqueue_pricing_recompute` may legitimately be any authenticated user.

**399 closes the hole that needs no credentials at all.** OG-74 covers the rest.

---

## 4. The gate, and the mistake it taught

Five tests. Two-sided: `anon` refused on all 26, `authenticated` still executing all 26, and a
third assertion that all 26 still **exist** — without it, dropping every function would satisfy
the closed half perfectly.

**The forced disturbance worked, and exposed a defect in the gate itself.**

The first draft aimed its live attack at a **real** admin (`order by user_id limit 1`) and
asserted the call was refused. That is safe only while the refusal holds — and a disturbance
exercise exists precisely to *remove* the refusal. So when the `anon` grant was restored to
prove the gate catches a regression, **the gate's own call went through and stripped the admin
role from `ADMIN_USER_ID`, the harness account the entire suite runs as.** Admin rows 14 → 13.

- Restored **54 seconds** later (`audit_logs`: `role_revoked` 15:48:47 → `role_assigned`
  15:49:41).
- **Blast radius proven, not assumed:** exactly two role events exist in that window, both for
  the same user. That evidence is usable *because* the restore — a direct SQL `INSERT`, not an
  RPC call — was itself audited, which shows the audit covers direct table writes and is a
  complete record of role changes.
- The full e2e run in flight had reached test 346 and was **invalidated and killed**, not
  reported.

Both halves now aim at a non-existent uuid. Re-running the disturbance confirms the gate still
fails on a re-grant while admin rows stay at **14 → 14**.

**The rule, now RULE 8:** a gate proving a destructive action is *refused* must never aim at a
target whose loss would matter. The refusal is the assertion; the target only has to be shaped
correctly.

---

## 5. Bearing on production — OG-75

`origin/main` is `99f6bd58` (2026-08-15) and production tracks `main`. Migration 399 is not on
`main`. **Any database that has not had 399 applied still has this privilege-escalation path
open.**

Whether production has it cannot be determined from this repository: there is **no production
migration ledger**. The read-only queries that would settle it are listed in the OG-75 row, to
be run by someone authorised — not by this agent, which never contacts production.
