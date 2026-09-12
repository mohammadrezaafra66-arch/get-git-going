# R-1 — Schema convergence, production vs test, and the six migrations

**Agent:** `dev-schema-drift-detector`. Persisted by the orchestrator (the agent has no Write tool).
Scratch DB `prod_rehearsal_r1`, created from the verified dump and **dropped at the end, confirmed
gone**.

---

**VERDICT: PARTIAL.** All six migrations were read and rehearsed inside `BEGIN … ROLLBACK`, the
OG-A per-customer ceiling table was produced, and the `auth.users` trigger claims were checked on
both databases. But the schema diff surfaced a **headline UNEXPECTED finding that outranks all six
migrations combined**, plus a second STOP-class defect in two of the six.

---

## RESTORE PROOF (mission falsification rule 1)

```
docker exec afrakala-lan-db md5sum /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0        ← matches the orchestrator's value exactly

pg_restore … prod_rehearsal_r1 --no-owner --disable-triggers
pg_restore: warning: errors ignored on restore: 21
   (19 pg_cron/cron-schema + 2 vault objects already present — the documented class.
    ZERO data-load COPY errors on any table this mission touches.)

psql -d prod_rehearsal_r1 -tAc "SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;"
681|20260912150000                      ← required value, exact
```

---

## 🔴 UNEXPECTED — the headline: production's ledger and production's catalog disagree

For at least **five** migrations recorded as applied in **both** ledgers, production's live objects
show the **pre-fix** behaviour:

| migration | what the file guarantees | production's live state |
|---|---|---|
| **386** `close_null_uid_on_viewer_guard_views` | `RAISE NOTICE '386 OK: … product_computed_prices_public and v_promotion_suggestions still hold security_invoker=true'` | `v_promotion_suggestions` viewdef **lacks** the `uid() IS NOT NULL AND` guard; `product_computed_prices_public` has `security_invoker` **unset** |
| **394** `purchase_date_uses_tehran_today` | raises if the body still compares `> CURRENT_DATE` | `create_purchase(...)` body: `IF p_purchase_date > CURRENT_DATE THEN` |
| **396** `bucketing_and_staff_metric_use_tehran_today` | same family | `get_payables_list`, `upsert_staff_daily_performance_metric` still use `CURRENT_DATE` |
| **404** `bank_export_reads_payments_with_direction` | — | `asan_list_bank_deposit_export` **lacks the entire payment-vouchers branch** (`v`/`combined` CTEs, `direction` column); returns receipts only |
| **409** `stale_hold_window_is_ten_days_and_bounded` | raises if more than one `expire_stale_credit_holds` signature exists | production has **both** `(integer)` and `(integer,integer)` |

Several of these files carry `ON_ERROR_STOP`-class self-verification. Under this repo's mandated
`--single-transaction -v ON_ERROR_STOP=1` protocol a failing check rolls the whole migration back
and (rule 2b) should never produce a ledger row. **Here the ledger is right and the schema is
wrong — the reverse of the failure mode rule 2b was written to catch.**

### Orchestrator's independent verification of this claim

R-1 dropped its database, so the orchestrator re-tested on **`prod_rehearsal_20260908`** — a
*different* production restore (the 2026-08-31 dump) that R-1 never touched:

| | `product_computed_prices_public` | `v_promotion_suggestions` |
|---|---|---|
| test (`afrakala`) | `security_invoker=true` | `security_invoker=true` |
| **production shape** | **(UNSET)** | **(UNSET)** |

Three alternative explanations were tested and **all three eliminated**:

1. *"A later migration silently reverted it."* 387's own error text warns that
   `CREATE OR REPLACE VIEW` drops `reloptions`. Checked: **nothing after 386 recreates either
   view** — zero matches for any migration with a timestamp `> 20260824210000`.
2. *"386 was never recorded on production."* Checked in the dump's own ledger:
   `20260824210000` (386), `20260824234500` (387) and `20260826220000` (396) are **all present**.
   387 exists *solely* to assert 386's end state and raises if `security_invoker` is lost — it
   could not have passed against this catalog, yet it has a ledger row.
3. *"`pg_dump` doesn't preserve view reloptions, so every restore would look like this."*
   Checked directly: `pg_dump -s -t public.product_computed_prices_public` on test emits
   ```
   CREATE VIEW public.product_computed_prices_public WITH (security_invoker='true') AS
   ```
   **pg_dump does preserve them.** The restore is faithful; production genuinely lacks the option.

**Conclusion: the finding is real and reproduced on two independent dumps.** Root cause is *not*
established — see UNKNOWN.

