# OG-63 — `CURRENT_DATE` is the UTC server date: the fix, and an audit of the rest of the class

Measured on the live `afrakala` database on 2026-08-26 for mission 5 of the chained
execution (branch `feature/og63-purchase-date-tehran`, migration 394). Everything below is
command output, not recollection.

The owner scoped migration 394 to **`create_purchase` only**. This file is the audit half
that v8 mission 5(d) requires: the remaining functions listed by name, with the class
raised as ONE gate and **nothing else changed**.

---

## 1. The defect, and how it was found

Not by looking for it. Mission 4's e2e run returned 43 failures against a baseline of 30;
the 14 new ones were all in `purchase/*`, they reproduced on an idle machine, and migration
393 was exonerated by reverting it live and re-running two of them. The run had started at
02:5x Tehran.

```
          utc_now           |         tehran_now         | server_current_date | tehran_today | inside_broken_window
----------------------------+----------------------------+---------------------+--------------+----------------------
 2026-08-25 23:23:08.352307 | 2026-08-26 02:53:08.352307 | 2026-08-25          | 2026-08-26   | t
```

`create_purchase`, live body line 170:

```
  IF p_purchase_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'تاریخ خرید نمی‌تواند در آینده باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_FUTURE';
```

`CURRENT_DATE` is evaluated in the **session's** TimeZone. This server runs UTC —
`SHOW TimeZone` → `UTC`, and `pg_db_role_setting` holds no override for `afrakala`. The
purchase form defaults its date field to the **Tehran** day. So between **00:00 and 03:30
Tehran every night**, the form's own default is one day ahead of `CURRENT_DATE` and is
refused as being in the future, with the RPC's own Persian message — which reads as a
validation rule rather than a bug.

This is A5.32's recorded trap — *server timezone is UTC; use `public.tehran_today()` for the
calendar day* — violated inside the RPC.

## 2. The fix

One line, in a 476-line body:

```
-  IF p_purchase_date > CURRENT_DATE THEN
+  IF p_purchase_date > public.tehran_today() THEN
```

`public.tehran_today()` is `(now() AT TIME ZONE 'Asia/Tehran')::date` — STABLE, already the
project's calendar-day function, and independent of the session TimeZone.

The body shipped in migration 394 is a **byte-for-byte copy of the live
`pg_get_functiondef` capture** with only that comparison replaced. It was copied rather than
retyped because it carries 31 distinct Persian-guarded error paths, and hand-transcribing
Persian is how ~460 Persian values were destroyed on 2026-07-11 (A5.30). Delivered by
`docker cp` + `psql -f`.

**No drift between git and the database here**, checked before writing anything: the live
body and migration 252's (the authoritative git definition — 254 is a different function,
`create_purchase_request`) carry the same 31 distinct HINT codes.

### Post-apply live verification (A0.9a)

```
            prosrc_md5            | matches_dryrun | still_buggy | uses_tehran_today | persian_intact | persian_corrupted
----------------------------------+----------------+-------------+-------------------+----------------+-------------------
 d4b56b29cf3339f053cccc10805076fc | t              | f           | t                 | t              | f

170:  IF p_purchase_date > public.tehran_today() THEN
171-    RAISE EXCEPTION 'تاریخ خرید نمی‌تواند در آینده باشد.'
172-      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_FUTURE';
```

The applied body's `prosrc` md5 equals the dry-run's exactly, so the delivery path
introduced no corruption. Rollback proved byte-identical **before** the forward file was
applied: `ea45948e11ae4a178fc1d6889f476a56` → forward → down → `ea45948e11ae4a178fc1d6889f476a56`.

---

## 3. The gate is time-independent, and that is the whole difficulty

**The defect is dormant for 20.5 hours a day.** A gate that simply called the RPC would
therefore PASS against the *broken* code at almost any hour and prove nothing. v8 5(c) is
explicit: *"A gate that only passes at 14:00 Tehran is not a gate."*

At the moment this mission ran, the window was already shut:

```
          utc_now           |         tehran_now         | server_current_date | tehran_today | inside_broken_window
----------------------------+----------------------------+---------------------+--------------+----------------------
 2026-08-26 07:17:31.883808 | 2026-08-26 10:47:31.883808 | 2026-08-26          | 2026-08-26   | f
```

So the gate **reconstructs the window on demand**. The mechanism was measured before it was
relied on: `CURRENT_DATE` follows the session TimeZone, while `tehran_today()` does not.

