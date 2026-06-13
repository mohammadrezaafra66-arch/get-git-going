# TPC-2-004 — Torob Limited Read-Only Execution Evidence Packet

**Status:** READY FOR REVIEW — execution **NOT AUTHORIZED** in this packet  
**Track:** Phase 2 / Torob limited read-only  
**Depends on:**

- `TPC-2-001-phase2-unlock-torob-readonly-gate.md`
- `TPC-2-002-torob-limited-readonly-design.md`
- `TPC-2-003-torob-limited-readonly-implementation-packet.md`
- `PHASE2_TOROB_LIMITED_READONLY_SKELETON_ACCEPTANCE_2026_06_13.md`

## 1. Purpose

Define the approval gate and evidence requirements for the first controlled Torob limited read-only execution.

This packet does **not** perform the execution. It only defines the exact conditions under which a later implementation/execution PR may run a small, manual, read-only Torob test.

## 2. Current state

The project has already accepted the Torob limited read-only worker skeleton:

- Driver skeleton merged in PR #136.
- Skeleton acceptance recorded in PR #137.
- Driver output is deterministic and non-live.
- `live_execution = false`.
- `browser_automation = false`.
- `network_calls = 0`.
- Real Torob execution is still **NOT STARTED**.

## 3. Scope of the future execution

After this packet is reviewed, approved, and merged, a later execution PR may perform exactly one controlled manual live read-only run, subject to all limits below.

The future execution must be:

- manual only,
- low-volume only,
- read-only only,
- Torob-only,
- evidence-backed,
- abortable,
- non-scheduled,
- non-production-impacting.

## 4. Maximum allowed live-run size

The first live run may include:

- minimum products: 1
- target products: 3
- maximum products: 3
- maximum sellers per product: 3
- maximum total requests: 10
- maximum concurrency: 1
- minimum delay between requests: 3000 ms
- maximum total run time: 300 seconds

If any of these limits would be exceeded, the run must abort before making the next request.

## 5. Allowed source and mode

Allowed:

- source: `torob`
- mode: `read-only`
- public product pages only
- no authenticated pages
- no private seller/admin/account pages

Not allowed:

- Divar
- Instagram
- WhatsApp
- Rubika
- Digikala
- any source other than Torob

## 6. Required preflight before the first live request

Before any live request, the operator must record:

1. exact branch,
2. commit hash,
3. operator name,
4. local/staging environment,
5. product URLs or product IDs,
6. request limit configuration,
7. current driver guardrail configuration,
8. confirmation that no secrets are present,
9. confirmation that no login/session/cookie will be used,
10. confirmation that no browser automation will be used,
11. confirmation that the run is manual and not scheduled.

The run must abort if public access is blocked, rate-limited, redirected to login, or technically unstable.

## 7. Allowed implementation files for the future execution PR

A future execution PR may modify only the minimum files required for controlled live-readiness and evidence.

Allowed future files:

1. `automation/worker-runtime/src/drivers/torob_limited_readonly.py`
2. `automation/worker-runtime/tests/test_torob_limited_readonly_contract.py`
3. `automation/worker-runtime/tests/test_torob_limited_readonly_mock.py`
4. `automation/worker-runtime/tests/test_torob_limited_readonly_live_guarded.py`
5. `docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md`

`driver_registry.py` remains locked unless a separate packet explicitly approves registration. The first live-readiness path should not change the default worker runtime behavior.

## 8. Forbidden implementation changes

The future execution PR must not add or modify:

- UI files,
- API routes,
- database migrations,
- OpenAPI files,
- package files,
- lock files,
- `.env` files,
- secrets,
- credentials,
- browser automation,
- login/session/cookie handling,
- scheduler/cron/always-on execution,
- bulk crawl,
- messaging,
- ranking manipulation,
- production sync,
- customer-facing automation,
- price updates,
- product writebacks.

## 9. Required abort conditions

The future live run must immediately stop if any of the following happens:

- HTTP 401/403 is returned,
- login is required,
- CAPTCHA or anti-bot challenge appears,
- rate limit or block is detected,
- response is unstable or malformed,
- redirect chain is unexpected,
- total requests would exceed 10,
- any configured limit would be exceeded,
- any secret or credential would be required,
- any browser automation would be required.

No bypass, stealth, CAPTCHA solving, account use, or anti-bot evasion is allowed.

## 10. Required evidence file

A future execution PR must create:

`docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md`

The evidence file must include:

1. PR number,
2. commit hash,
3. operator,
4. environment,
5. command used,
6. test result,
7. product count,
8. request count,
9. timing/delay configuration,
10. confirmation of read-only behavior,
11. confirmation of no login/session/cookie,
12. confirmation of no browser automation,
13. confirmation of no scheduler/bulk crawl,
14. output summary,
15. abort status or completion status,
16. any errors encountered,
17. explicit statement that no prices/products/customers were changed.

No private credentials, cookies, tokens, or secrets may be included in the evidence.

## 11. Acceptance criteria for this packet

This packet is accepted only when:

- it is reviewed and approved,
- it is merged to `main`,
- Phase 2 README links it,
- the status remains clear that real Torob execution has not yet started,
- the next execution PR is still separate.

## 12. What this packet does not authorize

This packet does not authorize:

- immediate live execution,
- background monitoring,
- recurring scraping,
- production data writes,
- UI exposure,
- API route exposure,
- worker default registration,
- scheduler integration,
- bulk product discovery,
- expanding beyond Torob.

## 13. Next step after this packet is merged

Open a separate execution PR that implements only the approved guarded live-readiness path and records the required evidence.

Until that future execution PR is reviewed, approved, and merged, Torob remains skeleton-only and non-live.