### Minor, same bucket

- `shipping_cost_rules.trg_audit_shipping_rules` fires on `INSERT OR DELETE OR UPDATE` on
  production, `INSERT OR UPDATE` on test — unexplained.
- `supabase_migrations.schema_migrations.inserted_at` NOT NULL on production, nullable on test —
  Supabase-CLI-managed, cosmetic.
- `list_trusted_credit_customers` differs by one comment (`-- 453:` vs `-- 452:`).
- `anon` SELECT on `categories`/`products` exists on production but not test; `anon` CRUD on
  `storage.buckets`/`storage.objects` exists on test but not production. Plausibly 477's
  documented partial abort plus the 522–525 family; **not traced to closure**.

### A forward-drift the brief did not describe

Four versions are on **production but not test**: `20260908120000` (522), `20260912140000` (523),
`20260912143000` (524), `20260912150000` (525). Production is *ahead* of test here. Benign, but the
brief only described drift in the other direction.

---

## 🔴 SECOND STOP-CLASS FINDING — 336 and 343 abort on production as written

Both carry a hardcoded database-name guard:

```sql
IF current_database() <> 'afrakala' THEN
  RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
```

`336` at lines 31-32, `343` at lines 34-35 — **verified by the orchestrator.** Production's database
is **`postgres`**. Applied verbatim, each aborts on its own guard before touching anything.

This is the same class of test-only assumption that broke **477** on 2026-09-12, and it is already
documented in `prod-clone-dryrun-20260831.md` §6 BLOCKER 1 (fourteen migrations in the 336–392
range carry it). **Neither can be run as-is.**

---

## TASK 2 — the six migrations, rehearsed

### 336 — drop dead receipt posting path → **NEEDS-REPLACEMENT**
Substantive DDL is safe: zero other callers of `post_receipt_journal` anywhere in `pg_proc.prosrc`
on production shape, and `trg_payment_receipts_post_journal` **does not exist** on production's
`payment_receipts` (8 triggers, none matching) — so the trigger-drop half is already a no-op.
Rehearsal (minus the guard) clean: `DROP FUNCTION` succeeded, verify raised
`336 OK: dropped cleanly, verified absent`. Only the guard blocks it.

### 343 — posted journal entries immutable → **NEEDS-REPLACEMENT**
**Stop-condition check passed — no existing row would violate the new triggers.** Production has
**17 `journal_entries`, all 17 `status='posted'`**, and **34 `journal_lines`** beneath them. Each was
individually UPDATE-tested inside ROLLBACK:

```
NOTICE: journal_entries: total_posted=17 raised=17 did_not_raise=0
NOTICE: journal_lines:  total_under_posted=34 raised=34 did_not_raise=0
```

Persian message captured byte-for-byte:
`سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید`

Known interaction recorded in the file itself (OG-11): `post_receipt_accounting`'s idempotent
back-fill branch UPDATEs a posted entry and would raise `P0001` after this lands — reachable only
after a partial failure. Accepted, documented, not re-litigated.

### 373 — close anon default privileges → **LEDGER-ROW-ONLY**
Precondition read first: `SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%'`
→ **0** on production. Rehearsed anyway: `0 → 0`, no error, no change. **Its work is already done.**

### 411 / 412 / 413 — the OG-A artifact

No hardcoded IDs or test-only names; keyed on `dynamic_scoring_parameters.code`.

> **🔴 Operational fact discovered during rehearsal, stated in none of the three files.**
> `customer_capital_allocations_dynamic.final_limit` is written by
> `refresh_today_dynamic_capital_after_score_change()`, which **silently no-ops**
> (`RETURN COALESCE(NEW, OLD)`) unless a `daily_capital_settings` row exists for `CURRENT_DATE`.
> Production's most recent such row is **2026-09-06 — six days stale**. A first rehearsal applying
> 411/412/413 exactly as written moved **zero of 122 customers** — not because the migrations are
> inert, but because the recompute trigger had nothing to recompute into.
> **Applying 411/412/413 alone, today, would change zero live ceilings** until the next daily-capital
> snapshot runs.

To produce the artifact the decision actually needs, the rehearsal inserted one synthetic
`daily_capital_settings` row for `CURRENT_DATE` **inside the same rolled-back transaction**
(cloning `total_capital = 2,000,000,000`, `scoring_mode='auto'` from the last real row) and called
`recompute_dynamic_capital_setting()` before and after.

