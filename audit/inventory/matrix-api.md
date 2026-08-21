# Frontend call ↔ Backend ↔ DB

Backend in this repo is PostgREST + RPC + a few TanStack Start serverFns. There is no Nest controller layer.

Inventories: `rpc-calls.txt` (157 unique `.rpc("...")` literals), `rpc-calls-dynamic-cast.txt` (7 extra names hidden behind `supabase.rpc as unknown`), `orm-from-tables.txt` (184), `db-*-from-types.txt`.

Live LAN (`afrakala-lan-db`) probed with SELECT-only `to_regclass` / `pg_proc` on 2026-08-17.

## Matched critical APIs

| Frontend | Call | Live backend | DB object | Status |
|---|---|---|---|---|
| login.tsx / AuthProvider | `auth.signInWithPassword` | GoTrue | `auth.users` + `profiles` | WORKING |
| quotes.new.tsx:316 | RPC `create_sales_quote_with_items` (cast) | exists on LAN | `sales_quotes` + items | WORKING |
| quote-status.functions.ts:103 | RPC `update_sales_quote_status` via serverFn | exists | `sales_quotes` + triggers | WORKING |
| persons/functions.ts | serverFn → RPC `person_create_full` / `search_visible_persons` | exists | `persons` | WORKING |
| persons_.merge.tsx | RPC `person_merge` | exists; registry includes `mutual_settlements.person_id` | persons + FKs | WORKING |
| receipts.$receiptId.tsx | RPC `post_receipt_accounting` | exists | payment_receipts / journals | WORKING (not re-traced journal rows) |
| promotion-nominations.ts | RPCs nominate/cancel/quota | exist on LAN; **missing from types.ts Functions** | `promotion_nominations` table exists | WORKING + type drift |
| inquiry-status.ts | `update_inquiry_status`, `tick_inquiries` | both exist | inquiries; tick calls expire_pending_documents | PARTIAL (tick errors swallowed) |
| gamification-leagues.ts | `start_league_season`, `settle_league_season` | exist; defs contain `title_fa` | `league_seasons` has title_fa/starts_at/ends_at | WORKING on LAN; UI/e2e still claim 400 |
| products.index.tsx | RPC `search_product_ids` + `.from(products)` | | `products` | WORKING |

## Unmatched / broken (FE → missing DB)

| Frontend | Call | Live | Status |
|---|---|---|---|
| useDashboardStats.ts:93 | `.from("invoices")` | `to_regclass('public.invoices')` **NULL** | BROKEN (errors swallowed → KPI 0) |
| useDashboardChart.ts:33 | `.from("invoices")` | table gone | BROKEN (empty chart) |
| reports.tsx:90 | `.from("invoices")` | table gone | BROKEN (query throws) |
| DeliveryReceiptUploadForm.tsx:105 | `.from("invoices")` | table gone | BROKEN picker |
| DeliveryReceiptCard.tsx:53 | `.from("invoices")` | table gone | BROKEN label |
| lib/invoices/functions.ts | serverFn insert/update/delete `invoices` | table gone; **zero importers** | ORPHAN + would 42P01 if called |
| lib/accounting/functions.ts | serverFn `.from("payments")` + invoices | both tables gone on LAN; **zero importers** | ORPHAN |
| operations/receipts.tsx | `.from("ocr_receipts")` | table gone; UI handles 42P01 | PARTIAL honest stub |
| price-lists.tsx | no table calls | `price_lists` **exists** | UI-only EmptyState |
| admin/automation dummy job | `automation_jobs` / `automation_modules` | not in generated types; live not fully checked | UNKNOWN / type gap |

## RPCs called in JS but absent from generated types.Functions

Live `pg_proc` confirmed they exist: `cancel_promotion_nomination`, `complete_marketing_task`, `generate_marketing_tasks`, `get_promotion_nomination_quota`, `get_task_kpi_report`, `nominate_product_for_promotion`.

Also hidden by casts: `create_sales_quote_with_items` **is** in types.ts:10861 but missed by `.rpc("...")` regex.

## Types tables that are not `.from()`'d (not automatically orphans)

See `types-tables-never-from.txt` (34). Includes dropped leftovers still in types (`invoice_items`, `waybills`, `waybill_items`, `waybill_custom_fields`) and real tables used only via RPC (`employee_leagues`, `inquiry_replies`, `dynamic_table_rows`, `price_lists`/`price_list_items`).

## Backend-only HTTP (no SPA menu consumer)

Bot: `api.public.bot.*`. Hooks: `api/public/hooks/ingest-market-rates`, `process-pricing-queue`, `generate-marketing-tasks`. Health: `api.healthz`, `api.version`. MCP/Lovable. These are not FE orphans; consumers are bots/cron.
