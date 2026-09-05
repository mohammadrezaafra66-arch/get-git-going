# پژوهش — شکاف‌های frontend/backend: چه چیزی نیمه‌وصل است، و در کدام جهت

**READ-ONLY — هیچ چیزی تغییر نکرد.** تنها فایل نوشته‌شده در این مأموریت همین سند است.
هیچ migration، هیچ نصب، هیچ اصلاح کد، هیچ نوشتنی روی دیتابیس.
همهٔ statementها با `PGOPTIONS="-c default_transaction_read_only=on"` اجرا شدند.
`192.168.170.10` نه تماس گرفته شد، نه resolve، نه ping.

| | |
|---|---|
| مخزن | `D:\AfraKalaTest\app` · شاخهٔ `staging` |
| SHA خوانده‌شده | `6c812f08d0fc0373246e2d3d4fbb8ca077c917d6` |
| دیتابیس | `afrakala` روی `afrakala-lan-db`، به‌عنوان `supabase_admin` |
| تاریخ | ۲۰۲۶-۰۹-۰۵ |
| وضعیت | **COMPLETE** برای Q1–Q4 · **PARTIAL** برای Q5 (دلیل در UNVERIFIED بند ۱) |

### وضعیت درخت کاری — ابتدا و انتهای ممیزی (verbatim)

```
$ git worktree list
D:/AfraKalaTest/app                                    6c812f08 [staging]
.../8c144667-.../wt-asan                               edb48fb8 [hotfix/asan-bank-export-headers]
.../8c144667-.../wt-asan2                              c816eea4 [hotfix/asan-bank-export-layout]
.../8c144667-.../wt-inline                             69ace7ca [feature/bank-account-asan-code-inline]
.../8c144667-.../wt-phonefix                           6298b97d [hotfix/quote-link-empty-phone]
.../8c144667-.../wt-terms                              ffd8315b [feature/purchase-term-is-mandatory]
.../98a8834f-.../wt/ab-export                          4d017cf0 [feature/asan-export-multidoc]
.../98a8834f-.../wt/ab-import                          f32997e4 [feature/asan-import-enforcement]
.../98a8834f-.../wt/ab-person                          1053cdb2 [feature/person-delete-and-complete]
.../98a8834f-.../wt/ab-wizard                          e600e189 [feature/receipt-any-person]
D:/AfraKalaTest/afrakala-deploy-sidebar                257ba917 (detached HEAD)
D:/AfraKalaTest/app-docs-build                         33bc6704 [feature/documents-dual-filter-export]

$ git status --porcelain          # شروع، ۰۸:۴۴ UTC
?? docs/research/asan-bridge-build-20260904.md
?? docs/research/nav-active-state-20260905.md
?? e2e/auth/generate-role-sessions.spec.ts.bak
?? pw.session.config.ts
?? r9-failures.txt
?? test-objects.txt
?? test-schema-20260831.sql
```

**درخت زیر پای من تکان نخورد.** HEAD در پایان هم `6c812f08` روی `staging` بود و فهرست
untracked فقط با همین سند تغییر کرد.

---

## Verdict

**سه چیز امروز واقعاً شکسته است و کاربر به آن‌ها می‌خورد؛ بقیهٔ فهرست «بی‌استفاده» است، نه
«خراب».** [E] شکستگی‌ها همه از یک ریشه‌اند: جدول `invoices` در migration ۳۳۲
(`20260808220000_332_drop_invoices_table.sql:498`) در تاریخ ۲۰۲۶-۰۸-۰۸ **حذف شد**، ولی
۲۰ فراخوان در frontend هنوز از آن (و از `payments` و `ocr_receipts` که **هرگز ساخته نشدند**)
می‌خوانند. از آن ۲۰ تا، ۱۲ تا در دو ماژول‌اند که **هیچ‌کس import نمی‌کند** — یعنی بی‌استفاده،
نه خراب. آنچه واقعاً به کاربر می‌رسد این سه است: تایل «فروش امروز» و نمودار ۷ روزهٔ داشبورد که
**بی‌صدا صفر نشان می‌دهند** (F1)، تب گزارش فروش که **پرتاب خطا می‌کند** (F2)، و سه ارجاع
ستونی که روی جدول‌های زنده به ستون‌های ناموجود می‌زنند و صفحه را می‌ترکانند (F4، F5).

**هر چیز دیگری در جهت frontend→backend سالم است، و این نتیجهٔ اندازه‌گیری است نه حدس.**
[E] ۲۱۳ نام RPC که frontend صدا می‌زند، **صفر تا** در دیتابیس زنده غایب است. **صفر** فراخوان
به توابع overloadشده (تلهٔ PGRST203 که بریف هشدار داده بود، اصلاً زده نمی‌شود — F3). **صفر**
ناهماهنگی آرگومان، در هر دو جهت: نه کلید ناشناخته، نه آرگومان اجباریِ جامانده (F6). Q3 هم
تقریباً یک منفیِ تمیز است: **صفر** handler خالی، **صفر** کنترل دائماً disabled، **صفر**
handler که تنها اثرش یک toast باشد (F12–F15).

Q2 هم بهتر از انتظار است: از ۲۱۰ فایل route، ۲۳ تا هیچ داده‌ای نمی‌خوانند — ولی ۲۱ تای آن‌ها
**عمداً** چنین‌اند (۷ redirect stub، ۶ لایهٔ `<Outlet/>`، ۴ صفحهٔ راهنمای ایستا، ۴ صفحهٔ
زیرساختی). فقط **۲** پوستهٔ واقعی‌اند و هر دو خودشان با متن فارسی اعتراف می‌کنند (F10).

در جهت معکوس، فهرست ۳۵تاییِ ممیزی قبلی **در مخزن نیست** (بند ۱ در UNVERIFIED)، پس آن را از
نو استخراج کردم: **۳۷ تابع یتیم** پس از پنج پاس نجات. نزدیکیِ ۳۷ به ۳۵ تصادفی نیست ولی
انطباق هم اثبات نشده. آنچه اثبات شد این است که **۱۰ تابع ادعای یتیمی‌شان رد می‌شود** — همه
از طریق اصطلاحاتی که grepِ ساده نمی‌بیند (F16). و **هیچ Edge Function در این استقرار وجود
ندارد و `pg_cron` نصب نیست** (F17، F18) — یعنی خوشهٔ «کارهای زمان‌بندی‌شده» زمان‌بند ندارد.

---

## Broken now — Q1

### F1 — داشبورد «فروش امروز» و نمودار ۷ روزه: بی‌صدا صفر · **exists-broken** · اثر: زیاد

`src/hooks/dashboard/useDashboardStats.ts:92-96`:

```ts
        const { data, error } = await supabase
          .from("invoices")
          .select("total_amount, status, issue_date")
          .eq("issue_date", todayDate);
        if (error || !data) return { count: 0, totalAmount: 0, issuedCount: 0 };
```

`src/hooks/dashboard/useDashboardChart.ts:32-36`:

```ts
        const { data, error } = await supabase
          .from("invoices")
          .select("issue_date, total_amount")
          .gte("issue_date", fromIso);
        if (error || !data) return days.map(toEmpty);
```

**چرا وجود ندارد:** جدول در هیچ schemaیی نیست —

```
$ psql -c "select n.nspname||'.'||c.relname from pg_class c join pg_namespace n
           on n.oid=c.relnamespace where c.relname in ('invoices','payments','ocr_receipts')"
(خروجی خالی)
```

و علتش مستند است: `supabase/migrations/20260808220000_332_drop_invoices_table.sql:498`
→ `DROP TABLE public.invoices;` (۲۰۲۶-۰۸-۰۸).

**اثر روی کاربر:** خطا **بلعیده می‌شود** (`if (error || !data) return {…0}`)، پس صفحه
نمی‌ترکد — **عدد صفر نشان می‌دهد**. و هر دو hook واقعاً رندر می‌شوند:
`src/routes/_app.dashboard.tsx:133` (`const sales = useTodaySalesStats();`) و
`src/components/dashboard/SalesChart.tsx:23` (`useSalesChart7d()`). این بدترین حالت است، نه
بهترین: کسب‌وکار روی `sales_quotes` می‌چرخد، پس داشبورد **عددِ غلطِ صفر** را با اطمینان به
مالک نشان می‌دهد.

### F2 — تب «گزارش فروش» خطا پرتاب می‌کند · **exists-broken** · اثر: زیاد

`src/routes/_app.reports.tsx:89-95`:

```ts
      const { data, error } = await supabase
        .from("invoices")
        .select("id, total_amount, status, created_at, customers!inner(full_name)")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
```