| customer | before `final_limit` | after | delta |
|---|---:|---:|---:|
| اصحابی | 224,251,151 | 171,473,263 | **−52,777,888** |
| خان محمدی | 455,093,003 | 455,093,003 | 0 |
| تست ۲ *(dummy record)* | 104,497,731 | 115,412,437 | +10,914,706 |
| کوثری کوروش | 266,328,208 | 311,374,592 | +45,046,384 |
| remaining 118 of 122 | 0 | 0 | 0 |

```
n_increased | n_decreased | n_unchanged | largest_decrease | largest_increase | n_total
          2 |           1 |         119 |        -52777888 |         45046384 |     122
```

**Of the 122, only 4 move or hold a non-zero ceiling; one of those is a test record.** So **3 real
customers are affected: 2 up, 1 down.** Largest decrease **−52,777,888** (اصحابی).

Verdicts: **411 BLOCKED (owner)** — CLAUDE.md rule 10 requires approval of the *ceiling movement*,
not the range numbers. **412 APPLY-AS-IS** (cosmetic Persian hint; depends on 411).
**413 BLOCKED (owner)** — same class; salesperson-side deltas were **not** captured (see UNKNOWN).

---

## TASK 3 — `auth.users` triggers (OG-E): **both brief claims are wrong**

```
prod_rehearsal_r1:   on_auth_user_created          | handle_new_auth_user | O
                     on_auth_user_created_afrakala | handle_new_auth_user | O
afrakala (test):     on_auth_user_created_afrakala | handle_new_auth_user | O
                     on_auth_user_created          | handle_new_auth_user | O
```

1. **"Production has two triggers → two rows per signup"** — TRUE, but **not production-specific**.
   Test has the identical pair, both enabled, bound to a byte-identical function body
   (`pg_get_functiondef` diff produced zero output). **The defect exists equally on both.**
2. **"Test has `handle_new_user` unwired"** — **the function does not exist** in either catalog.
   The real name is `handle_new_auth_user`, and it is **wired on both**. The claim is false as
   stated.

Empirical proof on production:

```
SELECT count(*), count(DISTINCT entity_id) FROM audit_logs WHERE action='user_registered';
15 | 13
-- entity_ids with 2 rows:
21ad639f-7df0-46f7-8bae-d3ba167922ea | 2
6dada3e8-240a-460a-a6d3-0781d0f8a990 | 2
```

2 of 13 users have duplicates; 11 have exactly one — consistent with the `_afrakala` trigger being
added after those 11 signed up.

**What the function writes:** a `profiles` row `ON CONFLICT (id) DO NOTHING`; `status='active'`
**only** for the very first profile ever, otherwise **`'pending'`**; a `user_roles` row with
`role='admin'` **only** for that first user, so every later signup gets **no role row**; and one
`audit_logs` row per trigger firing — **not deduplicated, which is the actual bug.** The profile and
role inserts are protected by `ON CONFLICT`; the audit insert is not.

**`profiles.status='pending'` with no role is confirmed as the intended cold state.**

---

## TASK 4 — verdicts

| # | verdict | why |
|---|---|---|
| **336** | **NEEDS-REPLACEMENT** | `current_database() <> 'afrakala'` guard aborts on production. DDL itself proven safe |
| **343** | **NEEDS-REPLACEMENT** | same guard. Logic proven safe: 17/17 and 34/34 rows correctly refuse UPDATE; **not** a stop condition |
| **373** | **LEDGER-ROW-ONLY** | `pg_default_acl` anon count already 0; rehearsal 0→0 |
| **411** | **BLOCKED (owner)** | moves real ceilings; rule 10 |
| **412** | **APPLY-AS-IS** | cosmetic; apply with 411 |
| **413** | **BLOCKED (owner)** | moves salesperson-side allocations; deltas not captured |

---

## UNKNOWN

- **Root cause of the ledger-vs-catalog mismatch.** Established *that* it exists and named five
  migrations; did **not** establish *why* (stale restore, manual hotfix, bulk ledger backfill).
  Needs production history or admin recollection — outside a read-only mission.
- **Full extent of that class.** Only objects that surfaced in the Task 1 diff were checked. Five
  confirmed instances; more may exist where test drifted identically or the object type was not
  queried.
- **`categories`/`products` and `storage.*` anon-grant asymmetry** — not traced to closure.
- **Salesperson-side ceiling deltas for 413** — no equivalent read-only RPC was exercised.
- **Whether the synthetic "today" snapshot reproduces the real numbers on deploy day** — depends on
  that day's live `total_capital` and `dynamic_entity_scores`.
- **Whether other scheduled work depends on the 6-day-stale `daily_capital_settings` cadence.**
