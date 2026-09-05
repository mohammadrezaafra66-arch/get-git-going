# Wave 4 — CONTRACTS

Orchestrator-owned. Read-only for specialists. Never write to root `PROGRESS.md`.

Baseline commit for every wave-4 worktree: **`31bc486e`** (`origin/staging`, after PR #401).

---

## 1. Central allocation — migration numbers and timestamps

Highest number on `origin/staging` disk: **459**. Highest ledger timestamp: **20260905231500**.
`456` is a pre-existing gap — DO NOT reuse it.

Take ONLY your allocated slot. Do not invent a number.

| Slot | Owner | Row | Filename |
|---|---|---|---|
| 460 | Agent O | O-1 | `20260906090000_460_pin_receipt_ocr_to_local_vision.sql` |
| 461 | Agent S | S-1 | `20260906091500_461_gate_hold_and_release_credit.sql` |
| 462 | Agent S | S-2 | `20260906093000_462_gate_money_tier_definers.sql` |
| 463 | Agent S | S-3 | `20260906094500_463_gate_identity_tier_definers.sql` |
| 464 | Agent S | S-4 | `20260906100000_464_gate_catalogue_tier_definers.sql` |
| 465 | Agent S | S-4 | `20260906101500_465_gate_housekeeping_tier_definers.sql` |
| 466 | Agent W | W-2 (only if the view must change) | `20260906103000_466_receivables_carry_salesperson_and_ceiling.sql` |
| 467-469 | RESERVED — orchestrator (H-1) | | |

If you need a slot you were not given, STOP and report. Do not take the next free number.

---

## 2. The gate shape — quoted from `20260905100000_436_close_anon_role_grant_escalation.sql`

Every gate migration MUST follow this shape. It is the established, reviewed pattern.

**2a. Header.** ASCII-only by design. Persian in a migration cannot survive the transport.

    SET client_encoding='UTF8';

**2b. Revoke BOTH `anon` and `PUBLIC`.** Wave 3 proved `REVOKE ... FROM anon` alone does NOT
close an `=X/supabase_admin` entry in `proacl` — that entry is a PUBLIC grant.

    REVOKE EXECUTE ON FUNCTION public.<fn>(<identity args>) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.<fn>(<identity args>) FROM PUBLIC;

Add `FROM authenticated` ONLY when the function has no legitimate direct caller anywhere in
`src/` or `server/` — and prove that with a grep you quote in the migration comment.

**2c. Guard inside the body**, so the rule survives a lost GRANT.
`user_roles.role` is TEXT. Use the `has_any_role(uuid, text[])` overload with an explicit
`::text[]` cast — the bare-literal form is ambiguous against the `app_role` overload.
`has_any_role(NULL, ...)` returns false (verified), so this also refuses an unauthenticated caller.

    IF NOT public.has_any_role(auth.uid(), ARRAY['admin']::text[]) THEN
      RAISE EXCEPTION 'forbidden: only an admin may <verb>'
        USING ERRCODE = '42501';
    END IF;

**2d. `CREATE OR REPLACE` silently restores default grants.** Therefore the REVOKEs in 2b must
appear in the SAME migration, AFTER the CREATE OR REPLACE, and the verify block in 2e must
re-assert them.

**2e. Verify in the same transaction** — `has_function_privilege` per role, then re-run the
attack against a harmless target (the all-zeros uuid), for BOTH `anon` and an authenticated
non-admin. 436's block is the template:

    DO $verify$ ... has_function_privilege('anon', p.oid, 'EXECUTE') ...
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims',
        '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
    ... EXCEPTION WHEN insufficient_privilege THEN ... END $verify$;

This `set_config` form is how you test a gate WITHOUT calling the function as a real user.

---

## 3. The OCR provider rows — quoted live from `afrakala`, 2026-09-06

`public.ai_usage_routes` — all 8 rows have `provider_id = NULL`:

                 service_key          | capability | provider_id | is_enabled | fallback_enabled
    ----------------------------------+------------+-------------+------------+------------------
     receipt_ocr.vision               | vision     |   (NULL)    | t          | f
     knowledge_ask.chat               | chat       |   (NULL)    | t          | t
     ... (the other 6 are all fallback_enabled = t)

`receipt_ocr.vision` is the ONLY route with `fallback_enabled = f`. Someone intended a pin; the
pin is absent because `provider_id` is NULL.

`public.ai_providers`:

     id                                   | name    | base_url                   | active | priority | vision_model   | capabilities             | has_key
     0fbe576a-9ef3-475b-92e7-fabd981a7d5d | for ocr | https://api.openai.com/v1  | t      |        1 | gpt-4o         | {vision}                 | t
     d30816a9-8ff0-4d0e-8f25-0661f8cbea61 | ollama  | http://192.168.170.8:11434 | t      |       10 | qwen3.6:latest | {chat,embeddings,vision} | f

`public.ai_provider_health` — PROOF THE LEAK ACTUALLY FIRED:

     0fbe576a (OpenAI) | vision | ok          | last_ok_at    = 2026-08-31 12:56:59+00 | 4413 ms
     d30816a9 (ollama) | vision | unavailable | last_error_at = 2026-08-28 06:34:07+00 | timeout

The code path, `src/lib/ai/client.server.ts`:

    function applyUsageRoute(providers: AiProvider[], route: UsageRouteRow | null): AiProvider[] {
      if (!route) return providers;
      if (!route.is_enabled) return [];
      if (!route.provider_id) return providers;   // <-- early return; fallback_enabled never read
      ...
    }

**Owner decision D-15 applies:** the key is live, so this is active exfiltration, not theory.

**Owner decision taken this wave:** pin the route to the Ollama provider AND set
`ai_providers.is_active = false` on `for ocr` (0fbe576a). The OpenAI provider declares only
`{vision}` and `receipt_ocr.vision` is the only vision route, so deactivating it affects
nothing else in the repo. Do NOT delete the stored key.

Note: local Ollama vision is currently `unavailable/timeout`. Degraded local OCR is the
accepted outcome; images leaving the network is not.

---

## 4. Non-negotiable rules

1. Persian SQL never through a PowerShell pipe, never via `psql -c`. File + `docker cp`
   (`MSYS_NO_PATHCONV=1`) + `psql -f`. **Prefer ASCII-only migrations.**
2. `pg_get_functiondef` and diff against the file BEFORE rewriting any function.
3. `schema_full_export.sql` is unreliable. Read live.
4. Discover column names by querying. Never guess.
5. The business runs on `sales_quotes`. `invoices` was DROPPED (migration 332) — `42P01`.
6. Never leave a migration applied but uncommitted. Push the branch the moment it is applied.
7. Boundary Guard allows `supabase/migrations/**` only on `feature/*`, `cursor/core/WPC-*`,
   `hotfix/WPC-*`. Your branch is `feature/wave4-agent<X>` — compliant.
8. After any migration: `docker restart afrakala-lan-rest`.
9. Never run `/autofix-pr`. Never force-push. Never merge your own PR.
10. Never `git stash`. Never touch a worktree you did not create.
11. Never `git show 'ref:path'` on Windows — read files from a worktree on disk.
12. Never call a function to test it. Use the `set_config` probe in 2e.
13. Production `192.168.170.10` must never be contacted, resolved, or pinged.
14. `audit_logs` id 61265 is evidence of the anon audit-forgery finding. Never delete it.
15. Forbidden in code: `@ts-ignore`, `.skip`, `test.fixme`, loosened assertions.

---

## 5. Measured baseline — do not re-derive, but DO report contradictions

- **Typecheck: exactly 70 errors across 6 files.** In a worktree WITHOUT `node_modules`, `tsc`
  reports 0 silently — a FALSE ZERO. Run `npm ci` before trusting any count.
  `_app.products.index.tsx` 18 · `_app.admin.sales-reminders.tsx` 15 ·
  `lib/invoices/functions.ts` 13 · `lib/accounting/functions.ts` 13 ·
  `lib/audit/index.ts` 6 · `_app.admin.automation.tsx` 5
- `Staging Check` is red at baseline for exactly these. `--admin` merge is established practice
  once you confirm no file of yours appears in the run log.
- **17 worktrees**, not 18 as prior art claims.
- `compute_daily_capital(p_capital_date date)` **survived** migrations 447-451. It is live.
- `ocr_receipts` does NOT exist. `payment_receipt_documents` does.
- Ledger drift: rows `20260903100000`, `20260903140000` have no file; files `20260903160000`,
  `20260904150000` have no row. Orchestrator owns this (H-1). Do not touch it.
- pg_cron live jobs are 9, 20, 21, 22. Jobs 10/11/12 are unscheduled.

### 5a. ⚠️ The `63 | 15 | 48 | 0` figure did NOT reproduce — Agent S must re-derive it

Prior art states the security census reproduces "to the digit" as `63 | 15 | 48 | 0`
(SECURITY DEFINER writers in `public` with EXECUTE to `authenticated`; with a non-role guard;
genuinely bare; still anon-reachable). The orchestrator could not reproduce it:

| Definition used | writers | with role check | bare | anon-reachable |
|---|---|---|---|---|
| prosecdef + authenticated EXECUTE + body matches insert/update/delete | 215 | 88 | 127 | **142** |
| same, excluding `returns trigger` | 147 | — | 60 | **76** |
| prior art's claim | 63 | 15 | 48 | **0** |

The prior-art number therefore rests on a narrowing that is not written down anywhere.
**Agent S must state its own selection query verbatim in the migration comments and in its
report, and must NOT assume "36 bare" is the right subject count.** Derive the tier lists from
your own query, then hand-read every body in a tier before gating it — prior art hand-read the
36/27 split and independently verified only 3 of 63.

The `anon-reachable = 0` claim is the one most worth checking: under both of the orchestrator's
definitions it is non-zero. It may be an artifact of default `=X/supabase_admin` PUBLIC grants
on internal helpers rather than genuine API reachability — establish which, and say so.

### 5b. S-1 target signatures — confirmed live 2026-09-06

    hold_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
    release_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
    both: prosecdef = t | authenticated EXECUTE = t | anon EXECUTE = f

`p_user_id` really is caller-supplied on both, and it is what lands in `audit_logs` as the
actor. Derive the actor from `auth.uid()` instead. Keep the parameter in the signature if
dropping it would break a caller — but ignore it for the audit actor, and say so in the file.
- Environment: app `http://192.168.170.8:3100`, Kong `:9000`, DB `afrakala` on
  `afrakala-lan-db`, Ollama `192.168.170.8:11434`. Test accounts
  `test.<role>@afrakala.local` / `AfraTest!1404`.
- Tests: NO top-level `test` script. `npx playwright test` (`testDir: ./e2e`) and
  `npm run test:receipt-ocr`.

---

## 6. Evidence standard

| Kind | What is required |
|---|---|
| FIX | The same probe, wrong before and right after. A test red before, green after. |
| CONNECT | A real path exercised in a browser. |
| RETIRE | Object gone, zero references. |
| INVESTIGATE | Measurement and output. NO code. |
| EXTEND | The old case still works AND the new case works. |

A clean PARTIAL outranks a padded COMPLETE. If you cannot prove it, write NOT VERIFIED.

---

## 7. Progress ledger

Append one row when a task closes. Do not edit another agent's row.

| Row | Agent | State | Evidence |
|---|---|---|---|
| Q-0 | orch | done | wave-3 PRs #404/#405/#406 merged during Stage 0; redeployed to 31bc486e |
| H-5 | orch | done | PR #401 merged, landed as `31bc486e` |
