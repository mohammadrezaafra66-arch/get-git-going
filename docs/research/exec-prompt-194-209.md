# پرامپت اجرایی جامع — نیازمندی‌های ۱۹۴ تا ۲۰۹ (خودکار، فازبندی‌شده، خودآزمون)

> **این یک مأموریت اجرایی کامل و خودکار است.** پنج فاز. هر فاز پس از اتمام، خودش تست می‌کند؛ اگر خطا بود رفع می‌کند؛ سپس checkpoint می‌زند. در پایان یک گزارش جامع می‌دهد.
> **بدون توقف برای پرسش.** همهٔ تصمیم‌ها در بخش «فرضیات» (§۰.۵) از پیش گرفته شده‌اند. اگر به ابهامی خارج از فرضیات رسیدی، محافظه‌کارانه‌ترین گزینه‌ای را که (الف) داده را نابود نمی‌کند، (ب) به تولید دست نمی‌زند، (ج) رفتار موجود را حفظ می‌کند انتخاب کن و در گزارش ثبت کن — **متوقف نشو و از کاربر نپرس.**
>
> **نحوهٔ استفاده (جلسهٔ تازه + حالت خودکار):**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read AfraKala-194-209-execution.md completely, THEN read docs/research/req-194-209-diagnosis.md completely, then execute ALL five phases autonomously without stopping for confirmation. Follow the UTF-8-safe migration method. Apply migrations live to afrakala-lan-db as you go, commit a checkpoint after each phase, and at the very end rebuild via deploy/lan/build.ps1 + up.ps1. Produce the final report at docs/execution/req-194-209-report.md.
> ```

---

## بخش ۰ — قواعد سراسری (بسیار مهم)

### ۰.۰ اولین کار
**قبل از هر چیز، کل فایل `docs/research/req-194-209-diagnosis.md` را بخوان.** آن گزارش برای هر نیازمندی جدول «دقیقاً چه چیزی برای رفع لازم است» با file:line دقیق دارد. این پرامپت **ترتیب، قواعد، تست‌ها و تصمیم‌ها** را می‌دهد؛ جزئیات جراحیِ هر رفع را از همان گزارش بردار. وقتی می‌گویم «طبق §A1»، یعنی جدول رفع بخش A1 آن گزارش.

### ۰.۱ ممنوعیت‌های مطلق (هرگز نقض نشود)
- **هرگز به تولید `192.168.170.10` دست نزن.** تمام کار روی `afrakala-lan-db` (دیتابیس `afrakala`) و `192.168.170.8` است.
- **هیچ `DROP TABLE` / `TRUNCATE` / `DELETE` روی جدول دارای داده.** فقط `CREATE OR REPLACE`، `ALTER TABLE ADD COLUMN`، `CREATE POLICY`، `INSERT` مجاز است.
- **SQL با متن فارسی = همیشه `docker cp` + `psql -f`. هرگز از pipe در PowerShell عبور نده** (یک حادثه در ۲۰۲۶-۰۷-۱۱ متن ۴۳ تابع را نابود کرد — همان چیزی که در فاز ۱ ترمیم می‌کنیم). هر فایل migration اولین خطش `SET client_encoding='UTF8';` و اجرا با `--single-transaction` / `-v ON_ERROR_STOP=1`.
  ```powershell
  $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
  docker cp "D:\AfraKalaTest\app\supabase\migrations\<FILE>.sql" afrakala-lan-db:/tmp/mig.sql
  docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig.sql
  ```
  (اگر socket auth رد کرد، روی TCP وصل شو — `supabase_admin` همان `POSTGRES_PASSWORD` را دارد.)
- **قبل از هر `CREATE OR REPLACE FUNCTION`، اول `pg_get_functiondef` بگیر و فقط همان بخشی را که باید عوض کنی تغییر بده** (جلوگیری از near-miss). بقیهٔ بدنه byte-identical بماند.
- **فایل migration قدیمی را ویرایش نکن** — برای هر تغییر DB یک migration **جدید** بساز.
- هیچ کلید/رمز چاپ نشود.

### ۰.۲ نام‌گذاری migration
`20260728<HHMMSS>_2<NN>_<name>.sql` — شماره را از آخرین migration موجود ادامه بده (پوشه را `ls` کن تا تکراری نشود؛ آخرین‌ها حوالی ۲۱۹‌اند).

### ۰.۳ دستور خودکار (Autonomy)
- **بدون توقف اجرا کن.** بین فازها یا مراحل، منتظر تأیید نمان.
- همهٔ تصمیم‌های باز در §۰.۵ پاسخ داده شده‌اند. اگر ابهام تازه‌ای دیدی: محافظه‌کارترین گزینهٔ امن را بگیر، در گزارش زیر «تصمیم‌های خودکار» ثبت کن، ادامه بده.
- **حلقهٔ رفع با سقف:** اگر تست یک فاز رد شد، تا **۳ دور** تلاش کن رفعش کنی و دوباره تست بزنی. اگر بعد از ۳ دور هنوز رد است: آن فاز را **commit نکن**، در گزارش «مسدود (BLOCKED)» علامت بزن با کل خروجی خطا، و طبق §۰.۴ ادامه بده.

### ۰.۴ وابستگی فازها و رفتار هنگام شکست
- **فاز ۱ پیش‌نیاز فاز ۳ است** (توابع اعتبار باید سالم شوند). اگر فاز ۱ مسدود شد ⟹ فاز ۳ را **رد کن** (اجرا نکن)، ولی فاز ۲ و ۴ مستقل‌اند و می‌توانند اجرا شوند.
- فاز ۲ و فاز ۴ کاملاً مستقل‌اند.
- در پایان، هر فاز مسدود را در گزارش با دلیل و راه پیشنهادی بیاور.

### ۰.۵ تست هر فاز — چه چیزی خودکار قابل‌تست است
تست‌های خودکاری که تو **می‌توانی** انجام دهی (بدون مرورگر):
1. **SQL:** شمارش ردیف، `pg_get_functiondef` (تأیید نبود `???`)، بررسی سیاست‌ها (`pg_policies`)، بررسی ستون‌ها (`information_schema`).
2. **تست رفتاری با JWT شبیه‌سازی‌شده داخل `BEGIN … ROLLBACK`** (همان روشی که در رفع سه‌باگ قبلی استفاده شد — INSERT/UPDATE آزمایشی با نقش‌های مختلف، بدون تغییر دائمی داده).
3. **`bun run build` سبز** (گیت اصلی کیفیت).
4. **typecheck baseline دقیقاً ۷۰ بماند** (`npx tsc --noEmit` → شمارش خطا؛ اگر بیشتر از ۷۰ شد یعنی کد جدید چیزی شکسته). قبل از شروع، baseline را یک بار بگیر و ثبت کن.
تست‌هایی که **نمی‌توانی** انجام دهی (مرورگر/بصری) را در گزارش زیر «تست‌های مرورگری برای کاربر» فهرست کن — انجامشان نده.

### ۰.۶ Checkpoint
پایان هر فاز موفق: `git add` فایل‌های همان فاز + `git commit` با پیام واضح. این‌طور هر فاز مستقل قابل‌بازگشت است.

---

## بخش ۰.۵ — فرضیات (تصمیم‌های از پیش گرفته‌شده — بدون پرسش اجرا کن)

| # | موضوع | تصمیم |
|---|---|---|
| ۱ | **مشتری مهمان (۱۹۷)** | چک اعتبار **فقط وقتی مشتری متصل است** اعمال شود. پیش‌فاکتور مهمان (بدون مشتری) **مجاز** بماند ولی با فیلد/نشان «بدون بررسی اعتبار — مهمان» ثبت شود (بلاک سخت نشود، تا workflow فعلی نشکند). این را در گزارش برجسته کن تا کاربر بعداً تصمیم بگیرد سخت‌گیرانه‌ترش کند. |
| ۲ | **حداقل بیعانه (۱۹۷)** | ۳۰٪ مبلغ کل (مطابق `MIN_RATIO = 0.3` در ماژول آماده). قابل‌تغییر، در گزارش ذکر شود. |
| ۳ | **دلیل رد (۱۹۵)** | ستون **جدید** `reject_reason` (از `cancel_reason` استفادهٔ مجدد نکن). |
| ۴ | **کف قیمت (۱۹۴)** | کف روی **قیمت مؤثر خط** بررسی شود `(_qty*_price - _disc)/_qty < _floor` تا حفرهٔ تخفیف بسته شود. قفل `unit_price` برای نقش sales بماند و فقط با تیک «با مسئولیت خودم» override شود. مقدار override در ستون‌های جدید ثبت شود. |
| ۵ | **عرض سایدبار (۲۰۹-الف)** | `20rem` از طریق override در `AppShell.tsx` (گزینهٔ ب گزارش)، نه دست‌زدن به فایل shadcn. |
| ۶ | **PDF پیش‌فاکتور (۲۰۳-ج)** | بازنویسی به روش HTML + `html2canvas-pro` + `jsPDF` (گزینهٔ ب، همان که در `sale-list-pdf.ts` ثابت شده کار می‌کند). گزینهٔ الف (فقط تعمیر pdfmake) را **انتخاب نکن** چون فارسی را خراب نگه می‌دارد. |
| ۷ | **کد آسان صراف (۲۰۷)** | گزینهٔ الف گزارش (فیلتر شرطی فرانت: قوانین `journal_entry` مربوط به گیرنده فقط در حالت ۱ اعمال شوند). حالت ۱ دست‌نخورده. گارد سرور سر جایش. |
| ۸ | **چت AI (۲۰۸)** | گزینهٔ ب گزارش (رفع کد): مسیر استریم چت اولین ارائه‌دهندهٔ `kind === "ollama"` را انتخاب کند، نه `providers[0]`. بدون تغییر config. (اصلاح `base_url` GPT اختیاری/بهداشتی.) |
| ۹ | **ویزیتور (۲۰۳-الف)** | `visitor_id` روی `sales_quotes` **nullable** (۲۲ پیش‌فاکتور موجود ویزیتور ندارند). در فرم صدور اختیاری. |
| ۱۰ | **عدد به حروف (۲۰۳-ب)** | ماژول داخلی `~۶۰ خطی`، بدون کتابخانهٔ خارجی. |
| ۱۱ | **متن‌های بازسازی‌شدهٔ ۱۴۹/۱۵۵ (۲۰۵)** | چون متن اصلی از بین رفته، از تابع خواهرِ سالم `20260502082111_ff7e5e06-*.sql` بازسازی کن. **همهٔ متن‌های بازسازی/بازنویسی‌شده را در گزارش فهرست کن** تا کاربر مرور کند (این تنها جای «حدس» است و باید شفاف باشد). |

---

# فاز ۱ — ترمیم encoding + صراف + چت AI (فاز رفع انسداد)

> **چرا اول:** ترمیم ۴۳ تابع خراب، **پیش‌نیاز فاز ۳** است (توابع `hold_credit`, `get_customer_credit`, `release_credit` جزو خراب‌ها هستند). و باگ فیش/صراف مستقل رفع می‌شود.

## ۱-الف: ترمیم ۴۳ تابع DB با متن فارسی نابودشده [۲۰۵-ب]
طبق §C1 گزارش:
1. فهرست کامل توابع خراب را بگیر:
   ```sql
   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
     AND p.prosrc ~ '\?\?\?' ORDER BY 1;
   ```
2. برای هر تابع، آخرین migration سالم در گیت را پیدا کن (`grep -l "FUNCTION public.<name>(" supabase/migrations/*.sql`) و متن سالمش را استخراج کن.
3. **۱۴۹ و ۱۵۵ استثنا:** سورس‌شان در گیت هم خراب است. متن‌شان را از تابع خواهر `20260502082111_ff7e5e06-*.sql` بازسازی کن (طبق فرضیهٔ ۱۱). هر متن بازسازی‌شده را برای گزارش نگه دار.
4. یک migration **واحد** بساز که همهٔ ۴۳ تابع را با `CREATE OR REPLACE` و متن فارسی سالم بازتعریف کند. (بدنهٔ منطقی هر تابع دست‌نخورده؛ فقط رشته‌های `???` با متن سالم جایگزین شوند — از `pg_get_functiondef` فعلی به‌عنوان مبنا استفاده کن و فقط رشته‌ها را ترمیم کن.)
5. با روش UTF-8-safe اجرا کن (`docker cp` + `-f`، `--single-transaction`).

**تست ۱-الف:**
```sql
SELECT count(*) AS still_corrupted FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ~ '\?\?\?';
```
باید `0` شود. اگر نشد، تابع باقی‌مانده را پیدا و ترمیم کن (حلقهٔ رفع).

## ۱-ب: کد آسان گیرنده در حالت ۲ اختیاری شود [۲۰۵-الف + ۲۰۷]
طبق §C2 گزارش، گزینهٔ الف:
- در `PaymentReceiptForm.tsx` (حوالی خط ۱۰۸۰، جایی که قوانین `journal_entry` با `receipt` ادغام و `evaluateRules` صدا زده می‌شود): قبل از ارزیابی، اگر `receiver_party_id` مقدار دارد (یعنی حالت ۲ فعال است)، قوانین مربوط به فیلدهای گیرنده (`receiver_accounting_code` و در صورت لزوم `payer_accounting_code` اگر مانع حالت ۲ شود) را از فهرست قوانین **فیلتر کن**.
- **فقط حالت ۲ متأثر شود.** حالت ۱ (حساب بانکی خودمان) باید کد آسان اجباری بماند. گارد سرور `post_receipt_accounting` دست‌نخورده بماند.

**تست ۱-ب:** `bun run build` سبز؛ typecheck ۷۰. (تست رفتاری کامل مرورگری است — برای کاربر فهرست کن.)

## ۱-ج: چت AI ارائه‌دهندهٔ Ollama را انتخاب کند [۲۰۸-چت]
طبق §D1 گزارش، گزینهٔ ب:
- در `src/routes/api/messenger/ai-chat.ts` (حوالی خط ۱۶۷-۲۰۰) و منطق `resolveProviderForCapability`: به‌جای برداشتن `providers[0]`، روی ارائه‌دهندگان capability=`chat` حلقه بزن و اولین `provider.kind === "ollama"` را انتخاب کن (چون فقط Ollama در این مسیر استریم می‌کند). اگر هیچ Ollama نبود، همان رفتار خطای فعلی.
- (اختیاری/بهداشتی) اگر آسان بود، `base_url` ارائه‌دهندهٔ «جی پی تی» را در نظر بگیر — ولی این ضروری نیست؛ اولویت با رفع کد بالاست.

**تست ۱-ج:** `bun run build` سبز؛ typecheck ۷۰.

**Checkpoint فاز ۱:** commit با پیام مثل `fix(db,receipts,ai): repair 43 corrupted function texts, make sarraf accounting-code optional in mode 2, route messenger chat to ollama`.

---

# فاز ۲ — باگ‌ها و بهبودهای مستقل فرانت

> کاملاً مستقل. اگر فاز ۱ مسدود شد، این باز هم اجرا شود.

## ۲-الف: PDF پیش‌فاکتور — بازنویسی به روش سالم [۲۰۳-ج، گزینهٔ ب]
طب §B3 گزارش:
- `src/lib/sales/quote-pdf.ts` را بر اساس معماری `src/lib/pdf/sale-list-pdf.ts` بازنویسی کن: ساخت HTML خودکفا با `dir="rtl"` و `@font-face` وزیرمتن از `/fonts/vazirmatn/*`, رندر در iframe مخفی → `html2canvas-pro` → برش A4 → `jsPDF`. الگوی کامل: `sale-list-pdf.ts:637-720`.
- هر دو مسیر مصرف‌کننده (`$quoteId.tsx:505` و `quotes.index.tsx:613`) با همین تابع درست می‌شوند.
- محتوای docDefinition فعلی (جدول اقلام، جمع‌ها، فوتر) باید در HTML بازتولید شود؛ چیزی از اطلاعات کم نشود.

**تست ۲-الف:** `bun run build` سبز؛ typecheck ۷۰. (کیفیت بصری PDF مرورگری است — برای کاربر.)

## ۲-ب: عدد به حروف فارسی [۲۰۳-ب]
طبق §B2:
- ماژول جدید `src/lib/i18n/number-to-words.ts` → `numberToPersianWords(n: number): string`. پوشش: یکان/دهگان/صدگان، هزار/میلیون/میلیارد، صفر، منفی. (اعشار لازم نیست.)
- تست واحد کوچک برای مقادیر مرزی (۰، ۱۱-۱۹، ۱۰۰، ۱۰۰۱، ۱۰۶، سقف ۱e۱۲).
- نمایش در صفحهٔ جزئیات پیش‌فاکتور زیر «مبلغ نهایی» (`$quoteId.tsx`) و در PDF جدید (بلوک جدا برای پرهیز از مشکل BiDi، طبق هشدار §B2).

**تست ۲-ب:** تست واحد پاس؛ `bun run build` سبز؛ typecheck ۷۰.

## ۲-ج: عرض سایدبار [۲۰۹-الف، گزینهٔ ب]
طبق §E1:
- در `src/components/layout/AppShell.tsx:17`: `<SidebarProvider style={{ "--sidebar-width": "20rem" } as React.CSSProperties}>`. فایل `src/components/ui/sidebar.tsx` را دست نزن.

**تست ۲-ج:** `bun run build` سبز؛ typecheck ۷۰.

**Checkpoint فاز ۲:** commit مثل `fix(pdf,ui): rewrite quote PDF via html2canvas, add Persian number-to-words, widen sidebar to 20rem`.

---

# فاز ۳ — قوانین کاری پیش‌فاکتور (migration مشترک RPC)

> **پیش‌نیاز: فاز ۱ موفق شده باشد** (توابع اعتبار سالم). اگر فاز ۱ مسدود است، این فاز را رد کن و در گزارش ثبت کن.
> ⚠️ ۳-ب و ۳-ج هر دو امضای `create_sales_quote_with_items` را عوض می‌کنند ⟹ **در یک migration واحد** انجام شوند تا دو بار rebuild لازم نشود. ۳-الف (رد) تابع دیگری است و می‌تواند migration جدا داشته باشد.

## ۳-الف: دلیل رد پیش‌فاکتور [۱۹۵]
طبق §A2 (جدول ۷‌ردیفی رفع):
- ستون جدید `reject_reason text` روی `sales_quotes`.
- در `update_sales_quote_status`: اجبار دلیل برای `rejected` (به سبک بلوک `canceled`) + نوشتن `reject_reason = p_reason` در شاخهٔ `rejected` (در همان تراکنش تغییر وضعیت، چون `rejected` نهایی است).
- فرانت: حذف شرط `data.next === "canceled"` در `quote-status.functions.ts:106`؛ افزودن `needsReason: true` به دکمهٔ رد (`$quoteId.tsx:486`)؛ تفکیک برچسب دیالوگ «دلیل لغو»/«دلیل رد»؛ نمایش دلیل رد در صفحهٔ جزئیات.

## ۳-ب: تخفیف زیر قیمت لیست با تأییدیه + بستن حفرهٔ تخفیف [۱۹۴/۱۹۶]
طبق §A1 (جدول ۸‌ردیفی رفع) + فرضیهٔ ۴:
- ستون‌های جدید روی `sales_quotes`: `below_list_price_ack boolean NOT NULL DEFAULT false`, `below_list_price_ack_at timestamptz`, `below_list_price_ack_by uuid`, `list_price_snapshot numeric`.
- پارامتر `p_below_list_ack boolean DEFAULT false` به `create_sales_quote_with_items`.
- بلوک «Phase J»: `RAISE EXCEPTION` کف قیمت را شرطی کن — فقط اگر `p_below_list_ack = false` بلاک شود؛ در غیر این صورت مقدار در ستون‌ها ثبت و اجازه داده شود.
- **حفرهٔ تخفیف:** کف را روی **قیمت مؤثر خط** بررسی کن: `(_qty*_price - _disc)/_qty < _floor` (نه فقط `_price`).
- فرانت: state `belowListAck` + چک‌باکس + `AlertDialog` با **متن دقیق**:
  > «از این گزینه فقط در صورتی که ۱۰۰٪ از مدیر مربوط تأییدیه گرفته‌اید استفاده نمایید؛ در غیر این صورت عواقب این تصمیم به عهدهٔ شخص صادرکنندهٔ پیش‌فاکتور است»
  - باز کردن `unit_price` برای sales فقط وقتی تیک زده شده؛ ارسال `p_below_list_ack` در `saveMutation`؛ نشان «زیر قیمت لیست — با مسئولیت صادرکننده» در صفحهٔ جزئیات. الگو: دیالوگ خط ۵۹۳ و هشدار ناموجودی دو-کلیکی.

## ۳-ج: اعتبار مشتری + بیعانه [۱۹۷/۱۹۸]
طبق §A3 (جدول ۷‌ردیفی رفع) + فرضیات ۱ و ۲:
- ستون‌های جدید روی `sales_quotes`: `deposit_amount numeric`, `commitment_confirmed boolean NOT NULL DEFAULT false`, `credit_check_snapshot jsonb`.
- پارامترهای `p_deposit_amount numeric DEFAULT NULL`, `p_commitment_confirmed boolean DEFAULT false` به RPC.
- داخل RPC پیش از INSERT: اگر `p_customer_id IS NOT NULL` → `get_customer_dynamic_credit` را صدا بزن؛ اگر `available_credit < _sum_final` **و** بیعانهٔ معتبر (`deposit >= 0.3 * _sum_final` و `commitment_confirmed = true`) داده نشده → `RAISE EXCEPTION` با متن فارسی روشن. قانون ۳۰٪ در **DB** هم تکرار شود، نه فقط فرانت.
- **مشتری مهمان (فرضیهٔ ۱):** اگر `p_customer_id IS NULL`، چک اعتبار اعمال نشود؛ فقط اجازه بده و در `credit_check_snapshot` علامت «guest» بگذار. (بلاک سخت نشود.)
- فرانت: mount کردن الگوی `AdvancePaymentSection` (از `src/shared/components/AdvancePaymentSection.tsx`) در فرم پیش‌فاکتور، مشروط به «اعتبار کافی نیست»؛ کوئری real-time اعتبار روی `linkedCustomerId` (الگو: `InvoiceForm.tsx:152-182`). **توجه:** این کامپوننت‌ها روی مسیر مردهٔ `invoices` هستند — کد را به‌عنوان **الگو** استفاده کن، برای `sales_quotes` تطبیق بده (نه import مستقیم اگر به invoice گره خورده).
- ⚠️ `hold_credit`/`release_credit` امضای `p_invoice_id` دارند؛ برای `sales_quotes` یا wrapper بنویس یا امضا را با یک پارامتر عمومی تطبیق بده (بدون شکستن مصرف‌کنندهٔ invoice — که مرده است، پس امن). این توابع در فاز ۱ سالم شده‌اند.

**migration مشترک ۳-ب+۳-ج:** یک فایل واحد که هم ستون‌های ۳-ب و ۳-ج را اضافه کند و هم `create_sales_quote_with_items` را یک‌بار با همهٔ پارامترها و منطق جدید `CREATE OR REPLACE` کند.

**تست فاز ۳ (رفتاری، داخل `BEGIN … ROLLBACK`، با JWT شبیه‌سازی):**
1. رد بدون دلیل → باید `RAISE EXCEPTION` بدهد؛ با دلیل → موفق و `reject_reason` نوشته شود.
2. صدور زیر قیمت لیست بدون `p_below_list_ack` → بلاک؛ با `p_below_list_ack=true` → موفق و ستون‌های ack پر شوند.
3. **حفرهٔ تخفیف:** قیمت روی کف + تخفیف زیاد بدون ack → باید حالا بلاک شود (قبلاً نمی‌شد).
4. مشتری با اعتبار ناکافی بدون بیعانه → بلاک؛ با بیعانهٔ ≥۳۰٪ + تعهد → موفق.
5. مشتری مهمان (بدون `p_customer_id`) → موفق (بدون چک اعتبار).
6. `bun run build` سبز؛ typecheck ۷۰.

**Checkpoint فاز ۳:** commit مثل `feat(sales): reject reason, below-list override with discount-hole closed, credit check + deposit path on pre-invoices`.

---

# فاز ۴ — ساخت‌های جدید

> مستقل. آخر چون بزرگ‌ترین‌اند.

## ۴-الف: موجودیت ویزیتور [۲۰۳-الف]
طبق §B1 (جدول ۸‌ردیفی) + فرضیهٔ ۹:
- جدول `public.visitors` (`id`, `full_name NOT NULL`, `code UNIQUE`, `phone`, `is_active DEFAULT true`, `sort_order`, `notes`, `created_at/updated_at`, `created_by`).
- RLS: خواندن `admin,manager,sales`؛ نوشتن `admin,manager` (الگو: سیاست‌های `settlement_types`).
- ستون `visitor_id uuid REFERENCES visitors(id)` روی `sales_quotes` (**nullable**).
- پارامتر `p_visitor_id uuid DEFAULT NULL` + اعتبارسنجی فعال‌بودن + نوشتن در INSERT (در همان migration مشترک فاز ۳ اگر آن اجرا شده، وگرنه migration جدید که RPC را دوباره `CREATE OR REPLACE` کند — مراقب باش امضای فاز ۳ را حفظ کنی).
- صفحهٔ CRUD `_app.admin.visitors.tsx` (الگوی کامل: `_app.admin.payment-terms.tsx`).
- ورودی در `src/lib/navigation/registry.ts` (گروه و `module` مناسب).
- `<Select>` ویزیتور در `quotes.new.tsx` (کپی الگوی «نوع تسویه»).
- نمایش ویزیتور در صفحهٔ جزئیات + PDF (تابع جدید فاز ۲) + فهرست.
- نوع‌های Supabase (`src/integrations/supabase/types.ts`) را برای جدول و ستون جدید به‌روز کن (دستی، چون CLI در دسترس نیست — الگوی سایر جداول).

## ۴-ب: drag-resize سایدبار [۲۰۹-ب]
طبق §E1 (جدول ۹‌ردیفی):
- `width`/`setWidth` به `SidebarContextProps`؛ `--sidebar-width` از ثابت به state؛ کامپوننت `SidebarResizeHandle` با `onPointerDown → pointermove → delta → setWidth`.
- **RTL:** اپ `dir="rtl"` و سایدبار سمت راست — علامت delta برعکس LTR (از الگوی `data-side=right` پیروی کن).
- clamp بین `3rem` و `~24rem`؛ ذخیره در `localStorage` (`sidebar_width`) با خواندن در `useEffect` (پرهیز از hydration mismatch در SSR)؛ حذف `transition-[width]` هنگام درگ؛ غیرفعال روی موبایل؛ mount handle در `AppSidebar`.
- ⚠️ این ناگزیر `src/components/ui/sidebar.tsx` را لمس می‌کند — تغییرات را با کامنت واضح `// AfraKala: drag-resize` علامت بزن.

**تست فاز ۴:**
1. `visitors` ساخته شد + RLS درست (`pg_policies`)؛ INSERT آزمایشی با `visitor_id` در rollback موفق.
2. `bun run build` سبز؛ typecheck ۷۰. (رفتار درگ مرورگری است — برای کاربر.)

**Checkpoint فاز ۴:** commit مثل `feat(sales,ui): visitor entity with CRUD and quote link, drag-resizable RTL sidebar`.

---

# فاز نهایی — rebuild و deploy

پس از اتمام همهٔ فازهای موفق:
```powershell
.\deploy\lan\build.ps1
.\deploy\lan\up.ps1
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
```
- تأیید کن `APP_GIT_SHA` = HEAD جدید و همهٔ سرویس‌های `afrakala-lan-*` `Up`، `db-role-fix` `Exited (0)`.
- اگر build شکست خورد، خطا را در گزارش بیاور (این نقطه بحرانی است چون کد فرانت بدون آن روی سرور نمی‌آید).

---

# گزارش نهایی — `docs/execution/req-194-209-report.md`

گزارش **بسیار کامل** بنویس با این بخش‌ها:

### ۱. جدول وضعیت هر نیازمندی
| # | نیازمندی | وضعیت نهایی (✅ انجام / 🚫 مسدود / ⏭ رد به‌خاطر وابستگی) | فاز | migration/فایل‌ها |

### ۲. فهرست migrationها
هر migration: شماره، هدف یک‌خطی، جداول/توابع متأثر.

### ۳. فایل‌های فرانت تغییرکرده
per فاز.

### ۴. 🔴 متن‌های فارسی بازسازی‌شده (برای مرور کاربر)
**همهٔ** رشته‌هایی که در ۱-الف بازسازی/بازنویسی شدند (به‌خصوص ۱۴۹/۱۵۵) — متن قدیمی خراب کنار متن جدید. این تنها جای «حدس» است و کاربر باید تأیید کند.

### ۵. حفره‌های امنیتی بسته‌شده
حفرهٔ تخفیف (۱۹۴) + وضعیت مشتری مهمان (۱۹۷، طبق فرضیهٔ ۱) — و توضیح اینکه مهمان بلاک سخت نشد و کاربر می‌تواند سخت‌گیرانه‌ترش کند.

### ۶. نتایج تست هر فاز
خروجی تست‌های SQL/رفتاری/build/typecheck per فاز. baseline typecheck اول و آخر.

### ۷. تصمیم‌های خودکار
هر ابهام تازه‌ای که خودت تصمیم گرفتی.

### ۸. تأیید rebuild
`APP_GIT_SHA` نهایی + وضعیت سرویس‌ها.

### ۹. ⚙️ کارهای دستی باقی‌مانده برای کاربر (که Claude Code نمی‌تواند انجام دهد)
- **دانش سازمانی (۲۰۸):** اجرای دکمهٔ نمایه‌سازی از `/knowledge` (نیازمند مرورگر). `knowledge_document_chunks` الان ۰ است.
- **موجودی انبار (۲۰۲):** پر کردن `warehouse_stock` با تعداد واقعی (دادهٔ کسب‌وکاری — نمی‌توان حدس زد).
- (اگر فاز ۱-ج `base_url` GPT را نگرفت) اصلاح آن در `/admin/ai-providers`.

### ۱۰. 🧪 تست‌های مرورگری برای کاربر (چک‌لیست شماره‌گذاری‌شده)
برای **هر** نیازمندی، مرحله‌به‌مرحله بگو کاربر در مرورگر چه کند تا تأیید کند کار می‌کند (با `Ctrl+Shift+R`). این بخش را کامل و دقیق بنویس چون کاربر با آن نتیجه را می‌سنجد.

---

# بخش نهایی — یادآوری‌های حیاتی
- **بدون توقف، بدون پرسش.** تصمیم‌ها در §۰.۵. ابهام تازه → محافظه‌کارترین گزینهٔ امن + ثبت در گزارش.
- **تولید `.10` را هرگز لمس نکن. `DROP/TRUNCATE/DELETE` روی داده ممنوع.**
- **متن فارسی همیشه `docker cp` + `-f`، هرگز pipe.** هر migration `SET client_encoding='UTF8'` + `--single-transaction` + `ON_ERROR_STOP`.
- **قبل از `CREATE OR REPLACE`، `pg_get_functiondef` + diff.**
- **حلقهٔ رفع سقف ۳ دور؛ فاز شکست‌خورده commit نشود و BLOCKED علامت بخورد.**
- **فاز ۳ به فاز ۱ وابسته است.** فاز ۲ و ۴ مستقل.
- **typecheck baseline ۷۰؛ build سبز گیت اصلی.**
- checkpoint commit پس از هر فاز موفق؛ rebuild فقط در فاز نهایی.
- گزارش: فارسی، بسیار کامل، با شواهد و خروجی تست.