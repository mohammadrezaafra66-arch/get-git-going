# PROJECT X-RAY — FINAL REPORT

**Subject:** AfraKala ERP (`D:/AfraKalaTest/app`), git `staging` @ `99f6bd58` (2026-08-15), remote `get-git-going`.
**Auditor:** read-only forensic pass 2026-08-17.
**Live schema:** LAN container `afrakala-lan-db` SELECT-only. Production `192.168.170.10` was not touched.

This report is assembled from `audit/inventory/*`, `audit/findings.jsonl`, `audit/traces/*`, `audit/coverage.md`. Documentation and folder names were treated as intent, never as behavior.

---

## 1. Executive summary

AfraKala is a Persian RTL trading ERP: product catalog and pricing board, **sales quotes (پیش‌فاکتور)** as the commercial document, unified persons, accounting receipts/AR/AP, messenger inquiries, gamification, Asan export, Didar import, and bot HTTP APIs. The runtime is a TanStack Start React app over self-hosted Supabase (GoTrue + PostgREST + Postgres RPCs). There is no separate Nest/Django API.

**Completion, weighted by business importance (not file count):**

| Weight | Area | Estimate |
|---|---|---|
| High | Login, quotes create/list/cancel, products list, persons, receipt posting RPC | **Working on LAN** |
| High | Dashboard “today sales” + reports sales + delivery-receipt invoice picker | **Broken** (dropped `invoices`) |
| Medium | Nominations, inquiries UI, league read, Asan, pricing | **Working / partial** |
| Medium | Price-lists menu, OCR receipts, reward execution | **UI stub or engine missing** |
| Low | Duplicate admin key/gamification URLs, leftover redirects | **Cosmetic** |

**Top 3 risks**

1. **P0 — Invoice table is gone; several production UI paths still query it.** Dashboard KPIs go to zero without an error (`F-001`, `F-002`). Reports throw (`F-003`). Delivery-receipt invoice search throws (`F-004`). LAN `to_regclass('public.invoices')` is NULL after migration 332.
2. **P1 — Typecheck is red (70 errors)** and generated `types.ts` still describes dropped tables (`F-005`, `F-019`). Orphan invoice/payment serverFns do not compile (`F-006`).
3. **P2 — Guard loading bypass + unguarded `/presence`.** `requirePermission` returns allow-through while roles load (`F-015`). Presence has no module RBAC (`F-014`).

**Top 3 blockers to a truthful sales dashboard**

1. Replace every `.from("invoices")` with `sales_quotes` (or a view).
2. Regenerate Supabase types from LAN/staging.
3. Delete or rewrite `src/lib/invoices/functions.ts` and `src/lib/accounting/functions.ts`.

Weighted completion of the **core trading loop** (auth → quote → receipt): **~80% working**, with **dashboard/reporting still describing a deleted invoice subsystem**.

---

## 2. Repository map

See `audit/inventory/tree.md`. Product truth is `app/`, not the wrapper `D:/AfraKalaTest` dumps or `afrakala-deploy-sidebar/`.

Stale by last-commit date: `openapi/` (2026-06-13), `.cursor/` (2026-06-11), `automation/` (2026-07-12).

---

## 3. Technology stack (versions from package.json)

TanStack Start 1.167 / Router 1.168 / Query 5.83 / React 19.2 / Vite 7.3 / Tailwind 4.2 / Zod 4.3 / Supabase JS 2.104 / TypeScript 5.8 / Playwright 1.62 / ESLint 9. Postgres via Supabase; PostgREST types file claims version 14.5.

Full table: `audit/inventory/stack.md`.

---

## 4. Domain & module map

Primary sidebar modules (`primary-modules.ts`): dashboard, assistant, catalog, sales, finance, analytics, admin. NAV seeds (124) match PRIMARY_MODULES paths (membership extract empty-diff).

Domain folders under `src/lib`: `sales`, `persons`, `pricing`, `accounting`, `messenger`, `operations`, `rbac`, `asan`, `automation`, `invoices` (dead).

