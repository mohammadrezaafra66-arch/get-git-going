
# AFRA-20260517-INFRA-U02-S01 — Cloud→LAN Migration Plan (Plan Only)

This plan inventories Cloud data, classifies every table by migration risk, defines six execution phases, and lists backup/rollback/verification gates. Nothing is executed.

---

## 1. Cloud inventory (live counts, public schema)

Source: live `count(*)` per table on Cloud at plan time.

### 1a. High-volume tables (>500 rows)
| Table | Rows | Notes |
|---|---:|---|
| product_interaction_events | 19,544 | telemetry; safe to skip or truncate-on-import |
| audit_logs | 7,703 | history; FK → auth.users; can ship after users phase |
| score_snapshots | 3,832 | gamification rollups; rebuildable |
| pricing_recompute_queue | 3,703 | transient work queue; **do not migrate** |
| price_calculation_snapshots | 2,979 | derived; rebuildable from products+prices |
| product_sale_price_history | 1,917 | history of price changes; nice-to-have |
| dynamic_table_cells | 1,762 | depends on dynamic_table_rows/columns |
| sale_list_items | 963 | depends on sale_lists + products |
| market_rate_ingestion_runs | 533 | external source logs; optional |
| product_computed_prices | 531 | **already targeted in S02** (123 after dedupe) |

### 1b. Medium tables (50–500)
product_category_attribute_values (476), purchase_prices (306), products (168), dynamic_table_rows (158), product_attributes (135), role_permissions (90), product_label_links (70), dynamic_table_columns (67), pricing_board_viewer_sessions (57), currency_rates (55).

### 1c. Reference / config (5–50)
sale_list_versions (47), bot_api_usage_logs (41), daily_mood_questions (31), brands (27), category_product_attributes (19), market_product_match_events (17), sale_lists (17), knowledge_documents (15), market_rate_source_mappings (15), pricing_rules (15), shop_settings (14), credit_scoring_rules (13), product_suppliers (13), gamification_kpis (12), market_indicators (11), **profiles (11)**, achievements (10), daily_mood_scenarios (10), bot_api_keys (9), **categories (9)**, gamification_kpi_rules (9), **sale_price_types (9)**, settlement_types (9), **user_roles (9)**, product_recommendation_overrides (8), daily_mood_hafez_poems (7), league_settings (7), marketing_channels (7).

### 1d. Small reference (<5)
credit_score_snapshots (6), employee_score_events (6), market_rate_sources (6), price_change_reasons (6), bot_api_key_table_access (5), custom_roles (5), dynamic_tables (5), missions (5), payment_terms (5), product_attribute_groups (5), profile_field_definitions (5), suppliers (5), validation_rules (5), currencies (4), customers (4), invoice_workflow_stages (4), market_product_matches (4), product_owner_assignments (4), bot_api_key_label_access (3), gamification_rewards (3), product_labels (3), sales_quote_items (3), sales_quotes (3), customer_credit_profile (2), dynamic_table_row_counters (2), employee_progress (2), external_parties (2), person_identifiers (2), persons (2).

### 1e. Singletons (1 row)
currency_rate_fetches, currency_sources, customer_credit_balance, daily_mood_entries, employee_mission_progress, employee_scores, invoice_items, invoices, league_seasons, payment_receipt_documents, payment_receipts, person_context_links, pricing_board_settings, product_sku_counters, recent_purchase_settings, sales_quote_counters, sales_quote_share_logs, stock_alert_requests.

### 1f. Empty (0 rows) — schema-only, no data to move
academy_*, bank_accounts, call_logs, capital_allocation_ledger, credit_requests, customer_capital_allocations, customer_credit_ledger, daily_capital_*, employee_achievements/leagues/level_up_events/streaks, feedback*, journal_entries/lines, knowledge_articles/confirmations, market_rate_ticks, messages, notification_events/queue, payment_receipt_custom_fields/links, person_field_definitions/values, price_alert_*, price_list*, pricing_board_access_requests, profile_field_values, purchase_items, purchases, sales_quote_send_queue, salesperson_capital_allocations, shipping_cost_rules, tasks, waybill_*.

### 1g. auth schema (relevant)
auth.users = **11**, sessions = 92, refresh_tokens = 237, mfa_amr_claims = 50.

