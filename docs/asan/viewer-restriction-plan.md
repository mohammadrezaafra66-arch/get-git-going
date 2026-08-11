# Restricting the `viewer` role — enumeration, plan and result

ASAN mission M1, phase 1.3. The enumeration is **empirical**: rather than reading ~400 policies
and reasoning about them, a real HS256 JWT was minted for a viewer account and every relation
in `public` was requested through PostgREST with `Prefer: count=exact`. That is the layer that
actually enforces RLS, so it is the layer that was measured.

- before: `docs/verification/asan/viewer-probe-before.json`
- after: `docs/verification/asan/viewer-probe-after.json`
- column derivation: `docs/verification/asan/table-columns.txt`

## A false start worth recording

The first measurement said a viewer could read **146 of 234 relations**. It was wrong. The
probe picked its subject with `select user_id from user_roles where role='viewer' limit 1`, and
the first such row is the owner's own account — which also holds admin, manager, sales and
accountant. The probe was measuring an administrator and calling it a viewer.

This is rule 2.9's warning in a different costume ("this server has 14 admin accounts; never
pick *any other profile* as a non-privileged test user"). The probe now selects a user holding
`viewer` **and no other role**, and `e2e/security/viewer-restrictions.spec.ts` asserts the
subject really is viewer-only before it asserts anything else.

The deny list below was drafted against the inflated 146 and kept afterwards: it is a superset
of what a viewer could actually reach, and a restrictive policy on a table the viewer already
could not read costs nothing.

## What a viewer-only account could read before this phase

**58 of 234 relations.** The ones that mattered:

| relation | rows | what leaked |
|---|---|---|
| `person_identifiers` | 28 | **phone, national id, IBAN** — hidden inside a generic `value_raw` column, so no column-name scan would ever have found it |
| `customers` | 14 | **phone, address, city, tax id, accounting code** |
| `shop_settings` | 26 | `shop_phone`, `shop_address`, `global_default_margin`, `accountant_daily_interest_rate`, `didar_api_key` |
| `v_promotion_suggestions` | 19 880 | pricing intelligence, through a view with no RLS of its own |
| `product_computed_prices_public` | 463 | final sale prices |
| `vw_account_balances` | 1 | **bank balances** |
| `v_dynamic_salesperson_capital_balances` | 182 | **capital held, consumed, remaining** |
| `daily_capital_settings` | 14 | **total capital** |
| `role_permissions` / `user_roles` / `custom_roles` | 137 / 1 / 9 | the privilege map itself |
| `knowledge_documents_backup_20260722` | 42 | whole document bodies |
| `categories` | 12 | `base_margin_percent` |
| `visitors` | 1 | phone |
| `sales_reminders` | 5 | sales activity |
| `dynamic_entity_scores`, `dynamic_parameter_weights` | 99 / 16 | credit-scoring internals |

`sales_quotes`, `payment_receipts`, `purchase_prices` and `audit_logs` were already closed to a
viewer by their own policies. They are still added to the deny list, because "already closed"
is a property of today's policies, not a guarantee.

## Who holds the role

| user id | name | status | all roles held |
|---|---|---|---|
| `1a15e8c6-3a83-49c2-9531-db9046d30968` | Ali Talebizadeh | active | **viewer, admin, manager, sales, accountant** |
| `20303d30-ab9d-4fc6-be96-ec5db1dcb647` | test.viewer@afrakala.local | rejected | viewer |

No role assignment is changed by this phase — only what the role can see.

### The decision this forced

The brief says "anyone with the `viewer` role". Taken literally that would blind a full
administrator, because the first account holds all five roles. Everywhere else in this system
roles are additive: `has_any_role` grants if **any** role qualifies. Restricting on "holds
viewer" would be the one place in the codebase where gaining a role removes access.

**The restriction therefore applies to users whose only role is `viewer`**, expressed as
`public.is_viewer_only(uuid)`. Rejected alternative: restrict on `has_role(uid,'viewer')` —
satisfies the sentence literally, locks out the owner's own account, and contradicts the
additive-role model the rest of the system is built on. The migration asserts both accounts
classify the way they should, so this cannot regress silently.

## Layer 1 — RLS (the control)

```sql
CREATE POLICY viewer_restricted ON public.<t> AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
```

`RESTRICTIVE` is `AND`-ed with the existing permissive policies, so this can only subtract, and
only for viewer-only users. No existing policy is rewritten, which is what makes it reversible.

**88 tables**, in ten groups: contact and identity (7) · sales documents (11) · payments and
accounting (6) · credit and capital (12) · purchasing (8) · pricing and margins (14) ·
personal performance (9) · security and infrastructure (16) · internal product intelligence
(4) · configuration holding secrets, contact details and margins (1). The full list is in the
migration, grouped by the same headings.

### Views