RBAC: `app_role` enum + `role_permissions` + `hasPermissionEx`. Quotes NAV still tagged `module: "invoices"` (`F-013`).

---

## 5. Feature inventory

| Feature | Status | Evidence | Confidence |
|---|---|---|---|
| Password login + `/_app` session gate | WORKING | traces/auth-login.md | HIGH |
| Create sales quote | WORKING | quotes.new.tsx:316; LAN RPC exists | HIGH |
| List/search products | WORKING | products.index.tsx RPC search_product_ids | HIGH |
| Update/create person | WORKING | persons/functions.ts; person_create_full on LAN | HIGH |
| Cancel/reject quote | WORKING | quote-status.functions.ts; update_sales_quote_status on LAN | HIGH |
| Post payment receipt | WORKING | receipts.$receiptId post_receipt_accounting on LAN | MEDIUM |
| Person merge | WORKING | LAN person_merge includes mutual_settlements.person_id | HIGH |
| Promotion nominations | WORKING | RPCs on LAN; types.ts missing Functions | HIGH |
| Inquiries board + status | PARTIAL | update_inquiry_status wired; tick errors swallowed | MEDIUM |
| League read (get_current_league) | WORKING | e2e expects 200; RPC exists | MEDIUM |
| League start/settle RPC | WORKING on LAN schema; UI/e2e stale | 335 + pg_proc title_fa | HIGH |
| Didar CRM | WORKING at /operations/didar; old URL redirects | integrations.didar.tsx:28 | HIGH |
| Dashboard sales KPI/chart | BROKEN | F-001 F-002 | HIGH |
| Reports sales tab | BROKEN | F-003 | HIGH |
| Delivery receipt ↔ invoice | BROKEN | F-004 | HIGH |
| Price lists page | PARTIAL / UI-only | EmptyState; tables exist | HIGH |
| OCR receipts ops page | PARTIAL | honest missing-table Alert | HIGH |
| Reward execution | PARTIAL | “not implemented yet” | HIGH |
| Invoice CRUD serverFns | ORPHAN | F-006 | HIGH |
| Dummy automation enqueue | WORKING (admin) | F-020 | HIGH |

---

## 6–9. Working / partial / UI-only / backend-only

**Working:** login, quotes, products, persons, receipt RPC, nominations RPCs, Didar surviving page, role assign pages, NAV↔sidebar alignment.

**Partial:** inquiries tick, league admin copy vs live RPC, price-lists, OCR stub, rewards engine, RBAC loading window.

**UI-only:** `/price-lists` EmptyState (`_app.price-lists.tsx:14`) despite live `price_lists` tables.

**Backend-only (no SPA menu):** `/api/public/bot/*`, market-rate ingest hook, pricing queue hook, marketing-tasks hook, `/api/healthz`, MCP/Lovable. Not orphans — other consumers.

---

## 10. Dead buttons & actions

| Control | File:line | What happens |
|---|---|---|
| Delivery-receipt invoice combobox | DeliveryReceiptUploadForm.tsx:105 | Query to missing `invoices` throws when opened |
| Reports “sales invoices” query | reports.tsx:90 | Throws; tab error UI |
| Invoice CRUD buttons | none in UI | serverFns never imported |

Quote cancel is **not** dead: `updateQuoteStatus` → live RPC.

Didar “coming soon” buttons are **gone**; `/integrations/didar` only redirects.

---

## 11–13. Orphans

**Frontend:** No knip graph. Hidden routes (`/presence`, `/api-keys`, `/operations/api-keys`, `/operations/gamification`, `/operations/receipts`) are mounted file routes, not unused exports. Redirects (capital, pending users, old gamification admin) are intentional.

**Backend:** `createInvoiceFn` / `updateInvoiceFn` / `deleteInvoiceFn` / `recordPaymentFn` — defined, never imported (`F-006`). They also import missing `@/integrations/supabase/server`.

**Database:** Live missing: `invoices`, `invoice_items`, `waybills`, `waybill_items`, `waybill_custom_fields`, `payments`, `ocr_receipts`. Still in `types.ts`: invoices/invoice_items/waybills (`F-005`). `price_lists` exists and is unused by `.from()`.