### 1h. LAN inventory — **must be collected by U02 before Phase A**
Sandbox has no LAN access. Run on the LAN DB and attach output to the next task:
```sql
SELECT relname,
  (xpath('/row/c/text()', query_to_xml(
     format('SELECT count(*) AS c FROM public.%I', relname), true, true, '')))[1]::text::bigint AS n
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname='public'
ORDER BY relname;
```
Plus `SELECT id, code, title FROM public.sale_price_types;` and `SELECT id, email FROM auth.users;`.

---

## 2. Known Cloud↔LAN diff (from prior tasks)

| Area | State |
|---|---|
| sale_price_types | **Conflict.** LAN canonical: cash/cheque/partner. Cloud has 9 rows that do not match. Decision (S02): never import Cloud sale_price_types; map Cloud price refs → LAN cash_price for the smoke bundle. |
| auth.users | **Conflict.** LAN admin exists (`4084224a-…`). Cloud has 11 users; some are test. Decision pending: import vs. remap. |
| profiles | Mirrors auth.users; same decision gate. |
| brands / categories / products / product_computed_prices | Bundle 1 already planned in S02. |
| Other modules | No reconciliation done yet; assumed LAN-empty or minimal. To be confirmed in §1h. |

LAN-only data (e.g. seed admin row, LAN-canonical price types) **must be preserved**. Cloud-only data is in scope. Conflicting rows go to a per-table staging/mapping table.

---

## 3. Dependency graph by FK (high-level)

Tier 0 — independent reference (no FK to other public.* data)
- `currencies`, `sale_price_types`, `settlement_types`, `payment_terms`, `price_change_reasons`, `marketing_channels`, `currency_sources`, `market_rate_sources`, `market_indicators`, `invoice_workflow_stages`, `validation_rules`, `product_attribute_groups`, `product_attributes`, `product_labels`, `achievements`, `missions`, `gamification_kpis`, `gamification_rewards`, `daily_mood_questions`, `daily_mood_scenarios`, `daily_mood_hafez_poems`, `league_settings`, `shop_settings`, `recent_purchase_settings`, `pricing_board_settings`, `custom_roles`, `role_permissions`, `profile_field_definitions`, `person_field_definitions`.

Tier 1 — users layer
- `auth.users` → `profiles` → `user_roles` → `employee_*`, `product_owner_assignments`, almost every `created_by/updated_by`.

Tier 2 — products domain
- `brands`, `categories` (self-FK) → `products` → `purchase_prices`, `product_suppliers`, `product_labels` (link), `product_category_attribute_values`, `product_attributes`, `pricing_rules` → `product_computed_prices` → `product_sale_price_history`, `price_calculation_snapshots`, `pricing_recompute_queue`, `product_interaction_events`, `product_recommendation_overrides`.

Tier 3 — persons domain (Phase 2 unified)
- `persons` → `person_identifiers`, `person_context_links`, `customers` (subset), `suppliers` (subset), `external_parties`.

Tier 4 — transactions
- `purchases` / `purchase_items` (empty), `sales_quotes` / `sales_quote_items`, `sale_lists` / `sale_list_items` / `sale_list_versions`, `invoices` / `invoice_items`, `waybill_*` (empty), `payment_receipts` / `payment_receipt_documents`, `stock_alert_requests`.

Tier 5 — derived / operational
- `audit_logs` (→ auth.users), `currency_rates` / `currency_rate_fetches`, `market_rate_*`, `pricing_board_viewer_sessions`, `bot_api_*`, `score_snapshots`, `employee_*`, `dynamic_tables` family, `knowledge_documents`, `credit_*`, `notification_*`, `tasks`, `messages`.

Rule: import each tier only after all earlier tiers are committed and verified.

---

## 4. Phased migration

Each phase = export → staging → map → dry-run → backup → real insert → verify → sign-off. Same shape as S02. Always `ON CONFLICT (id) DO NOTHING` + explicit column lists.

### Phase A — Reference / base data (Tier 0)
**Scope:** currencies, settlement_types, payment_terms, price_change_reasons, marketing_channels, invoice_workflow_stages, validation_rules, market_indicators, market_rate_sources, market_rate_source_mappings, currency_sources, product_attribute_groups, product_attributes, product_labels, profile_field_definitions, person_field_definitions, achievements, missions, gamification_kpis, gamification_kpi_rules, gamification_rewards, league_settings, daily_mood_questions/scenarios/hafez_poems, shop_settings, pricing_board_settings, recent_purchase_settings, custom_roles, role_permissions.

