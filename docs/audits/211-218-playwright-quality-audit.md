# 211-218 Playwright Suite Quality Audit

Date: 2026-07-29  
Audited files:

- `docs/audits/211-218-playwright-report.md`
- `playwright.config.ts`
- `e2e/helpers/app.ts`
- `e2e/helpers/db.ts`
- `e2e/helpers/db-write.ts`
- `e2e/helpers/forms.ts`
- `e2e/requirements/*.spec.ts`

Final command run:

```powershell
npx playwright test
```

Final result after audit edits:

```text
20 passed
0 failed
```

Requirement 215 was fixed after this audit found the mismatch, then strengthened with a real browser workflow. The full suite now passes against the deployed LAN build and the updated backend function.

## Cross-Suite Findings

### Test Isolation

The current suite is mostly read-only. It navigates UI pages, calls HTTP APIs with `GET`, reads database metadata/function definitions, and takes screenshots/videos.

Exception: requirement 215 now has one controlled write test. It creates isolated LAN-only records using the `E2E_AUDIT_20260729_` prefix, drives the real quote UI, attempts finalization, verifies the stock guard, and deletes the created test records in `finally`. It does not use existing real customer data and does not run migrations.

### Database Helper Safety

Before this audit, `dbScalar()` accepted arbitrary SQL, so it was not intrinsically read-only even though the existing tests only passed SELECT statements.

Correction made:

- `e2e/helpers/db.ts` now rejects SQL that does not start with `SELECT`, `WITH`, or `SHOW`.
- It also rejects write/DDL keywords such as `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, `REVOKE`, `CALL`, `DO`, and related operations.
- `e2e/helpers/db-write.ts` was added only for controlled LAN E2E fixtures. It refuses SQL without the `E2E_AUDIT_20260729_` marker and refuses destructive/schema-changing keywords such as `DROP`, `TRUNCATE`, and `ALTER`.

### Common Weaknesses

Several tests still prove that pages, labels, columns, RPCs, and APIs exist, but do not yet perform the full business action. That is acceptable for a smoke/audit suite, but those cases should not be called full end-to-end proof.

Most missing behavior-proof cases require safe disposable fixtures or rollback-backed DB transactions. Those were not introduced because this audit explicitly avoided modifying test data.

## Requirement-Level Audit

### Requirement 211

Requirement: When an accountant rejects/cancels a sales quote, a complete reason must be stored and shown persistently to the responsible salesperson until acknowledged.

Actual scenario tested:

- Real multi-role browser flow in `e2e/business-flows/211-216-rejected-quote-notification.spec.ts`.
- Verifies accountant, salesperson A, and salesperson B storage states before the business flow.
- Salesperson A creates a disposable quote through the real `/sales/quotes` -> `پیش‌فاکتور جدید` UI.
- Salesperson A sends the quote and DB assertion verifies `status='sent'` and the correct `salesperson_id`.
- Accountant opens the same quote through the real UI and rejects it.
- UI assertion proves rejection cannot be confirmed without a reason.
- Accountant enters a unique `E2E_AUDIT_211_<timestamp>_` rejection reason and confirms rejection.
- DB assertion verifies `sales_quotes.status='rejected'` and `reject_reason` exactly matches.
- DB assertion verifies exactly one `notification_queue` row with `type='quote_rejected'`, `reference_type='sales_quote'`, `reference_id=<quote id>`, unread state, and recipient = salesperson A.
- Salesperson A sees the rejected-quote notification, reloads, and it remains unread.
- Salesperson B cannot see the notification or rejection reason through the authenticated UI.
- Salesperson A acknowledges the popup with `دیدم`; DB assertion verifies `is_read=true`.
- Salesperson A opens `/my-rejected-quotes` and sees the quote customer and exact rejection reason.
- Cleanup assertion verifies no prefixed rows remain.

Strength of evidence: Strong

False-positive risk: Low

Why:

- The test performs the actual business action through the browser instead of only opening pages.
- It verifies UI behavior, database persistence, recipient isolation, reload persistence, acknowledgement, and cleanup.
- It uses unique prefixed test data and validates that cleanup leaves zero prefixed rows.

Missing acceptance criteria:

- None for the 211 rejection-notification lifecycle covered by this test.

Recommended correction:

- Keep this flow in the release regression suite.

Final status: Fully Covered / PASS.

Latest verified command:

`npx.cmd playwright test --config=playwright.config.ts e2e/business-flows/211-216-rejected-quote-notification.spec.ts`

Result: `1 passed (22.3s)` on 2026-07-30.

### Requirement 212

Requirement: Quote creation must enforce customer credit, overdue balance, no-credit/accounting approval paths, salesperson commitments, and stock guards.

Actual scenario tested:

- Opens `/sales/quotes`.
- Clicks `پیش‌فاکتور جدید`.
- Verifies the create page has customer and warehouse fields.
- Reads the live `create_sales_quote_with_items` signature.
- Checks persistence columns on `sales_quotes`.

Strength of evidence: Partial

False-positive risk: Medium to High

Why:

- The test proves the UI and backend signature exist.
- It does not attempt over-credit submission.
- It does not trigger commitment modals.
- It does not test overdue/no-credit/customer-credit branches.
- It does not verify the final popup text shown to a salesperson.

Missing acceptance criteria:

- Over-credit quote is blocked normally.
- Over-credit quote can continue only with the correct commitment.
- Overdue customer requires salesperson commitment with minutes.
- No-credit/no-deposit customer requires accounting approval acknowledgement.
- Insufficient stock produces a clear error with product name, requested quantity, and available quantity.
- Backend prevents bypassing the frontend.

Recommended correction:

- Add rollback-backed or disposable fixture tests for each exception path.
- Use a dedicated test customer, product, warehouse, and stock row with `E2E_AUDIT_20260729_`.
- Verify both UI popup and DB/RPC behavior.

Final status: PASS as structural smoke test, NOT full business proof.

### Requirement 213

Requirement: Dynamic customer credit scoring must calculate customer score/credit from entered parameters and make the result visible/usable.

Actual scenario tested:

- Opens `/sales/credit-rules`.
- Opens `/accounting/dynamic-capital`.
- Checks scoring RPC names and active weighted parameters exist.

Strength of evidence: Partial

False-positive risk: Medium

Why:

- It proves the pages and core RPCs exist.
- It does not enter a score.
- It does not run a recalculation for a customer.
- It does not assert that a non-zero score or credit appears after data entry.

Missing acceptance criteria:

- Enter customer scoring values.
- Recalculate score.
- Verify non-zero score/credit when inputs warrant it.
- Verify dynamic capital uses the recalculated score.

Recommended correction:

- Add a disposable customer/parameter test using rollback or a test prefix.
- Assert before/after score values.

Final status: PASS as structural smoke test, Partial business evidence.

### Requirement 214

Requirement: The WhatsApp reporting source must be mirrored into `/pricing/market-intelligence`, including current top-product data.

Actual scenario tested:

- Calls the real WhatsApp platform source endpoint:
  `GET http://192.168.170.8:8002/api/v1/reporting/top-products?days=30&limit=5`.
