# OG-64 — the `CURRENT_DATE` class, measured and assessed

**Date:** 2026-08-26 · **Mission:** 13 · **Migration:** 396 · production لمس نشد

`CURRENT_DATE` is evaluated in the **session timezone**, which is UTC on this deployment.
Between **00:00 and 03:30 Tehran** it therefore still returns **yesterday**. `public.tehran_today()`
is `(now() AT TIME ZONE 'Asia/Tehran')::date`, `STABLE`, and independent of the session timezone.

---

## 1. The audit undercounted the class, and the reason is structural

The audit behind OG-64 enumerated **`pg_proc`**. That is the right query for functions and the
wrong query for the class, because two other kinds of object carry the same comparison and
neither lives in `pg_proc`. A full sweep across every catalogue that can hold an expression
found:

| Object kind | Count | Occurrences | Seen by the original audit? |
|---|---|---|---|
| Functions | 21 | 33 | **yes** |
| **Views** | **2** | **13** | **no** — views are in `pg_views` |
| **Column defaults** | **7** | **7** | **no** — `pg_attrdef` |
| **RLS policies** | **4** | **4** | **no** — `pg_policy` |
| **Check constraints** | **2** | **2** | **no** — `pg_constraint` |

The lesson generalises past this bug: **an audit's blind spot is the shape of its query, and
it will not appear in its own output.** A count of 21 read as complete because nothing in the
result said "functions only".

The sweep that produced the table above is kept at the end of this document so the next
mission can re-run it rather than re-derive it.

---

## 2. Two of those hidden objects made the scoped fix a no-op — this is the main finding

Mission 13 was scoped to five functions. Fixing exactly those five would have produced
**two failures that read as successes**:

### (a) The views — a row that contradicts itself on screen

`get_payables_list` / `get_receivables_list` and their summaries take `is_overdue`,
`days_until_due` and `aging_bucket` **from** `vw_supplier_payables` / `vw_customer_receivables`,
which compute all three from `CURRENT_DATE`. Fixing only the functions gives, inside the window:

- an item due today-in-Tehran listed under **«امروز»** by the fixed filter,
- while the **same row** reports `days_until_due = 1` from the unfixed view.

And an item that **is** overdue in Tehran is not yet overdue in UTC, so it falls out of the
overdue bucket without landing in any other.

### (b) The RLS policies — the function is not the gate

`staff_daily_performance_metrics` carries:

```
sdpm_insert_privileged   WITH CHECK (... AND metric_date <= CURRENT_DATE)
sdpm_update_privileged   USING/CHECK (... AND metric_date >= CURRENT_DATE - 5 days)
```

`upsert_staff_daily_performance_metric` line 21 is **not** what refuses the write — the policy
is. Converting the function alone lets the call past a clean Persian message
(`تاریخ نامعتبر است؛ ثبت برای آینده مجاز نیست`) and straight into a row-level-security
violation: **the same refusal, with a worse error.** Strictly worse than the bug.

Both were therefore converted with the five, in migration 396 — nine objects, 27 substitutions.

---

## 3. What the bug is actually worth, measured

Not a hypothetical. Bucketing the **live** payables rows by the two dates a `CURRENT_DATE`
could produce (UTC-12 versus UTC+14 — always 26 hours apart, so always different dates):

| `due_today` computed as | Total |
|---|---|
| `CURRENT_DATE` at UTC-12 | **349,800** |
| `CURRENT_DATE` at UTC+14 | **13,000,000,024.95** |
| `public.tehran_today()` | **349,800** (fixed, both) |

Same screen, same rows: a **five-order-of-magnitude** difference in "due today", decided by
nothing but the clock. And unlike OG-63's purchase outage it raises **no error and writes no
log** — just plausible money on a financial screen. Harder to notice, not easier.

---

## 4. The remaining 16 functions — located by the audit, ASSESSED here

The audit said plainly that these were "located, not assessed". They are assessed now, ranked
by **what happens when the comparison is wrong**, not by count.

### Tier 1 — writes a wrong date into a permanent record

| Function | Line | What it does | Why it is the worst tier |
|---|---|---|---|
| `post_mutual_settlement` | 25 | `_date := COALESCE(_entry_date, CURRENT_DATE)` → `journal_entries.entry_date` | A settlement posted in the window is **dated yesterday in the ledger**, and the immutability trigger blocks correcting it afterwards — even for a superuser. Wrong accounting data that cannot be edited out. |
| `pay_purchase_with_voucher` | 54 | `_pay_date := COALESCE(_payment_date, CURRENT_DATE)` | Stores a payment date one day early; feeds settlement and reporting. |
| `compute_daily_capital` | 1, 18 | `p_capital_date date DEFAULT CURRENT_DATE`, re-assigned at 18 | Writes the daily capital row under the wrong key, so the day has two identities. |
| `refresh_today_dynamic_capital_after_score_change` | 8, 19 | `WHERE capital_date = CURRENT_DATE` | The name says *today*. In the window it refreshes **yesterday's** row and leaves today's stale — a silent no-op that looks like a refresh. |

### Tier 2 — writes a validity window or a notification