```
     tz     | current_date_now | tehran_today | window_reconstructed
------------+------------------+--------------+----------------------
 Etc/GMT+12 | 2026-08-25       | 2026-08-26   | t
```

The gate therefore runs the same two assertions under **both** regimes —
`Etc/GMT+12` (the broken window, at any wall-clock time) and `Asia/Tehran` (the healthy
case) — and each regime carries a **vacuity guard** that fails if the regime was not
actually constructed:

1. a purchase dated **today-in-Tehran must be ACCEPTED** — the user-facing bug;
2. a purchase dated **tomorrow-in-Tehran must still be REJECTED** with
   `PURCHASE_DATE_FUTURE` — so a "fix" that just deletes the check fails (A2.10).

**Nothing is written.** `create_purchase` is VOLATILE and inserts, so every probe goes
through a `pg_temp` helper whose sub-transaction is rolled back in both directions —
including the accepted case, which raises its own marker to force the rollback. Proven:
`purchases` was **198 before and 198 after** the gate ran, and 198 again after the real
apply.

---

## 4. Gate attack (A2.12) — 1 control + 12 disturbances, all caught

Every disturbance prints its constructed state before the gate runs (A2.12d).

| # | kind | disturbance | constructed? | result |
|---|---|---|---|---|
| D0 | — | **control**, healthy | — | **PASS** (required) |
| D1 | behavioural | install the **original defective body** | `compares_to_current_date=t`, `calls_tehran_today=f` | CAUGHT — S2 |
| D2 | **correct-looking, no effect** | `... > tehran_today() OR p_purchase_date > (CURRENT_DATE)` | `calls_tehran_today=t`, `bare_current_date_match=f` — **structurally clean** | **CAUGHT — B3, behaviourally, inside the reconstructed window** |
| D3 | behavioural | neuter the rule: `> tehran_today() + 3650` | `neutered=t` | CAUGHT — B4 (`got __ACCEPTED__`) |
| D4 | **rejects everything** | `> tehran_today() - 3650` | `rejects_all=t` | CAUGHT — B3 |
| D5 | **vacuity** | redefine `tehran_today()` as `SELECT CURRENT_DATE` so the window cannot be built | `tehran_today = current_date_utc` | CAUGHT — B1 vacuity guard |
| D6 | structural | corrupt the Persian message to `?????` | `corrupted=t`, `persian_gone=t` | CAUGHT — S5 |
| D7 | structural | delete one of the 31 guards | `35` occurrences over `30` codes | CAUGHT — S4 |
| D8 | structural | `GRANT EXECUTE … TO anon` | `anon_execute=t` | CAUGHT — S9 |
| D9 | structural | `REVOKE EXECUTE … FROM authenticated` | `auth_execute=f` | CAUGHT — S10 |
| D10 | structural | `ALTER FUNCTION … SECURITY INVOKER` | `security_definer=f` | CAUGHT — S7 |
| D11 | structural | add an overload `create_purchase(jsonb)` | `signatures=2` | CAUGHT — S1 |
| D12 | structural | `COMMENT … IS NULL` | `comment_is_null=t` | CAUGHT — S8 |

**D2 is the disturbance that justifies the whole design.** It calls `tehran_today()` and
contains no bare `> CURRENT_DATE`, so every *structural* check passes it — and it is still
the original bug, because the `OR` restores the UTC comparison. Only the behavioural half,
run inside a deliberately reconstructed window, catches it. A gate built on grep would have
shipped it.

**D5 justifies the vacuity guards.** With `tehran_today()` neutered to `CURRENT_DATE`, the
window can no longer be constructed; without the guard, both regimes would collapse to the
same trivially-passing case and the gate would report success.

**A2.12(b)'s "numeric returned as a JSON string"** has no attack surface here — this gate
makes no HTTP or JSON read; every check is a catalogue lookup, a `prosrc` inspection, or a
direct RPC call. Stated rather than skipped silently. Its nearest analogue, a check that
passes because its input is degenerate rather than because the property holds, is D5.

---

## 5. AUDIT ONLY — the rest of the class, not touched

22 functions in `public` reference `CURRENT_DATE`/`current_date`. **Not one of them also
references `tehran_today`.** `create_purchase` is now fixed; these 21 are not, by the
owner's scoping.

**The class is not homogeneous, and the distinction matters more than the count.**

### 5a. Same *rejection* semantics as `create_purchase` — 1 function

