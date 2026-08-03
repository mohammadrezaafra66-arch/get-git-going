# 211-218 Playwright E2E Report

Date: 2026-07-29  
Environment: LAN test, `http://192.168.170.8:3100`  
Project: `chromium-admin`  
Auth: `e2e/auth/admin.storage.json`  
Command: `npx playwright test`  
Result JSON: `test-results/211-218-playwright-results.json`  
HTML report: `test-results/playwright-html/index.html`

## Summary

| Requirement | Status | Spec | Evidence |
|---|---:|---|---|
| 211 | PASS | `e2e/requirements/211.spec.ts` | UI pages for quotes, notifications, rejected quotes |
| 212 | PASS | `e2e/requirements/212.spec.ts` | Quote create UI, RPC signature, persistence columns |
| 213 | PASS | `e2e/requirements/213.spec.ts` | Credit rules UI, dynamic capital UI, scoring RPCs/weights |
| 214 | PASS | `e2e/requirements/214.spec.ts` | Source reporting UI, destination market UI, top-products API |
| 214.1 | PASS | `e2e/requirements/214-1.spec.ts` | Purchase advisor UI, product sellers API |
| 215 | PASS | `e2e/requirements/215.spec.ts` | Notifications UI, queue constraint exists |
| 216 | PASS | `e2e/requirements/216.spec.ts` | Notifications UI, `quote_rejected` supported |
| 217 | PASS | `e2e/requirements/217.spec.ts` | Visitor admin UI, visitors table/active data |
| 217.1 | PASS | `e2e/requirements/217-1.spec.ts` | Quote UI visitor picker, separate salesperson/visitor fields |
| 218 | PASS | `e2e/requirements/218.spec.ts` | Receipt create UI, mobile-bank screenshot columns |

Final run: 17 passed, 0 failed, 0 skipped.  
Trace on failure: configured with `trace: "retain-on-failure"`; no final-run failure trace was produced.  
Video: configured with `video: "on"` and produced for every test.

## Requirement Details

### 211 - Quote Rejection Visibility

Status: PASS  
UI paths tested:
- `/sales/quotes`
- `/notifications`
- `/my-rejected-quotes`

Assertions:
- Sales quote list renders.
- Notification center renders.
- Rejected quote page renders.

Screenshots:
- `test-results/211-218/requirements-211-Requireme-709ac-salesperson-facing-surfaces-chromium-admin/211-sales-quotes-list.png`
- `test-results/211-218/requirements-211-Requireme-709ac-salesperson-facing-surfaces-chromium-admin/211-notifications.png`
- `test-results/211-218/requirements-211-Requireme-709ac-salesperson-facing-surfaces-chromium-admin/211-my-rejected-quotes.png`

Video:
- `test-results/211-218/requirements-211-Requireme-709ac-salesperson-facing-surfaces-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: run a destructive-safe manual scenario with a disposable quote to verify the actual rejection reason popup lifecycle end to end.

### 212 - Quote Credit, Commitment, and Stock Guards

Status: PASS  
UI path tested:
- `/sales/quotes` -> click `پیش‌فاکتور جدید` -> `/sales/quotes/new`

Backend checks:
- `create_sales_quote_with_items` includes `p_quote_exception_type`.
- `create_sales_quote_with_items` includes `p_quote_exception_minutes`.
- `create_sales_quote_with_items` includes `p_quote_exception_amount`.
- `create_sales_quote_with_items` includes `p_warehouse_id`.
- `create_sales_quote_with_items` includes `p_visitor_id`.
- `sales_quotes` includes exception and warehouse persistence columns.

Screenshot:
- `test-results/211-218/requirements-212-Requireme-8bd09-d-RPC-signature-is-deployed-chromium-admin/212-new-quote-guard-form.png`

Videos:
- `test-results/211-218/requirements-212-Requireme-8bd09-d-RPC-signature-is-deployed-chromium-admin/video.webm`
- `test-results/211-218/requirements-212-Requireme-65fb6-n-persistence-columns-exist-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: add a dedicated disposable-data test later that attempts over-credit and insufficient-stock submission inside a rollback-capable fixture.

