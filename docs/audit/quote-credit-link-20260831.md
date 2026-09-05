# چرا پیش‌فاکتور مشتریِ دارای اعتبار «وصل نیست» گزارش می‌شود

**بررسی:** ۲۰۲۶-۰۹-۰۱ · کاملاً فقط‌خواندنی. هیچ INSERT/UPDATE/DELETE، هیچ migration،
هیچ restart، هیچ دستور git. هیچ پیش‌فاکتور آزمایشی ساخته نشد. تنها فایل نوشته‌شده
همین گزارش.

```
$ hostname
DESKTOP-MT8J1VR
```

---

## حکم در یک جمله

**گزینهٔ A — باگ سمت فرانت‌اند.** فرم شناسهٔ مشتری را نمی‌فرستد، چون گاردِ «ایمنی
پول» تلفنِ **تایپ‌شده** را با تلفنِ **ذخیره‌شده** مقایسه می‌کند و ذخیره‌شده برای
**۹۵.۸٪ مشتریان خالی است**. از آن‌طرف، هم فرم و هم پایگاه‌داده تلفن را **اجباری**
می‌کنند. این دو شرط با هم در تناقض‌اند و برای آن ۷۳۷ مشتری، ساختن پیش‌فاکتور
پیوندخورده از رابط کاربری **ممکن نیست**.

سقف اعتبار سالم است و RPC عدد درست را برمی‌گرداند. مشکل صرفاً این است که فرم هرگز
شناسه را پاس نمی‌دهد.

---

## Q1 — پیام از کجا می‌آید

```
src/routes/_app.sales.quotes.new.tsx:407
        detail: "این پیش‌فاکتور به پرونده مشتری ثبت‌شده وصل نیست و اعتبار مالی قابل بررسی ندارد.",
```

عنوان مودال از جای دیگری می‌آید:

```
src/components/sales/quotes/QuoteCreationBlockDialog.tsx:84
          : "مشتری اعتبار قابل استفاده ندارد";
```

شرط تصمیم‌گیرنده، در تابع `findCreditBlocker`:

```ts
src/routes/_app.sales.quotes.new.tsx:386-412

  const findCreditBlocker = (): QuoteBlockReason | null => {
    if (totals.final_amount <= 0) return null;
    if (linkedCustomerId && creditInfoLoading) { ... }
    if (creditInfo?.hasOverdue) { ... }
    if (!linkedCustomerId) {                                  // ← اینجا
      return {
        kind: "no_credit",
        finalAmount: totals.final_amount,
        detail: "این پیش‌فاکتور به پرونده مشتری ثبت‌شده وصل نیست و اعتبار مالی قابل بررسی ندارد.",
      };
    }
    if (!creditInfo?.hasAllocation || creditInfo.availableCredit <= 0) { ... }
    if (creditInfo.availableCredit < totals.final_amount) { ... }
    return null;
  };
```

**متغیر تعیین‌کننده: `linkedCustomerId`.** هر وقت falsy باشد، همین مودال ظاهر می‌شود —
پیش از آنکه اعتبار اصلاً بررسی شود.

توجه کنید که این شرط **قبل** از شرط «اعتبار کافی نیست» می‌آید. یعنی پیام درست همان
چیزی را می‌گوید که هست: مسئله کمبود اعتبار نیست، نبودِ پیوند است.

---

## Q2 — «وصل بودن» مکانیکاً یعنی چه

```ts
src/routes/_app.sales.quotes.new.tsx:160-172

  // MONEY-SAFETY: keep the customer link only while the name and phone still
  // match the picked customer. Compare on normalized values (trim name, strip
  // non-digits from phone) so harmless reformatting does not drop a correct
  // link, but any real divergence clears the id — a stale id must never attach
  // a payment to the wrong customer. Re-matching the fields restores the link.
  const linkedCustomerId = useMemo(() => {
    if (!selectedCustomer) return null;
    const nameMatches = selectedCustomer.name.trim() === customerName.trim();
    const phoneMatches =
      selectedCustomer.phone.replace(/\D/g, "") === customerPhone.replace(/\D/g, "");
    return nameMatches && phoneMatches ? selectedCustomer.id : null;
  }, [selectedCustomer, customerName, customerPhone]);
```

پیوند **دو شرط هم‌زمان** دارد:
1. نام تایپ‌شده دقیقاً برابر نام مشتری انتخاب‌شده (بعد از `trim`)
2. ارقام تلفن تایپ‌شده دقیقاً برابر ارقام تلفن مشتری انتخاب‌شده