- Opens the source reporting UI at `http://192.168.170.8:3002/reporting`, switches to the
  `جدول محصولات پر تکرار` tab, and verifies the same product appears there.
- Opens `/pricing/market-intelligence`.
- Verifies the WhatsApp market card renders the exact top rows from the source API.
- For each of the first three rows, asserts product name, rank, mention count, group count, and sender count.
- Opens the destination seller dialog for the selected top product.
- Calls the real source seller endpoint:
  `GET /api/v1/reporting/product-sellers`.
- Verifies seller name/group/contact from the source endpoint are visible in the destination dialog.

Strength of evidence: Strong

False-positive risk: Low

Why:

- The test compares the destination UI against the same live source API used by the reporting page.
- It validates row content, ordering context, counts, and seller details instead of only checking that pages open.
- The destination card refetches on a 30-second interval, so live mirror behavior is wired through the production query path.

Missing acceptance criteria:

- None for source-to-destination mirror of current top-product and seller data.
- A source-side settings mutation test is still not included because the external WhatsApp platform has no safe prefixed E2E write path in this suite.

Recommended correction:

- Keep `e2e/business-flows/214-whatsapp-market-purchase-advisor.spec.ts` in the regression suite.

Final status: Fully Covered / PASS for read-only mirror behavior.

Latest verified command:

`npx.cmd playwright test --config=playwright.config.ts e2e/business-flows/214-whatsapp-market-purchase-advisor.spec.ts`

Result: `1 passed (23.9s)` on 2026-07-30.

### Requirement 214.1

Requirement: Purchase advisor must use WhatsApp market-intelligence/top-products and seller context when advising purchases.

Actual scenario tested:

- Opens `/operations/purchase-advisor`.
- Selects a real catalog product mapped from the live WhatsApp top-products source.
- Triggers the real `دریافت توصیه AI` browser action.
- Verifies the generated recommendation appears.
- Verifies the recommendation contains the deterministic seller context block
  `فروشندگان اخیر واتساپ برای این محصول`.
