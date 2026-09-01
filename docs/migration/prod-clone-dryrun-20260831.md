# Production clone dry-run — **PARTIAL**

The clone genuinely has the Live Ledger module: 11 of its 12 named objects are present and all 151
of production's accepted quotes were back-filled correctly. **Two blockers must be decided by the
owner before the production run**, and both are things that would have gone wrong at 2am with no
warning. That is what this rehearsal was for.

Run 2026-09-01. Production was **never contacted**. The live `afrakala` database on the test server
was **not touched**.

---

## 1. Machine

```
$ hostname
VIRA-SERVICE
```

The TEST server. Production is `DESKTOP-MT8J1VR`; the wrong-machine stop condition did not fire.

## 2. The dump

`C:\Users\AFRA\Desktop\prod-full-20260831.dump`

| check | value | expected | |
|---|---|---|---|
| size | 29,725,089 bytes | 29,725,089 | ✅ |
| md5 (on Windows) | `41830357199bf4fe743e824fee89f3f5` | same | ✅ |
| md5 (inside the container, after transfer) | `41830357199bf4fe743e824fee89f3f5` | same | ✅ |

Delivered over stdin rather than `docker cp`, which is broken on this machine at the Docker Desktop
mount layer.

> **An earlier attempt was correctly abandoned.** The previous run used
> `afrakala-prod-20260811-140459.dump` — a genuine production dump (`dbname: postgres`) but three
> weeks stale. It restored to 153 / 11 / 337 / 375 and was missing `payment_vouchers`,
> `dynamic_entity_scores`, `settlement_types.days` and the entire `supabase_migrations` schema. That
> clone was dropped, with the owner's approval, and rebuilt from the verified dump above.

## 3. The clone before migrations — an exact match

`pg_restore --no-owner --disable-triggers`, exit 1 with **21 errors, all benign**: 19 are
`pg_cron`-related (the extension can only live in a database named `postgres`, and the clone is
not), 2 are vault objects that pre-exist in the container. **No data-loading errors** — the
`--disable-triggers` advice about the circular FK was correct and prevented them.

Counting `public` schema only, the method that reproduces the test server's published figures
(224 / 21 / 840 / 618) exactly:

| | tables | views | functions | policies |
|---|---|---|---|---|
| production, expected | 221 | 20 | 823 | 622 |
| **clone, measured** | **221** | **20** | **823** | **622** |

A perfect match on all four. Structural proof the clone sits at production's level:

| check | result |
|---|---|
| `sales_quotes.accepted_at` absent | ✅ as expected |
| `dual_documents`, `document_numbers`, `document_attachments` absent | ✅ as expected |
| `payment_vouchers` present | ✅ |
| `dynamic_entity_scores` present | ✅ |
| `settlement_types.days` present | ✅ |
| `supabase_migrations.schema_migrations` present | ✅ |

## 4. Stage 2 — what the clone needs

Structure, not the ledger. A caution that changed the method: only 6 of the 40 migrations create a
checkable top-level object; **the other 34 create functions, alter columns, or rewrite views that
already exist by name**, so name-presence cannot decide "already applied". A view whose name exists
with an older definition looks present and is not.

| present / wanted | migrations | reading |
|---|---|---|
| 0 of N | 338, 342, 346, 349, 351, 353, 354, 355, 356, 357, 360, 361, 363, 365, 378, 379, 380, 400, 403 | **NEEDED** |
| partial | 364 (3/5), 407 (3/4), 408 (1/4), 417 (2/3) | **NEEDED** |
| names all present | 291, 350, 359, 366, 367, 369, 402, 419 | names exist, definitions may be older — re-apply is safe |
| no detectable object | 344, 352, 362, 368, 391, 392, 398, 410, 418 | policy/seed/backfill/grant — must be applied and observed |

Because name-presence is not decisive, the honest test was to **apply all 40 in order** and record
what each does. That is Stage 3.

## 5. Stage 3 — the run

Filename order, one at a time, each under `--single-transaction -v ON_ERROR_STOP=1`.

**First pass: 27 succeeded, 13 failed.** After remediation: **33 succeeded, 7 remain**.

```
291 OK    338 FAIL*  342 FAIL*  344 FAIL*  346 FAIL*  349 OK    350 OK    351 OK
352 FAIL† 353 OK     354 OK     355 OK     356 OK     357 OK    359 OK    360 OK
361 OK    362 OK     363 OK     364 OK     365 OK     366 OK    367 OK    368 OK
369 OK    378 FAIL‡  379 FAIL‡  380 FAIL‡  391 FAIL§  392 FAIL* 398 OK    400 OK
402 FAIL† 403 OK     407 OK     408 OK     410 FAIL¶  417 OK    418 FAIL¶ 419 OK
```

## 6. Every failure, classified

### 🔴 BLOCKER 1 — the database-name guard will stop production dead

