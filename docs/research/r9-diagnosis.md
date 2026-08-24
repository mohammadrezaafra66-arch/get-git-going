# R9 — تشخیص. ۴۷ شکست در برابر خط پایهٔ ۴۱

> **مأموریت پژوهشی، فقط‌خواندنی.** هیچ مهاجرتی، هیچ DDL، هیچ نوشتنی، هیچ تغییری زیر `src/`،
> هیچ بازسازی نشست، هیچ restart، هیچ build. مجموعهٔ کامل e2e **دوباره اجرا نشد** — طبق
> تصحیح مالک، چون specها سند و پیش‌فاکتور می‌سازند و همان شمارش `payment_receipts` را که
> OG-43 رویش باز است جابه‌جا می‌کنند. همه چیز از `r9-run3.log`، متن خود specها، و SQL
> فقط‌خواندنی آمده.
>
> اجرا شده روی: `origin/staging = ebff94e2`، پایگاه‌داده `afrakala` روی `afrakala-lan-db`.
> تولید `192.168.170.10` لمس نشد.

---

## ۰. حکم، در یک خط

**NO M4 REGRESSION.** هر ۴۷ شکست در دسته‌های A، D یا E است. **هیچ شکست دستهٔ B وجود ندارد**،
و دلیل قاطعش این است که **هیچ‌کدام از ۲۶ فایل spec شکست‌خورده حتی یکی از آن هشت view را
نمی‌خواند.**

---

## ۱. بازسازی خط پایه — **کامل پیدا شد**

سند مأموریت می‌گفت «عدد ۴۱ هست، فهرستش نیست». **فهرست پیدا شد.**

در `docs/execution/00-progress.md` و `docs/execution/m6-route-guard-PROGRESS.md` فقط **عدد**
ثبت شده و هیچ برشمردنی نیست (`spec.ts` در آن دو فایل ۱ و ۲ بار می‌آید). ولی خروجی خام همان
اجرا هنوز روی دیسک بود، در پوشهٔ task‌های همین session، و **هر ۴۱ نام را دارد**:

```
tasks/bicb1nw3c.output   →  62 خط، 41 نام در بلوک شکست
```