**Excluded from this phase:** `sale_price_types` (LAN canonical — never overwrite).

**Strategy:** staging + per-table diff vs LAN by natural key (code/slug/name) before insert. Conflicts → report, do not auto-overwrite.

### Phase B — Products and computed prices (Tier 2, S02 bundle)
Already designed in `AFRA-20260517-PRODUCTS-U02-S02`. Tables: brands, categories, products, product_computed_prices (dedupe + map to LAN cash_price + remap created_by). Add follow-up sub-bundle B2 for:
- `pricing_rules`, `purchase_prices` → required to re-link `product_computed_prices.purchase_price_id` / `pricing_rule_id` (currently nulled in S02).
- `product_category_attribute_values`, `product_attributes`, `category_product_attributes`, `product_attribute_groups`, `product_label_links`, `product_suppliers` (needs Tier 3 first), `product_recommendation_overrides`, `product_sku_counters`.

### Phase C — Persons / customers / suppliers (Tier 3)
**Scope:** persons, person_identifiers, person_context_links, customers, suppliers, external_parties, customer_credit_profile, customer_credit_balance.
**Decision needed:** whether Cloud `customers` (4) and `suppliers` (5) get re-linked to the unified `persons` table (workspace rule: any party belongs to Phase-2 persons core). Plan: import persons first, then map customers.person_id and suppliers.person_id via staging.

### Phase D — Purchases / sales / quotes / lists / invoices (Tier 4)
**Scope (non-empty):** sale_lists (17), sale_list_versions (47), sale_list_items (963), sales_quotes (3), sales_quote_items (3), sales_quote_counters (1), sales_quote_share_logs (1), invoices (1), invoice_items (1), payment_receipts (1), payment_receipt_documents (1), stock_alert_requests (1).
**Empty (schema-only, skip data):** purchases, purchase_items, waybills*, price_lists*, salesperson_capital_allocations, customer_capital_allocations, capital_allocation_ledger.
**Risk:** every row pulls FKs to products, persons, profiles. Cannot start before Phases B+C.

### Phase E — Accounting / credit / delivery / support / reports (Tier 5)
**Scope (non-empty):** currency_rates (55), currency_rate_fetches (1), bot_api_keys (9), bot_api_key_label_access (3), bot_api_key_table_access (5), bot_api_usage_logs (41), credit_scoring_rules (13), credit_score_snapshots (6), knowledge_documents (15), market_rate_ingestion_runs (533), market_product_matches (4), market_product_match_events (17), employee_progress (2), employee_scores (1), employee_score_events (6), employee_mission_progress (1), league_seasons (1), score_snapshots (3,832 — rebuildable; **decision: skip or import?**), daily_mood_entries (1), product_interaction_events (19,544 — telemetry, **default skip**), pricing_board_viewer_sessions (57 — transient, **default skip**), pricing_recompute_queue (3,703 — work queue, **always skip**), price_calculation_snapshots (2,979 — derived, **default skip / rebuild**), product_sale_price_history (1,917 — history, owner decision), audit_logs (7,703 — owner decision; FK to auth.users so depends on Phase F or remap-to-admin), dynamic_tables (5) + columns (67) + rows (158) + cells (1,762) + row_counters (2).

### Phase F — Auth / users / profiles (Tier 1, last)
**Default plan:** **do NOT migrate auth.users blindly.**
Options for owner decision:
- (F1) Keep LAN admin only; remap every Cloud user_id → LAN admin in prior phases (current S02 approach). Simplest, safest.
- (F2) Create new LAN auth.users for real (non-test) Cloud users via Supabase Auth Admin API, build `auth_user_map(cloud_id → lan_id)`, then back-fill `created_by/updated_by/actor_id` from staging into already-imported tables. Heavy; requires re-running parts of Phases B–E with the remap before COMMIT.
- (F3) Raw `pg_restore` of `auth.users` from a freshly dumped Cloud subset — **rejected** by rule 4 (no blind auth import) and by self-host security posture.

Recommendation: **F1 now**, F2 only if/when real users move off Cloud.

---