اینجا برخلاف F1 خطا **بلعیده نمی‌شود** (`throw error`). و `SalesReportTab` واقعاً رندر
می‌شود — `_app.reports.tsx:70`: `<SalesReportTab range={range} />`.

**اثر روی کاربر:** تب گزارش فروش برای هر کاربری که بازش کند، خطای React Query می‌دهد.

### F3 — تلهٔ PGRST203 اصلاً زده نمی‌شود · **not-applicable** (منفیِ تأییدشده)

بریف هشدار داده بود که `has_role` و `has_any_role` هرکدام دو نسخه دارند. تأیید شد، و
**یک مورد سومی هم پیدا شد که بریف نمی‌دانست**:

```
$ psql -c "select p.proname, count(*), string_agg(pg_get_function_identity_arguments(p.oid),' ;; ')
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' group by 1 having count(*)>1"
...
dyn_table_role_can_view|2|_user_id uuid, _access_level text, _allowed_roles jsonb ;; _user_id uuid, _access_level text
has_any_role|2|_user_id uuid, _roles text[] ;; _user_id uuid, _roles app_role[]
has_role|2|_user_id uuid, _role text ;; _user_id uuid, _role app_role
```

(بقیهٔ ۱۶ نام overloadشده متعلق به pgvector است — `avg`, `l2_distance`, `subvector` و…)

**ولی هیچ‌کدام از این سه از frontend صدا زده نمی‌شوند:**

```
$ comm -12 <رشتهٔ ۲۱۳ نام RPC فراخوانده‌شده> <فهرست نام‌های overloadشده>
count: 0

$ grep -rn 'rpc("has_role"|rpc("has_any_role"|rpc("dyn_table_role_can_view"' . \
      --exclude-dir=node_modules --exclude-dir=.git
(هیچ)
```

**نتیجه: صفر شکستگی PGRST203.** این‌ها فقط از داخل SQL (policyها و بدنهٔ توابع) صدا زده
می‌شوند، جایی که overload با نوع آرگومان حل می‌شود و مشکلی نیست.

### F4 — `inquiries.customer_name` / `inquiries.product_name` وجود ندارند · **exists-broken**

`src/components/purchase/PurchaseRequestForm.tsx:99-104`:

```ts
      const { data, error } = await supabase
        .from("inquiries")
        .select("id, product_name, customer_name, created_at")
        .eq("id", inquiryId)
        .maybeSingle();
      if (error) throw error;
```

ستون‌های واقعی:

```
$ psql -c "select string_agg(column_name,', ' order by ordinal_position)
           from information_schema.columns
           where table_schema='public' and table_name='inquiries'"
id, product_id, group_id, requested_by, assigned_to, status, message_id,
created_at, answered_at, closed_at
```

نه `customer_name`، نه `product_name` — جدول فقط `product_id` و `requested_by` دارد.

**اثر روی کاربر:** `throw error`. مسیر فعال‌شونده مشروط است: `enabled: !!inquiryId`
(`:107`)، یعنی فقط وقتی فرم درخواست خرید از دل یک استعلام باز شود. آن مسیر می‌ترکد.

### F5 — دو ستون در «داشبورد هوشمند بازار» · **exists-broken**

**۵-الف — `product_computed_prices_public.sale_price`**، `src/routes/_app.pricing.market-intelligence.tsx:253-258`:

```ts
      const { data, error } = await supabase
        .from("product_computed_prices_public")
        .select("product_id, sale_price, products!inner(id, name, sku)")
        .order("sale_price", { ascending: false })
        .limit(200);
      if (error) throw error;
```

```
$ psql: columns of product_computed_prices_public
id, product_id, sale_price_type_id, pricing_rule_id, final_sale_price,
rounded_sale_price, computed_at, source
```

`sale_price` نیست؛ نام‌های واقعی `final_sale_price` و `rounded_sale_price` هستند. هم در
`select` و هم در `order` استفاده شده، پس هر دو می‌شکنند.

**۵-ب — `purchase_prices.effective_from`**، همان فایل `:310-316`:

```ts
      const { data, error } = await supabase
        .from("purchase_prices")
        .select("product_id, effective_from, products!inner(id, name, sku)")
        .lt("effective_from", threshold)
        .order("effective_from", { ascending: true })
```

```
$ psql: columns of purchase_prices
id, product_id, supplier_id, purchase_price, currency, effective_at, expires_at,
reason_id, private_note, registered_by, is_active, created_at, updated_at,
supplier_person_id
```

ستون واقعی `effective_at` است، نه `effective_from`. اینجا سه‌بار استفاده شده
(`select`, `lt`, `order`).

**اثر روی کاربر:** هر دو کارت `throw error` دارند؛ دو کارت از صفحهٔ
«داشبورد هوشمند بازار» خطا می‌دهند.

### F6 — شکل آرگومان‌ها: هیچ ناهماهنگی‌ای نیست · **exists-works** (منفیِ تأییدشده)

هر ۲۳۰ فراخوان RPC با شیء آرگومان یا بدون آن، در برابر امضای زندهٔ تابع بررسی شد. نام‌های
آرگومان **فقط ورودی** گرفته شدند (`proargmodes IN ('i','b','v')`) — بدون این فیلتر،
`proargnames` ستون‌های `RETURNS TABLE` را هم شامل می‌شود و نتیجه بی‌معنی می‌شد؛ پاس اول همین
اشتباه را کرد و ۸۹ «آرگومان جامانده»ی جعلی داد که همگی نام ستون خروجی بودند.

```
########## unknown-key check (input-only) ##########
calls whose keys all fit some overload: 208
calls with a key NO overload accepts: 0
calls to a name with no DB prototype: 0

########## missing-required check (input-only) ##########
total rpc calls checked: 230
calls MISSING a required (non-default) argument: 0
```

### F7 — `payments` و `ocr_receipts` هرگز وجود نداشته‌اند · **absent** · اثر: هیچ (بی‌استفاده)

```
$ grep -rln "CREATE TABLE.*\bpayments\b|CREATE TABLE.*ocr_receipts" supabase/migrations/
(هیچ)
$ grep -rln "ocr_receipts" supabase/migrations/
(هیچ)
```

این دو **هیچ‌وقت با migration ساخته نشدند** — بازماندهٔ داربستِ اولیهٔ Lovable/cloud هستند،
نه چیزی که حذف شده باشد. برخلاف `invoices` که تاریخ مرگ دارد.

نکتهٔ مهم: `src/routes/_app.operations.receipts.tsx` **این را می‌داند و درست رفتار می‌کند**
(`:84-90`):

```ts
  if (error) {
    // Postgres 42P01 = undefined_table, PostgREST PGRST205 = table not found in schema cache
    if (error.code === "42P01" || error.code === "PGRST205" || /ocr_receipts/i.test(error.message)) {
      return { tableMissing: true, rows: [] };
    }
    throw new Error(error.message);
  }
```

**این نقص نیست — رفتار صادقانه است** و در فهرست شکستگی‌ها نمی‌آید.

### F8 — ۱۲ فراخوان دیگر به جدول‌های مرده، ولی در ماژول‌های وارد‌نشده · **not-connected** · اثر: هیچ

```
$ grep -rn '\.from("invoices")|\.from("payments")|\.from("ocr_receipts")' src server | wc -l
20
   src/lib/accounting/functions.ts        8
   src/lib/invoices/functions.ts          4
   src/routes/_app.operations.receipts.tsx 3      <- F7، صادقانه مدیریت‌شده
   src/hooks/dashboard/useDashboardChart.ts 1     <- F1
   src/hooks/dashboard/useDashboardStats.ts 1     <- F1
   src/routes/_app.reports.tsx            1       <- F2
   src/components/delivery-receipts/DeliveryReceiptCard.tsx       1  <- F9
   src/components/delivery-receipts/DeliveryReceiptUploadForm.tsx 1  <- F9
```

دو ماژول اولی را **هیچ‌کس import نمی‌کند**:

```
$ grep -rn 'lib/invoices/functions|from "@/lib/invoices' src server | grep -v "^src/lib/invoices/functions.ts"
(هیچ)
$ grep -rn 'lib/accounting/functions"' src server
(هیچ)
```

exportهایشان `createInvoiceFn` / `updateInvoiceFn` / `deleteInvoiceFn` و
`recordPaymentFn` / `updatePaymentFn` / `reversePaymentFn` هستند — همگی `createServerFn`
و همگی بدون مصرف‌کننده. **این «بی‌استفاده» است، نه «خراب».** (احتیاط در UNVERIFIED بند ۴.)

