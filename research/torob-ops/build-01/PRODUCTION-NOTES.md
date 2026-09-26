# PRODUCTION-NOTES — Torob Eye (owner applies; this session does not touch production)

## Same cause as FIX A in code headed to production?

**Yes.** `product_computed_prices_public` on staging (migration **596**, merged in PR #483) was a `security_invoker` view that required `auth.uid() IS NOT NULL` (and not viewer-only). The service role / admin client therefore saw **0 rows** while `product_computed_prices` still held cash prices. Migration 596 adds a service-role bypass **without changing pricing math or any stored price**. Production will have the same empty-view symptom until 596 is applied there.

Saved before the fix: `evidence/S1/S1-view-before.out.txt`. After: `evidence/S1/S1-view-after.out.txt` (0 → 2057 view rows; 321 active products with `cash_price`).

## Migrations (apply in order, after each is on `staging`)

1. `20260926233000_596_torob_eye_foundation.sql` — view access, eye settings, `torob_eye_runs`, `torob_offer_snapshots`, `torob_link_assignments`, `notify_torob_eye`, own-shop auto-report trigger, findings write lock, DELETE deny on sessions/report_logs.
2. Down file: `docs/verification/596-down.sql`.

No 597 in this drop.

## New env keys (names only)

- `TOROB_EYE_BOT_KEY` — bot key named `torob-eye` (create in UI or `create_bot_api_key`; store only in the LAN/prod env file).
- `TOROB_OPS_SIMULATE_SUBMIT` — keep `1` on 3100. On production, leave `1` until the owner accepts live Torob complaints, then set `0`. The flag turns off **only the final submit click**.
- `TOROB_OPS_ACCOUNT_SECRET` — already required for account session blobs.
- `TOROB_EYE_STUB_BLOCK` — test only (`1` forces a block).
- `TOROB_EYE_REPORT_STUB_URL` — test stub page; unused when simulate is off and a real Torob URL is used.

## New container

`afrakala-lan-torob-eye` from `deploy/lan/docker-compose.yml` service `torob-eye`, image `afrakala-torob-eye:lan`, Playwright Chromium.

## Bot key

Create a key named `torob-eye`. No table restriction needed (same as most existing keys). Put the raw value in the env file only.

## Before auto-report

1. Fill `torob_ops_own_shops` with the real shop name/domain. The DB trigger refuses `auto_report_enabled` while the list is empty.
2. Put Torob accounts into the pool (owner does this).
3. Confirm kill switch, hourly cap, and repeat window on `/torob-ops/settings`.
4. Switch auto-report on only after own-shops are correct.

## Live submission

**Live submission to Torob is unverified until production.** 3100 proves the path against a stub page with `TOROB_OPS_SIMULATE_SUBMIT=1`.