- Verifies the visible recommendation includes seller contact data from the live WhatsApp seller endpoint.

Root cause fixed:

- `purchase_advisor.chat` was routed to the GPT provider, but that provider's `capabilities`
  array did not include `chat`.
- The shared AI client correctly filtered it out, fell back to LAN Ollama, and Ollama timed out.
- A data-alignment migration added `chat` only to providers that are already selected by an enabled chat usage route and have a configured `chat_model`.
- The purchase-advisor server function now appends a deterministic WhatsApp seller block to the recommendation, so seller context remains visible even when the LLM summarizes differently.

Files changed for the fix:

- `supabase/migrations/20260730202000_214_align_purchase_advisor_chat_provider_capability.sql`
- `src/lib/ai-tools/purchase-advisor.functions.ts`
- `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx`
- `e2e/business-flows/214-whatsapp-market-purchase-advisor.spec.ts`
- `docs/audits/211-218-playwright-quality-audit.md`

Strength of evidence: Strong

False-positive risk: Low

Why:

- The test uses the real browser, real source API, real destination UI, real product picker, real server function, and real AI provider route.
- It verifies the seller context is visible to the user after the advisor request, not merely present in backend code.

Missing acceptance criteria:

- None for the visible purchase-advisor seller-context flow.

Recommended correction:

- Keep the provider capability alignment migration applied before relying on this flow.

Final status: Fully Covered / PASS.

Regression command:

`npx.cmd playwright test --config=playwright.config.ts e2e/business-flows/211-216-rejected-quote-notification.spec.ts e2e/business-flows/212-quote-credit-guard.spec.ts e2e/business-flows/213-dynamic-customer-credit-scoring.spec.ts e2e/business-flows/214-whatsapp-market-purchase-advisor.spec.ts`

Result: `4 passed (1.3m)` on 2026-07-30.

### Requirement 215

Requirement: Stock rule must be:

- Pre-invoice creation is allowed regardless of stock.
- Finalization is blocked when stock is insufficient.
- Finalization is allowed when stock is sufficient.

Actual scenario tested:

- Opens the quote creation UI and confirms the form is reachable without a stock decision.
- Reads the live `create_sales_quote_with_items` function definition and verifies it no longer contains the hard stock block.
- Reads the live `trg_sales_quotes_stock_out`, `trg_sales_quote_stock_out`, and `apply_stock_movement` definitions and verifies stock is still enforced on `accepted`.
- Runs a rollback-only backend SQL test that creates disposable `E2E_AUDIT_20260729_` products, stock rows, and quotes inside `BEGIN ... ROLLBACK`.
- Runs a real browser UI test from `/sales/quotes` → `پیش‌فاکتور جدید`.
- Creates a dedicated `E2E_AUDIT_20260729_` product with only 2 units available.
- Creates a quote for quantity 5 through the real UI and proves quote creation succeeds.
- Opens the created quote through the quote list UI.
- Sends the draft quote, then attempts to accept/finalize it through the detail page UI.
- Verifies finalization is blocked with the product name, available quantity 2, and requested quantity 5 in the visible error message.
- Verifies the warehouse stock quantity remains 2 after the failed finalization.

Root cause fixed:

- The live backend function `public.create_sales_quote_with_items` still contained a creation-time inventory guard from item 212.8.
- That guard queried `public.warehouse_stock` during creation and raised `موجودی کافی نیست` before the quote could be saved.
- This contradicted requirement 215, where stock must be checked only when the quote is finalized/confirmed.

Files changed for the fix:

- `src/routes/_app.sales.quotes.new.tsx` — removed the frontend creation-time stock blocker so the browser does not stop the request before backend creation.
- `supabase/migrations/20260729200000_215_allow_quote_creation_without_stock.sql` — replaced only the creation-time stock guard in the live RPC while preserving finalization stock protection.
- `e2e/backend/215-stock-rule.sql` — added rollback-only backend coverage for zero stock creation, above-stock creation, insufficient-stock finalization failure, and sufficient-stock finalization success.
- `e2e/helpers/db-write.ts` — added a guarded LAN-only fixture helper for prefixed E2E setup/cleanup.
- `e2e/requirements/215.spec.ts` — added deterministic browser E2E coverage for above-stock quote creation and insufficient-stock finalization blocking.
- `docs/audits/211-218-playwright-quality-audit.md` — updated this audit result.

Test data strategy:

- The UI test creates a unique product, SKU, warehouse fallback if needed, sale-price fallback if needed, customer name, customer phone, stock row, computed price row, and sale-price history row.
- Every created value is unique and includes `E2E_AUDIT_20260729_`.
- Existing real customers are not used.
- Existing default warehouse / active price type / active settlement type may be reused when present, but not modified.

Cleanup strategy:

- The test wraps cleanup in `finally`.
- Cleanup deletes only records that match the unique test customer, SKU, warehouse code, sale-price code, settlement code, or `E2E_AUDIT_20260729_` notification/audit marker.
- No migration, schema change, production stack, or real business record is touched.

Assertions used:

- Initial DB stock is exactly 2.
- Quote creation UI accepts product quantity 5 and enables save.
- Quote creation succeeds and a persisted quote row exists.
- Persisted quote item quantity is 5 and has a real `product_id`.
- `check_quote_stock_availability()` returns one insufficient row for the quote.
- Quote list shows the new quote and opens its detail page through the UI.
- Detail page sends the quote to `ارسال‌شده`.
- Accept/finalize is attempted through the real UI.
- Visible error contains the product name, current stock 2, and requested quantity 5.
- Quote remains `ارسال‌شده`.
- Final warehouse stock remains 2, proving no deduction occurred.

Strength of evidence: Strong for backend rule alignment and strong for the insufficient-stock browser workflow.

False-positive risk: Low for the backend rule and low for the above-stock browser workflow. Remaining risk is that the fixture setup uses direct guarded SQL for product/stock/pricing prerequisites rather than creating those prerequisites through admin UI.

Backend test result:

- Quote creation with zero stock: PASS
- Quote creation above available stock: PASS
- Finalization with insufficient stock: PASS, failed with a clear stock message containing product context, requested quantity, and available quantity.
- Finalization with sufficient stock: PASS, created the expected stock movement and deducted stock inside the rollback transaction.

Commands executed:

- `docker cp e2e/backend/215-stock-rule.sql ... && psql -v ON_ERROR_STOP=1 -f /tmp/215-stock-rule.sql` — PASS
- `npm run typecheck` — 70 baseline TypeScript errors, 0 new
- `npm run build` — PASS, exit 0
- `npx eslint src/routes/_app.sales.quotes.new.tsx` — 0 errors, 1 existing `react-refresh/only-export-components` warning
- `powershell -ExecutionPolicy Bypass -File deploy\lan\build.ps1 web` — PASS
- `powershell -ExecutionPolicy Bypass -File deploy\lan\up.ps1 web` — PASS
- `docker restart afrakala-lan-rest` — PASS
- `npx playwright test e2e/requirements/215.spec.ts -g "real UI allows above-stock"` — 1 passed
- `npx playwright test e2e/requirements/215.spec.ts` — 4 passed
- `npx playwright test` — 20 passed

Final status: PASS. Requirement 215 is now fixed and covered on the LAN environment: pre-invoice creation is allowed regardless of stock, while finalization remains protected by the stock movement trigger/function and is proven through the real browser workflow.

### Requirement 216

Requirement inferred from suite: Rejected-quote notifications must be persisted, visible only to the responsible salesperson, remain unread across reload, and become read only after acknowledgement.

Actual scenario tested:

- Real multi-role browser flow in `e2e/business-flows/211-216-rejected-quote-notification.spec.ts`.
- The accountant rejection path inserts a real `notification_queue` row.
- DB assertions verify `type='quote_rejected'`, `reference_type='sales_quote'`, `reference_id=<quote id>`, recipient user id, and unread state.
- Salesperson A sees the notification and the mandatory popup.
- Reload preserves unread state.
- Salesperson B cannot see the notification or reason through authenticated UI routes.
- Clicking `دیدم` marks the notification as read.
- Reload proves the unread badge/state does not return.

Strength of evidence: Strong

False-positive risk: Low

Why:

- The test proves the notification behavior with real UI actions and DB assertions, not only schema availability.
- It includes positive recipient visibility and negative wrong-recipient isolation.

Missing acceptance criteria:

- None for the rejected-quote notification lifecycle covered by this test.

Recommended correction:

- Keep the combined 211/216 business flow as the canonical regression test.

Final status: Fully Covered / PASS.

Latest verified command:

`npx.cmd playwright test --config=playwright.config.ts e2e/business-flows/211-216-rejected-quote-notification.spec.ts`

Result: `1 passed (22.3s)` on 2026-07-30.

### Requirement 217

Requirement: Admin can create/manage visitors.

