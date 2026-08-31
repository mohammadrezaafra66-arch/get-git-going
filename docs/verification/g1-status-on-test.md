# G-1 status on the test database

**Verdict: G-1 is closed. No migration was written.**

The brief stated that eight views leak real data to the anon key because
`is_viewer_only(auth.uid())` returns false for a NULL uid. One half of that is true — the
function does return false for NULL — but the premise that the views therefore leak is **false
on this database**. Every one of the eight is closed twice over, at the grant layer and at the
predicate layer.

> **Scope: this covers the TEST database only** (`afrakala` on `afrakala-lan-db`, 192.168.170.8).
> Nothing here is a claim about production. Production was not touched, read, or contacted, and
> its state is unknown to this report.

Verified 2026-08-31, first-hand, all eight views, all three steps. Every probe ran inside
`BEGIN … ROLLBACK`.

---

## The eight views

Every one of them ends with the identical predicate, quoted verbatim from
`pg_get_viewdef(oid, true)`:

```sql
WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());
```

The `uid() IS NOT NULL` conjunct is what closes the hole. It is evaluated first and is false for
an unidentified caller, so the row set is empty regardless of what `is_viewer_only` returns.

| # | view | guard present | anon read attempt | admin | accountant | closed by |
|---|---|---|---|---|---|---|
| 1 | `product_computed_prices_public` | ✅ | `permission denied for view` | 661 rows | 661 rows | 370 + 386 |
| 2 | `publish_recipients_view` | ✅ | `permission denied for view` | 25 rows | 25 rows | 370 + 386 |
| 3 | `v_dynamic_customer_capital_balances` | ✅ | `permission denied for view` | 35 rows | 35 rows | 370 + 386 |
| 4 | `v_dynamic_salesperson_capital_balances` | ✅ | `permission denied for view` | 252 rows | 252 rows | 370 + 386 |
| 5 | `v_promotion_suggestions` | ✅ | `permission denied for view` | 19 936 rows | 19 936 rows | 370 + 386 |
| 6 | `vw_account_balances` | ✅ | `permission denied for view` | 2 rows | 2 rows | 370 + 386 |
| 7 | `vw_customer_receivables` | ✅ | `permission denied for view` | 8 rows *(via RPC)* | 8 rows *(via RPC)* | 370 + 386 |
| 8 | `vw_supplier_payables` | ✅ | `permission denied for view` | 200 rows *(via RPC)* | 200 rows *(via RPC)* | 370 + 386 |

`ends_with_guard` returned `t` for all eight in a single catalog query. `anon` holds **zero**
privileges on any of them — `information_schema.role_table_grants` filtered to `grantee='anon'`
over the eight returned **0 rows**.

### On rows 7 and 8

These two are `permission denied` for admin and accountant as well, and that is by design, not a
regression: `authenticated` has no SELECT grant on either. They are consumed exclusively through
`SECURITY DEFINER` RPCs. Tested through the real path:

```
admin      receivables via RPC -> 8 rows
admin      payables    via RPC -> 200 rows
accountant receivables via RPC -> 8 rows
accountant payables    via RPC -> 200 rows
sales      receivables via RPC -> forbidden
sales      payables    via RPC -> forbidden
anon       receivables via RPC -> permission denied for function get_receivables_list
```

So the two RPC-only views are readable by exactly the roles that should read them, and anon
cannot reach even the function.

### The guard is load-bearing, not cosmetic

A superuser session with no JWT reads **0 rows from all eight**, while the same views return the
counts above under a real JWT. That is worth stating precisely, because it corrected an
assumption of mine mid-run: the predicate is an ordinary `WHERE` clause, not RLS, so `supabase_admin`
does **not** bypass it. A session without a JWT sees nothing no matter how privileged it is.

---

## What closed it