### F9 — کارت رسید تحویل: شکستگی نهفته، امروز فعال نیست · **exists-broken (latent)**

`src/components/delivery-receipts/DeliveryReceiptCard.tsx:47-58`:

```ts
function useInvoiceNumber(invoiceId: string | null) {
  return useQuery({
    queryKey: ["dr-invoice-number", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("number")
```

این کامپوننت **واقعاً رندر می‌شود** — سه جا: `_app.delivery-receipts.tsx:133`،
`_app.admin.delivery-receipts.tsx:303`، `PendingDeliveryReceiptsPanel.tsx:49`.

ولی `enabled: !!invoiceId` نگهش داشته است:

```
total_rows=1
with_invoice_id=0
invoice_cols: invoice_id
```

ستون `delivery_receipts.invoice_id` هنوز هست ولی **هیچ ردیفی مقدار ندارد**، پس query هرگز
فعال نمی‌شود. **امروز نمی‌شکند؛ اولین ردیفی که `invoice_id` بگیرد آن را می‌شکند.**

---

## Shells — Q2

از ۲۱۰ فایل `src/routes/`، ۵۰ تا هیچ نشانهٔ مستقیم backend ندارند. با دنبال‌کردن importها تا
۳ گام — و **کنار گذاشتن ماژول‌های زیرساختی** (`lib/rbac/`, `lib/auth/`, `components/layout/`,
`components/ui/`, `integrations/`)، چون آن‌ها را هر صفحه‌ای import می‌کند و ربطی به دادهٔ
خودِ صفحه ندارند — ۲۷ تا از راه یک hook دامنه به backend می‌رسند و **۲۳ تا به هیچ چیز**.

از آن ۲۳، هر ۲۳ خوانده شد. **۲۱ تا نقص نیستند:**

| صفحه | خط | داده می‌خواند؟ | دسته |
|---|---:|---|---|
| `_app.admin.gamification.tsx` | ۹ | نه | **redirect stub** → `/gamification/admin` |
| `_app.admin.gamification.achievements.tsx` | ۹ | نه | **redirect stub** |
| `_app.users.pending.tsx` | ۹ | نه | **redirect stub** → `/users?status=pending` |
| `_app.accounting.daily-capital.tsx` | ۱۷ | نه | **redirect stub** (Item 141) |
| `_app.accounting.customer-capital-allocations.tsx` | ۱۵ | نه | **redirect stub** (Item 141) |
| `_app.accounting.salesperson-capital-allocations.tsx` | ۱۵ | نه | **redirect stub** (Item 141) |
| `_app.integrations.didar.tsx` | ۳۳ | نه | **redirect stub** (بازنشستهٔ ۲۰۲۶-۰۸-۰۸) |
| `_app.sales.tsx` | ۱۰ | نه | **لایهٔ `<Outlet/>`** + guard |
| `_app.sales.quotes.tsx` | ۱۴ | نه | **لایهٔ `<Outlet/>`** + guard |
| `_app.bot-api-keys.tsx` | ۱۴ | نه | **لایهٔ `<Outlet/>`** + guard |
| `_app.tsx` | ۲۲۱ | نه | **لایهٔ shell** برنامه |
| `index.tsx` | ۶۰ | نه | **ورودی/redirect** |
| `unauthorized.tsx` | ۳۱ | نه | **صفحهٔ خطای ایستا** |
| `_app.sales_.customers_.credit-training.tsx` | ۱۲ | نه | **راهنمای ایستا** (`CustomerCreditGuide`) |
| `_app.sales_.customers_.credit-allocation-guide.tsx` | ۱۲ | نه | **راهنمای ایستا** (همان کامپوننت) |
| `_app.gamification_.admin_.manual-metrics_.guide.tsx` | ۱۴ | نه | **راهنمای ایستا** (Item 143) |
| `_app.accounting.receipts_.training.tsx` | ۱۶ | نه | **راهنمای ایستا** |
| `_app.sales.index.tsx` | ۱۰۵ | نه | **هاب ناوبری** — ۶ کارت `<Link>` |
| `_app.popup-center.tsx` | ۶۸ | نه (state محلی) | از `usePopupCenter` context می‌خواند |
| `api.version.ts` | ۳۲ | نه | **اطلاعات build** |
| `sitemap[.]xml.ts` | ۵۱ | نه | **XML ایستا** — ۳ ورودی hardcode |

**فقط ۲ پوستهٔ واقعی، و هر دو خودشان می‌گویند:**

**`src/routes/_app.price-lists.tsx` (۲۲ خط)** — `:14-18`:

```tsx
      <EmptyState
        icon={ListOrdered}
        title="ماژول لیست‌های قیمت — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
```

پوستهٔ واقعی، و **در سایدبار لینک دارد** (`/price-lists` در ماژول `catalog` است) — یعنی
کاربر به آن می‌رسد.

**`src/routes/_app.purchases.tsx` (۳۴ خط)** — `:26-30`:

```tsx
      <EmptyState
        icon={ShoppingBag}
        title="ماژول خرید"
        description="برای ثبت یک خرید جدید روی دکمه «ثبت خرید جدید» کلیک کنید. لیست خریدها در فاز بعدی اضافه می‌شود."
      />
```

**پوستهٔ نیمه:** دکمهٔ «ثبت خرید جدید» واقعاً به `/purchases/create` می‌رود و کار می‌کند؛
فقط *فهرست* خریدها ساخته نشده.

### یک یادداشت جانبی روی `sitemap[.]xml.ts`

`:4` → `const BASE_URL = "https://get-git-going.lovable.app";` — یک دامنهٔ بیگانه از داربست
اولیهٔ Lovable که هنوز مانده. دادهٔ خراب نیست، ولی sitemap منتشرشده به دامنهٔ اشتباه اشاره
می‌کند.

### Q2.3 — کامپوننت‌های نمای داده

۲۳ کامپوننت با نام نمای داده (`*Table|List|Dashboard|Grid|Report|Panel|Board|Chart|Stats|Summary|Overview|Feed|Queue|Timeline.tsx`)
بیرون از `components/ui` پیدا شد. ۸ تا نشانهٔ مستقیم backend دارند، ۷ تا props می‌گیرند
(فرزند نمایشی — طبیعی)، و ۸ تای باقی‌مانده تک‌تک بررسی شدند:

| کامپوننت | منبع داده‌اش |
|---|---|
| `settings/WorkflowSettingsTable.tsx` | `useWorkflowSettings()` `:2` |
| `delivery-receipts/PendingDeliveryReceiptsPanel.tsx` | `usePendingDeliveryReceipts()` `:4` |
| `documents/PendingDocumentsPanel.tsx` | `usePendingDocuments()` `:4` |
| `dashboard/SalesChart.tsx` | `useSalesChart7d()` `:16` — **مسیر داده‌اش مرده است، F1** |
| `penalties/MyPenaltiesPanel.tsx` | hook penalties |
| `penalties/AppealReviewPanel.tsx` | hook penalties + `useAuth` |
| `operations/mood/DailyMoodAdminTable.tsx` | hook داخلی + `useDebounce` |
| `pricing/price-history/ProductPriceChart.tsx` | props: `PriceHistoryPoint` `:13` |

**نتیجه: صفر کامپوننت نمای داده بدون مسیر داده.** تنها استثنا `SalesChart` است که مسیر
دارد ولی مسیرش به جدول حذف‌شده می‌رسد — که همان F1 است، نه یافتهٔ جدید.

---

## Dead controls — Q3

**هر چهار زیرچک منفیِ تمیز درآمد.** این برای codebaseیی به این اندازه غیرعادی است، پس
دستورها را کامل می‌آورم تا قابل بازآزمایی باشد.

### F12 — handlerهای خالی: صفر

```
$ grep -rnE 'on[A-Z][a-zA-Z]*=\{\(\)\s*=>\s*\{\s*\}\}' src/ | grep -v components/ui
count: 0
```

### F13 — handlerهایی که تنها اثرشان یک toast است: صفر

اسکریپت بدنهٔ هر `onClick`/`onSubmit` را می‌گیرد و آن‌هایی را نگه می‌دارد که `toast` دارند
ولی هیچ `rpc/insert/update/upsert/delete/mutate/navigate/set*/refetch/invalidate/window./document./copy` ندارند:

```
toast-only handlers: 0
```

### F14 — کنترل‌های دائماً disabled: صفر واقعی

```
$ grep -rnE 'disabled=\{(true|false)\}' src/ | grep -v components/ui
count: 0
```

