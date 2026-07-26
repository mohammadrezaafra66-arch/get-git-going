# پکیج K — واحد پول (Rial/Toman) — آیتم ۱۹۱

**خلاصه پکیج:** بررسی عمیق نشان می‌دهد که **کل داده‌های پولی در دیتابیس به «تومان» ذخیره می‌شوند** (نه ریال)، و هیچ ضریب تبدیل ریال↔تومان در مسیر ذخیره‌سازی وجود ندارد — تنها یک تبدیل `÷۱۰` در OCR رسید هست که ریالِ روی فیش بانکی را به تومان برمی‌گرداند. مشکل اصلی این است که **تابع نمایش پیش‌فرض `formatCurrency` واحد را «ریال» فرض می‌کند**، و در نتیجه دو زیرسیستم — **فاکتور/پیش‌فاکتور (InvoiceForm) و اعتبار مشتری** و **سرمایهٔ پویا (dynamic-capital)** — همان اعداد تومانی را با برچسب «ریال» نشان می‌دهند. این یعنی ریسک واقعی خطای ۱۰ برابری بین ماژول‌ها. ماژول‌های قیمت‌گذاری، پیش‌فاکتور فروش (quotes)، نرخ ارز، رسیدها و مطالبات به‌درستی «تومان» را نشان می‌دهند.

---

## K2 — تابع/کامپوننت مشترک فرمت پول

**تابع کانونیک:** `src/lib/i18n/formatters.ts:12`
```ts
export function formatCurrency(n, currency = "ریال"): string {   // ← پیش‌فرض «ریال»
  return `${formatNumber(n)} ${currency}`;
}
```
- `formatNumber` (خط ۷) فقط عدد را انگلیسی‌جدا و به رقم فارسی تبدیل می‌کند؛ هیچ ضرب/تقسیمی روی مقدار انجام نمی‌دهد.
- **این تابع همه‌جا استفاده نمی‌شود.** بسیاری از ماژول‌ها فرمت محلی خودشان را دارند:
  - `formatNumber(x) + " تومان"` (quotes، ProductPriceCard)
  - `fmtMoney(x) + " ریال"` (dynamic-capital: `src/routes/_app.accounting.dynamic-capital.tsx:73`)
  - تابع محلی `تومان` در receivables (`_app.accounting.receivables.tsx:106`) و purchase card (`PurchaseRequestCard.tsx:25`)
- **نکتهٔ کلیدی:** پیش‌فرض بودن «ریال» در `formatCurrency` یک تلهٔ طراحی است؛ هر فراخوانی که فراموش کند `"تومان"` را پاس بدهد، بی‌سروصدا مقدار تومانی را «ریال» برچسب می‌زند. تنها فراخوانی که این پیش‌فرض را استفاده می‌کند: `_app.operations.receipts.tsx:286`.

**شاهد اینکه واحد داخلی «تومان» است (نه ریال):**
- ستون‌های DB با نام صریح: `product_computed_prices.purchase_price_toman`, `currency_rates.rate_to_toman`.
- موتور قیمت‌گذاری `src/lib/pricing/engine.ts:64-68,138,265` همه‌چیز را در تومان محاسبه می‌کند (`purchase_price_toman = input_purchase_price × currency_rate`؛ `final_sale_price = purchase_price_toman + shipping + margin`).
- `roundSalePrice` در `src/lib/pricing/constants.ts` کامنت «گرد کردن قیمت تومانی».
- OCR رسید `src/lib/accounting/receipt-extraction.ts:196-201`: اگر واحدِ روی فیش «ریال» باشد → `Math.round(n / 10)` و هشدار «مبلغ به ریال بود؛ به تومان تبدیل شد». یعنی مقدار ذخیره‌شده در `payment_receipts.amount` **تومان** است.
- فرم رسید `PaymentReceiptForm.tsx:1667` برچسب ورودی «مبلغ (تومان)»؛ اعتبارسنجی خط ۲۰۹ «حداکثر ۱۰۰۰ میلیارد تومان».