| migration | what it did |
|---|---|
| `20260822143000_370_close_anon_read_on_viewer_guard_views.sql` | revoked anon SELECT on the eight views — the grant layer |
| `20260822171000_371_assert_370_end_state_by_identity.sql` | asserted 370's end state |
| `20260824210000_386_close_null_uid_on_viewer_guard_views.sql` | added `uid() IS NOT NULL` to all eight predicates — the predicate layer |
| `20260824234500_387_repair_386_gate.sql` | repaired 386's gate |
| `20260826200000_395_close_anon_definer_price_and_staff_leaks.sql` | closed related anon-reachable SECURITY DEFINER paths |

386 rewrites exactly these eight views — confirmed by extracting every
`CREATE OR REPLACE VIEW public.<name>` from it — and its own header records the same analysis the
brief describes, including that the fault lay in the predicate rather than in the grant.

---

## (a) The full view census — and the third category nobody had enumerated

There are **21 views** in schema `public`.

**12 carry `security_invoker=true`**, not 10:

| # | view | also uses `is_viewer_only` |
|---|---|---|
| 1 | `academy_quiz_questions_public` | |
| 2 | `effective_currencies_view` | |
| 3 | `employee_monthly_hours` | |
| 4 | `product_computed_prices_public` | ✅ |
| 5 | `v_latest_active_purchase_prices` | |
| 6 | `v_league_tiers_public` | |
| 7 | `v_pricing_recompute_queue_summary` | |
| 8 | `v_promotion_suggestions` | ✅ |
| 9 | `v_purchase_item_allocation` | |
| 10 | `v_purchase_request_fulfillment` | |
| 11 | `v_purchase_requests_legacy_unknown` | |
| 12 | `vw_purchase_float` | |

The figure **10 is correct only for "security_invoker views that do NOT also use
`is_viewer_only`"** — the two sets overlap on `product_computed_prices_public` and
`v_promotion_suggestions`. Both numbers describe something real; they answer different questions.

### The third category — neither `security_invoker` nor a `uid()` guard

This is the set the brief correctly identified as unenumerated. There are **three**, and **none is
anon-readable**:

| view | anon SELECT | authenticated SELECT | anon live attempt | authenticated with NO jwt |
|---|---|---|---|---|
| `api_product_price_rows` | ❌ | ❌ | `permission denied for view` | `permission denied for view` |
| `api_products_pricing` | ❌ | ❌ | `permission denied for view` | `permission denied for view` |
| `v_customer_credit_exposure` | ❌ | ✅ | `permission denied for view` | **0 rows** |

Two are closed by grant. The third deserves a plain statement rather than a tick:

> **`v_customer_credit_exposure` has no `uid()` guard and any `authenticated` session can read it,
> including one with no JWT at all. It returns 0 rows today — but not because anything is stopping
> it.** It is structurally empty: it filters on
> `quote_exception_type = 'credit_ceiling_exceeded'`, and the CHECK constraint on `sales_quotes`
> permits only `overdue_salesperson_commitment`, `credit_shortfall_salesperson_commitment` and
> `accounting_approval`. That value can never be written, so the view can never return a row.
> Confirmed: it returns 0 rows for a real admin JWT too, so the emptiness is the view's own defect,
> not a guard doing its job.
>
> **Consequence to carry forward:** the moment that filter is corrected — which a previous audit
> already recommended, and which mission M-C.1 of an earlier brief proposed — this view becomes
> readable, with customer credit exposure in it, by any authenticated session including one with a
> NULL uid. Whoever fixes the filter must add the `uid() IS NOT NULL AND NOT is_viewer_only(uid())`
> guard in the same migration. It is not a leak today; it is a leak armed to appear.

---

## What is NOT established here

- **Production.** Nothing in this report describes it. Production was not touched.
- **Whether the guard is enforced going forward.** The assertions that keep these predicates in
  place live in the apply-time `DO` blocks of migrations 386/387/393, not in a standing event
  trigger. A future `CREATE OR REPLACE VIEW` that omits the guard would not be stopped by anything.
  The 419 migration written today preserves the guard and asserts it, but that is one author being
  careful, not a mechanism.
- **HTTP-level behaviour.** Every probe here is at the SQL layer via `SET LOCAL ROLE`. No request
  was made through PostgREST with a real anon JWT. `anon` holding no grant makes the SQL result
  decisive, but the HTTP path itself was not exercised.