چهار `disabled` بدون عبارت پیدا شد و هر چهار **صادقانه‌اند**:

| فایل:خط | برچسب فارسی | چه می‌کند |
|---|---|---|
| `_app.data-tables.index.tsx:79` | «جدول جدید» | شاخهٔ `else` مجوز، با `TooltipContent` «شما دسترسی انجام این عملیات را ندارید» `:85` |
| `_app.data-tables.$tableId.tsx:547` | «افزودن ردیف» | همان الگو، `title="شما دسترسی…"` |
| `_app.admin.automation.tsx:340` | «اجرای مستقیم ترب از UI قفل است» | **خودِ برچسب می‌گوید قفل است**؛ متن بالایش `:338-339` توضیح می‌دهد که اجرا کار worker است |
| `shared/components/SettlementTypeForm.tsx:104` | — | فیلد `code` فقط‌خواندنی |

### F15 — فرم‌هایی که اعتبارسنجی می‌کنند ولی نمی‌فرستند: صفر

از ۳۷ فایل دارای submit handler، ۱۲ تا هیچ نوشتنی در خودشان ندارند. هر ۱۲ بررسی شد:
۹ تا از طریق prop به والد واگذار می‌کنند (`PersonForm`, `CourseForm`, `FeedbackForm`,
`KnowledgeDocumentForm`, `LessonForm`, `QuizForm`, `QuizTaker`, `SettlementTypeForm`,
`ShippingCostRuleForm`)، و ۳ تای باقی‌مانده واقعاً می‌نویسند:

- `register.tsx:104` → `supabase.auth.signUp({…})`
- `reset-password.tsx:63` → `supabase.auth.updateUser({ password })`
- `PriceAlertDialog.tsx:126,129` → `updateAlertRule(...)` / `createAlertRule(...)`

(دو مورد اول را regexِ اولیه‌ام نمی‌دید چون نوشتنشان از مسیر `auth` است، نه `.insert/.rpc`.)

### F16 — چهار نشانگر «به‌زودی» — هیچ‌کدام کنترل مرده نیستند

```
$ grep -rnE '//\s*(TODO|FIXME)|not implemented|به‌زودی|بزودی|coming soon' src/ | grep -v components/ui
count: 7   (سه‌تا کامنت تاریخی‌اند)
```

- `_app.gamification.admin.rewards.tsx:247` — متن سلب ادعا:
  «`Reward execution engine not implemented yet.` در این فاز تعریف پاداش انجام می‌شود و
  اجرای خودکار، پرداخت یا تسویه فعال نیست.» CRUDِ خودِ پاداش کار می‌کند.
- `src/lib/pricing/price-alerts.ts:66` — `stock_status_changed: "… (به‌زودی)."` — و این
  operator **از dropdown فیلتر می‌شود**: `PriceAlertDialog.tsx:240` →
  `.filter((op) => op !== "stock_status_changed")`. یعنی به کاربر پیشنهاد نمی‌شود.
- `_app.pricing.index.tsx:281` — نشان «به‌زودی» فقط در شاخهٔ `!t.enabled` رندر می‌شود، و
  `grep -c "enabled: false"` روی آن فایل **۰** است. یعنی این شاخه **کد مرده است** و امروز
  هیچ تایلی غیرفعال نیست. (بی‌ضرر، ولی گمراه‌کننده برای خواننده‌ی بعدی.)

---

## Rescued orphans — Q4

**۱۰ تابع ادعای یتیمی‌شان رد شد.** همه به دلیلی که Q4.1 پیش‌بینی کرده بود: نام تابع
به‌صورت `supabase.rpc("literal")` نوشته نشده، پس grepِ ساده نمی‌بیندش. سه اصطلاح در این
مخزن رایج است.

### الف) نام پویا از یک اتحادیهٔ تایپی — ۲ تابع

`src/features/ledger-wizard/rpc.ts:3` و `:97`:

```ts
export type LedgerRpcName = "create_receipt" | "create_payment" | "create_dual_document";
...
  const { data, error } = await supabase.rpc(name as never, args as never);
```

فراخوان‌های واقعی — `src/features/ledger-wizard/DocumentWizard.tsx`:

```
:371        result = await callLedgerRpc("create_receipt", {
:388        result = await callLedgerRpc("create_payment", {
:405        result = await callLedgerRpc("create_dual_document", {
```

**نجات‌یافته: `create_receipt`، `create_dual_document`.**

### ب) نام پویا از یک ternary — ۵ تابع

`src/routes/_app.data-tables.$tableId.tsx:213-214` و `:317`:

```ts
  const rpcName =
    isTorobTable || isObservatoryTable ? "query_dynamic_table_rows_v2" : "query_dynamic_table_rows";
...
      const { data, error } = await supabase.rpc(rpcName, { p_table_id: tableId, … });
```

**نجات‌یافته: `query_dynamic_table_rows_v2`.**

`src/lib/operations/gamification.ts:155-164`:

```ts
  const fnName =
    period === "daily"
      ? "get_leaderboard_daily"
      : period === "weekly"
        ? "get_leaderboard_weekly"
        : period === "all_time"
          ? "get_leaderboard_all_time"
          : "get_leaderboard_monthly";

  const { data, error } = await supabase.rpc(fnName as never, {…});
```

**نجات‌یافته: `get_leaderboard_daily`، `get_leaderboard_weekly`، `get_leaderboard_monthly`،
`get_leaderboard_all_time`.**

### ج) فراخوان با cast — ۳ تابع (و یک اصطلاح دیگر)

`src/routes/_app.my-rejected-quotes.tsx:33-38`:

```ts
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("get_my_rejected_quotes", { p_limit: 50 });
```

**نجات‌یافته: `get_my_rejected_quotes`** (و به همین شکل `calculate_customer_realtime_credit`،
`get_product_view_counts_7d`، `get_recent_purchase_labels`، `set_gamification_sales_source`،
`set_quote_accounting_marker`، `upsert_staff_daily_performance_metric`،
`create_sales_quote_with_items` — که هیچ‌کدام در فهرست یتیم من نمانده بودند چون استخراج
چندخطی‌ام گرفتشان).

`src/routes/_app.sales.credit-customers.tsx:160-161` — همان cast ولی نام در **خط بعد**:

```ts
      const { data, error } = await (supabase.rpc as unknown as TrustedCustomersRpc)(
        "list_trusted_credit_customers",
```

**نجات‌یافته: `list_trusted_credit_customers`.**

### د) یک wrapper با `bind` — ۶ تابع

اصطلاحی که `.rpc(` را کاملاً از grep پنهان می‌کند:

```ts
// src/lib/treasury/queries.ts:50 و src/lib/warehouses/queries.ts:70
//     و src/lib/accounting/mutual-settlement.ts:22
const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
```

و `warehouses/queries.ts:64-69` توضیح می‌دهد چرا `bind` لازم است. فراخوان‌ها بعد از آن
`rpc("name", {...})` می‌شوند — بدون نقطه.

**نجات‌یافته: `adjust_warehouse_stock` (`warehouses/queries.ts:200`)،
`check_quote_stock_availability`، `get_account_balances` (`treasury/queries.ts:71`)،
`get_account_ledger` (`:98`)، `pay_purchase_with_voucher` (`:231`)،
`post_mutual_settlement` (`mutual-settlement.ts:79`)،
`list_mutual_settlement_candidates` (`:49`)، `person_settlement_position`.**

### F17 — Edge Function در این استقرار وجود ندارد · **absent**

```
$ ls -d supabase/functions
  supabase/functions: DOES NOT EXIST
$ ls supabase/
config.toml   migrations   schema_full_export.sql

$ docker ps -a --format "{{.Names}}" | grep -iE "functions|edge|deno"
  (هیچ)

$ grep -nE "^  [a-z-]+:" deploy/lan/docker-compose.yml
  web:  db:  db-role-fix:  auth:  rest:  storage:  meta:  studio:  kong:  caddy:
```

**نه در مخزن، نه در stack.** پس هیچ‌کدام از ۳۷ تابع از این راه نجات نمی‌یابند.

### F18 — `pg_cron` نصب نیست · **absent** — خوشهٔ «کار زمان‌بندی‌شده» زمان‌بند ندارد

```
$ psql -c "select extname from pg_extension order by 1"
btree_gist pg_graphql pg_stat_statements pg_trgm pgcrypto pgjwt pgsodium plpgsql
supabase_vault uuid-ossp vector

$ psql -c "select jobname from cron.job"
ERROR:  relation "cron.job" does not exist
```

