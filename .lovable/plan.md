Plan for adding a dynamic customer/salesperson credit scoring layer

Background
The current customer credit system stores a static `credit_score` and a derived `settlement_score` in `customer_credit_profile`. The goal is to add a dynamic, weight-driven scoring engine that can later replace the static score without deleting the existing column or data.

Schema conflict check
The exact names below were checked against the `public` schema:

Proposed new tables
- `dynamic_scoring_parameters`
- `dynamic_parameter_weights`

Result: no conflict. Neither table exists, and no existing table starts with `dynamic_` in the credit/scoring area. The existing `dynamic_tables`/`dynamic_table_*` family is unrelated to scoring.

Other proposed names that were checked:
- `entity_scores`, `scoring_parameters`, `parameter_weights` — do not exist.
- `daily_capital`, `capital_allocation` — do not exist as exact names.
- `salesperson_allocations`, `customer_allocations` — do not exist as exact names.
- Closest existing tables: `daily_capital_inputs`, `capital_allocation_ledger`, `customer_capital_allocations`, `salesperson_capital_allocations` — these are capital/finance modules, not scoring, so no semantic collision.

Schema choice
Use the `public` schema. Reasons:
- Existing credit tables (`customer_credit_profile`, `customer_credit_ledger`, `credit_requests`, `credit_score_snapshots`, `credit_scoring_rules`) are all in `public`.
- RLS policies, `has_role()` helper, and `audit_logs` are built around `public`.
- No multi-tenant isolation requirement exists that would justify a separate schema.
- A separate schema would add extra maintenance for migrations, RLS helpers, and self-host backups without benefit.

Weight rationale: 0.2 per parameter, total 1.0
- Mathematically valid as a starting default because 5 * 0.2 = 1.0.
- It is simple to explain and easy to audit.
- Caveats for future tuning:
  - All parameters must be normalized to the same scale before weighting; otherwise a high-magnitude parameter will dominate.
  - If any parameter is unavailable or disabled, the engine must renormalize the remaining weights so the sum remains 1.0, or treat missing values as 0 with a clearly documented penalty.
  - The 0.2 default should be stored per `valid_from`/`valid_to` window so historical scores remain reproducible.

Proposed data model

dynamic_scoring_parameters
- id: uuid primary key
- entity_type: enum/text check ('customer' | 'salesperson')
- code: text unique per entity_type (or globally unique)
- label_fa: text
- direction: enum/text check ('positive' | 'negative')
- is_active: boolean default true
- display_order: integer
- created_by: uuid -> auth.users
- created_at / updated_at: timestamps
- constraint: code unique within entity_type

dynamic_parameter_weights
- id: uuid primary key
- parameter_id: FK -> dynamic_scoring_parameters
- weight: numeric (0 to 1)
- valid_from: date (or timestamp)
- valid_to: date nullable (open-ended = null)
- created_by: uuid -> auth.users
- created_at / updated_at: timestamps
- constraint: valid_from < valid_to, one active weight per parameter per time window

Default customer parameters (weight 0.2 each, valid_from = today)
- customer_purchase_1y
- customer_profit_1y
- customer_purchase_3m
- customer_profit_3m
- customer_settlement_score

Default salesperson parameters (weight 0.2 each, valid_from = today)
- salesperson_collection_quality
- salesperson_call_in
- salesperson_call_out
- salesperson_profit_ratio
- salesperson_growth

Integration with existing tables
- Read from `customer_credit_profile.settlement_score` for the `customer_settlement_score` component.
- Read from `invoices`/`purchases` for purchase/profit components.
- Read from `call_logs` for call-in/call-out components.
- Store the final computed score back into `customer_credit_profile.credit_score` (or a new `dynamic_credit_score` column if the existing static score must be preserved).
- Store per-parameter snapshots in a new table `customer_score_snapshots` or reuse `credit_score_snapshots` if its schema is flexible enough.

Recommended phases
Phase 1: Database migration
- Create `dynamic_scoring_parameters` and `dynamic_parameter_weights` with RLS, GRANTs, and update triggers.
- Add `dynamic_` prefix to the audit_logs entity-type allowlist so admin-only seeding can be audited.
- No changes to `customer_credit_profile` schema yet.

Phase 2: Seed default parameters and weights
- Insert the 10 default parameters and their 0.2 weights via the data insert tool (not a migration, because this is seed data).
- Restrict seeding to admins/managers using RLS or a server function.

Phase 3: Recalculation engine (server function/RPC)
- Implement `recalculate_dynamic_credit_score(entity_type, entity_id, as_of_date)`:
  1. Fetch active parameters and weights for the date window.
  2. Normalize each raw metric to a 0-100 scale (or z-score, documented in the code).
  3. Apply `direction` (positive keeps sign, negative inverts).
  4. Sum weighted values, then clamp to the desired score range.
  5. Write result to the target profile and insert a snapshot row.
- Keep `customer_credit_profile.credit_score` as the write target for now, but only update it when the dynamic engine is enabled per a feature flag.

Phase 4: Automation triggers
- Optional: add a trigger on `invoices` and `payment_receipts` that calls the recalculation engine asynchronously (via `pg_net` or a cron job) so the score stays fresh without slowing down transactions.
- Prefer a nightly cron job over synchronous triggers for the first release to avoid write amplification.

Phase 5: UI for admin weight management
- Add a route under admin settings for listing parameters and editing weights by date window.
- Show a read-only score breakdown in the customer detail credit page.
- Persian labels, RTL, mobile-first.

Access control
- `dynamic_scoring_parameters` / `dynamic_parameter_weights`: read for authenticated staff, write for admin/manager only.
- Recalculation RPC: admin, manager, accountant, or an automated service role (internal use).
- Snapshots: read for roles that can read the parent profile.

Audit and logging
- Any change to weights or manual recalculation must write to `audit_logs` through the existing security-definer/allowlist pattern.
- Add `dynamic_parameter_weight_changed` and `dynamic_score_recalculated` to the audit entity-type allowlist.

Risks and open decisions
- Normalization method is not yet chosen (min-max vs. percentile vs. z-score). This affects how the score behaves across different customer/salesperson sizes.
- Reuse vs. replace the static `credit_score` column: preserving the old value is safer but requires a feature flag or a new column.
- The `valid_to` handling: decide whether overlapping weights are allowed or if a weight must be active in exactly one window.
- Performance: recalculation touches invoices/purchases/calls; add pagination or materialized aggregates if the customer base is large.
- Self-host: the plan stays within Lovable Cloud/Supabase, but any cron job must be compatible with pg_cron in the self-host Docker image.

No code has been written. This plan is ready for approval before Phase 1 implementation.