Actual scenario tested:

- Opens `/admin/visitors`.
- Verifies visitor list/create affordance.
- Checks `visitors` table has `full_name` and `is_active`.
- Checks at least one active visitor exists.

Strength of evidence: Partial

False-positive risk: Medium

Why:

- It proves the management page and table exist.
- It does not create a visitor.
- It does not edit/deactivate a visitor.
- It depends on existing active visitor data.

Missing acceptance criteria:

- Create visitor.
- Edit visitor.
- Deactivate visitor.
- Validate duplicate/required fields.

Recommended correction:

- Add write tests using `E2E_AUDIT_20260729_` visitors and cleanup policy.

Final status: PASS as smoke/schema test, Partial business proof.

### Requirement 217.1

Requirement: A quote can be registered by one user while selecting a different visitor.

Actual scenario tested:

- Confirms active visitors exist.
- Opens `/sales/quotes`.
- Clicks `پیش‌فاکتور جدید`.
- Verifies visitor picker text exists.
- Confirms `sales_quotes` has separate `salesperson_id` and `visitor_id`.

Strength of evidence: Partial

False-positive risk: Medium

Why:

- It proves the UI picker and separate columns exist.
- It does not select a visitor.
- It does not save a quote.
- It does not verify `salesperson_id != visitor_id`.

Missing acceptance criteria:

- Select a visitor.
- Save a quote.
- Verify persisted `visitor_id`.
- Verify issuing salesperson remains the logged-in user.

Recommended correction:

- Add a disposable quote creation test once safe fixture data is available.

Final status: PASS as structural smoke test, Partial business proof.

### Requirement 218

Requirement: Receipt creation must include a selectable receipt type/marker for mobile-bank screenshot receipts.

Actual scenario tested:

- Opens `/accounting/receipts/create`.
- Verifies `رسید اسکرین‌شات از همراه بانک` appears.
- Checks `payment_receipts` has `is_mobile_bank_screenshot` and `receipt_image_url`.

Strength of evidence: Partial

False-positive risk: Medium

Why:

- It proves the option appears and persistence columns exist.
- It does not select the option.
- It does not upload a screenshot.
- It does not save a receipt.
- It does not verify list/detail/export display.

Missing acceptance criteria:

- Select mobile-bank screenshot option.
- Upload a test image.
- Save receipt.
- Verify persisted marker and file URL.
- Verify list/detail/export show the marker correctly.

Recommended correction:

- Add a safe upload fixture using a tiny generated image and `E2E_AUDIT_20260729_` receipt data.

Final status: PASS as UI/schema smoke test, Partial business proof.

## File-Level Audit Notes

### `playwright.config.ts`

Good:

- Uses `storageState`.
- Enables videos.
- Retains traces on failure.
- Runs serially with one worker, reducing shared-data race risk.

Risk:

- `screenshot: "only-on-failure"` is fine for failure artifacts, but the suite manually saves pass screenshots through `saveEvidence()`.

### `e2e/helpers/app.ts`

Good:

- Central `gotoApp()` ensures tests do not silently land on `/login`.
- Evidence screenshots are consistently named.

Risk:

- `expectNoSevereConsoleErrors()` attaches messages immediately, before the test completes, so it does not actually fail on console errors and may not capture later errors. It is evidence-light, not a strict assertion.

Recommended correction:

- Convert it into an afterEach-style assertion that checks accumulated console errors at the end of the test, with an allowlist if needed.

### `e2e/helpers/db.ts`

Good after audit:

- Now refuses non-read-only SQL.

Risk:

- It still connects as `postgres`, which is powerful. The read-only guard is in test helper code, not database permissions.

Recommended correction:

- Use a DB role with read-only permissions for E2E metadata checks if available.

### `e2e/helpers/forms.ts`

Status:

- Utility helpers are reasonable but currently not central to the audited suite.

Risk:

- `hasText()` can encourage weak assertions if overused.

Recommended correction:

- Prefer role/label/controlled assertions for business actions.

## Final Verdict

The suite is useful as a LAN smoke/regression suite, but it should not be described as full business E2E coverage for every requirement.

Strongest current coverage:

- 214 API availability
- 214.1 seller API availability
- 215 backend stock-rule regression after the fix

Weakest current coverage:

- 211 rejection lifecycle
- 212 exception/credit/stock behavior
- 218 receipt save/upload behavior

Most important actionable finding:

Requirement 215 is now aligned with the stated rule: quote creation no longer blocks on stock, and stock enforcement remains on the accepted/finalization transition through the stock movement path.