### F19 — `automation/` هیچ‌کدام را صدا نمی‌زند; `e2e/` ۱۶ تا را نام می‌برد ولی فراخوان نیست

`automation/` یک worker پایتونی است (`worker-runtime/src/*.py`) و **هیچ‌یک از نام‌های
یتیم را نمی‌برد**. در `e2e/` ۱۶ نام پیدا شد، ولی این‌ها **نجات نیستند** — اکثرشان تست
امنیت‌اند که ثابت می‌کنند anon نمی‌تواند به آن‌ها برسد:

```
capture_score_snapshots            <- e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts
cleanup_stale_auto_suppliers       <- e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts
recalculate_settlement_score       <- e2e/security/og61-...
refresh_all_sale_list_prices       <- e2e/security/og61-...
sync_product_price_observatory_rows<- e2e/security/og61-...
update_customer_overdue_status     <- e2e/security/og61-...
person_fk_drift_report             <- e2e/persons/aliases-crud.spec.ts
...
```

یک تست که ثابت می‌کند تابعی **قابل دسترسی نیست**، مصرف‌کنندهٔ محصولی آن نیست. یتیم می‌مانند —
ولی بی‌آزمون نیستند، و این تفاوت برای تصمیم «حذف یا وصل» مهم است.

### F20 — رشتهٔ مسیر پویا: فقط یکی، و سالم است