A view has no RLS of its own. Four already carry `security_invoker=true`, so the policies above
reach them: `employee_monthly_hours`, `v_latest_active_purchase_prices`, `vw_purchase_float`,
`v_pricing_recompute_queue_summary`.

Eight do not and run with their owner's rights: `product_computed_prices_public`,
`publish_recipients_view`, `v_dynamic_customer_capital_balances`,
`v_dynamic_salesperson_capital_balances`, `v_promotion_suggestions`, `vw_account_balances`,
`vw_customer_receivables`, `vw_supplier_payables`. Each is re-created as
`SELECT * FROM (<its own unchanged definition>) src WHERE NOT public.is_viewer_only(auth.uid())`.
Wrapping rather than editing keeps the original SQL byte for byte and guarantees an identical
column list, so `CREATE OR REPLACE VIEW` cannot silently change a signature. Rejected
alternative: `ALTER VIEW … SET (security_invoker = true)` — one line, but it changes the view's
semantics for **every** role at once.

Live definitions snapshotted to `docs/verification/pre-281/` first (rule 2.3).

### Found during execution: four tables with RLS switched off entirely

`dynamic_parameter_weights_backup_142`, `dynamic_parameter_weights_backup_20260722`,
`knowledge_documents_backup_20260722` and `payment_receipts_backup_20260722` were created
without `ENABLE ROW LEVEL SECURITY`. No policy on them — restrictive or permissive — had any
effect, and **every authenticated user could read them whole**, including a copy of the payment
receipts ledger and the only surviving copy of 42 knowledge documents.

The first run of this phase's restrictive policies visibly failed to close them, which is what
exposed it. RLS is now enabled on all four with an admin-only read policy. `service_role`
bypasses RLS, so server-side code is unaffected. The migration now asserts that **zero** tables
in `public` have RLS disabled, and the e2e spec asserts the same, so the next table created
without it fails a test rather than sitting open.

## Layer 2 — `role_permissions`

Set to `can_view = false` for viewer: **invoices, sales, purchases, price-lists, data-tables**.
Left `true`: academy, dashboard, feedback, knowledge, messages, persons, reports — names,
learning material and aggregate statistics are explicitly permitted.

**`warehouse` had no `viewer` row at all.** Rule 2.5: `has_dynamic_permission` falls back to
`has_any_role(..., ARRAY['admin','manager','accountant','sales','viewer'])` when a module has no
row, so absence *granted*. A `viewer`/`warehouse` row with every flag false is seeded, which
also completes viewer coverage to all 20 modules and closes the fallback for this role for good.
The migration asserts the row count is exactly 20.

## Layer 3 — frontend

Already in place and left as-is:
- `AppSidebar.tsx` — `QUICK_ACCESS_BY_ROLE.viewer` is `[]`.
- `MobileBottomNav.tsx` — viewer gets dashboard, notifications, messages only.
- `src/lib/navigation/registry.ts` — routes outside `ROLE_ALLOWLIST_BY_ROUTE` resolve through
  `has_dynamic_permission(module, 'view')`, so the layer-2 change removes `/sales*`,
  `/purchases*`, `/pricing/sale-lists`, `/data-tables*` and the invoice pages from the viewer's
  navigation and from their route guards at the same time.

Frontend is reinforcement. RLS is the control, and the phase test proves it with a direct
PostgREST call rather than through the UI.

## Result

**58 relations before, 28 after.** Everything still readable is a name, a product-attribute
lookup, a reference list, learning material or an aggregate: `persons`, `brands`,
`product_labels`, `product_label_links`, `product_attributes`, `product_attribute_groups`,
`category_product_attributes`, `category_required_services`, `product_service_types`,
`currencies`, `currency_rate_fetches`, `payment_terms`, `settlement_types`, `sale_price_types`,
`invoice_workflow_stages`, `validation_rules`, `workflow_settings`, `marketing_channels`,
`person_context_links`, `profile_field_definitions`, `score_level_thresholds`,
`gamification_kpis`, `knowledge_documents`, `knowledge_document_chunks`, the three
`daily_mood_*` tables and `v_pricing_recompute_queue_summary`.

`e2e/security/viewer-restrictions.spec.ts` — **40 tests, all green**.

## For the owner

1. **A viewer cannot see product listings**, although the brief says they may.
   `role_permissions.viewer.products.can_view` has been `false` since before this phase and
   `products_select_dynamic` keys on it. Flipping it to `true` is a *grant*, not a restriction,
   so it was not done inside a phase whose purpose is to restrict. Say the word and it is a
   one-row update.
2. **`categories` is denied**, because `base_margin_percent` sits in it. A viewer's product
   listing would therefore show `category_id` without the category name. Splitting the margin
   out or exposing a `categories_public` view would both create a parallel object, which
   rule 14 forbids.
3. `market_indicators`, `market_rate_sources`, `market_rate_ticks`, `currencies` and
   `currency_rate_fetches` stay readable — public market data, not a price of ours.