## 5. Tables that must never be blindly overwritten
`sale_price_types` (LAN canonical), `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `profiles` (mirror of auth), `user_roles`, `custom_roles`, `role_permissions`, `shop_settings`, `pricing_board_settings`, `recent_purchase_settings`, `currencies` (if LAN has overrides), any singleton settings/counter table (`product_sku_counters`, `sales_quote_counters`, `waybill_number_counter`, `dynamic_table_row_counters`, `league_seasons`).

---

## 6. Tables needing staging + mapping
- All four S02 tables (brands, categories, products, product_computed_prices).
- `purchase_prices`, `pricing_rules` (to relink price refs).
- `persons`, `customers`, `suppliers`, `external_parties` (persons unification mapping).
- Any table with FK to `auth.users` / `profiles` while F1 is in effect: `audit_logs`, `currency_rates`, `currency_rate_fetches`, `credit_*`, `employee_*`, `bot_api_*`, `knowledge_documents`, `sales_quotes`, `sale_lists`, `invoices`, `payment_receipts`, `product_owner_assignments`, `dynamic_tables`.
- Sale/quote/invoice item families (FK to products + persons).
- Counters and singletons (compare-and-merge, never replace).

---

## 7. Tables that can be pg_restore'd safely (data-only, after backup)
Only when LAN side is empty AND no FK to user/auth AND no LAN seed conflict:
- Empty schema-only tables in §1f need no data move.
- Tier 0 pure reference where LAN is empty: `daily_mood_questions/scenarios/hafez_poems`, `market_indicators`, `market_rate_sources`, `market_rate_source_mappings`, `currency_sources`, `achievements`, `missions`, `gamification_rewards`, `validation_rules`, `price_change_reasons`, `marketing_channels`, `invoice_workflow_stages`, `payment_terms`, `settlement_types`.
- Confirm each is LAN-empty in §1h before allowing raw restore. Even then, prefer staged insert with `ON CONFLICT DO NOTHING` for traceability.

---

## 8. Tables needing explicit owner (U01) decision
1. `sale_price_types` Cloud rows — discard vs. archive into a staging table for reference. (Recommendation: archive in `_staging_import.cloud_sale_price_types`, do not insert into public.)
2. Cloud `auth.users` (11 rows) — F1 vs F2.
3. `audit_logs` (7,703) — import historical audit or start fresh on LAN.
4. `product_interaction_events` (19,544) — telemetry; default skip.
5. `pricing_recompute_queue` / `price_calculation_snapshots` / `score_snapshots` — derived/transient; default skip + rebuild.
6. `product_sale_price_history` (1,917) — history retention?
7. `customers` (4), `suppliers` (5) — confirm test vs real before persons-mapping.
8. `bot_api_keys` (+ access tables) — rotate or migrate?
9. `dynamic_tables` family (1,989 rows total) — owner-defined data; confirm real vs test.
10. `knowledge_documents` (15) — confirm content is intended for LAN.

---

## 9. Backup and rollback plan

### Pre-phase (mandatory)
```bash
# Full LAN logical backup with custom format
pg_dump --format=custom --no-owner --no-acl \
  -h "$LAN_DB_HOST" -p "$LAN_DB_PORT" -U "$LAN_DB_USER" -d "$LAN_DB_NAME" \
  -f "backups/lan-pre-<phase>-$(date -u +%Y%m%d-%H%M%S).dump"
```
Verify file size > 0, then `pg_restore --list` to confirm readable. Store off-server (encrypted), never in repo.

### Per phase
1. Take backup; record path.
2. Run dry-run (no COMMIT).
3. Review diff in `_staging_import.*`.
4. Real run inside single `BEGIN` per file; `ON_ERROR_STOP=1` ensures abort+rollback.
5. Smoke verification (§11).
6. Tag a backup-after snapshot.

### Rollback
- Aborted mid-transaction → automatic; no action.
- Post-commit defect → `pg_restore --clean --if-exists` from the pre-phase backup.
- Partial rollback (one table) → keep `_staging_import.*` until phase sign-off so you can DELETE-by-id the just-inserted rows using the staging id list.

---

## 10. Verification queries per phase

Phase-agnostic counts:
```sql
SELECT 'cloud' AS side, count(*) FROM <table>;
SELECT 'lan'   AS side, count(*) FROM <table>;
```

Phase A (reference): each table count matches expected; spot-check natural keys exist on LAN.

Phase B (products):
```sql
SELECT count(*) FROM public.products;                                    -- expect +168
SELECT count(*) FROM public.product_computed_prices;                      -- expect +123
SELECT count(*) FROM public.products
  WHERE is_active AND stock_status IN ('available','limited');            -- expect ≈ 74
