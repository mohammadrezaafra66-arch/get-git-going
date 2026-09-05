# تعارض migration 391 با مسیر ثبت سند فیش — بررسی روی تولید

**بررسی انجام‌شده:** ۲۰۲۶-۰۹-۰۱ (نام فایل طبق دستور مأموریت `20260831` نگه داشته شد)
**وضعیت: COMPLETE** — هر شش سؤال با شواهد پاسخ گرفتند. یک زیرسؤال از Q5 (متن کامل
خودِ ۳۹۱) خواندنی نبود و در «تأیید نشده» با دلیلش آمده؛ بقیهٔ Q5 پاسخ گرفت.

**مأموریت کاملاً فقط‌خواندنی اجرا شد.** هیچ INSERT/UPDATE/DELETE/TRUNCATE/DROP/ALTER/
CREATE، هیچ migration، هیچ دستور docker یا git نوشتاری. `post_receipt_journal` و
`post_receipt_accounting` **اجرا نشدند**، حتی داخل تراکنش. هیچ فیشی تأیید نشد. تنها
فایل نوشته‌شده همین گزارش است.

```
$ hostname
DESKTOP-MT8J1VR
```

---

## خلاصهٔ اجرایی — فرض بنیادی مأموریت روی تولید درست نیست

مأموریت با این فرض شروع می‌شود:

> «production has an OLD path that auto-posts an accounting journal when a receipt
> is approved»

**روی تولید چنین نیست.** تریگر وجود دارد و فعال است، ولی تابعی که صدا می‌زند یک
**stub خنثی‌شده** است که کل بدنه‌اش `RETURN NULL;` است و هیچ ردیفی در هیچ جدولی
نمی‌نویسد. این خنثی‌سازی در migration 149 و به‌عمد انجام شده — دو ماه پیش از Live
Ledger و کاملاً مستقل از آن.

بنابراین سناریوی «اگر ۳۹۱ اجرا شود، فیش‌های تأییدشده دیگر سند نمی‌خورند» روی تولید
مصداق ندارد: آن‌ها همین حالا هم از این مسیر سند نمی‌خورند.

---

## Q1 — مسیر قدیمی، دقیقاً

### تریگر

```sql
SELECT tgname, tgrelid::regclass, tgenabled, pg_get_triggerdef(oid)
  FROM pg_trigger WHERE NOT tgisinternal AND tgname='trg_payment_receipts_post_journal';
```

```
              tgname               |     on_table     | tgenabled |                                        definition
-----------------------------------+------------------+-----------+------------------------------------------------------------------------------------------
 trg_payment_receipts_post_journal | payment_receipts | O         | CREATE TRIGGER trg_payment_receipts_post_journal AFTER INSERT OR UPDATE OF status
                                                                    ON public.payment_receipts FOR EACH ROW
                                                                    EXECUTE FUNCTION trg_post_receipt_on_approve()
(1 row)
```

تریگر موجود و **فعال** است (`tgenabled = O`).

### تابع تریگر

```sql
CREATE OR REPLACE FUNCTION public.trg_post_receipt_on_approve()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     AND NEW.payer_accounting_code IS NOT NULL
     AND COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL
  THEN
    PERFORM public.post_receipt_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
```

### و تابعی که واقعاً کار را می‌کرد — حالا خنثی است

```sql
CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
  -- authoritative ledger path. This former Path A wrote
  -- account_kind='accounting_code', which the journal_lines CHECK forbids, and
  -- it duplicated posting. Kept (not dropped) with its trigger
  -- trg_payment_receipts_post_journal intact for history; it now does nothing,
  -- so the approve UPDATE succeeds and only Path B posts.
  RETURN NULL;
END;
$function$
```

### به زبان ساده

- **کِی شلیک می‌شود:** پس از INSERT یا پس از UPDATE ستون `status` روی
  `payment_receipts`، برای هر ردیف.
- **چه شرطی دارد:** فقط وقتی وضعیت به `approved` می‌رسد و هر دو کد حسابداری
  واریزکننده و گیرنده پر باشند.
- **چه ردیفی می‌نویسد:** **هیچ.** `post_receipt_journal` فقط `RETURN NULL` می‌کند.
  هیچ `INSERT`، هیچ `UPDATE`، به هیچ جدولی — نه `journal_entries`، نه
  `journal_lines`، نه هیچ‌جای دیگر.
- **سند حسابداری حاصل:** هیچ. مسیر مرده است و فقط «برای تاریخچه» نگه داشته شده.

### تأیید از خود درخت تولید

فایل migration در `C:\afrakala\supabase\migrations` موجود است:

```
/c/afrakala/supabase/migrations/20260724090000_149_repair_receipt_posting_model_b.sql
  2: -- 149 - Repair receipt posting on the Model B ledger path
  4: -- Model B (post_receipt_accounting) is authoritative. Changes:
  5: --  1) post_receipt_accounting: journal_lines kind/ref_id ->
  8: --  2) post_receipt_journal: NEUTRALIZED to a no-op; function + trigger retained.
 23: CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
114: CREATE OR REPLACE FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)
```

خنثی‌سازی تصادفی یا نتیجهٔ رانش نیست — تصمیم مستند migration 149 است.

---

## Q2 — چقدر تاریخچهٔ حسابداری به این مسیر وابسته است؟ هیچ

```sql
SELECT status, posting_status, count(*) FROM public.payment_receipts GROUP BY 1,2;
```

```
     status     | posting_status | count
----------------+----------------+-------
 pending_review | unposted       |     1
(1 row)
```

```sql
SELECT (SELECT count(*) FROM public.journal_entries) AS entries,
       (SELECT count(*) FROM public.journal_lines)   AS lines;
```

```
 entries | lines
---------+-------
       0 |     0
```

تنها فیش موجود:

```
     status     | posting_status | has_posted_at |  created
----------------+----------------+---------------+------------
 pending_review | unposted       | f             | 2026-08-11
```

جدول‌های مرتبط:

```
                t                 | count
----------------------------------+-------
 payment_receipt_links            |     0
 payment_receipt_documents        |     0
 payment_receipts_backup_20260722 |     0
 customer_credit_ledger           |     0
```

و کل تاریخچهٔ ممیزی مربوط به فیش‌ها و اسناد:

```sql
SELECT entity_type, action, count(*), min(created_at)::date, max(created_at)::date
  FROM public.audit_logs
 WHERE entity_type ILIKE '%receipt%' OR entity_type ILIKE '%journal%'
 GROUP BY 1,2;
```

```
   entity_type   |               action               | count |   first    |    last
-----------------+------------------------------------+-------+------------+------------
 payment_receipt | payment_receipt_created            |     1 | 2026-08-11 | 2026-08-11
 payment_receipt | receipt_security_warning_confirmed |     1 | 2026-08-11 | 2026-08-11
```

**نتیجه:** روی تولید در کل عمر سیستم یک فیش ساخته شده، هرگز تأیید نشده، هرگز ثبت
نشده، و **صفر سند حسابداری وجود دارد**. هیچ داده‌ای — نه از مسیر قدیمی و نه از مسیر
جدید — در معرض خطر نیست.

---

## Q3 — آیا مسیر جدید Live Ledger روی تولید هست؟

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_can
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
   AND p.proname IN ('post_receipt_accounting','create_receipt',
                     'post_receipt_journal','trg_post_receipt_on_approve');
```

```
           proname           |               args                | prosecdef | auth_can
-----------------------------+-----------------------------------+-----------+----------
 post_receipt_accounting     | p_receipt_id uuid, p_user_id uuid | t         | t
 post_receipt_journal        | _receipt_id uuid                  | t         | t
 trg_post_receipt_on_approve |                                   | t         | t