Six of the 40 (**338, 342, 344, 346, 391, 392**) — and **14 migrations across the whole repo** —
open with:

```sql
DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;
```

**Production's database is named `postgres`.** Every one of these will abort with
`wrong database: postgres (expected afrakala)`. This is not a clone artefact — the clone merely
revealed it. Without this rehearsal the production run would have stopped at migration 338.

*Fix, proven on the clone:* relaxing the guard to accept the target database unblocked all six, and
352 (which failed only because 338 had not created `document_numbers`) then passed.

### 🔴 BLOCKER 2 — migration 391 would silently disable receipt posting on production

391 calls `trg_post_receipt_on_approve()` an **orphan** and drops it. On the test database that is
true — zero triggers use it. **On production it is live:**

```sql
CREATE TRIGGER trg_payment_receipts_post_journal
  AFTER INSERT OR UPDATE OF status ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION trg_post_receipt_on_approve()
```

and the function posts the accounting entry when a receipt is approved:

```sql
IF NEW.status = 'approved' AND … THEN PERFORM public.post_receipt_journal(NEW.id); END IF;
```

The migration failed with `cannot drop function … because other objects depend on it`. **Forcing it
with CASCADE would remove production's automatic receipt → journal posting**, and the Live Ledger
RPC path that replaces it is exactly what this migration set is still in the middle of installing.

**Not forced.** This needs the owner's decision — see §8.

### 🟡 Missing prerequisites — the brief's list is incomplete

- **`jalali_year` is missing from the finished clone.** It is created by **migration 337**, which
  the brief's list skips (it jumps 291 → 338). 338 applied without it, but the document-number
  functions call it at runtime.
- **378, 379, 380** assert that no `anon` default-privilege entries remain. Production still has
  **9** such entries (the test database has 0). The migration that revokes them is **393**, also
  absent from the list. These three are gates asserting a state a missing migration establishes.

### 🟡 Hard-coded data assertions — the 283/310 pattern, exactly as warned

| migration | assertion | production reality | fix |
|---|---|---|---|
| **410** | `IF v_ledger < 598` | ledger holds 569 | relax the floor — **applied clean after relaxing** |
| **418** | `IF _total <> 9` (accepted quotes) | **151** accepted quotes | relax to `< 1` — **applied clean after relaxing** |
| **392** | probe account `20303d30…` must be viewer-only | different roles on production; then a second probe hits `documents_uploaded_by` FK | relax both probes |

418 is mine, and the rehearsal caught it: it was written against a database with exactly 9 accepted
quotes and hard-codes that number. **On production it would have aborted immediately.**

Once relaxed, 418 back-filled **all 151** accepted quotes — see §7.

### 🟡 402 — an ordering conflict, not an assertion

First run: failed because `document_attachments` did not exist (cascade from 342).
After 342 applied: failed its own probe, `an attachment with two parents was accepted`.
Third run: `column "receipt_id" of relation "document_attachments" already exists`.

342 creates the table already carrying `receipt_id` and the constraint
`document_attachments_exactly_one_parent CHECK (num_nonnulls(receipt_id, voucher_id, dual_id) = 1)`,
which 402 then tries to add again. **This is an overlap between 342 and 402 that needs a human
decision**, not a relaxed number. Not forced.

## 7. Stage 4 — verification

| object | present |
|---|---|
| `dual_documents` | ✅ |
| `document_numbers` | ✅ |
| `document_attachments` | ✅ |
| `v_customer_credit_exposure` | ✅ |
| `sales_quotes.accepted_at` | ✅ |
| `create_receipt` | ✅ |
| `create_payment` | ✅ |
| `create_dual_document` | ✅ |
| `reverse_document` | ✅ |
| `hold_credit_for_quote` | ✅ |
| `expire_stale_credit_holds` | ✅ |
| **`jalali_year`** | ❌ — migration **337**, missing from the list |

**The back-fill worked on real production data:** 151 accepted quotes, **151 stamped**, 0 left NULL.
Measured beforehand, every one of the 151 has an acceptance event in `audit_logs`, so nothing is
inferred from a fallback.

| | tables | views | functions | policies |
|---|---|---|---|---|
| TEST database | 224 | 21 | 840 | 618 |
| **clone after the run** | **224** | **21** | **839** | **626** |

- tables and views: **exact match**
- functions: **−1**, which is `jalali_year` (migration 337)
- policies: **+8**. These are production-only policies the test database has since replaced —
  `dynamic_entity_scores.dyn_scores_select_privileged`, `categories.manager admin write categories`,
  `daily_capital_settings.dcs_select_privileged` and five more. A pre-existing divergence, not
  something this run created. Some would have been removed by 391/392, which are blocked.

---

## 8. برای اجرای واقعی روی production چه چیزی لازم است

### پیش‌شرط‌ها — قبل از باز کردن پنجرهٔ تعمیر