-- orphans
SELECT count(*) FROM public.products p
  WHERE p.brand_id    IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.brands b     WHERE b.id=p.brand_id);
SELECT count(*) FROM public.products p
  WHERE p.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id=p.category_id);
SELECT count(*) FROM public.product_computed_prices pcp
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=pcp.product_id);
```

Phase C (persons): every imported customer/supplier resolves to a `persons.id`; no duplicate `person_identifiers (kind, value)`.

Phase D (transactions): every sales_quote_items.product_id and sale_list_items.product_id resolves to public.products; every `*_by/customer_id/supplier_id` resolves to its target.

Phase E (operational): currency_rates per currency code monotonically increasing; bot_api_usage_logs FK to bot_api_keys 100%; no audit_logs with NULL actor when source had value (unless remapped to admin by design).

Phase F (only if F2): `auth_user_map` row count = imported users; spot-check sign-in for one migrated user.

---

## 11. Stop conditions (abort phase, do not proceed)

1. Any preflight assertion fails (LAN admin missing, LAN cash_price missing, expected LAN seed row missing).
2. Backup step fails or backup file unreadable by `pg_restore --list`.
3. Cloud↔LAN column list differs for a table in scope (schema drift).
4. Orphan count > 0 after import.
5. `_staging_import.*` shows duplicate natural keys that have no deterministic tiebreaker.
6. Any required environment variable missing or empty.
7. Any step would require disabling RLS, RBAC, or a trigger to succeed.
8. Any step would require modifying `auth.*` or `storage.*` schemas.
9. Real run requested without explicit U01 approval token in the task.

---

## 12. Required U01 approvals

U01 must explicitly approve, in writing on the task, before each:
- (A1) Phase A real execution and the set of reference tables included.
- (B1) Phase B real execution (already in flight for S02 bundle 1).
- (B2) Phase B2 real execution (purchase_prices + pricing_rules + relink).
- (C1) Phase C real execution and the persons-unification mapping rules for customers/suppliers.
- (D1) Phase D real execution and the products/persons remap result table.
- (E1) Per-table decision list from §8 (especially audit_logs, telemetry, queues).
- (F-Decision) Choose F1 vs F2 before any further phase, since the choice changes how `*_by` columns are populated in B/C/D/E.
- Every `DRY_RUN=false` invocation of any wrapper script.

---

## 13. Recommended first execution phase

**Phase B bundle 1** (already designed in S02 — brands, categories, products, product_computed_prices, mapped to LAN cash_price, created_by → LAN admin), because:
- Scripts and SQL are already written and reviewed.
- It does not touch auth, RLS, RBAC, or LAN-canonical sale_price_types.
- It is the smallest bundle that proves the staging+mapping pattern end-to-end on LAN.
- Output is immediately observable in the UI on `/persons`-adjacent product surfaces (sales search displayable count ≈ 74).

After B1 verification:
1. Collect LAN inventory (§1h).
2. U01 picks F1 vs F2 (§4 Phase F).
3. Run Phase A reference data.
4. Then B2, then C, D, E.

---

## 14. Self-Host Acceptance Check (plan-level)
- Only `pg_dump` / `pg_restore` / `psql` / Bash / PowerShell used — all standard on Linux+Docker+Windows admin laptop.
- No CDN, external API, or non-self-hostable service.
- No RLS/RBAC change anywhere in the plan.
- No real secret stored; all creds via env or interactive.
- Every phase reversible from a pre-phase backup.
- Compatible with `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`.

## 15. Remaining risks (plan-level)
1. LAN inventory not yet collected — Phase A scope depends on it.
2. Schema drift between Cloud and LAN possible if LAN ran older migrations; needs `\d` parity check per table at the start of each phase.
3. Categories self-FK (`parent_id`) and persons self-references may need deferrable FK or sorted insert.
4. If U01 picks F2 later, prior phases must be re-run with the new auth_user_map (or back-fill scripts must be written).
5. Telemetry/derived tables (`product_interaction_events`, snapshots, queues) are large; importing them inflates LAN storage with low value.
6. `sale_price_types` permanent divergence means any future analytic comparing Cloud↔LAN must translate via `price_type_map`.

End of plan. No code or DB changes were made.