---

## 14. API traceability matrix

See `audit/inventory/matrix-api.md` and `matrix-routes.md`.

---

## 15–17. Connection gaps

**FE → BE:** invoices, payments, ocr_receipts (missing tables). Six RPCs missing from types but present live (`F-018`).

**BE → FE:** bot/public hooks have no in-app screens (by design). Dummy/torob automation UI exists for admins.

**Module → module:** quotes no longer FK to invoices; dashboard/reports/delivery-receipts were not updated. `ModuleKey` `"invoices"` leftover.

---

## 18. Dead / duplicate / legacy code

- Duplicate: `/roles` vs `/admin/roles` (different jobs, both NAV).
- Duplicate: `/api-keys` + `/operations/api-keys` vs `/bot-api-keys` (`F-016`).
- Duplicate: `/operations/gamification` vs `/gamification/admin` (`F-017`).
- Legacy redirects: Didar, capital, users/pending, admin/gamification (`F-021`, `F-022`).
- Dead: `src/lib/invoices/*`, invoice branches in `lib/accounting/functions.ts`.

---

## 19. Mock / fake / placeholder in production paths

- `/price-lists` EmptyState copy “به‌زودی” — reachable from catalog sidebar (`F-008`).
- Rewards footer “not implemented yet” — reachable from admin gamification (`F-009`).
- Dummy job enqueue is a **real** `DUMMY_RUN` row, admin-gated (`F-020`) — not fake prices.
- Dashboard zeros are **not** mocks; they are failed queries displayed as empty (`F-001`).

---

## 20. TODO / FIXME / HACK register

| Location | Text |
|---|---|
| `src/lib/pricing/workbench-queries.ts:6` | TODO scale >10k combined filters |
| `src/routes/_app.gamification.admin.rewards.tsx:247` | Reward execution engine not implemented yet |

No other `TODO|FIXME|HACK` hits in `src/` besides identifier comments matching `XXX` digits.

---

## 21. Documentation drift

- `registry.ts:329` says invoices table still in DB — false on LAN (`F-007`).
- League UI/e2e claim start_league_season 400 title_fa — false on LAN after 335 (`F-010`).
- PROGRESS person_merge vs 319 — fixed in 335 live (`F-023`).
- login.tsx meta still says «فاکتورها» (`F-024`).
- `types.ts` vs live schema (`F-005`, `F-018`).
- inquiry-status.ts 42P10 comment possibly stale (`F-011`).

---

## 22. Database & migration issues

- 523 migration files; latest `335_converge_environment_drift` (2026-08-11).
- 332 dropped invoices; frontend not fully converted.
- types.ts not regenerated (still lists invoices, invoice_items, waybills; omits several live RPCs and `sales_reminders` / `automation_jobs`).
- `payments` and `ocr_receipts` absent on LAN.
- person_merge gate (328) + 335 registry includes `mutual_settlements.person_id`.

---

## 23. Auth / permission gaps

- `requirePermission` allow-through while `rolesLoading` (`F-015`).
- `/presence` login-only (`F-014`).
- `purchase_specialist` / `site` omitted from `ALL_ROLES` picker (`roles.ts:33`) by comment design.
- RLS not enumerated (unknowns.md).
- Admin short-circuit in `hasPermission`.

---

## 24. Error-handling gaps

- Dashboard invoice queries: catch → zero (`F-001`).
- Inquiry tick: catch empty (`InquiryBoard.tsx:211`).
- Quote create: toast + rejection dialog (good).
- persons serverFn: Response-to-Error wrapper (good).
- Reports: throw (visible error, still broken).

---

## 25. Build / type / lint / test status

**Typecheck** (`npm run typecheck`, 2026-08-17, 134s, exit 2): **70 `error TS`**. Raw log: `audit/inventory/typecheck.txt`. Clusters:

- `src/lib/invoices/functions.ts` and `src/lib/accounting/functions.ts` — missing `@/integrations/supabase/server`, ZodError `.errors`, createServerFn middleware shape.
- `src/lib/audit/index.ts` — same missing server module.
- `src/routes/_app.admin.sales-reminders.tsx` — `sales_reminders` not in generated types.
- `src/routes/_app.admin.automation.tsx` — `automation_jobs` not in types.
- `src/routes/_app.products.index.tsx` — implicit any.

**Lint:** `npx eslint .` hung >7 minutes with zero output (killed). Alternative `npx eslint src --max-warnings 99999` (no `--fix`) finished in 22s, **exit 1: 1133 problems (706 errors, 427 warnings)**; 700 errors prettier-fixable. Summary: `audit/inventory/eslint-summary.txt`.

**Tests:** generic `test` script does not exist. Playwright not run. `test:receipt-ocr` not run.

**Build:** `vite build` not run (heavy; not required if typecheck already fails).

---

## 26. Risk register

| Risk | Sev | Evidence |
|---|---|---|
| Users trust dashboard sales totals that are always 0 after invoice drop | P0 | F-001 F-002 |
| Reports sales tab unusable | P1 | F-003 |
| Delivery receipts cannot attach “invoice” | P1 | F-004 |
| CI/typecheck red; generated types lie | P1 | F-019 F-005 |
| Role guard skip during load | P2 | F-015 |
| Presence attendance visible to every login | P2 | F-014 |
| Dummy jobs on shared LAN if module enabled | P2 | F-020 |
| Stale e2e expects league 400 | P2 | F-010 |
| Price-lists / rewards look like features and are not | P2 | F-008 F-009 |

---

## 27. Remediation backlog (P0 → P3)

1. **P0** Rewrite dashboard stats/chart from `sales_quotes`.
2. **P1** Rewrite reports sales tab the same way.
3. **P1** Point delivery-receipt picker at quotes; drop invoice number column UI.
4. **P1** Delete or quarantine `src/lib/invoices/functions.ts` and invoice branches of `lib/accounting/functions.ts`.
5. **P1** Regenerate `types.ts`; add `sales_reminders`, `automation_*`, nomination RPCs; remove dropped tables.
6. **P2** `requirePermission`: block or pending, never allow, while roles load.
7. **P2** Guard `/presence` or hide it.
8. **P2** Implement or hide `/price-lists`; implement or hide reward execution.
9. **P2** Fix league/e2e comments; retest `start_league_season` expecting success.
10. **P3** Redirect duplicate key/gamification URLs; fix login meta; registry comment; ModuleKey rename.

---

## 28. Dependency-aware repair order

1. **DB/types:** regenerate types from LAN (tables already dropped; do not recreate invoices).
2. **Delete dead serverFns** so tsc can see remaining errors.
3. **API contracts:** dashboard/reports/delivery-receipts → `sales_quotes`.
4. **Guards:** rolesLoading + presence.
5. **UI stubs:** price-lists, rewards, OCR route visibility.
6. **Docs/e2e:** league, merge, invoices comments.
7. **Duplicates:** redirects only after canonical pages confirmed.

---

## 29. UNKNOWN / could not verify

Full list: `audit/unknowns.md`. Material: production schema, tick_inquiries execute, RLS catalog, eslint final tally if hung, component unused-export graph, nginx rewrites.

---

## 30. Coverage report

See `audit/coverage.md`. Named 210 routes and 157 RPCs. Deep-read a minority. Live-probed a handful of tables/RPCs on LAN only. No production. No knip. Seven P5 traces written.

---

## P8 self-challenge notes

- League “broken RPC” **downgraded** from BROKEN to DOC_DRIFT/`WORKING` after reading 335 and `pg_get_functiondef` (`F-010`).
- person_merge 319 gap **downgraded** after LAN def contains `mutual_settlements.person_id` (`F-023`).
- OCR receipts **not** marked BROKEN because the page handles 42P01 (`F-012`).
- Didar coming-soon **not** current behavior (`F-021`).
- `createInvoiceFn` is ORPHAN not “missing backend” — backend exists in JS and would 42P01 if called (`F-006`).
- HIGH confidence used only where both ends were read (source + LAN or source + source).