---

## K1 — بررسی ماژول‌به‌ماژول (واحد ذخیره‌شده / نمایش)

### ۱) محصولات و قیمت‌گذاری
- **DB:** `products` هیچ ستون `base_price` **ندارد** (تأیید‌شده با `information_schema` — ۲۵ ستون، بدون قیمت). قیمت‌ها در `purchase_prices.purchase_price` و `product_computed_prices` (`final_sale_price`, `rounded_sale_price`, `purchase_price_toman`, `margin_amount`, `shipping_cost`, `currency_rate`) نگهداری می‌شوند — همه `numeric`.
- **واحد ذخیره:** تومان. نمونهٔ واقعی: `final_sale_price=99,990,000`, `purchase_price_toman=99,990,000` (سقف دادهٔ تستی).
- **نمایش:** تومان — `ProductPriceCard.tsx:157,359`؛ sale-lists با `formatCurrency(x,"تومان")` (`_app.pricing.sale-lists_.$listId.tsx:1744` و ده‌ها جای دیگر).
- **ناسازگاری:** ندارد. ✅

### ۲) پیش‌فاکتور فروش (sales_quotes / sales_quote_items)
- **DB:** `sales_quotes.final_amount/subtotal_amount/discount_amount`, `sales_quote_items.unit_price/line_total/discount_amount` — `numeric`. نمونه: `final_amount` تا `63,000,000` (۵ ردیف موجود).
- **منبع unit_price:** از قیمت تومانی محصول تغذیه می‌شود (همان `get_product_sale_price`).
- **نمایش:** تومان — `_app.sales.quotes.$quoteId.tsx:220,230,326`، `_app.sales.quotes.new.tsx:503,511`، و PDF `quote-pdf.ts:148-150,251` («قیمت واحد (تومان)»).
- **ناسازگاری:** ندارد. ✅

### ۳) فاکتور/پیش‌فاکتور رسمی (invoices / invoice_items)  ⚠️ کانون مشکل
- **DB:** `invoices.total_amount/subtotal/discount_amount/tax_amount/deposit_amount/settled_amount`, `invoice_items.unit_price/line_total` — `numeric`. (۰ ردیف داده — بدون نمونهٔ واقعی، واحد از مسیر داده استنتاج شد.)
- **منبع unit_price:** مستقیماً از قیمت **تومانی** — `InvoiceForm.tsx:892` فراخوانی RPC `get_product_sale_price` و `form.setValue("unit_price", n)` (خط ۹۰۱)؛ همچنین `product_computed_prices_public.rounded_sale_price` (خط ۹۵۳-۹۶۲). تابع `get_product_sale_price` (regprocedure، `pg_get_functiondef`) `SELECT new_sale_price FROM product_sale_price_history` برمی‌گرداند که تومانی است (`ProductPriceCard.tsx:157` همان `new_sale_price` را «تومان» نشان می‌دهد).
- **نمایش:** **«ریال»** — `InvoiceForm.tsx:598,602,607,617,808` («{formatNumber(totalAmount)} ریال»، اعتبار/بدهی/بیعانه)، و پیام‌های خط ۳۲۳ و ۳۶۶.
- **ناسازگاری: بله — بحرانی.** عددِ تومانی با برچسب «ریال» → خطای ۱۰ برابری. همان قیمتی که در quote «۵۰٬۰۰۰٬۰۰۰ تومان» دیده می‌شود، در فاکتور «۵۰٬۰۰۰٬۰۰۰ ریال» نمایش داده می‌شود.