(3 rows)
```

| تابع | روی تولید |
|---|---|
| `create_receipt` | **غایب** — تأیید انتظار مأموریت |
| `post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)` | **موجود**، SECURITY DEFINER |
| `post_receipt_journal(_receipt_id uuid)` | موجود ولی **خنثی** |
| `trg_post_receipt_on_approve()` | موجود، تابع تریگرِ مسیر خنثی |

`create_receipt` نه در `src/` و نه در هیچ فایل migration این درخت ارجاع ندارد
(جست‌وجوی هر دو مسیر خالی برگشت).

### مسیر واقعیِ امروزِ تولید

`post_receipt_accounting` **یک تریگر نیست** — یک RPC صریح است که کاربر آغازش می‌کند:

```
src/routes/_app.accounting.receipts.$receiptId.tsx:335
      const { data: postResult, error: rpcErr } = await supabase.rpc("post_receipt_accounting", {
```

و هیچ تابع دیگری در پایگاه‌داده صدایش نمی‌زند:

```sql
SELECT p.proname,
       (pg_get_functiondef(p.oid) ILIKE '%post_receipt_accounting%') AS calls_accounting,
       (pg_get_functiondef(p.oid) ILIKE '%post_receipt_journal%')    AS calls_journal
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND (...);
```

```
           proname           | calls_accounting | calls_journal
-----------------------------+------------------+---------------
 post_receipt_accounting     | t                | f     ← خودارجاعی در متن خودش
 post_receipt_journal        | t                | t     ← فقط در کامنت خنثی‌سازی
 trg_post_receipt_on_approve | f                | t     ← تنها فراخوان واقعی
```

### آنچه مسیر واقعی می‌نویسد

از بدنهٔ `post_receipt_accounting`:

```sql
  -- Create journal entry (idempotent)
  SELECT id INTO v_existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_receipt' AND source_id = v_receipt.id;

  IF v_existing_journal IS NULL THEN
    IF v_receipt.destination_bank_account_id IS NOT NULL THEN
      v_debit_kind := 'bank';           v_debit_ref := v_receipt.destination_bank_account_id;
    ELSE
      v_debit_kind := 'external_party'; v_debit_ref := v_receipt.receiver_party_id;
    END IF;

    INSERT INTO public.journal_entries(source_type, source_id, entry_date, description,
                                       status, posted_by, payer_accounting_code, receiver_accounting_code)
    VALUES ('payment_receipt', v_receipt.id, v_receipt.payment_date,
            'سند فیش واریزی شماره ' || v_receipt.tracking_number, 'posted', p_user_id, ...)
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines(journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
      (v_journal_id, 2, 'customer_credit', v_receipt.customer_id, 0, v_receipt.amount, 'افزایش اعتبار/کاهش بدهی مشتری');
  ELSE
    v_journal_id := v_existing_journal;   -- فقط کدهای حسابداری را backfill می‌کند
  END IF;
```

سند حاصل: **بدهکار** حساب بانکی شرکت یا طرف خارجی به مبلغ فیش؛ **بستانکار**
اعتبار مشتری به همان مبلغ.

نکتهٔ مهم: این تابع **ذاتاً idempotent** است — کلید یکتاسازی‌اش
`(source_type='payment_receipt', source_id=<receipt id>)` است و اگر سندی از قبل باشد
سند دوم نمی‌سازد.

---

## Q4 — آیا دو مسیر با هم برخورد یا تکرار می‌کنند؟ **هیچ‌کدام**

مأموریت سه گزینه پیش می‌گذارد. پاسخ هیچ‌یک از آن سه نیست، و شواهدش این است:

**۱. مسیر قدیمی نمی‌تواند سند تکراری بزند، چون اصلاً سند نمی‌زند.** تابعی که بدنه‌اش
`RETURN NULL;` است، مستقل از اینکه مسیر جدید چه کند، صفر ردیف می‌نویسد. برخورد
نیازمند دو نویسنده است؛ اینجا فقط یکی هست.

**۲. مسیر جدید کار تریگر را «جایگزین» نمی‌کند، چون آن کار دو ماه پیش بازنشسته شد.**
migration 149 در ۲۰۲۶-۰۷-۲۴ مسیر A را خنثی کرد و مسیر B را تنها مرجع اعلام کرد —
مدت‌ها پیش از آنکه Live Ledger مطرح باشد. آنچه ۳۹۱ می‌خواهد drop کند، یک پوستهٔ
خالی است که ۱۴۹ از قبل تهی‌اش کرده.

**۳. دو مسیر انواع متفاوت فیش را پوشش نمی‌دهند،** چون مسیر قدیمی هیچ نوعی را پوشش
نمی‌دهد.

**پس پاسخ Q4:** روی تولید امروز دقیقاً **یک** مسیر ثبت زنده وجود دارد
(`post_receipt_accounting`، RPC صریح). تریگر قدیمی بی‌اثر است. حذفش نه چیزی را از
کار می‌اندازد و نه تکراری را رفع می‌کند — صرفاً یک شیء مرده را برمی‌دارد.

---

## Q5 — ۳۹۱ چه چیزی drop می‌کند و چه چیزی به آن وابسته است؟

### آنچه خواندنی نبود

```
/c/afrakala                          -> 391 ABSENT
/c/AfraKalaServer/get-git-going01lan -> 391 ABSENT
/c/afrakala-feature-tree             -> 391 ABSENT
/c/Users/AfRa KaLa/afrakala-platform -> 391 ABSENT
/c/Users/AfRa KaLa/get-git-going     -> 391 ABSENT
```

فایل `20260825180000_391_*.sql` روی **هیچ‌کدام** از پنج clone این ماشین نیست
(بالاترین سریال در `C:\afrakala` عدد ۳۳۵ است). پس **فهرست کامل اشیائی که ۳۹۱ drop
می‌کند از اینجا قابل استخراج نیست.** این در «تأیید نشده» آمده.

### آنچه خواندنی بود — وابستگی‌های دو شیء نام‌برده

```sql
SELECT p.proname AS target, d.deptype, <dependent object> FROM pg_proc p
  JOIN pg_depend d ON d.refobjid=p.oid AND d.refclassid='pg_proc'::regclass
 WHERE p.proname IN ('post_receipt_journal','trg_post_receipt_on_approve');
```

```
           target            | deptype |                 dependent
-----------------------------+---------+--------------------------------------------
 trg_post_receipt_on_approve | n       | trigger: trg_payment_receipts_post_journal
(1 row)
```

| شیء | وابسته‌ها |
|---|---|
| `trg_post_receipt_on_approve()` | دقیقاً **یک** تریگر: `trg_payment_receipts_post_journal` |
| `post_receipt_journal(uuid)` | **هیچ چیز** — صفر ردیف در `pg_depend` |

هیچ view ای به آن‌ها ارجاع نمی‌دهد (کوئری `pg_get_viewdef ILIKE` صفر ردیف داد).
هیچ تابع دیگری صدایشان نمی‌زند (جدول Q3).

تنها ارجاع فرانت‌اند یک تایپ تولیدشدهٔ خودکار است، نه فراخوانی:

```
src/integrations/supabase/types.ts:12158
      post_receipt_journal: { Args: { _receipt_id: string }; Returns: string }
```

**نتیجه:** یک `DROP ... CASCADE` روی این دو شیء دقیقاً یک تریگرِ بی‌اثر را با خود
می‌برد و **نه چیزی بیشتر**. خطر «CASCADE بیش از انتظار بگیرد» برای این دو شیء وجود
ندارد. برای بقیهٔ اشیای ۳۹۱ نمی‌توانم چنین ادعایی بکنم، چون متنش را ندارم.

---

## Q6 — آیا جدول‌های دفتر روی تولید محافظت تغییرناپذیری دارند؟ **ندارند**

```sql
SELECT tgrelid::regclass, tgname, tgenabled, pg_get_triggerdef(oid)
  FROM pg_trigger WHERE NOT tgisinternal
   AND tgrelid IN ('public.journal_entries'::regclass,'public.journal_lines'::regclass);
```

```
    on_table     |               tgname               | tgenabled |                     definition
-----------------+------------------------------------+-----------+----------------------------------------------------
 journal_entries | trg_asan_burn_journal_entry_number | O         | AFTER DELETE ... EXECUTE FUNCTION tg_asan_burn_journal_entry_number()
 journal_lines   | trg_validate_journal_line_ref      | O         | BEFORE INSERT OR UPDATE OF account_kind, account_ref_id ... EXECUTE FUNCTION validate_journal_line_ref()
(2 rows)
```

هیچ‌کدام محافظ تغییرناپذیری نیست: اولی هنگام حذف، شمارهٔ آسان را بازیافت می‌کند؛
دومی صحت ارجاع خط را پیش از درج بررسی می‌کند.

چهار تریگر خواهرخواندهٔ نام‌برده در مأموریت، و حتی توابعشان:

```
                     name                      | status
-----------------------------------------------+--------
 tg_journal_entry_immutable                    | ABSENT
 tg_journal_line_immutable                     | ABSENT
 tg_lock_columns_when_posted                   | ABSENT
 trg_payment_receipts_block_delete_when_posted | ABSENT
```

هر چهار مورد، هم به‌عنوان تریگر و هم به‌عنوان تابع، **روی تولید وجود ندارند**.

### و جدول‌های دفتر برای نقش‌های برنامه نوشتنی‌اند

```
     relname     |    rolname    | ins | upd | del | trunc | rls
-----------------+---------------+-----+-----+-----+-------+-----
 journal_entries | anon          | t   | t   | t   | t     | t
 journal_entries | authenticated | t   | t   | t   | t     | t
 journal_lines   | anon          | t   | t   | t   | t     | t
 journal_lines   | authenticated | t   | t   | t   | t     | t
```

RLS روشن است، پس سیاست‌ها مسیرهای DML را می‌بندند — ولی `TRUNCATE` تابع RLS نیست و
هر دو نقش آن را دارند.

**پاسخ Q6:** اگر تریگر قدیمی چیزی می‌نوشت، در جدول‌هایی می‌نوشت که **هیچ محافظت
تغییرناپذیری ندارند**. عملاً این موضوع امروز بی‌اثر است چون هر دو جدول صفر ردیف
دارند، ولی از لحظه‌ای که ثبت واقعی شروع شود، داده‌های دفتر روی تولید قابل تغییر
خواهند بود.

---

## تأیید نشده

1. **فهرست کامل اشیائی که ۳۹۱ drop می‌کند.** فایل `20260825180000_391_*.sql` روی هیچ
   clone این ماشین نیست. **چه چیزی این را حل می‌کند:** خودِ فایل، یا خروجی
   `git show` آن از مخزن — که نیازمند `git fetch` است و در حدود این مأموریت نبود.
   بدون آن، حکم زیر فقط برای دو شیء نام‌برده معتبر است، نه برای کل migration.
2. **رفتار مسیر جدید Live Ledger.** `create_receipt` روی تولید نیست و تعریفش هم در
   هیچ فایل این درخت نیست، پس نتوانستم بخوانم چه می‌نویسد. استدلال Q4 به این وابسته
   نیست (یک تابعِ `RETURN NULL` مستقل از رفتار طرف مقابل نمی‌تواند تکرار بسازد)، ولی
   نمی‌توانم بگویم مسیر جدید خودش با `post_receipt_accounting` تداخل دارد یا نه.
3. **هیچ‌کدام از دو تابع اجرا نشد** — طبق دستور صریح، حتی داخل تراکنش. رفتارشان از
   متن تعریف استنتاج شده، نه از اجرا.
4. **وضعیت پایگاه‌دادهٔ تست بررسی نشد** و از اینجا در دسترس نیست. ادعای مأموریت که
   «روی تست این تابع orphan است» تأیید یا رد نشد.
5. **`beneficiary_accounting_code`** در شرط تریگر ظاهر می‌شود؛ وجود این ستون روی
   `payment_receipts` جداگانه بررسی نشد.

---

## حکم دربارهٔ مهاجرت ۳۹۱

### **گزینهٔ C — برای دو شیء نام‌برده، ۳۹۱ همان‌طور که هست بی‌خطر است.**

شواهد، به ترتیب قدرت:

1. **`post_receipt_journal` روی تولید یک stub است که بدنه‌اش `RETURN NULL;` است.**
   هیچ ردیفی در هیچ جدولی نمی‌نویسد. حذف آن هیچ قابلیتی را از بین نمی‌برد، چون
   قابلیتی ندارد. این خنثی‌سازی تصمیم مستند migration 149 در ۲۰۲۶-۰۷-۲۴ است که در
   خود درخت تولید موجود است.
2. **صفر سند حسابداری روی تولید وجود دارد.** `journal_entries` و `journal_lines` هر
   دو خالی‌اند، تنها فیش موجود هرگز تأیید نشده، و کل تاریخچهٔ ممیزی دو رویداد در یک
   روز است. هیچ تاریخچهٔ حسابداری‌ای به این مسیر وابسته نیست.
3. **وابستگی‌ها دقیقاً یک شیء است.** `pg_depend` نشان می‌دهد تنها وابستهٔ
   `trg_post_receipt_on_approve` همان تریگر بی‌اثر است، و به `post_receipt_journal`
   هیچ چیز وابسته نیست. CASCADE چیز اضافه‌ای نمی‌گیرد.
4. **مسیر ثبت واقعی دست نمی‌خورد.** `post_receipt_accounting` یک RPC صریح است که
   فرانت‌اند صدا می‌زند و به هیچ‌یک از دو شیءِ حذف‌شونده وابسته نیست.

### قید ضروری روی این حکم

این حکم **فقط دربارهٔ `post_receipt_journal` و `trg_post_receipt_on_approve`** است.
متن کامل ۳۹۱ روی این ماشین نیست، پس نمی‌توانم بگویم بقیهٔ آن migration بی‌خطر است.
پیش از اجرای ۳۹۱ روی تولید باید متنش خوانده شود و همین تحلیل وابستگی برای **هر**
شیئی که drop می‌کند تکرار شود — به‌ویژه چون Q4 نشان داد فرض اولیه دربارهٔ همین دو شیء
هم روی تولید نادرست بود.

### آنچه این حکم را باطل می‌کند

اگر ۳۹۱ علاوه بر این دو، `post_receipt_accounting` را هم drop یا جایگزین کند، حکم
عوض می‌شود — آن تابع تنها مسیر ثبت زندهٔ تولید است و فرانت‌اند مستقیماً صدایش می‌زند.
این را نتوانستم بررسی کنم چون متن ۳۹۱ در دسترس نبود.

---

*هر ادعای این گزارش با کوئری یا `file:line` و خروجی خامش همراه است. هیچ نوشتنی روی
پایگاه‌داده، داکر یا گیت انجام نشد و هیچ تابع ثبت‌کننده‌ای اجرا نشد.*