```
$ grep -rnE 'to=\{`|navigate\(\{?\s*to:\s*`|href=\{`' src/ --include=*.tsx | grep -v components/ui
src/routes/_app.pricing.sale-lists_.$listId.tsx:976:  href={`/public/sale-lists/${list.id}`}
count: 1
```

و مقصدش وجود دارد: `src/routes/public.sale-lists.$listId.tsx` و
`routeTree.gen.ts:459-460` (`path: '/public/sale-lists/$listId'`). **هیچ صفحه‌ای از این راه
نجات یا شکسته نمی‌شود.**

---

## The 35, explained — Q5

> **هشدار صداقت:** فهرست ۳۵تاییِ ممیزی ۲۰۲۶-۰۹-۰۴ **در این مخزن نیست** (UNVERIFIED بند ۱).
> جدول زیر روی فهرستی است که خودم استخراج کردم: **۳۷ تابع**، از ۲۳۶ تابع بدون فراخوانِ
> درون‌دیتابیسی، منهای همهٔ اصطلاحات فراخوان frontend (F16). نزدیکی ۳۷ به ۳۵ دلگرم‌کننده
> است ولی **انطباق اثبات نشده** — ممکن است این جدول شامل توابعی باشد که آن ممیزی نداشت، و
> برعکس.
>
> ستون «امروز دستی قابل اجراست؟» یعنی: آیا یک ادمین می‌تواند همین حالا با
> `SELECT fn(...)` صدایش بزند و نتیجهٔ معنادار بگیرد. **این توصیه به اجرا نیست** — هر مورد
> «بله، می‌نویسد» باید مثل هر نوشتن دیگری در `BEGIN … ROLLBACK` آزموده شود.

### خوشه ۱ — کار زمان‌بندی‌شده (۶ تابع) · هیچ زمان‌بندی وجود ندارد (F18)

| نام | یک جمله دربارهٔ کاری که می‌کند | چه می‌نویسد | دستی؟ | پیش‌نیاز |
|---|---|---|---|---|
| `capture_score_snapshots()` | همهٔ ردیف‌های `employee_scores` را با مهر زمان کپی می‌کند و اسنپ‌شات‌های قدیمی‌تر از ۹۰ روز را پاک می‌کند؛ تعداد کپی‌شده را برمی‌گرداند | `INSERT score_snapshots` + `DELETE score_snapshots` (نگه‌داری ۹۰ روزه) | بله | ندارد. **هیچ guard نقشی ندارد** — SECDEF بدون بررسی `auth.uid()` |
| `recompute_all_employee_scores()` | روی هر کارمندی که در `call_logs` یا `employee_scores` هست حلقه می‌زند و `calculate_employee_score` را صدا می‌زند؛ خطای هر کارمند را می‌بلعد (`EXCEPTION WHEN OTHERS THEN NULL`) | مستقیم چیزی نه؛ از راه `calculate_employee_score` می‌نویسد | بله | `calculate_employee_score` (خودش از frontend صدا زده می‌شود) |
| `recompute_customer_credit_scores(p_limit, p_offset)` | دسته‌ای امتیاز اعتبار مشتری‌ها را بازمحاسبه می‌کند و برای هرکدام سطر نتیجه/خطا برمی‌گرداند | از راه توابع امتیازدهی | بله | **نقش لازم**: `admin`/`manager`/`accountant`، وگرنه `forbidden` |
| `refresh_all_sale_list_prices()` | آخرین `rounded_sale_price` هر محصول را در همهٔ `sale_list_items` می‌نشاند و `previous_price`/`change_amount`/`change_percent` را از تاریخچه بازمی‌سازد | `UPDATE sale_list_items` (۴ ستون) | بله | ندارد. **بدون guard نقشی** — روی همهٔ لیست‌های فروش اثر می‌گذارد |
| `cleanup_stale_auto_suppliers()` | تأمین‌کنندگانِ خودکارافزوده‌شده‌ای را که ۱۰۰ روز است نه برای این محصول و نه برای هیچ محصولِ همان برند خریدی نداشته‌اند حذف می‌کند | `DELETE product_suppliers` | بله | ندارد. **حذف واقعی داده** |
| `sync_product_price_observatory_rows()` | ردیف‌ها و سلول‌های جدول پویای «رصدخانهٔ قیمت» را از کاتالوگ محصولات می‌سازد/به‌روز می‌کند؛ `(inserted_rows, updated_rows)` برمی‌گرداند | `INSERT dynamic_table_rows` + `INSERT/UPDATE dynamic_table_cells` | بله | جدول پویای رصدخانه باید با slug درست موجود باشد |

### خوشه ۲ — تخصیص سرمایه (۷ تابع)

| نام | یک جمله دربارهٔ کاری که می‌کند | چه می‌نویسد | دستی؟ | پیش‌نیاز |
|---|---|---|---|---|
| `hold_capital_allocation(...)` | **سنگ قبر.** بدنه فقط یک `RAISE EXCEPTION` است: «این مسیر رزرو بازنشسته شده است؛ از hold_credit/release_credit استفاده کنید (M11)» با `ERRCODE '0A000'` | هیچ | **نه** — همیشه خطا | جانشین: `hold_credit` |
| `release_capital_allocation(...)` | سنگ قبر، متن یکسان | هیچ | **نه** | `release_credit` |
| `consume_capital_allocation(...)` | سنگ قبر، متن یکسان | هیچ | **نه** | `release_credit` |
| `refund_capital_allocation(...)` | سنگ قبر، متن یکسان | هیچ | **نه** | `release_credit` |
| `can_use_customer_capital_allocation(p_customer_id, p_amount)` | می‌گوید آیا مبلغی از سقف تخصیصِ مشتری در snapshot سرمایهٔ فعال قابل استفاده است، و اگر نه با دلیل فارسی («مشتری در snapshot فعال تخصیص ندارد» و…) برمی‌گردد | فقط می‌خواند | بله | یک snapshot سرمایهٔ فعال (`_latest_active_capital_setting()`)، و `customers.person_id` غیر NULL |
| `upsert_daily_capital_input(p_capital_date, …۱۲ عدد)` | ورودی‌های دستیِ سرمایهٔ یک روز (موجودی بانک/نقد، چک‌ها، مطالبات و بدهی‌های بیرونی، ذخیرهٔ ریسک و…) را ثبت یا به‌روز می‌کند؛ اعداد منفی را رد می‌کند | `INSERT/UPDATE daily_capital_inputs` | بله | نقش `admin`/`manager`/`accountant` |
| `save_daily_capital_snapshot(p_capital_date)` | محاسبهٔ سرمایهٔ آن روز را در `daily_capital_snapshots` تثبیت می‌کند | `INSERT daily_capital_snapshots` | بله | نقش `admin`/`manager`/`accountant`؛ ورودی آن روز باید موجود باشد |

### خوشه ۳ — دوقلوهای جایگزین‌شده (۵ تابع)

| نام | یک جمله دربارهٔ کاری که می‌کند | چه می‌نویسد | دستی؟ | جانشینِ زنده |
|---|---|---|---|---|
| `assign_user_role(_target_user, _role app_role)` | فقط `assign_user_role_txt(_target_user, _role::text)` را PERFORM می‌کند — یک پوستهٔ `app_role` روی نسخهٔ متنی | از راه نسخهٔ `_txt` | بله | **`assign_user_role_txt` را frontend صدا می‌زند** |
| `revoke_user_role(_target_user, _role app_role)` | همان، برای حذف نقش | از راه `_txt` | بله | **`revoke_user_role_txt` صدا زده می‌شود** |
| `get_workflow_setting(p_process_key)` | یک سطر `workflow_settings` را با کلید فرایند برمی‌گرداند (تک‌رکورد) | فقط می‌خواند | بله | **`get_workflow_settings` (جمع) صدا زده می‌شود** |
| `create_dynamic_scoring_parameter(_code, _label_fa, _weight, _direction)` | پارامتر امتیازدهیِ مشتری می‌سازد، وزن ماه جاری را ثبت می‌کند و لاگ ممیزی می‌نویسد | `INSERT` در `dynamic_scoring_parameters` + `dynamic_parameter_weights` + `audit_logs` | بله | **`create_dynamic_scoring_parameter_v2` صدا زده می‌شود** (`_app.sales.credit-rules.tsx:218`) |
| `get_product_sale_price(_product_id, _sale_price_type_id)` | آخرین `new_sale_price` از `product_sale_price_history` را برمی‌گرداند | فقط می‌خواند | بله | `product_computed_prices` مسیر زندهٔ قیمت است |

### خوشه ۴ — تشخیصی، بدون صفحه (۵ تابع) · همه فقط‌خواندنی و بی‌خطر

| نام | یک جمله دربارهٔ کاری که می‌کند | چه می‌نویسد | دستی؟ |
|---|---|---|---|
| `person_fk_drift_report()` | جدول‌هایی را می‌شمارد که ستون `*_person_id` آن‌ها با `person_id` جدول والد (customers/suppliers) نمی‌خواند — یعنی رانش هویت | فقط می‌خواند | بله، کاملاً بی‌خطر |
| `polymorphic_ref_orphan_report()` | در `stock_movements` ردیف‌هایی را می‌شمارد که `ref_id` دارند ولی مقصدشان وجود ندارد، یا `ref_type`شان به هیچ جدولی نگاشت نشده | فقط می‌خواند | بله، بی‌خطر |
| `validate_journal_entry_balance(p_journal_entry_id)` | جمع بدهکار و بستانکار یک سند را با هم و با صفر مقایسه می‌کند و `is_balanced` می‌دهد | فقط می‌خواند | بله، بی‌خطر |
| `manual_daily_metrics_totals(p_employee_id, p_from)` | جمع فروش، سود، تماس‌های ورودی/خروجی و دقایق مکالمهٔ یک کارمند را از تاریخی به بعد برمی‌گرداند | فقط می‌خواند | بله، بی‌خطر |
| `mi_get_seller_favorite_products(p_days, p_limit)` | پرتعامل‌ترین محصولات نزد کاربران با نقش `sales` در N روز اخیر را برمی‌گرداند — خواهرِ همان `mi_*`هایی که frontend صدا می‌زند | فقط می‌خواند | بله، ولی `_mi_require_privileged()` را PERFORM می‌کند |

### خوشه ۵ — بقیه (۱۴ تابع)

| نام | یک جمله دربارهٔ کاری که می‌کند | چه می‌نویسد | دستی؟ | پیش‌نیاز / نکته |
|---|---|---|---|---|
| `handle_new_user()` | trigger ثبت‌نام: برای کاربر تازه یک `profiles` می‌سازد و نقش `viewer` می‌دهد | `INSERT profiles` + `INSERT user_roles` | نه (trigger) | **به هیچ triggerی وصل نیست** — کوئری روی `pg_trigger` خروجی خالی داد. یعنی این مسیر خودکارِ ساخت پروفایل امروز کار نمی‌کند |
| `tg_purchase_actor_active()` | trigger نگهبان: اگر سازندهٔ `purchases`/`purchase_requests` حساب غیرفعال داشته باشد، «حساب کاربری شما فعال نیست.» را پرتاب می‌کند | هیچ (فقط رد می‌کند) | نه (trigger) | **به هیچ triggerی وصل نیست** — یعنی این محافظ خاموش است |
| `calculate_salesperson_collected_sales(p_employee_id, p_window_months)` | مبلغ وصول‌شدهٔ یک فروشنده در بازهٔ ماهانه را می‌دهد — **ولی همیشه یک سطر صفر** | فقط می‌خواند | بله | migration ۳۳۱ هر دو CTE را که جدول فاکتور می‌خواندند خنثی کرد. کامنت داخل بدنه صریح است: «Not repointed at sales_quotes: that would turn a metric that has always read zero into a live number, which is a product decision, not a cleanup.» |
| `update_customer_overdue_status(_customer_id)` | وضعیت معوقهٔ مشتری را می‌نویسد — **همیشه «معوقه ندارد»** | `INSERT/UPDATE customer_credit_profile` | بله (ولی بی‌معنا) | همان ۳۳۱. بدنه: «v_overdue_since := NULL;» با توضیح که منبع معوقه فقط جدول فاکتور بود |
| `recalculate_settlement_score(_customer_id)` | امتیاز خوش‌حسابی مشتری را می‌نویسد — **همیشه صفر** | `INSERT/UPDATE customer_credit_profile` | بله (ولی بی‌معنا) | همان ۳۳۱؛ حلقهٔ امتیازدهی حذف شده و `v_score := 0` مانده |
| `log_invoice_issuance_blocked_overdue(...)` | وقتی صدور فاکتور به‌خاطر معوقه رد شود، رویداد را در ممیزی ثبت می‌کند؛ ابتدا از `can_issue_customer_invoice` می‌پرسد تا لاگ جعلی ثبت نشود | `INSERT audit_logs` | بله | چون `can_issue_customer_invoice` امروز روی دادهٔ فاکتورِ حذف‌شده تکیه دارد، عملاً همیشه زودهنگام `RETURN` می‌کند |
| `api_dynamic_table_query_rows(p_table_slug, p_filters, p_limit, p_offset)` | ردیف‌های یک جدول پویا را با slug و فیلترهای مجاز می‌خواند و jsonb برمی‌گرداند — نسخهٔ «API» به‌جای نسخهٔ id-محورِ داخلی | فقط می‌خواند | بله | نقش `admin`/`manager` |
| `api_dynamic_table_update_cell(p_table_slug, p_row_id, p_column_key, p_value)` | یک سلول از جدول پویا را با slug به‌روز می‌کند و ممیزی می‌نویسد | `INSERT/UPDATE dynamic_table_cells` + `INSERT audit_logs` | بله | نقش `admin`/`manager`؛ جدول باید `is_active` باشد |
| `auto_publish_release(p_git_sha, p_build_time, p_version, …)` | اگر برای این `git_sha` انتشاری نباشد، یک `platform_releases` با اقلام تغییر می‌سازد؛ شکل ورودی را سخت‌گیرانه اعتبارسنجی می‌کند (حداکثر ۴۰ قلم و…) | `INSERT platform_releases` + `INSERT audit_logs` | بله | idempotent روی `git_sha`؛ `SET row_security TO 'off'` دارد |
| `set_market_rate_tick_status(p_tick_id, p_status, p_note)` | وضعیت یک تیک نرخ بازار را به `accepted`/`suspect`/`rejected` می‌برد و تغییر را ممیزی می‌کند | `UPDATE market_rate_ticks` + `INSERT audit_logs` | بله | نقش `admin`/`manager`/`accountant` |
| `person_backfill_existing(p_table, p_default_kind, p_limit)` | ابزار مهاجرت: ردیف‌های یک جدول قدیمی را به هستهٔ اشخاص وصل یا شخص تازه می‌سازد و شمارش created/linked/rejected می‌دهد | `INSERT person_context_links` + `UPDATE customers`/`suppliers` | بله ولی **پرخطر** | تنها تابع `INVOKER` این فهرست که می‌نویسد؛ نیازمند `auth.uid()`. یک ابزار یک‌بارمصرفِ مهاجرت است، نه قابلیت محصول |
| `search_tokens_match(p_document, p_term)` | همهٔ توکن‌های عبارت جست‌وجو (پس از نرمال‌سازی فارسی) باید در متن باشند تا `true` بدهد | فقط می‌خواند | بله، بی‌خطر | `IMMUTABLE PARALLEL SAFE` — یک کمکیِ جست‌وجو |
| `is_valid_audit_entity_type(_entity_type)` | چک می‌کند نوع موجودیت در فهرست ثابت انواع مجاز ممیزی باشد | فقط می‌خواند | بله، بی‌خطر | `IMMUTABLE`. **UNCLEAR:** فهرست هنوز `'invoice'` را مجاز می‌داند در حالی که جدولش حذف شده؛ از بدنه معلوم نیست این عمدی است (سازگاری با ردیف‌های تاریخی ممیزی) یا جاماندگی |
| `validate_price_settlement_compatibility(p_sale_price_type_id, p_settlement_type_id)` | می‌گوید آیا مهلت تسویهٔ انتخابی از سقف مجاز آن نوع قیمت بیشتر است، و پیام فارسی آماده برمی‌گرداند | فقط می‌خواند | بله، بی‌خطر | اگر هرکدام پیکربندی نشده باشد `{"valid":true,"reason":"not_configured"}` می‌دهد |

**جمع: ۶ + ۷ + ۵ + ۵ + ۱۴ = ۳۷ ✓**

### `UNCLEAR` — جایی که بدنه هدف را روشن نمی‌کند

فقط یک مورد در کل ۳۷ تا: **`is_valid_audit_entity_type`** — همان‌طور که بالا آمد، فهرست
انواع مجازش هنوز `'invoice'` را دارد (و در همان آرایه `'sales_quote'` هم هست). از بدنه
نمی‌شود فهمید کدام‌یک درست است:

```sql
  SELECT _entity_type = ANY(ARRAY[
    'ai_provider',
    'inquiry','invoice','customer','product','profile','user_role','supplier',
    ...
    'category','brand','price_list','pricing_rule','sale_list','sales_quote',
```

سایر ۳۶ تا از روی بدنه روشن بودند.

---

## Numbers

| کمیت | مقدار | دستور/کوئری |
|---|---:|---|
| فایل `.ts`/`.tsx` در `src/` + `server/` (بدون `routeTree.gen.ts`) | ۷۰۸ | `os.walk` در `extract.py` |
| کل نقاط `.rpc(` | ۲۳۶ | شمارش در `extract.py` |
| ↳ نامِ literal حل‌شده (تک‌خطی + چندخطی) | ۲۳۲ | همان |
| ↳ پویا (ternary / متغیر) | ۴ | همان — هر ۴ در F16 حل شد |
| نقاط `rpc("…")` بدون نقطه (wrapper با `bind`) | ۸ | `grep -rhoE '(^\|[^.a-zA-Z0-9_])rpc\(\s*"[a-zA-Z0-9_]+"'` |
| نقاط cast `)("…")` | ۸ (+۱ چندخطی) | `grep -rhoE '\)\(\s*"[a-z_][a-z0-9_]+"'` |
| **کل نام‌های متمایز RPC فراخوانده‌شده** | **۲۱۳** | اجتماع همهٔ اصطلاحات بالا |
| ↳ **بدون تابع زنده در دیتابیس** | **۰** | `comm -23 rpc_all db_funcs` |
| ↳ فراخوان به تابع overloadشده (PGRST203) | ۰ | `comm -12 rpc_all overload_names` |
| فراخوان RPC با کلیدی که هیچ overload نمی‌پذیرد | ۰ | `argdiff.py`، نام‌های ورودی‌فقط |
| فراخوان RPC با آرگومان اجباریِ جامانده | ۰ | `argmiss.py`، `pronargdefaults` |
| کل نقاط `.from(` | ۱۲۱۲ | `grep -rn "\.from(" src server` |
| ↳ نام جدولِ literal | ۱۰۹۱ (۱۸۰ متمایز) | `extract.py` |
| ↳ غیر literal | ۱۲۱ | همه بررسی شد: `Array.from`/`new Set`/`.values()` و ثابت‌های bucket ذخیره‌سازی |
| **نام جدول بدون معادل زنده** | **۳** | `invoices`, `payments`, `ocr_receipts` |
| ↳ نقاط فراخوانشان | ۲۰ | ۱۲ در ماژول وارد‌نشده، ۳ صادقانه مدیریت‌شده، ۵ واقعاً فعال |
| جفت (جدول، ستون) متمایز بررسی‌شده | ۱۰۹۲ | `cols.py` روی ۷۰۰ زنجیرهٔ `from+select` |
| ↳ روی سه جدول مرده | ۲۴ | — |
| ↳ **روی جدول زنده و ناموجود** | **۳** | `inquiries.customer_name`, `inquiries.product_name` (یک فایل)، `product_computed_prices_public.sale_price`، `purchase_prices.effective_from` |
| ↳ مثبت کاذبِ parser (اصلاح‌شده) | ۱ | `missions.event_key/is_active` — select در واقع مال `gamification_kpi_rules` بود |
| توابع زندهٔ `public` (نام متمایز) | ۸۱۸ | `pg_proc` + `pg_namespace` |
| جدول‌ها و viewهای زندهٔ `public` | ۲۴۶ | `information_schema.tables` |
| ستون‌های زندهٔ `public` | ۲۶۵۷ | `information_schema.columns` |
| نام‌های overloadشده در `public` | ۱۶ (۳ تای غیر pgvector) | `group by proname having count(*)>1` |
| فایل route | ۲۱۰ | `os.walk("src/routes")` |
| ↳ بدون نشانهٔ مستقیم backend | ۵۰ | `shells.py` |
| ↳ بدون backend تا ۳ گام (بدون زیرساخت) | ۲۳ | `trans.py` با `INFRA` |
| ↳ **پوستهٔ واقعی** | **۲** | `/price-lists`، `/purchases` |
| ↳ عمداً بدون داده | ۲۱ | ۷ redirect + ۶ Outlet/shell + ۴ راهنما + ۴ زیرساخت |
| کامپوننت نمای داده بدون مسیر داده | ۰ | `comps.py` + بازبینی دستی هر ۸ مورد |
| handler خالی / toast-only / disabled ثابت | ۰ / ۰ / ۰ | سه grep در F12–F14 |
| فرم بدون مسیر نوشتن | ۰ | ۱۲ نامزد، همه رد شد (F15) |
| توابع بدون فراخوانِ درون‌دیتابیسی | ۲۳۶ | `orphans.sql` |
| ↳ **یتیم نهایی پس از ۵ پاس نجات** | **۳۷** | منهای ۲۱۳ نام فراخوانده‌شده |
| توابعی که ادعای یتیمی‌شان رد شد | ۱۰ | F16 |
| Edge Function | ۰ | F17 |
| job در `pg_cron` | — (افزونه نصب نیست) | F18 |

**بستن حساب:**
`.rpc(`: ۲۳۲ + ۴ = ۲۳۶ ✓ · آرگومان‌ها: ۲۰۸ (با شیء) + ۲۲ (بدون) = ۲۳۰، به‌علاوهٔ ۲ فراخوان
با آرگومانِ غیر literal = ۲۳۲ ✓ · `.from(`: ۱۰۹۱ + ۱۲۱ = ۱۲۱۲ ✓ · routeها: ۵۰ = ۲۷ (باواسطه
وصل) + ۲۳ (هیچ) ✓، و ۲۳ = ۲ + ۲۱ ✓ · یتیم‌ها: ۳۷ = ۶ + ۷ + ۵ + ۵ + ۱۴ ✓

---

## Coverage

### بررسی‌شده

| موضوع | روش |
|---|---|
| هر ارجاع RPC در `src/`+`server/` | استخراج برنامه‌ای ۴ اصطلاح (`.rpc("x")` تک/چندخطی، `rpc("x")` با wrapper، cast `)("x")` تک/چندخطی، نام پویا)؛ هر ۴ نقطهٔ پویا دستی حل شد |
| هر ارجاع جدول | ۱۰۹۱ نقطهٔ literal + بازبینی هر ۱۲۱ نقطهٔ غیر literal |
| ارجاع‌های ستونی | ۷۰۰ زنجیرهٔ `from`+`select` → ۱۰۹۲ جفت متمایز؛ هر ۶ نامزد شکست دستی در برابر `information_schema.columns` بررسی شد |
| شکل آرگومان | ۲۳۰ فراخوان در برابر `pg_proc`، با نام‌های **ورودی‌فقط** (`proargmodes`) و `pronargdefaults` |
| تلهٔ overload | کل `pg_proc` گروه‌بندی شد؛ هر ۳ نام غیر pgvector در برابر همهٔ منابع grep شد |
| هر route | ۲۱۰ فایل؛ ۵۰ بدون نشانه، ۲۳ بدون دسترسی، **هر ۲۳ دستی خوانده شد** |
| کامپوننت‌های نمای داده | ۲۳ کامپوننت؛ هر ۸ موردِ «بدون نشانه و بدون props» دستی بررسی شد |
| Q3 هر چهار زیرچک | چهار جست‌وجوی مستقل + بازبینی دستی هر ۴ `disabled` و هر ۱۲ فرم |
| مسیرهای نجات Q4 | Edge Functions (مخزن + stack)، `pg_cron`، `automation/`، `scripts/`، `e2e/`، رشته‌های پویا |
| بدنهٔ توابع یتیم | `pg_get_functiondef` برای هر ۳۷؛ ۳۱ بدنه کامل یا سرِ کامل خوانده شد، ۶ تا از روی سر + استخراج برنامه‌ایِ اهداف نوشتن |

### بررسی‌نشده، با دلیل

| موضوع | دلیل |
|---|---|
| اجرای واقعی در مرورگر روی `192.168.170.8:3100` | نیازمند ورود با نقش‌های مختلف. F1/F2/F4/F5 از روی کد و schema اثبات شده‌اند، ولی **پیام خطای واقعی کاربر دیده نشد** |
| ۳۳۲ نقطهٔ `.from()` که در زنجیره‌شان `.select()` نبود | این‌ها `insert`/`update`/`delete`/`count` هستند؛ بررسی ستون برایشان به یک parser دیگر نیاز داشت. **نام جدولشان بررسی شد** (در ۱۰۹۱ هست)، فقط ستون‌هایشان نه |
| ۳۳ زنجیرهٔ `select` با template یا `*` | نام ستون‌ها در زمان اجرا ساخته می‌شود |
| ستون‌های داخل `.eq()`, `.order()`, `.filter()` که در `select` نیامده‌اند | خارج از دامنهٔ parser. **استثنا:** برای هر ۳ ستون شکستهٔ F4/F5 دستی بررسی شد و `order`/`lt` هم همان نام غلط را دارند |
| منابع `.rpc` در `e2e/` | تست‌اند، نه مسیر محصول؛ فقط برای پاس نجات Q4 grep شدند |
| نگاشت ۳۷ من به ۳۵ آن ممیزی | فهرست آن ممیزی در مخزن نیست (UNVERIFIED ۱) |
| RLS/policy روی جدول‌های مرتبط | مأموریت دربارهٔ اتصال است، نه مجوز |

---

## UNVERIFIED / UNKNOWN

1. **`UNKNOWN` — فهرست ۳۵تاییِ ممیزی ۲۰۲۶-۰۹-۰۴ پیدا نشد.** جست‌وجوی
   `grep -rln "orphan|writerless|unwired" docs/` و
   `git log --since=2026-09-01 --name-only -- docs/` هیچ سندی با آن یافته نداد؛ ظاهراً در
   یک نشست تولید و هرگز commit نشده. پس **Q4.4 («برای هرکدام از ۳۵ تا که این بررسی‌ها نجات
   می‌دهند، نامش را ببر») را نمی‌توانم روی فهرست اصلی جواب بدهم.** آنچه دادم: فهرست خودم
   (۳۷) و ۱۰ نجاتِ اثبات‌شده روی آن. این تنها دلیلِ `PARTIAL` بودن Q5 است.
2. **تناقض با «ground truth» بریف.** بریف می‌گوید «`invoices` صفر ردیف دارد و یک طراحی
   موازی مرده است». [E] اندازه‌گیری من: **جدول اصلاً وجود ندارد** — migration ۳۳۲ در
   ۲۰۲۶-۰۸-۰۸ آن را `DROP` کرد. کامنت‌های داخل بدنهٔ چند تابع (که در migration ۳۳۱ نوشته
   شده‌اند) هم هنوز می‌گویند «the table holds 0 rows»، که در آن لحظه درست بود و حالا نیست.
   **این تفاوت مهم است:** «صفر ردیف» یعنی query موفق می‌شود و آرایهٔ خالی می‌دهد؛ «جدول
   نیست» یعنی PostgREST خطای `PGRST205`/`42P01` می‌دهد — و F2 دقیقاً به همین دلیل می‌ترکد
   به‌جای اینکه خالی بماند.
3. **`UNVERIFIED` — آیا `createServerFn` در دو ماژول وارد‌نشدهٔ F8 endpoint ثبت می‌کند؟**
   `src/lib/invoices/functions.ts` و `src/lib/accounting/functions.ts` را هیچ فایلی import
   نمی‌کند، و بر همین اساس آن‌ها را «بی‌استفاده» طبقه‌بندی کردم. ولی **نمی‌دانم TanStack
   Start توابع سرور را با کشفِ فایل ثبت می‌کند یا فقط از راه گراف import.** اگر اولی باشد،
   ۱۲ فراخوان به جدول‌های مرده در واقع endpointهای زنده‌اند و طبقه‌بندی باید «خراب» شود.
   بدون اجرای build و بازرسی manifest قابل تعیین نبود.
4. **`UNKNOWN` — آیا `handle_new_user` و `tg_purchase_actor_active` عمداً جدا شده‌اند.**
   [E] هیچ‌کدام به triggerی وصل نیستند (`pg_trigger` خالی). ولی از خود دیتابیس معلوم نیست
   این تصمیم بوده (مثلاً ثبت‌نام حالا از مسیر دیگری پروفایل می‌سازد) یا جاماندگی. تاریخچهٔ
   migration را برای این دو دنبال نکردم.
5. **`UNVERIFIED` — سهم ۳۳۲ نقطهٔ `.from()` بدون `.select()` در ارجاع ستونی.** ممکن است
   ستون‌های ناموجودی در `insert`/`update` وجود داشته باشد که ندیدم. نام جدولشان بررسی شده،
   ستون‌هایشان نه.
6. **`UNKNOWN` — آیا ۱۵ ستونِ `sale_price`/`effective_from` و مانند آن‌ها زمانی وجود
   داشته‌اند.** تاریخچهٔ migration برای این سه ستون دنبال نشد؛ فقط وضعیت زنده اندازه‌گیری شد.
7. **`UNKNOWN` — چرا `_app.pricing.index.tsx` شاخهٔ «به‌زودی» دارد ولی هیچ تایلی
   `enabled: false` نیست.** ممکن است تایل‌ها قبلاً غیرفعال بوده‌اند و کسی فعالشان کرده و
   شاخه را برنداشته. از کد امروز قابل تشخیص نیست.

---

## Self-check

1. **هر زیربند Q1–Q5 حکم دارد یا `UNKNOWN` با دلیل:**
   Q1.1→Numbers+F1..F8 · Q1.2→همان · Q1.3→F1,F2,F4,F5,F7,F8,F9 · Q1.4→F3 · Q1.5→F6 ·
   Q2.1→بخش Shells · Q2.2→جدول ۲۱+۲ با دلیل هر ردیف · Q2.3→پایان Shells ·
   Q3.1→F12,F13,F16 · Q3.2→F14 · Q3.3→F15 · Q3.4→جدول‌های F14/F16 ·
   Q4.1→F16,F20 · Q4.2→F17 · Q4.3→F19 · Q4.4→**UNKNOWN بند ۱** + ۱۰ نجات اثبات‌شده ·
   Q5→جدول ۳۷تایی در ۵ خوشه، با یک `UNCLEAR` صریح.
2. **حساب می‌بندد:** ۲۳۲+۴=۲۳۶ ✓ · ۱۰۹۱+۱۲۱=۱۲۱۲ ✓ · ۵۰=۲۷+۲۳ ✓ · ۲۳=۲+۲۱ ✓ ·
   ۳۷=۶+۷+۵+۵+۱۴ ✓ · ۲۳۶ بدون فراخوان − ۱۹۹ فراخوانده‌شده از frontend = ۳۷ ✓
3. **چیزی که نخواندم یا اجرا نکردم ادعا نشد.** دو مثبت کاذبِ خودم را هم صریح ثبت کردم
   (خطای `proargnames` در پاس اول آرگومان‌ها، و مثبت کاذب `missions` در بررسی ستون‌ها)، چون
   هر دو اگر تصحیح نمی‌شدند عدد نهایی را عوض می‌کردند.
4. **هیچ چیزی تغییر نکرد.** تنها فایل نوشته‌شده همین سند است؛ همهٔ کوئری‌ها read-only بودند.

**وضعیت: COMPLETE برای Q1–Q4 · PARTIAL برای Q5** — و دلیل PARTIAL یک چیز است و فقط یک چیز:
فهرست اصلی ۳۵تایی در مخزن نیست، پس نمی‌توانم بگویم جدول من همان ۳۵ را پوشش می‌دهد.