### ۴) رسیدهای پرداخت (payment_receipts.amount)
- **DB:** `amount numeric`. (۰ ردیف داده.) `parsed_amount` (ستون جدا، خروجی OCR).
- **واحد ذخیره:** تومان (OCR با `÷۱۰` ریال را به تومان می‌برد — `receipt-extraction.ts:196`؛ فرم برچسب «مبلغ (تومان)»).
- **تخصیص:** رسید به فاکتور/quote گره می‌خورد با `Number(q.final_amount) - paid` (`PaymentReceiptForm.tsx:678`) — هر دو تومان، داخلاً سازگار.
- **نمایش (صف بازبینی):** `_app.operations.receipts.tsx:286` مقدار `parsed_amount` را با `formatCurrency(...)` **بدون** واحد → پیش‌فرض «ریال». مقدار تومانی، برچسب ریال. ⚠️ ریسک.

### ۵) سرمایه/اعتبار (daily_capital_snapshots, customer_capital_allocations, credit)  ⚠️ کانون مشکل
- **DB:** `daily_capital_snapshots.final_capital/system_suggested_capital/total_payables/total_receivables`؛ `customer_capital_allocations.final_amount/held_amount/consumed_amount/system_suggested_amount` — `numeric`. نمونه: `final_capital=31,650,000,000`.
- **نمایش:** **«ریال»** در سرتاسر — `dynamic-capital.tsx:315` (Label ورودی «سرمایه کل (ریال)»)، خطوط ۳۲۸,۴۶۹,۵۰۱,۶۳۴,۶۷۹؛ و اعتبار مشتری در `InvoiceForm.tsx:598-617` «ریال».
- **ناسازگاری: بله — بحرانی.** کاربر «سرمایه کل» را زیر برچسب «ریال» وارد می‌کند، اما این استخر توسط مبالغ **تومانی** فاکتور/اعتبار مصرف می‌شود (`allocated_capital`/`consumed_amount` در برابر totalAmount تومانی فاکتور). اگر اپراتور طبق برچسب مقدار را «ریالی» (۱۰ برابر) وارد کند، سقف اعتبار ۱۰ برابر باد می‌کند.

### ۶) خریدها (purchases, purchase_prices)
- **DB:** `purchases.purchase_price/total_amount/cash_price` + `cash_price_currency text`؛ `purchase_prices.purchase_price` + `currency`. نمونه: `purchase_prices.purchase_price` تا `999,000,000`؛ `purchases.purchase_price=24,999,999.99`.
- **واحد ذخیره:** به **ارز پایهٔ کالا** (`toman | usd | aed`) — نه لزوماً تومان؛ موتور با `rate_to_toman` به تومان تبدیل می‌کند (`engine.ts:130-138`).
- **نمایش:** `PurchaseRequestCard.tsx:25` عدد را با «تومان» ثابت نشان می‌دهد. برای خرید ارزی این برچسب می‌تواند اشتباه باشد، اما این مسئلهٔ **ارز خارجی** است نه خطای ریال/تومان. 🔶
- **ناسازگاری ریال/تومان:** خیر (ارز خارجی جدا).

### ۷) نرخ ارز (currency_rates.rate_to_toman)
- **DB:** `rate_to_toman numeric`. نمونه: `190,000`, `184,000`, `182,500` (تومان به‌ازای هر واحد ارز).
- **نمایش:** «تومان» — `_app.pricing.currency-rates.tsx:229-231,274-276,468`.
- **ناسازگاری:** ندارد. ✅

---

## K3 — جدول کامل