| function | line | code |
|---|---|---|
| `upsert_staff_daily_performance_metric` | 21 | `IF p_metric_date IS NULL OR p_metric_date > CURRENT_DATE THEN` |
| " | 26 | `IF p_metric_date < CURRENT_DATE - INTERVAL '5 days' AND NOT v_is_admin THEN` |

This is the only other outright **refusal**. During the window a staff member recording
today's metric is refused exactly as a purchase was; and the 5-day backdating allowance
shifts with it.

### 5b. *Bucketing filters*, not rejections — 4 functions

| function | lines | code |
|---|---|---|
| `get_payables_list` | 36–38 | `v.due_date = CURRENT_DATE` / `= CURRENT_DATE + 1` / `> CURRENT_DATE + 1` |
| `get_receivables_list` | 35–37 | same three |
| `get_payables_summary` | 16–18 | `FILTER (WHERE v.due_date = CURRENT_DATE)` / `= CURRENT_DATE + 1` / `> CURRENT_DATE + 1` |
| `get_receivables_summary` | 16–18 | same three |

These four drive the *today / tomorrow / future* buckets on the payables and receivables
screens. **Their night-time effect is not an error — it is a silent misclassification.**
Inside the window, an item due today-in-Tehran is counted as "tomorrow", and the
"due today" total reads 0 or wrong. Nothing raises, nothing logs, and the numbers look
plausible. That is harder to notice than the purchase failure, not easier.

### 5c. The remaining 16 — `CURRENT_DATE` present, no future-date rejection

`_latest_active_capital_setting`, `calculate_adjusted_price`, `calculate_credit_score`,
`calculate_customer_realtime_credit`, `calculate_dynamic_score`, `compute_daily_capital`,
`create_dynamic_scoring_parameter`, `create_dynamic_scoring_parameter_v2`,
`generate_birthday_notifications`, `get_customer_dynamic_credit`, `get_product_stats`,
`pay_purchase_with_voucher`, `post_mutual_settlement`,
`refresh_today_dynamic_capital_after_score_change`, `settle_league_season`,
`upsert_dynamic_parameter_weight`.

These use `CURRENT_DATE` as a stamp or a window boundary. Each would attribute a
late-evening Tehran action to the previous calendar day — `compute_daily_capital`,
`generate_birthday_notifications` and `settle_league_season` are the ones where that is most
likely to be visible — but none of them refuses input, so none is an outage. They were
**not** individually analysed for correctness; only the `CURRENT_DATE` usage was located.
Saying so is the point: this is a located set, not an assessed one.

**Raised as OG-64.** Not fixed here — the owner scoped migration 394 to `create_purchase`
alone, and A2.9 caps this mission at the one gate 394 spent.

---

## 6. What the e2e run can and cannot prove

Mission 4's run produced 14 `purchase/*` failures because it started at **02:5x Tehran**,
inside the window. This mission's run started at **10:58 Tehran** — outside it.

**So those 14 tests would pass in this run with or without migration 394.** A green
`purchase/*` here is consistent with the fix working and equally consistent with the fix
doing nothing; it does not discriminate. Recorded plainly rather than presented as
confirmation, because presenting it as confirmation is exactly the reasoning error that put
OG-63 in the `purchase/*` column in the first place.

**The evidence that the fix works is the time-independent gate** — specifically D1 (the real
defective body is caught) and D2 (a structurally-clean re-introduction of the UTC comparison
is caught behaviourally, inside a reconstructed window). The e2e run's job here is narrower
and still worth doing: showing that replacing a 476-line SECURITY DEFINER RPC broke nothing
else.

---

## 7. New gate raised

| gate | question |
|---|---|
| **OG-64** | 21 functions still compare against the UTC `CURRENT_DATE` and none uses `tehran_today()`. One (`upsert_staff_daily_performance_metric`) *refuses* input during the same 00:00–03:30 Tehran window that OG-63 described. Four (`get_payables_list/summary`, `get_receivables_list/summary`) *misclassify* due-date buckets silently in that window — no error, plausible-looking numbers. The other 16 stamp or bound by date without refusing anything. Should the class be converted to `public.tehran_today()`? It is a real business question, not a mechanical sweep: converting the four bucketing functions changes which rows appear under "today" on live financial screens, and converting the backdating allowance in `upsert_staff_daily_performance_metric` shifts a permission boundary. Fixing them one at a time as they surface is also defensible. |