نیت این گارد در کامنت توضیح داده شده و **درست** است: شناسهٔ کهنه نباید پرداخت را به
مشتری اشتباه بچسباند.

### فرم هنگام انتخاب مشتری چه می‌گذارد

هر دو مسیر انتخاب، NULL را درست مدیریت می‌کنند:

```ts
src/routes/_app.sales.quotes.new.tsx:264-266     (quick-add)
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
    setSelectedCustomer({ id: customer.id, name: customer.name, phone: customer.phone ?? "" });

src/routes/_app.sales.quotes.new.tsx:505-507     (search picker)
                  setCustomerName(c.name);
                  setCustomerPhone(c.phone ?? "");
                  setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone ?? "" });
```

تا اینجا سالم است: اگر مشتری تلفن نداشته باشد، هر دو `""` می‌شوند و `"" === ""` برقرار
است.

### ولی فرم تلفن را اجباری می‌کند

```tsx
src/routes/_app.sales.quotes.new.tsx:524-531
              <Label htmlFor="customer_phone">شماره تماس *</Label>
              <Input
                id="customer_phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                dir="ltr"
                placeholder="09xxxxxxxxx"
              />
```

و پایگاه‌داده هم اجباری‌اش می‌کند:

```sql
create_sales_quote_with_items، خطوط ۶۸-۶۹:
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'شماره تماس مشتری الزامی است.' USING ERRCODE = '22023';
```

```
    column_name     | is_nullable
--------------------+-------------
 customer_phone     | NO           ← NOT NULL
 customer_id        | YES
 customer_person_id | YES
```

### و شناسه فقط وقتی فرستاده می‌شود که پیوند برقرار باشد

```ts
src/routes/_app.sales.quotes.new.tsx:352-353
        // Null unless the fields still match the picked customer (money-safety).
        p_customer_id: linkedCustomerId,
```

**تناقض اینجاست:** برای مشتری بدون تلفن ذخیره‌شده، `selectedCustomer.phone = ""`؛
فروشنده مجبور است تلفنی تایپ کند (فرم و DB هر دو الزام می‌کنند)؛ آن لحظه
`"" !== "0912..."` و پیوند می‌شکند. برگرداندنش هم ممکن نیست، چون خالی گذاشتن تلفن
باعث رد شدن ثبت می‌شود.

---

## Q3 — وضعیت واقعی اصحابی

```sql
SELECT c.id, c.name, length(c.name), length(trim(c.name)),
       encode(convert_to(c.name,'UTF8'),'hex'), c.phone, c.accounting_code,
       c.person_id, c.responsible_id, c.is_active
  FROM public.customers c WHERE c.id='bd16ccb0-19ab-4d4b-843f-92fb649c415f';
```

```
customer_id      | bd16ccb0-19ab-4d4b-843f-92fb649c415f
name             | اصحابی
name_len         | 6
name_trimmed_len | 6
name_hex         | d8a7d8b5d8add8a7d8a8db8c
phone            | (NULL)          ← این
phone_len        | -
accounting_code  | 114017
person_id        | 8d13fb04-5f7a-4c13-8d05-2ee3473eef7f
responsible_id   | 00fd015a-5585-428f-ac44-b98da72e389e
is_active        | t
```

**نام کاملاً سالم است.** ۶ کاراکتر، بدون فاصلهٔ اضافی، و هگزش
`d8a7 d8b5 d8ad d8a7 d8a8 db8c` یعنی ا-ص-ح-ا-ب-ی با «ی» فارسی استاندارد (U+06CC).
پس شرط نام مشکلی ندارد.

**`person_id` و `responsible_id` هر دو پر هستند.** تنها ستون NULL همان `phone` است —
و دقیقاً همان ستونی است که گارد به آن گیر می‌کند.

---

## Q4 — کنترل تاریخی، آموزنده‌ترین بخش

```sql
SELECT count(*) AS quotes_total, count(customer_id) AS with_customer_id,
       count(*)-count(customer_id) AS without_customer_id,
       count(customer_person_id) AS with_person_id, count(customer_phone) AS with_phone
  FROM public.sales_quotes;
```

```
 quotes_total | with_customer_id | without_customer_id | with_person_id | with_phone
--------------+------------------+---------------------+----------------+------------
          178 |               41 |                 137 |             41 |        178
```