| ماژول | جدول/ستون DB | واحد ذخیره | واحد نمایش | فایل نمایش | ناسازگاری؟ |
|---|---|---|---|---|---|
| محصولات/قیمت‌گذاری | `product_computed_prices.final_sale_price / rounded_sale_price / purchase_price_toman`؛ `purchase_prices.purchase_price` | تومان | تومان | `ProductPriceCard.tsx:157,359`؛ `_app.pricing.sale-lists_.$listId.tsx:1744` | خیر ✅ |
| پیش‌فاکتور فروش (quotes) | `sales_quotes.final_amount`؛ `sales_quote_items.unit_price/line_total` | تومان | تومان | `_app.sales.quotes.$quoteId.tsx:220,326`؛ `quote-pdf.ts:148` | خیر ✅ |
| **فاکتور رسمی (invoices)** | `invoices.total_amount/subtotal/...`؛ `invoice_items.unit_price/line_total` | **تومان** (از `get_product_sale_price`) | **ریال** | `InvoiceForm.tsx:598,808` | **بله — بحرانی ✗** |
| رسید پرداخت | `payment_receipts.amount` | تومان | تومان (فرم) / **ریال** (صف OCR) | `PaymentReceiptForm.tsx:1667` / `_app.operations.receipts.tsx:286` | جزئی — نمایش OCR ⚠️ |
| **سرمایه/اعتبار** | `daily_capital_snapshots.final_capital`؛ `customer_capital_allocations.final_amount/held/consumed` | **تومان** (مصرف با اعداد تومانی فاکتور) | **ریال** | `_app.accounting.dynamic-capital.tsx:315,328,469`؛ `InvoiceForm.tsx:598-617` | **بله — بحرانی ✗** |
| خریدها | `purchases.purchase_price/total_amount`؛ `purchase_prices.purchase_price (+currency)` | ارز پایهٔ کالا (toman/usd/aed) | «تومان» ثابت | `PurchaseRequestCard.tsx:25` | مسئلهٔ ارز خارجی 🔶 (نه ×۱۰ ریال) |
| نرخ ارز | `currency_rates.rate_to_toman` | تومان | تومان | `_app.pricing.currency-rates.tsx:229` | خیر ✅ |
| مطالبات/پرداختنی‌ها | مشتق از invoices/quotes | تومان | تومان | `_app.accounting.receivables.tsx:106`؛ `_app.accounting.payables.tsx:108` | خیر ✅ |

---

## K4 — یافته‌های بحرانی (ریسک خطای ۱۰ برابری Rial↔Toman)

**علت ریشه‌ای:** واحد داخلی سیستم «تومان» است، ولی `formatCurrency` پیش‌فرض «ریال» دارد و زیرسیستم فاکتور/اعتبار برچسب «ریال» را دستی به اعداد تومانی می‌چسباند.

| # | نقطه | فایل:خط | شرح ریسک | شدت |
|---|---|---|---|---|
| ۱ | **InvoiceForm — کل جمع‌ها و اعتبار** | `src/shared/components/InvoiceForm.tsx:323,366,598,602,607,617,808` | `unit_price` از `get_product_sale_price` (تومان) پر می‌شود ولی جمع کل/بیعانه/اعتبار «ریال» برچسب می‌خورد؛ همان عدد در quote «تومان» است. اختلاف مستقیم ×۱۰. | 🔴 بحرانی |
| ۲ | **سرمایهٔ پویا — ورودی و نمایش** | `src/routes/_app.accounting.dynamic-capital.tsx:315,328,469,634,679` | برچسب ورودی «سرمایه کل (ریال)» ولی مصرف با مبالغ تومانی فاکتور؛ ورود عدد ریالی سقف اعتبار را ۱۰ برابر می‌کند. | 🔴 بحرانی |
| ۳ | **صف بازبینی OCR رسید** | `src/routes/_app.operations.receipts.tsx:286` | `formatCurrency(parsed_amount)` بدون واحد → پیش‌فرض «ریال»، ولی مقدار تومانی است. | 🟠 متوسط |
| ۴ | **OCR — شاخهٔ برچسب‌دار «مبلغ»** | `src/lib/accounting/receipt-extraction.ts:175-183` | شاخهٔ اصلی «مبلغ: X ریال» عدد را بدون `÷۱۰` به‌عنوان تومان ذخیره می‌کند؛ فقط شاخهٔ fallback (خط ۱۹۶) تبدیل را انجام می‌دهد. فیش ریالی = ذخیرهٔ ۱۰ برابری. | 🟠 متوسط |
| ۵ | **پیش‌فرض `formatCurrency = "ریال"`** | `src/lib/i18n/formatters.ts:12` | عامل تسهیل‌گر همهٔ موارد بالا؛ در سیستمی که واقعاً تومانی است، پیش‌فرض باید تومان یا اجباری‌شدن پارامتر باشد. | 🔴 بحرانی (ریشه) |