**۱. دو تصمیم که فقط شما می‌توانید بگیرید:**

**تصمیم الف — محافظ نام دیتابیس.** چهارده مهاجرت مخزن شرط `current_database() <> 'afrakala'`
دارند و نام دیتابیس production ‏`postgres` است. دو راه:
- **توصیهٔ من:** یک بار همهٔ آن‌ها را طوری ویرایش کنیم که نام مقصد را هم بپذیرند
  (`NOT IN ('afrakala','postgres')`). روی clone این کار جواب داد و هر شش‌تا رد شدند.
- یا: نسخهٔ scratch بسازیم و اصل فایل‌ها را دست نزنیم — همان کاری که در این تمرین کردم.

**تصمیم ب — مهاجرت ۳۹۱. این خطرناک‌ترین مورد است.** روی production تابعی را حذف می‌کند که
تریگر زندهٔ ثبت خودکار سند حسابداری از آن استفاده می‌کند. سه گزینه:
- **توصیهٔ من: ۳۹۱ را روی production اجرا نکنید.** ماژول Live Ledger را نصب کنید، مسیر تازهٔ
  ثبت را با یک فیش واقعی بسنجید، و تازه بعد در یک تغییر جداگانه و آگاهانه تریگر قدیمی را بردارید.
- یا با `CASCADE` مجبورش کنید — **که ثبت خودکار را قطع می‌کند و جایگزینش هنوز آزموده نشده.**
- یا ۳۹۱ را طوری بازنویسی کنیم که اول تریگر را بردارد و بعد تابع را.

**۲. سه مهاجرتی که به فهرست اضافه شوند:** **۳۳۷** (تابع `jalali_year`، پیش‌نیاز شماره‌گذاری سند)
و **۳۹۳** (باطل‌کردن default privilegeهای anon، پیش‌نیاز گیت‌های ۳۷۸/۳۷۹/۳۸۰).

**۳. پشتیبان تازه بلافاصله پیش از شروع**، و تأیید md5 آن.

### ترتیب اجرا

```
337  ← افزوده شد: jalali_year
291
338  342  344  346        ← هر چهار با محافظ نام دیتابیس اصلاح‌شده
349  350  351  352  353  354  355  356  357
359  360  361  362  363  364  365  366  367  368  369
393  ← افزوده شد: باطل‌کردن default privilege های anon
378  379  380              ← حالا گیت‌هایشان می‌گذرد
391  ← ⛔ اجرا نشود تا تصمیم الف/ب گرفته شود
392  ← با هر دو probe آزادشده
398  400
402  ← ⛔ تعارض ستونی با ۳۴۲؛ قبل از اجرا حل شود
403  407  408
410  ← با `IF v_ledger < 598` آزادشده
417
418  ← با `IF _total <> 9` آزادشده؛ روی production ۱۵۱ ردیف backfill می‌کند
419
```

### گام‌های دستی بین مهاجرت‌ها

- **بعد از ۴۱۷ و پیش از ۴۱۸:** چیزی لازم نیست. سنجیده شد که هر ۱۵۱ پیش‌فاکتور accepted رویداد
  پذیرش در `audit_logs` دارند، پس backfill کامل است و هیچ تاریخی حدس زده نمی‌شود.
- **`person_backfill_existing`** که در بریف هشدار داده شده، مربوط به فاصلهٔ ۲۳۰/۲۳۱ است و **زیر
  محدودهٔ ما**. در این اجرا لازم نشد.
- **بعد از پایان:** `docker restart` روی سرویس PostgREST تولید — امضای RPCها در حافظه‌اش کش شده.

### چیزی که باید بعدش راستی‌آزمایی شود

همان دو کوئری Stage 4 این گزارش: وجود هر ۱۲ شیء Live Ledger، و
`SELECT count(*), count(accepted_at) FROM sales_quotes WHERE status='accepted'` که باید
۱۵۱ / ۱۵۱ بدهد.

---

## وضعیت

`afrakala_prod_clone` روی `afrakala-lan-db` باقی است تا خودتان بررسی کنید. حذفش:

```
DROP DATABASE afrakala_prod_clone;
```

نسخه‌های scratch اصلاح‌شده در پوشهٔ موقت این جلسه‌اند و هیچ فایل tracked مخزن عوض نشد، هیچ commit
یا push انجام نشد، دیتابیس زندهٔ `afrakala` لمس نشد، و **production هرگز تماس گرفته نشد**.

**چرا PARTIAL و نه COMPLETE:** ماژول Live Ledger روی clone نشست و ۳۳ مهاجرت از ۴۰ اجرا شدند، ولی
**۳۹۱ و ۴۰۲ حل‌نشده‌اند** و هر دو تصمیم شما را می‌خواهند، و **۳۳۷ و ۳۹۳** باید به فهرست اضافه
شوند. تا آن‌موقع اسکریپت بالا آمادهٔ اجرا نیست.
