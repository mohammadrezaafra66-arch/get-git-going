# Route ↔ Page ↔ Guard ↔ Menu

Generated 2026-08-17. File routes: 210. NAV seeds: 124. PRIMARY_MODULES paths: 125. After extract, **every NAV `to` is listed in PRIMARY_MODULES.paths** (nav-not-in-primary-modules.txt empty). Sidebar coverage of NAV is complete; unmatched rows are routes that never appear in the menu.

Auth: `/_app` `beforeLoad` requires a session (`src/routes/_app.tsx:23-85`). Module RBAC is per-route `requirePermission` / `requireAdmin` / `requireAnyRole`.

## Menu rows (NAV) — sample of critical + anomalies

| Route (public) | Page file | Guard | In NAV | In sidebar module | Status |
|---|---|---|---|---|---|
| `/login` | `src/routes/login.tsx` | public; redirects if session | no | n/a | WORKING |
| `/dashboard` | `_app.dashboard.tsx` | `requirePermission("dashboard","view")` | yes | dashboard | PARTIAL (KPI uses dropped `invoices`) |
| `/sales` | `_app.sales.search.tsx` via `/sales/` | `requirePermission("sales","view")` | yes | sales | WORKING |
| `/sales/quotes` | `_app.sales.quotes.tsx` layout | `requirePermission("sales","view")` | yes | sales | WORKING |
| `/sales/quotes/new` | `_app.sales.quotes.new.tsx` | `requireAnyRole(admin,manager,sales)` | no (create via quotes UI) | reachable | WORKING |
| `/persons` | `_app.persons.tsx` | `requirePermission("persons","view")` | yes | sales | WORKING |
| `/persons/merge` | `_app.persons_.merge.tsx` | `requireAnyRole(admin,manager)` | yes | sales | WORKING (live person_merge includes mutual_settlements) |
| `/accounting/receipts` | `_app.accounting.receipts.tsx` | `requireAnyRole(admin,manager,accountant)` | yes | finance | WORKING |
| `/reports` | `_app.reports.tsx` | `requirePermission("reports","view")` | yes | analytics | PARTIAL (sales tab queries `invoices`) |
| `/price-lists` | `_app.price-lists.tsx` | `requirePermission("price-lists","view")` | yes | catalog | HALF-BUILT EmptyState |
| `/gamification/league` | `_app.gamification.league.tsx` | `requireAnyRole` 5 roles | yes | analytics | WORKING read path |
| `/gamification/admin/leagues` | `_app.gamification.admin.leagues.tsx` | admin/manager | yes | admin | PARTIAL (UI warns stale RPC; live 335 writes title_fa) |
| `/messages/inquiries` | `_app.messages.inquiries.tsx` | `requirePermission("messages","view")` | yes | assistant | WORKING (tick best-effort) |
| `/sales/promotion-nominations` | `_app.sales.promotion-nominations.tsx` | sales/admin/manager | yes | sales | WORKING (RPCs exist live) |
| `/roles` | `_app.roles.tsx` | `requireAdmin` | yes | admin | WORKING assign roles |
| `/admin/roles` | `_app.admin.roles.tsx` | `requireAdmin` | yes | admin | WORKING dynamic permissions (duplicate surface) |
| `/operations/didar` | `_app.operations.didar.tsx` | `requireAdmin` | yes | admin | WORKING |
| `/integrations/didar` | `_app.integrations.didar.tsx` | redirect | no | n/a | LEGACY redirect |

## Routes with no NAV entry (not orphans — detail/API/legacy)

| Public path | File | Guard | Classification |
|---|---|---|---|
| `/presence` | `_app.presence.tsx` | **none beyond `/_app` login** | Hidden; missing module RBAC |
| `/api-keys` | `_app.api-keys.tsx` | `requireAdmin` | Hidden duplicate of bot/ops keys |
| `/operations/api-keys` | `_app.operations.api-keys.tsx` | `requireAdmin` | Hidden duplicate |
| `/operations/receipts` | `_app.operations.receipts.tsx` | admin/manager | Hidden; honest stub if `ocr_receipts` missing |
| `/operations/gamification` | `_app.operations.gamification.tsx` | admin/manager | Hidden duplicate of `/gamification/admin` |
| `/accounting/daily-capital` | redirect → dynamic-capital | redirect | LEGACY bookmark |
| `/accounting/customer-capital-allocations` | redirect | redirect | LEGACY |
| `/accounting/salesperson-capital-allocations` | redirect | redirect | LEGACY |
| `/users/pending` | redirect → `/users?status=pending` | | LEGACY |
| `/admin/gamification` | redirect → `/gamification/admin` | | LEGACY |
| `/api/*` (~20) | `src/routes/api*.ts` | various (bot key, hooks) | Backend-only consumers |
| `/public/sale-lists/$listId` | public.sale-lists | public | External |
| `/.lovable/oauth/consent` | Lovable | | LEGACY |

## Unmatched menu claims

None found: NAV and PRIMARY_MODULES were reconciled 2026-08-08. `/price-lists` is in both but the page is an EmptyState (feature incomplete, not a missing route).