Note: an earlier draft that navigated directly to `/sales/quotes/new` redirected to `/login` with the stored session. The final suite follows the real UI path from `/sales/quotes`, which passes.

### 213 - Dynamic Customer Credit Scoring

Status: PASS  
UI paths tested:
- `/sales/credit-rules`
- `/accounting/dynamic-capital`

Backend checks:
- `calculate_dynamic_score` exists.
- `calculate_customer_realtime_credit` exists.
- Active scoring parameters with weights exist.

Screenshots:
- `test-results/211-218/requirements-213-Requireme-31888-capital-pages-are-reachable-chromium-admin/213-credit-rules.png`
- `test-results/211-218/requirements-213-Requireme-31888-capital-pages-are-reachable-chromium-admin/213-dynamic-capital.png`

Videos:
- `test-results/211-218/requirements-213-Requireme-31888-capital-pages-are-reachable-chromium-admin/video.webm`
- `test-results/211-218/requirements-213-Requireme-e76ba-ive-parameter-weights-exist-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: add a write-safe scoring fixture later to prove score recalculation after editing one customer parameter.

### 214 - WhatsApp Top Products Mirror

Status: PASS  
UI paths tested:
- `http://192.168.170.8:3002/reporting`
- `/pricing/market-intelligence`

API tested:
- `http://192.168.170.8:8002/api/v1/reporting/top-products?range=30&limit=3`

Assertions:
- Source reporting page renders.
- Destination market intelligence WhatsApp card renders.
- Top-products API returns product rows with `product_name` and `mention_count`.

Screenshots:
- `test-results/211-218/requirements-214-Requireme-b2a71-ion-market-card-both-render-chromium-admin/214-source-reporting.png`
- `test-results/211-218/requirements-214-Requireme-b2a71-ion-market-card-both-render-chromium-admin/214-destination-market-intelligence.png`

Videos:
- `test-results/211-218/requirements-214-Requireme-b2a71-ion-market-card-both-render-chromium-admin/video.webm`
- `test-results/211-218/requirements-214-Requireme-789ba-urns-real-top-products-data-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: add a polling/live-refresh test later if the source reporting app exposes a safe way to mutate `E2E_AUDIT_20260729_` rows.

### 214.1 - Purchase Advisor Uses WhatsApp Seller Context

Status: PASS  
UI path tested:
- `/operations/purchase-advisor`

API tested:
- `http://192.168.170.8:8002/api/v1/reporting/top-products?range=30&limit=1`
- `http://192.168.170.8:8002/api/v1/reporting/product-sellers?product_name=<topProduct>&days=30&limit=5`

Assertions:
- Purchase advisor form renders product, quantity, urgency, and AI action.
- Seller endpoint returns at least one seller for the top WhatsApp product.
- Seller rows include `sender_phone`.

Screenshot:
- `test-results/211-218/requirements-214-1-Require-6e893-ntity-urgency-and-AI-action-chromium-admin/214-1-purchase-advisor-form.png`

Videos:
- `test-results/211-218/requirements-214-1-Require-6e893-ntity-urgency-and-AI-action-chromium-admin/video.webm`
- `test-results/211-218/requirements-214-1-Require-97bb5-or-the-top-WhatsApp-product-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: add one AI-call test only after provider latency and cost limits are defined for E2E.

### 215 - Notification Role-Cast Regression

Status: PASS  
UI path tested:
- `/notifications`

Backend check:
- `notification_queue_type_check` exists.

Screenshot:
- `test-results/211-218/requirements-215-Requireme-f7e7f-and-queue-constraint-exists-chromium-admin/215-notifications-ui.png`

Video:
- `test-results/211-218/requirements-215-Requireme-f7e7f-and-queue-constraint-exists-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: add a seeded notification creation test later if a safe RPC/test fixture exists.

### 216 - Notification Queue Type Check

Status: PASS  
UI path tested:
- `/notifications`