```
  status  | quotes | linked | unlinked
----------+--------+--------+----------
 accepted |    160 |     36 |      124
 draft    |     10 |      2 |        8
 sent     |      7 |      3 |        4
 canceled |      1 |      0 |        1
```

```
   month    | quotes | linked | pct_linked
------------+--------+--------+------------
 2026-08-01 |    170 |     41 |       24.1
 2026-09-01 |      8 |      0 |        0.0
```

### این رگرسیونِ مهاجرت دیروز نیست

تاریخاً فقط **۲۴٪** پیش‌فاکتورها پیوند داشته‌اند. ۷۶٪ همیشه بدون پیوند بوده‌اند. این
مودال از قبل هم ظاهر می‌شده. ۴۳ migration دیروز این را نساخته‌اند.

(هشت پیش‌فاکتور امروز صفر پیوند دارند، ولی هشت نمونه برای ادعای تغییر کافی نیست.)

### و اینجا الگو خودش را لو می‌دهد

```sql
SELECT count(*) AS customers, count(phone) AS with_phone,
       count(*)-count(phone) AS phone_null, round(100.0*(count(*)-count(phone))/count(*),1) AS pct_null
  FROM public.customers;
```

```
 customers | with_phone | phone_null | pct_null
-----------+------------+------------+----------
       769 |         32 |        737 |     95.8
```

```sql
-- از میان ۴۱ پیش‌فاکتور پیوندخورده، مشتریانشان تلفن داشتند؟
SELECT count(*) AS linked_quotes, count(c.phone) AS customer_had_phone,
       count(*)-count(c.phone) AS customer_phone_null
  FROM public.sales_quotes q JOIN public.customers c ON c.id=q.customer_id;
```

```
 linked_quotes | customer_had_phone | customer_phone_null
---------------+--------------------+---------------------
            41 |                 41 |                   0
```

```sql
-- و آیا تلفن پیش‌فاکتور با تلفن ذخیره‌شده یکی بود؟
```

```
 linked | phone_identical | phone_differs
--------+-----------------+---------------
     41 |              41 |             0
```

**هر ۴۱ پیش‌فاکتور پیوندخورده، بدون استثنا، متعلق به مشتریانی هستند که تلفن
ذخیره‌شده داشتند — و در هر ۴۱ مورد تلفن پیش‌فاکتور دقیقاً برابر تلفن ذخیره‌شده بود.
صفر مورد با تلفن NULL. صفر مورد با تلفن متفاوت.**

این تصادفی نیست. پیوند **دقیقاً وقتی و فقط وقتی** برقرار می‌شود که مشتری تلفن
ذخیره‌شده داشته باشد و فروشنده عوضش نکند. ۳۲ مشتری تلفن دارند؛ ۴۱ پیش‌فاکتور پیوند
دارند. بقیه — ۷۳۷ مشتری — از این مسیر بیرون‌اند.

---

## Q5 — مسیر ارزیابی اعتبار سالم است

فرم این تابع را صدا می‌زند:

```ts
src/routes/_app.sales.quotes.new.tsx:176-178, 206-208
  const { data: creditInfo, isFetching: creditInfoLoading } = useQuery({
    enabled: !!linkedCustomerId,                    // ← اصلاً اجرا نمی‌شود
    queryKey: ["quote-credit-info", linkedCustomerId],
    ...
      const { data, error } = await supabase.rpc("get_customer_dynamic_credit", {
        p_customer_id: linkedCustomerId as string,
      } as never);
```

`enabled: !!linkedCustomerId` یعنی وقتی پیوند نباشد، **درخواست اصلاً فرستاده نمی‌شود**.

تابع `VOLATILE` است (به `_ensure_credit_balance` می‌رسد)، پس داخل `BEGIN … ROLLBACK`
با JWT شبیه‌سازی‌شدهٔ ادمین اجرا شد:

```
-[ RECORD 1 ]-------+-------------
available_credit    | 506021009.00
held_credit         | 0.00
total_purchases     | 0
outstanding_balance | 0
settlement_score    | 0
has_overdue         | f
overdue_since       |
final_limit         | 506021009
capital_date        | 2026-09-01
binding_constraint  | formula
has_allocation      | t
is_today            | t
ROLLBACK
```

**RPC عدد درست را می‌دهد: ۵۰۶٬۰۲۱٬۰۰۹ اعتبار در دسترس، تخصیص امروز، بدون معوقه.**