هر دو فهرست نرمال شدند (حذف `[chromium-admin]`، پیشوند شماره، BOM، و یکسان‌سازی `\` و `/`)
و مقایسهٔ مجموعه‌ای شد:

```
baseline = 41   current = 47   in both = 40
```

| | تعداد | |
|---|---|---|
| در خط پایه بود و هنوز هست | **۴۰** | بدون تغییر |
| در خط پایه بود و دیگر نیست | **۱** | `persons/person-profile.spec.ts:121` — «viewer via login» |
| تازه است | **۷** | پایین |

```
41 − 1 + 7 = 47   ✔
```

> **تصحیح یک عدد در سند مأموریت:** سند از «شش شکست اضافه» حرف می‌زند. مقایسهٔ مجموعه‌ای
> **هفت** تازه می‌دهد، نه شش — چون هم‌زمان یکی از خط پایه دیگر شکست نمی‌خورد. اختلاف
> ۴۷−۴۱ = ۶ یک تفریق است، نه اندازهٔ تغییر.

### هفت شکست تازه

```
e2e/persons/filters-ui.spec.ts:138            viewer privacy on list filters
e2e/persons/permission-matrix.spec.ts:321     UI — viewer
e2e/persons/phone-collisions-ui.spec.ts:205   viewer cannot open queue
e2e/products/torob-url-and-excel.spec.ts:235  UI on deployed /products
e2e/purchase/c3-request-purchase.spec.ts:386  E2E-9 standalone purchase page
e2e/purchase/c4-assignment.spec.ts:182        E2E-3 ownerless request labelled
e2e/purchase/c4-assignment.spec.ts:453        E2E-9 unassigned filter
```

---

## ۲. طبقه‌بندی هر ۴۷

هر ۴۷ بلوک شکست از `r9-run3.log` پارس شد و بر اساس **امضای واقعی خطا** طبقه‌بندی شد.

### دستهٔ A — گره‌خورده به fixture (OG-43) — **۲۳ مورد**

| spec | خط پایه/تازه | خطا |
|---|---|---|
| `asan/export-bank-deposits:98` | base | `toEqual` — مجموعهٔ رسیدهای واجد شرایط نمی‌خواند |
| `asan/export-bank-deposits:228` | base | `toBe` |
| `asan/export-journal:95` | base | `toBe` |
| `asan/export-journal:114` | base | `toEqual` |
| `asan/export-numbering:76` | base | `toBe` |
| `asan/export-preinvoice:79` | base | «need an exportable quote to compare» |
| `asan/export-purchase:159` | base | «no supplier has an Asan code yet» |
| `asan/export-receipts-payments:108` | base | «one factory, called four times» |
| `asan/export-receipts-payments:306` | base | `toBeVisible` |
| `asan/export-sales:300` | base | `toBeGreaterThan` |
| `asan/export-sales:318` | base | «there must be at least one exportable invoice» |
| `asan/export-sales:389` | base | `toBeGreaterThan` |
| `asan/export-sales:493` | base | `toBeGreaterThan` |
| `asan/export-sales:529` | base | `toBeGreaterThan` |
| `asan/final-verification:236` | base | «staged import batches» |
| `asan/final-verification:270` | base | «at least one sales invoice must be exportable» |
| `asan/phone-normalization:136` | base | `toEqual` |
| **`asan/product-video-chain:480`** | base | `Expected: 0  Received: 1` روی `select count(*) from delivery_receipts` |
| `clusters/new-clusters-jwt:162` | base | `toBe` |
| `persons/credit-unchanged:125` | base | اعتبار «خان محمدی» عوض شده |
| **`purchase/c4-assignment:182`** | **NEW** | «request was never created» — `Expected "1" Received "0"` |
| `requirements/215:67` | base | `toHaveValue` |
| `requirements/218:10` | base | `toBeVisible` — روی فرمی که phase 6 در `e7dc789e` بازنشسته کرد |

### دستهٔ D — محیطی — **۸ مورد**

| spec | خط پایه/تازه | خطا |
|---|---|---|
| `business-flows/211-216:401` | base | `locator.click: Timeout 15000ms` |
| `business-flows/215-quote-inventory:329` | base | `locator.click: Timeout 15000ms` |
| **`persons/filters-ui:138`** | **NEW** | `not.toHaveURL(/\/login/)` — روی `/login` ماند |
| **`persons/permission-matrix:321`** | **NEW** | همان |
| **`persons/phone-collisions-ui:205`** | **NEW** | همان |
| **`products/torob-url-and-excel:235`** | **NEW** | `page.waitForLoadState: Timeout 20000ms` |
| **`purchase/c3-request-purchase:386`** | **NEW** | `locator.click: Timeout 15000ms` |
| **`purchase/c4-assignment:453`** | **NEW** | `page.waitForLoadState: Timeout 20000ms` |

### دستهٔ E — از پیش شکسته، به دلیل خودش — **۱۶ مورد**

**دوازده تای اولش یک علت مشترک دارند که ارزش نام‌بردن دارد:** خطای
`Command failed: docker exec afrakala-lan-db … psql`. علتِ زیرینش در همان لاگ هست —
**INSERTهای fixture خودِ specها به قید NOT NULL می‌خورند:**

```
ERROR:  null value in column "doc_kind" of relation "journal_entries" violates not-null constraint   ×9
ERROR:  null value in column "person_id" of relation "customers" violates not-null constraint        ×2
```

هر دو ستون **قبلاً** NOT NULL شده‌اند (مهاجرت‌های ۲۹۴ / ۲۹۷ / ۳۲۰، مرداد) و specها هنوز
بدون آنها INSERT می‌زنند. این رانش schema در برابر fixture است — همان خانوادهٔ OG-43، ولی از
سمت نوشتن نه خواندن.

```
asan/export-journal:257, 283, 317, 342, 365, 415        (۶)
asan/export-receipts-payments:180, 212, 255             (۳)
business-flows/212:607, 213:486                         (۲)
asan/export-preinvoice:164                              (۱، بدون متن خطای صریح)
```

چهار مورد باقی‌مانده:

```
business-flows/214-whatsapp:35     toContain — ادعای متنی
clusters/new-clusters-jwt:148      toContain
requirements/215:56                toContain — روی متن سورس
warehouse/line-level-warehouse:37  «every line of a warehoused document must have a warehouse»
```

### دستهٔ C — نبود نشست viewer/manager — **صفر مورد**

**فرضیهٔ راهنمای سند رد شد.** پایین.

### دستهٔ B — رگرسیون M4 — **صفر مورد**

---

## ۳. چهار spec ‏viewer

### شاهد مشترک و قاطع: هیچ‌کدام هیچ view نگهبانی را نمی‌خواند

هر ۲۶ فایل spec شکست‌خورده برای ارجاع به آن هشت نام جست‌وجو شدند:

```
distinct failing spec files: 26
referencing any of the eight guarded views: 0 of 26
```

**صفر.** هیچ spec شکست‌خورده‌ای هیچ‌کدام از view‌هایی را که M4 عوض کرد نمی‌خواند. این
به‌تنهایی دستهٔ B را برای هر ۴۷ منتفی می‌کند.

### ۳.۱ `asan/product-video-chain.spec.ts:480` — «a salesperson reaches the page»

۱. **نشست:** `storageState` دارد ولی **viewer نیست** — نامش «a viewer» است ولی خودِ آزمون
   می‌گوید «a salesperson reaches the page». صفر ارجاع به فایل نشست viewer.
۲. **view نگهبان:** صفر.
۳. **شکل شکست:** نه «زیاد می‌بیند» نه «هیچ نمی‌بیند» — یک ادعای پاکیزگی fixture است:
   ```
   > 106 | expect(Number(dbScalar("select count(*) from delivery_receipts"))).toBe(0);
   Expected: 0   Received: 1
   ```
۴. **آیا تازه است؟** **نه.** در خط پایهٔ ۴۱ هم بود.

**دستهٔ A. ربطی به viewer و به M4 ندارد؛ اسم بلوک گمراه‌کننده است.**

### ۳.۲ `persons/filters-ui.spec.ts:138` — «viewer does not see missing-data filters»

۱. **نشست: از فایل نشست استفاده نمی‌کند.** به‌صورت تعاملی لاگین می‌کند:
   ```ts
   await page.goto("/login", { waitUntil: "domcontentloaded" });
   await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
   await page.goto("/login", { waitUntil: "domcontentloaded" });
   await page.locator('input[name="email"][type="email"]').fill("test.viewer@afrakala.local");
   await page.locator('input[name="password"][type="password"]').fill("AfraTest!1404");
   await page.getByRole("button", { name: /^ورود$/ }).click();
   await expect(page).not.toHaveURL(/\/login(?:$|\?)/, { timeout: 30_000 });
   ```
۲. **view نگهبان:** صفر.
۳. **شکل شکست:** **هیچ نشستی نگرفت** — روی `http://192.168.170.8:3100/login` ماند. هرگز به
   جایی نرسید که چیزی ببیند یا نبیند.
۴. **تازه است.** خود فایل از ۲۰۲۶-۰۸-۰۵ عوض نشده (`6f852a6a`).

### ۳.۳ `persons/permission-matrix.spec.ts:321` — «UI — viewer»

مو‌به‌مو همان: لاگین تعاملی با همان کاربر و همان رمز، همان شکست روی `/login`، صفر view
نگهبان، فایل از ۲۰۲۶-۰۸-۰۵ دست‌نخورده (`87383b18`).

### ۳.۴ `persons/phone-collisions-ui.spec.ts:205` — «viewer cannot open queue»

همان، از طریق helper مشترک `signInAs` در خطوط ۵۰–۶۱ همان فایل.

### فرضیهٔ راهنمای سند: **رد شد، با شاهد**

سند می‌گوید: *«فقط چهار فایل نشست هست — viewer ندارد — پس شاید این specها به‌خاطر نبود نشست
می‌افتند.»*

**نیمهٔ اولش درست است، نیمهٔ دومش غلط.** درست است که فقط چهار فایل نشست هست
(`admin`, `accountant`, `salesperson-a`, `salesperson-b`). ولی **این سه spec اصلاً از فایل
نشست استفاده نمی‌کنند** — خودشان با رمز لاگین می‌کنند. نبودِ فایل نشست viewer برایشان
بی‌اثر است. **پس دستهٔ C صفر عضو دارد.**

### و فرضیهٔ دوم — «رمزها به مقدار تصادفی ریست شده‌اند» — **هم رد شد**

سند می‌گوید رمزهای کاربران آزمون به مقدار تصادفیِ نامعلوم ریست شده‌اند. اگر چنین بود، هر
هفت specی که `AfraTest!1404` را درون کد دارند باید می‌افتادند. **نیفتادند:**

```
اسپک‌هایی که AfraTest!1404 را درون کد دارند: 7
  aliases-ui            در فهرست شکست: 0
  filters-ui            در فهرست شکست: 1   ← افتاد
  permission-matrix     در فهرست شکست: 1   ← افتاد
  person-profile        در فهرست شکست: 0
  phone-collisions-ui   در فهرست شکست: 1   ← افتاد
  profile-dossier-ui    در فهرست شکست: 0
  viewer-restrictions   در فهرست شکست: 0
```

و شاهد قاطع: `e2e/security/viewer-restrictions.spec.ts` **اصلاً از مرورگر استفاده نمی‌کند**
— مستقیم به API احراز هویت POST می‌زند و وضعیت ۲۰۰ را ادعا می‌کند:

```ts
const res = await fetch(`${…}/auth/v1/token?grant_type=password`, {
  body: JSON.stringify({ email: VIEWER_EMAIL, password: VIEWER_PASSWORD }),
});
expect(res.status, `viewer login failed: …`).toBe(200);
```

**در همین اجرا ۴۰ بار اجرا شد و صفر بار افتاد.** یعنی `AfraTest!1404` برای
`test.viewer@afrakala.local` **هنوز معتبر است**.

پایگاه‌داده هم همین را می‌گوید:

```
test.viewer@afrakala.local    profile_status=active   pwd_updated=08-24 18:06   last_sign_in=08-24 18:06
test.manager@afrakala.local   profile_status=active   pwd_updated=07-19 09:04   last_sign_in=07-19 09:04
```

> **و این دو واقعیت را هم اصلاح می‌کند:** OG-36 ثبت کرده بود که `test.manager` و
> `test.viewer` هر دو `status=rejected`اند. **هر دو الان `active`اند.** آن سطر دیگر درست
> نیست.

### پس چرا سه‌تا افتاد و سه‌تا پاس شد؟

ترتیب اجرا در همان اجرا:

```
233  filters-ui:138            افتاد
292  permission-matrix:321     افتاد
303  person-profile:121        پاس   ← کد لاگینش معنایی یکسان است
309  phone-collisions-ui:205   افتاد
311  phone-collisions-ui:224   پاس
329  profile-dossier-ui:202    پاس
548+ viewer-restrictions       پاس (۴۰ بار)
```

متناوب است، نه یک نقطهٔ شکست در زمان. و کد لاگینِ افتاده با پاس‌شده **معنایی یکسان** است —
تنها تفاوت، literal در برابر متغیر:

```
< await page.locator('input[name="email"][type="email"]').fill("test.viewer@afrakala.local");
> await page.locator('input[name="email"][type="email"]').fill(email);
```

**نتیجه: flake.** و شکلش دقیقاً همان باگی است که مالک همین امروز در
`e2e/auth/generate-role-sessions.spec.ts` اصلاح کرد — پرکردن فرم در `domcontentloaded`، پیش
از hydration شدن React، که فیلدها را پاک می‌کند و فرم خالی submit می‌شود. **آن اصلاح فقط در
اسکریپت تولید نشست اعمال شد؛ این شش spec هر کدام helper لاگین جداگانهٔ خودشان را دارند و
هیچ‌کدام وصله نشده‌اند.**

این یک **فرضیهٔ قوی است، نه اثبات**. آنچه اثباتش می‌کند در بخش پرسش‌های باز آمده.

---

## ۴. تأیید سطح پایگاه‌داده — هشت view، عیناً

```
product_computed_prices_public |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
publish_recipients_view |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
v_dynamic_customer_capital_balances |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
v_dynamic_salesperson_capital_balances |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
v_promotion_suggestions |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
vw_account_balances |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
vw_customer_receivables |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
vw_supplier_payables |   WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));

views matching the exact 387 tail: 8 of 8
```

```
product_computed_prices_public             reloptions={security_invoker=true}
publish_recipients_view                    reloptions=(none)
v_dynamic_customer_capital_balances        reloptions=(none)
v_dynamic_salesperson_capital_balances     reloptions=(none)
v_promotion_suggestions                    reloptions={security_invoker=true}
vw_account_balances                        reloptions=(none)
vw_customer_receivables                    reloptions=(none)
vw_supplier_payables                       reloptions=(none)
```

`security_invoker=true` روی **همان دو view** که مهاجرت ۳۷۰ گذاشته بود سرجایش است —
یعنی `CREATE OR REPLACE VIEW` که `reloptions` را می‌اندازد، اینجا نینداخته، چون ۳۸۶ آن را
صریح بازنویسی می‌کند.

رفتار uid تهی، داخل `BEGIN … ROLLBACK` نوشته‌شده در خود فایل:

```
uid=NULL  publish_recipients_view=0  v_dyn_cust=0  v_dyn_sales=0  vw_account_balances=0
after rollback: current_user=supabase_admin
```

و ۳۸۶/۳۸۷ هیچ تغییری در سطح جدول ندارند:

```
386   ALTER TABLE=0  CREATE TABLE=0  GRANT=0  REVOKE=0  INSERT/UPDATE/DELETE=0
387   ALTER TABLE=0  CREATE TABLE=0  GRANT=0  REVOKE=0  INSERT/UPDATE/DELETE=0
```

---

## ۵. حکم

# NO M4 REGRESSION

هر ۴۷ شکست در دستهٔ A (۲۳)، D (۸) یا E (۱۶) است. **صفر مورد دستهٔ B، و صفر مورد دستهٔ C.**

شواهدی که این را وادار می‌کنند، به ترتیب قدرت:

۱. **هیچ‌کدام از ۲۶ فایل spec شکست‌خورده هیچ‌یک از آن هشت view را نمی‌خواند** — `0 of 26`.
   یک تغییر در predicate یک view نمی‌تواند آزمونی را بشکند که آن view را نمی‌خواند.

۲. **۴۰ از ۴۷ دقیقاً همان‌هایی‌اند که پیش از M4 هم می‌افتادند** — مقایسهٔ مجموعه‌ای، نه شمارش.

۳. **سه شکست تازه‌ای که ظاهراً به viewer مربوطند، هرگز به نشست نمی‌رسند.** روی `/login`
   می‌مانند. نه «زیاد می‌بینند» نه «کم» — هیچ چیز نمی‌بینند، چون وارد نشده‌اند.

۴. **چهار شکست تازهٔ دیگر همه timeout ناوبری/کلیک‌اند** و هیچ‌کدام به view نگهبان کار ندارد.

۵. **۳۸۶ و ۳۸۷ صفر تغییر سطح جدول دارند** و هر هشت view دقیقاً همان predicateی را دارند که
   ۳۸۷ ادعا می‌کند، با `security_invoker` سالم روی هر دو.

**آنچه این گزارش اثبات نمی‌کند و ادعا هم نمی‌کند:** اینکه علت آن سه flake لاگین قطعاً مسابقهٔ
hydration است. شواهد قوی‌اند (کد یکسان، نتیجهٔ متناوب، رمز اثبات‌شده معتبر، همان باگ امروز در
اسکریپت خواهر اصلاح شد) ولی سنجیده نشده. → پرسش باز ۱.

---

## ۶. پرسش‌های باز — نیازمند تصمیم مالک

**۱. آیا مسابقهٔ hydration در helperهای لاگین درون‌خطی تأیید شود؟**
شش spec هر کدام helper لاگین جداگانهٔ خودشان را دارند و هیچ‌کدام وصلهٔ امروزِ
`generate-role-sessions.spec.ts` را نگرفته‌اند. **اثباتش یعنی اجرای دوبارهٔ آن سه spec** —
که مالک اجازه‌اش را داده ولی من انجام ندادم، چون تشخیص بدون آن هم به همین حکم می‌رسد و
اجرای spec داده می‌سازد. اگر بخواهید، سه spec (نه بیشتر) اجرا می‌شود.
**اگر تأیید شود، اصلاحش یک `waitFor({state:"visible"})` در شش فایل است — و آن نوشتن است، پس
مأموریت دیگری است.**

**۲. OG-36 دیگر درست نیست و باید اصلاح شود.**
ثبت شده بود که `test.manager` و `test.viewer` هر دو `status=rejected`اند. **هر دو الان
`active`اند** (`test.viewer` در ۰۸-۲۴ ۱۸:۰۶ لاگین موفق داشته). چند مأموریت روی آن سطر
«NOT TESTABLE» ثبت کرده‌اند. آیا حالا باید آن سنجش‌ها بازگرفته شوند؟

**۳. OG-43 دو نیمه دارد، نه یکی.**
تا امروز به‌عنوان «ادعاهای خواندن که به شمارش ردیف سنجاق شده‌اند» ثبت شده بود. ولی دوازده
شکست از این ۴۷ به‌خاطر **INSERTهای fixture** است که به قید NOT NULL می‌خورند
(`journal_entries.doc_kind`، `customers.person_id` — از مهاجرت‌های مرداد). این نیمهٔ نوشتن
است و راه‌حلش با نیمهٔ خواندن فرق دارد.

**۴. فرضیهٔ HTTPS سنجیده شد و شاهدی برایش پیدا نشد.**
سند می‌گفت شکست‌های اضافه ممکن است TLS یا base-URL باشند. در `r9-run3.log` هیچ خطای
`unable to verify the first certificate` و هیچ ارجاع به `test.myafrakala.ir` در بلوک‌های
شکست نیست؛ همهٔ URLهای شکست `http://192.168.170.8:3100` است. **رد نشد، ولی شاهدی هم ندارد**
— اگر مجموعه‌ای هست که واقعاً از میزبان HTTPS استفاده می‌کند و در این اجرا نبوده، آن جدا
باید سنجیده شود.

**۵. خط پایهٔ ۴۱ حالا برشمرده شده — کجا ثبت شود؟**
فهرست کامل از `tasks/bicb1nw3c.output` بازیابی شد، ولی آن پوشه موقتی است و با پایان session
از بین می‌رود. اگر خط پایه قرار است معنا داشته باشد، باید در مخزن ثبت شود. **این نوشتن است
و انجام نشد.**

---

## ۷. مرزهای این مأموریت

**تولید لمس نشد.** هیچ دستوری به `192.168.170.10` اشاره نکرد.

**هیچ نوشتنی انجام نشد:** صفر مهاجرت، صفر DDL، صفر `INSERT`/`UPDATE`/`DELETE`، صفر
`docker restart`، صفر build، صفر تغییر زیر `src/`، صفر بازتولید نشست. تنها SQLهای اجراشده
`SELECT` بودند، و تنها probeای که نقش عوض کرد داخل `BEGIN … ROLLBACK` نوشته‌شده در خود فایل
بود، با اثبات بازگشت (`after rollback: current_user=supabase_admin`).

**مجموعهٔ e2e دوباره اجرا نشد** — طبق تصحیح مالک.

**فایل‌های در جریان مالک لمس نشدند:** `e2e/auth/generate-role-sessions.spec.ts`،
`deploy/lan/docker-compose.yml`، `pw.session.config.ts`، `*.bak`، `r9-run3.log`،
`r9-failures.txt`، `session-gen*.log`. نه stage شدند، نه commit، نه revert.

**تنها فایل نوشته‌شده همین گزارش است.** هیچ PRی باز نشد.