**نکتهٔ مثبت:** هیچ ضرب/تقسیم ۱۰ در مسیر ذخیره‌سازی وجود ندارد (grep روی `/10`, `*10`, `toRial`, `tomanToRial` در `src` — تنها موارد Tailwind و byte و همان `÷۱۰` عمدی OCR). پس داده در DB یکدست تومان است؛ مشکل صرفاً در **لایهٔ برچسب نمایش** است.

---

### آیتم ۱۹۱ — یکسان‌سازی واحد پول (ریال/تومان)

**وضعیت:** ⚠️ ناقص

**پاسخ کوتاه:** کل داده‌های پولی در دیتابیس به «تومان» ذخیره می‌شوند و هیچ تبدیل ریال↔تومان در مسیر داده نیست؛ اما دو زیرسیستم (فاکتور رسمی/InvoiceForm و سرمایه‌ی پویا/اعتبار مشتری) همان اعداد تومانی را با برچسب «ریال» نشان می‌دهند و پیش‌فرض `formatCurrency` هم «ریال» است — که ریسک واقعی خطای ۱۰ برابری بین ماژول‌ها ایجاد می‌کند.

**شواهد:**
- L1/L2 (نمایش تومان صحیح): pricing `sale-lists_.$listId.tsx:1744`، quotes `quotes.$quoteId.tsx:220`, `quote-pdf.ts:148`، currency-rates `currency-rates.tsx:231`، receivables `receivables.tsx:106`.
- L2 (منبع تومانی فاکتور): `InvoiceForm.tsx:892,901,953` → RPC `get_product_sale_price` → `SELECT new_sale_price FROM product_sale_price_history` (تومان).
- L3 (DB یکدست تومان): `product_computed_prices.purchase_price_toman`, `currency_rates.rate_to_toman`؛ engine `engine.ts:138,265`؛ OCR `receipt-extraction.ts:196` (`n/10` ریال→تومان).
- L2 (مسلابل ریال): `InvoiceForm.tsx:598,808`؛ `dynamic-capital.tsx:315,328,469`؛ `operations.receipts.tsx:286`؛ پیش‌فرض `formatters.ts:12`.

**شکاف نسبت به نیازمندی:** واحد نمایش بین ماژول‌ها یکسان نیست؛ فاکتور و سرمایه/اعتبار «ریال» و بقیه «تومان». نیازمندی «واحد پول یکدست» برآورده نشده.

**برنچ:** بله — همهٔ فایل‌های بالا در working tree سرور (`feature/navigation-modernization`, HEAD `a9315e78`) موجودند.

**وابستگی‌ها:** موتور قیمت‌گذاری (تومان)، RPC `get_product_sale_price`، `product_sale_price_history`، زیرسیستم اعتبار مشتری و `daily_capital_*`.

**برای رفع چه لازم است:** یکسان‌سازی واحد نمایش روی «تومان» در سه نقطه (InvoiceForm، dynamic-capital/credit، operations.receipts) و اصلاح پیش‌فرض `formatCurrency` به تومان یا اجباری‌کردن پارامتر واحد؛ به‌علاوه اصلاح شاخهٔ برچسب‌دار OCR تا مثل fallback مبلغ ریالی را `÷۱۰` کند. هیچ تغییری در دادهٔ DB لازم نیست چون داده‌ها از قبل تومانی‌اند.

**ریسک/پیچیدگی:** متوسط — تغییرات عمدتاً برچسبی/نمایشی‌اند، اما باید با اطمینان تأیید شود که هیچ نقطه‌ای عدد را واقعاً ریالی ذخیره نمی‌کند (بررسی انجام‌شده: نمی‌کند)؛ خطر رگرسیون در اعتبارسنجی سقف اعتبار.