مبلغ پیش‌فاکتور شکست‌خورده ۳۰۷٬۳۰۰٬۰۰۰ بود — کاملاً زیر سقف. اگر شناسه پاس داده
می‌شد، هیچ مانعی وجود نداشت.

---

## Q6 — حکم

### **A) فرم فیلد پیوند را پر نمی‌کند — باگ فرانت‌اند**

زنجیرهٔ کامل، هر حلقه با شاهد:

| # | اتفاق | شاهد |
|---|---|---|
| ۱ | اصحابی در جدول مشتریان `phone = NULL` دارد | Q3 |
| ۲ | فروشنده او را از فهرست انتخاب می‌کند → `selectedCustomer.phone = ""` و `customerPhone = ""` | خطوط ۵۰۵-۵۰۷ |
| ۳ | فرم و پایگاه‌داده هر دو تلفن را **اجباری** می‌کنند | خط ۵۲۴ · RPC خطوط ۶۸-۶۹ · `customer_phone NOT NULL` |
| ۴ | فروشنده تلفنی تایپ می‌کند → `customerPhone = "0912…"` ولی `selectedCustomer.phone` هنوز `""` | ناگزیر |
| ۵ | `"" !== "0912…"` → `linkedCustomerId = null` | خطوط ۱۶۹-۱۷۱ |
| ۶ | کوئری اعتبار اصلاً اجرا نمی‌شود (`enabled: !!linkedCustomerId`) | خط ۱۷۷ |
| ۷ | مودال ظاهر می‌شود | خطوط ۴۰۳-۴۰۹ |
| ۸ | اگر با تعهد ادامه دهند، `p_customer_id: null` ذخیره می‌شود | خط ۳۵۳ |

**این برای ۷۳۷ از ۷۶۹ مشتری (۹۵.۸٪) یک بن‌بست است، نه یک اتفاق.** خالی گذاشتن تلفن —
تنها راهی که پیوند را حفظ می‌کند — باعث رد شدن ثبت می‌شود.

### چرا B و C و D نیستند

- **B (شکاف داده) نیست** — گرچه NULL بودن تلفن یک شکاف داده است، خودِ گارد هم اشتباه
  است: «مشتری تلفن ذخیره‌شده نداشت» را با «تلفن عوض شد» یکی می‌گیرد. پر کردن تلفن ۷۳۷
  مشتری علامت را می‌پوشاند، ولی منطق همچنان غلط می‌ماند.
- **C (گارد بیش‌ازحد سخت‌گیر) نیست، دقیقاً** — نیت گارد درست است و باید بماند. فقط
  یک حالت مرزی را اشتباه مدیریت می‌کند.
- **D (رفتار مورد انتظار) نیست** — هیچ طراحی‌ای عمداً ۹۵.۸٪ مشتریان را از اعتبار
  محروم نمی‌کند، در حالی که سقفشان محاسبه و نمایش داده می‌شود.

### اصلاح پیشنهادی — توصیف، اعمال نشد

در `src/routes/_app.sales.quotes.new.tsx` خطوط ۱۶۹-۱۷۱، مقایسهٔ تلفن باید فقط وقتی
انجام شود که مشتریِ انتخاب‌شده واقعاً تلفنی ذخیره داشته باشد:

```diff
   const linkedCustomerId = useMemo(() => {
     if (!selectedCustomer) return null;
     const nameMatches = selectedCustomer.name.trim() === customerName.trim();
-    const phoneMatches =
-      selectedCustomer.phone.replace(/\D/g, "") === customerPhone.replace(/\D/g, "");
+    // A customer with no phone on file has nothing to diverge FROM. Adding a
+    // phone to such a record is not evidence of a wrong customer, so it must
+    // not drop the link — otherwise the 95.8% of customers with no stored
+    // phone can never have a credit-checked quote, because both the form and
+    // create_sales_quote_with_items require a phone to be typed.
+    const storedPhone = selectedCustomer.phone.replace(/\D/g, "");
+    const typedPhone = customerPhone.replace(/\D/g, "");
+    const phoneMatches = storedPhone === "" ? true : storedPhone === typedPhone;
     return nameMatches && phoneMatches ? selectedCustomer.id : null;
   }, [selectedCustomer, customerName, customerPhone]);
```