| Function | Line | Note |
|---|---|---|
| `create_dynamic_scoring_parameter` | 10 | `v_today := CURRENT_DATE` → `valid_from` |
| `create_dynamic_scoring_parameter_v2` | 10 | same |
| `upsert_dynamic_parameter_weight` | 14–16 | `v_today`, `v_month`, `v_next_month` all derived |
| `settle_league_season` | 25–26 | next season's start/end stored |
| `generate_birthday_notifications` | 10 | in the window it congratulates **yesterday's** birthdays and misses today's — visible to customers, and not correctable after sending |

*Related and in the same class:* the column defaults `dynamic_parameter_weights.valid_from`
and `score_level_thresholds.valid_from` are `date_trunc('month', CURRENT_DATE)`.

### Tier 3 — reads and compares; a wrong answer, nothing stored

| Function | Line | Effect in the window |
|---|---|---|
| `_latest_active_capital_setting` | 8 | `capital_date <= CURRENT_DATE` excludes a setting dated today-in-Tehran → silently uses yesterday's |
| `calculate_customer_realtime_credit` | 78, 90 | passes the wrong period; `v_is_stale` misjudged |
| `get_customer_dynamic_credit` | 43 | `v_is_today` false for today's row → UI says the figure is stale when it is not |
| `calculate_adjusted_price` | 51 | `v_holding_days` off by one — **and this feeds a PRICE** |
| `calculate_credit_score` | 64 | analysis window shifts by a day |

### Tier 4 — month-boundary only, roughly 12× rarer

| Function | Line | Note |
|---|---|---|
| `calculate_dynamic_score` | 19 | `date_trunc('month', current_date)` — only wrong when the window falls on the 1st |
| `get_product_stats` | 14 | same shape |

### Assessed as NOT worth changing

The two `*_birth_date_not_future` **check constraints**. A UTC "not in the future" is, for
3.5 hours, marginally more **permissive** than a Tehran one — never more restrictive. It
refuses nothing it should accept, so converting it buys nothing and touches a constraint on
two tables holding real data.

`purchases.purchase_date DEFAULT CURRENT_DATE` is **latent, not live**: `create_purchase`
rejects a NULL date (:166) and passes `p_purchase_date` explicitly (:333), so the default
never fires from the only path that writes purchases. Recorded so the next reader does not
re-raise it as a bug — but it should still be converted if a second write path is ever added.

---

## 5. What mission 13 changed, and what it deliberately did not

**Changed (migration 396, nine objects, 27 substitutions):** the four bucketing functions,
`upsert_staff_daily_performance_metric`, the two views they read, and the two RLS policies on
`staff_daily_performance_metrics`.

**Not changed:** all 16 above, the 7 column defaults, the 2 check constraints. That is the
owner's scoping and it is the right call for tier 3 and 4 — but **tier 1 is a different
argument**, because those write dates into records that cannot be corrected afterwards. Raised
as **OG-71** rather than fixed silently or left unmentioned.

---

## 6. Re-runnable sweep

```sql
SELECT 'function' AS kind, p.proname AS name, count(*) AS hits
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
       LATERAL regexp_matches(pg_get_functiondef(p.oid),'CURRENT_DATE|current_date','gi')
 WHERE n.nspname='public' AND p.prokind='f' GROUP BY 1,2
UNION ALL
SELECT 'view', v.viewname, count(*) FROM pg_views v,
       LATERAL regexp_matches(v.definition,'CURRENT_DATE|current_date','gi')
 WHERE v.schemaname='public' GROUP BY 1,2
UNION ALL
SELECT 'column default', c.relname||'.'||a.attname, 1
  FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
 WHERE n.nspname='public' AND pg_get_expr(d.adbin,d.adrelid) ~* 'current_date'
UNION ALL
SELECT 'check constraint', co.conrelid::regclass::text||' / '||co.conname, 1
  FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace
 WHERE n.nspname='public' AND co.contype='c' AND pg_get_constraintdef(co.oid) ~* 'current_date'
UNION ALL
SELECT 'RLS policy', pol.polrelid::regclass::text||' / '||pol.polname, 1
  FROM pg_policy pol
 WHERE coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') ~* 'current_date'
    OR coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') ~* 'current_date'
UNION ALL
SELECT 'index', i.indexrelid::regclass::text, 1
  FROM pg_index i WHERE pg_get_indexdef(i.indexrelid) ~* 'current_date'
ORDER BY 1, 3 DESC, 2;
```

## 7. The gate

`e2e/business-flows/og64-tehran-today-bucketing.spec.ts` — five tests, all passing.

It is **time-independent**: it compares UTC-12 against UTC+14, which are 26 hours apart, so
their dates differ at every hour of every day. An earlier draft used one fixed offset and
**failed at 18:30 Tehran** because that offset happened to agree with Tehran's date — a gate
that only fires during certain hours passes vacuously for most of the day.

It is **two-sided**: a CONTROL reproduces the pre-fix expression over the same live rows and
must show it MOVES. Without that, the closed half would pass on data that has nothing near a
boundary and would prove nothing.

Two drafting errors are recorded in the spec itself because both produced *false green*:
the views are RLS-filtered to **empty** without a JWT claim (the first draft measured 0 vs 0
and concluded the bug was unreproducible), and `set_config` in a scalar **subquery** is not
guaranteed to run before the aggregate — it has to be a separate statement, which works
because `psql -c` runs multiple statements in one transaction.