Backend check:
- `notification_queue_type_check` includes `quote_rejected`.

Screenshot:
- `test-results/211-218/requirements-216-Requireme-842dd-ue-supports-quote-rejection-chromium-admin/216-notifications-quote-rejected-support.png`

Video:
- `test-results/211-218/requirements-216-Requireme-842dd-ue-supports-quote-rejection-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: include a notification queue insert/rollback test in a future database-focused suite.

### 217 - Visitor Management

Status: PASS  
UI path tested:
- `/admin/visitors`

Backend checks:
- `visitors` table includes `full_name`.
- `visitors` table includes `is_active`.
- At least one active visitor exists.

Screenshot:
- `test-results/211-218/requirements-217-Requireme-b990b--list-and-create-affordance-chromium-admin/217-visitors-management.png`

Videos:
- `test-results/211-218/requirements-217-Requireme-b990b--list-and-create-affordance-chromium-admin/video.webm`
- `test-results/211-218/requirements-217-Requireme-fd11f-ctive-visitor-fixture-exist-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: add create/edit visitor write tests with `E2E_AUDIT_20260729_` prefix only after cleanup rules are agreed.

### 217.1 - Visitor Selection on Quotes

Status: PASS  
UI path tested:
- `/sales/quotes` -> click `پیش‌فاکتور جدید` -> `/sales/quotes/new`

Backend checks:
- Active visitor exists.
- `sales_quotes` has `salesperson_id`.
- `sales_quotes` has `visitor_id`.

Screenshot:
- `test-results/211-218/requirements-217-1-Require-a5ba1--picker-when-visitors-exist-chromium-admin/217-1-quote-visitor-picker.png`

Videos:
- `test-results/211-218/requirements-217-1-Require-a5ba1--picker-when-visitors-exist-chromium-admin/video.webm`
- `test-results/211-218/requirements-217-1-Require-7573b-esperson-and-visitor-fields-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: later add a full quote creation test that selects a visitor and verifies the persisted `visitor_id`.

### 218 - Mobile-Bank Screenshot Receipt Marker

Status: PASS  
UI path tested:
- `/accounting/receipts/create`

Backend checks:
- `payment_receipts` has `is_mobile_bank_screenshot`.
- `payment_receipts` has `receipt_image_url`.

Screenshot:
- `test-results/211-218/requirements-218-Requireme-32b21-bile-bank-screenshot-option-chromium-admin/218-receipt-create-mobile-bank-option.png`

Videos:
- `test-results/211-218/requirements-218-Requireme-32b21-bile-bank-screenshot-option-chromium-admin/video.webm`
- `test-results/211-218/requirements-218-Requireme-57b60-ping-can-persist-the-marker-chromium-admin/video.webm`

Exact failing selector: none in final run.  
Root cause: none found by this suite.  
Recommendation: add a safe upload fixture later to prove the marker persists after selecting the mobile-bank screenshot option and uploading a test image.

## Failure Artifacts

Final run failures: none.  
Final run trace zips: none, because `trace: "retain-on-failure"` only keeps traces when a test fails.  
Videos are still available for all tests because `video: "on"` is configured.

## Root Cause Summary

No root cause was found in the final E2E run because all assertions passed.

One test-authoring issue was found and fixed before the final run: direct navigation to `/sales/quotes/new` redirected to `/login` with storageState, while the real user path from `/sales/quotes` to the `پیش‌فاکتور جدید` link worked. The suite now follows the real UI navigation path.

## Recommendations

1. Keep this suite as the smoke/regression layer for 211-218.
2. Add a second write-safe suite only for disposable records prefixed with `E2E_AUDIT_20260729_`.
3. For 212, add transactional/fixture-backed tests for over-credit, overdue, no-credit, and insufficient-stock blocking.
4. For 211, add a real rejected quote notification flow test with a disposable quote.
5. For 214, add live-refresh validation only if the reporting source exposes safe test-data mutation.
6. For 218, add upload persistence validation with a tiny generated screenshot file.