نیت ایمنی پول حفظ می‌شود: اگر مشتری تلفن داشته باشد و فروشنده عوضش کند، پیوند
همچنان می‌شکند. فقط حالتی که «چیزی برای واگرا شدن وجود نداشت» دیگر جریمه نمی‌شود.

---

## تأیید نشده

1. **هیچ صفحه‌ای در مرورگر باز نشد** و هیچ پیش‌فاکتوری ساخته نشد. زنجیره از کد
   مستقر، schema و داده بازسازی شد، نه از مشاهدهٔ زندهٔ فرم.
2. **اصلاح آزمایش نشد** — نه اعمال شد و نه build گرفت.
3. **اینکه فروشنده در آن تلاش مشخص، واقعاً مشتری را از فهرست انتخاب کرده یا نامش را
   تایپ کرده** معلوم نیست. اگر تایپ کرده باشد، `selectedCustomer` از ابتدا null بوده و
   همان مودال با علت سطحی‌ترِ «انتخاب نشده» ظاهر می‌شده. تحلیل بالا مسیر انتخاب‌شده را
   پوشش می‌دهد که سخت‌ترین حالت است.
4. **شرط نام** برای این مشتری مشکلی ندارد (هگز بررسی شد)، ولی برای نام‌هایی با
   نیم‌فاصله یا «ي» عربی می‌تواند همین باگ را مستقلاً بسازد. بررسی نشد.
5. **۸ پیش‌فاکتور امروز** — بررسی نشد که کدام مشتری‌اند و آیا با همین علت بدون پیوند
   مانده‌اند.

---

## برای ثبت پیش‌فاکتور مدت‌دار چه باید کرد

**پاسخ صادقانه: یک اصلاح کد لازم است.** راه دور زدنی که مسئله را نپوشاند وجود ندارد.

### چرا راه دور زدن وجود ندارد

سه راهی که به ذهن می‌رسد، هر سه بسته‌اند:

- **تلفن را خالی بگذارید** → `create_sales_quote_with_items` با «شماره تماس مشتری
  الزامی است» رد می‌کند، و ستون هم `NOT NULL` است.
- **تلفن مشتری را در پروندهٔ او ثبت کنید** → این کار می‌کند و پیوند برقرار می‌شود،
  ولی باید برای **۷۳۷ مشتری** انجام شود و اگر شماره‌ای در دست نباشد یعنی وارد کردن
  دادهٔ ساختگی در پروندهٔ مشتری. این علامت را می‌پوشاند و باگ سر جایش می‌ماند.
- **با «تأیید حسابداری» ادامه دهید** → پیش‌فاکتور ثبت می‌شود ولی با
  `customer_id = NULL`. یعنی به پروندهٔ مشتری وصل نمی‌شود، اعتبارش مصرف نمی‌شود، و در
  گزارش‌های اعتباری دیده نمی‌شود. همان ۱۳۷ پیش‌فاکتور بی‌پیوندِ موجود از همین راه
  ساخته شده‌اند.

### قدم عملی

**۱. اصلاح خطوط ۱۶۹-۱۷۱ را در `src/routes/_app.sales.quotes.new.tsx` اعمال کنید**
(diff بالا)، سپس build و deploy طبق روال معمول. یک تغییر سه‌خطی است.

**۲. تا آن زمان، اگر یک پیش‌فاکتور مدت‌دار فوری لازم دارید:** تلفن واقعی همان یک
مشتری را در پروندهٔ او ثبت کنید (`/sales/customers/...`)، بعد پیش‌فاکتور را بسازید و
همان شماره را تایپ کنید. این برای یک مورد جواب می‌دهد — ولی به‌عنوان راه‌حل عمومی
نپذیریدش.

**۳. بعد از اصلاح، راستی‌آزمایی کنید:** یک پیش‌فاکتور برای اصحابی بسازید. باید نشان
اعتبار با عدد **۵۰۶٬۰۲۱٬۰۰۹** ظاهر شود و هیچ مودالی نیاید. سپس در پایگاه‌داده
`customer_id` آن پیش‌فاکتور باید پر باشد.

**۴. جدا از این باگ:** نسبت پیوند تاریخی ۲۴٪ است. بعد از اصلاح باید به‌شدت بالا برود.
اگر نرفت، علت دومی هم هست.

---

*هر ادعا با `file:line` یا کوئری و خروجی خامش همراه است. هیچ نوشتنی روی پایگاه‌داده
انجام نشد.*
