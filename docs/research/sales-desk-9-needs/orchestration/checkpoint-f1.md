# Checkpoint F1 — sales-desk UI (routes + popup + nav)

| Field | Value |
|-------|-------|
| Agent | dev-frontend-engineer |
| Branch | `feature/sales-desk` |
| HEAD start | `67d20333cbc74380a2ddf2b2f7edbb2e1545e53f` |
| HEAD end | `8cd388a2991ae86913cb17865d001f2a24f6a10c` |
| Started | 2026-09-16T02:48+05:00 |
| Finished | 2026-09-16T03:00+05:00 (approx) |
| Deadline | 2026-09-16T06:00:00+05:00 |
| Status | **COMPLETE** (UI wired; E5/browser auth not run) |

## Heartbeat
- 02:48 — baseline: routes absent (`Test-Path` False); typecheck EXIT=2 (pre-existing accounting/invoices)
- 02:52 — components + routes + nav
- 02:55 — `vite build --mode development` → EXIT=0; routeTree regenerated; sales-desk chunk present
- 03:00 — 5 commits; no push

## Commits (pathspec)
| SHA | Message |
|-----|---------|
| `a2537aee` | feat(sales-desk): کامپوننت‌های میز فروش و پاپ‌آپ تماس |
| `3e880085` | feat(sales-desk): مسیر میز فروش و پرونده مشتری ۳۶۰ |
| `b8c512b0` | feat(sales-desk): ناوبری میز فروش و listener تماس ورودی |
| `5a5e8053` | chore(sales-desk): بازتولید routeTree برای sales-desk و dossier |
| `8cd388a2` | docs(sales-desk): چک‌پوینت F1 UI میز فروش |

## Evidence
- **E4 before**: `Test-Path` sales-desk/dossier = False; registry بدون «میز فروش»
- **E4 after**: files True; registry.ts:564 `میز فروش`; :571 `/operations/call-activity`; primary-modules.ts:130–131; AppShell.tsx:18
- **E3 build**: `npx vite build --mode development` EXIT=0; chunk `_app.operations.sales-desk-*.js`

## Routes
- `/operations/sales-desk` — میز تماس
- `/sales/customers/$customerId/dossier` — پرونده ۳۶۰ (via `customers.person_id` → `loadSalesDossier`)

## Without Issabel
Manual QuickRequestForm / CallNoteForm on desk + dossier; popup idle if no inbound CDR.

## Foreign dirty (not ours — left alone) [D-1]
- `src/routes/_app.persons_.create.tsx`
- `src/routes/_app.persons_.merge.tsx`

## Not verified
- Authenticated browser HTTP 200
- E5 third-party / e2e (T1 owner)
