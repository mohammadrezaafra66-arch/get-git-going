# T0 — واژگان Domain «دریافت و پرداخت»

وضعیت: **اشباع نشده.** توضیحش در انتهای فایل.

## چگونه ساخته شد

از دیتابیس شروع شد نه از کد، چون نام جدول و ستون و مقدار `CHECK` واژگانی
هستند که نویسنده مجبور بوده صریح بنویسد؛ نام فایل و کامنت این تضمین را ندارند.

## جدول واژگان

### هستهٔ موضوع — جدول‌ها

| واژهٔ کد | معنای کسب‌وکاری | فایل src | شاهد |
|---|---|---|---|
| `payment_receipts` | سند دریافت / فیش دریافتی | ۱۲ | جدول، ۴۳ ستون |
| `payment_vouchers` | سند پرداخت | ۴ | جدول، ۲۱ ستون |
| `payment_receipt_links` | تخصیص دریافت به فاکتور یا پیش‌فاکتور | ۳ | ستون‌های `invoice_id`, `quote_id`, `amount` |
| `payment_receipt_documents` | فایل پیوست فیش | ۲ | migration 267 (سقف حجم) |
| `payment_receipt_custom_fields` | فیلدهای سفارشی فیش | ۲ | `_app.admin.receipt-fields.tsx` |
| `journal_entries` | سند حسابداری (سربرگ) | ۵ | `status`, `source_type`, `source_id` |
| `journal_lines` | ردیف سند — **همین سند دوبل است** | ۵ | `debit`, `credit`, `account_kind` |
| `mutual_settlements` | تهاتر | ۳ | `offset_amount`, `cash_amount`, `direction` |
| `bank_accounts` | حساب بانکی | ۳ | `iban` |
| `external_parties` | **طرف حساب / شخص ثالث / صراف** | ۳ | `national_id`, `phone` |
| `payment_terms` | شرایط پرداخت | ۲ | `_app.admin.payment-terms.tsx` |
| `settlement_types` | نوع تسویه | ۸ | `code`, `sort_order`, `days` |
| `customer_credit_ledger` | دفتر اعتبار مشتری | ۳ | — |
| `customer_credit_balance` | مانده اعتبار | ۳ | — |

### ستون‌هایی که واژهٔ کسب‌وکاری‌اند

| ستون | معنا | کجا |
|---|---|---|
| `beneficiary_accounting_code` | **ذینفع** | `payment_receipts` |
| `receiver_party_id` | **شخص ثالث / نفر سوم** گیرنده | `payment_receipts` |
| `payee_party_id` / `payee_type` | ذینفع پرداخت و نوعش | `payment_vouchers` |
| `payer_accounting_code` / `receiver_accounting_code` | کد حسابداری پرداخت‌کننده و گیرنده | `payment_receipts`, `journal_entries` |
| `document_channel` | کانال سند (روش انتقال وجه) | `payment_receipts`, `payment_vouchers` |
| `has_perforation` | پرفراژ دارد | `payment_receipts` |
| `is_typed_receipt` | فیش تایپی است | `payment_receipts` |
| `is_mobile_bank_screenshot` | اسکرین‌شات همراه‌بانک | `payment_receipts` |
| `security_warnings` | هشدارهای اصالت فیش | `payment_receipts` |
| `posting_status` / `posted_at` | ثبت‌شده در سند حسابداری | `payment_receipts` |
| `tracking_number` | شمارهٔ پیگیری | هر دو |
| `cheque_number` / `cheque_due_date` | شمارهٔ چک و سررسید | هر دو |
| `offset_amount` / `cash_amount` | بخش تهاتری و بخش نقدی | `mutual_settlements` |

### مقادیر مجاز — از `CHECK`، نه از حدس

| ستون | مقادیر |
|---|---|
| `payment_receipts.status` | `pending_review` · `approved` · `rejected` |
| `payment_receipts.posting_status` | `unposted` · `posted` |
| `payment_receipts.receipt_type` | `invoice_payment` · `debt_payment` · `prepayment` · `positive_credit` |
| `payment_receipts.document_channel` | `card_to_card` · `paya` · `pol` · `satna` · `cash` · `cheque` · `other` |
| `journal_entries.status` | `draft` · `posted` · `void` |
| `journal_lines.account_kind` | `customer_credit` · `bank` · `external_party` · `invoice_ar` · `clearing` · `other` · `supplier_payable` |
| `mutual_settlements.direction` | `customer_pays` · `we_pay` · `balanced` |

### قواعدی که در سطح دیتابیس اجبار شده‌اند

این‌ها را در T6 دوباره از منظر کد می‌بینیم، ولی چون در `CHECK` نشسته‌اند
غیرقابل‌دورزدن‌اند و همین‌جا ثبت می‌شوند:

- `journal_lines_one_side` — هر ردیف یا بدهکار است یا بستانکار، هرگز هر دو و
  هرگز هیچ‌کدام. این تعریف مکانیکی سند دوبل است.
- `payment_receipts_receiver_exclusive_chk` — گیرنده یا حساب بانکی است یا شخص
  ثالث، نه هر دو. استثنا فقط وقتی سند هنوز `pending_review` است.
- `payment_receipts_cheque_fields_chk` — شمارهٔ چک و سررسید فقط وقتی مجازند که
  `document_channel = 'cheque'` باشد.
- `mutual_settlements_cash_needs_account_chk` — اگر بخش نقدی صفر نیست، حساب
  بانکی اجباری است.
- `payment_receipts_amount_check` / `payment_vouchers_amount_check` — مبلغ باید
  اکیداً بزرگ‌تر از صفر باشد.

## گزارش اشباع

| دور | منبع | فایل‌های src | جدید |
|---|---|---|---|
| ۱ | جدول‌های دیتابیس | — | ۲۶ جدول کاندید |
| ۲ | ستون‌های جدول‌های هسته | — | ~۲۰ واژه |
| ۳ | جست‌وجوی کد با واژه‌های هسته | ۲۵ | ۲۵ |
| ۴ | واژه‌های تازه (treasury, external_part, cheque) | ۳۹ | +۱۴ |
| ۵ | واژه‌های تازه (payable, receivable, credit) | ۴۷ | +۸ |
| ۶ | فهرست مسیرها + مجوزها + migrationها | ۵۷ | +۱۰ |
| ۷ | واژه‌های تازه (capital, aging, delivery) | ۷۵ | +۱۸ |

**اشباع حاصل نشد.** ولی الگوی دور ۷ مهم است: از ۱۸ فایل تازه، بیشترشان از
حوزه‌های **همسایه** آمدند نه از خود موضوع —

- `delivery_receipts` فقط به‌خاطر کلمهٔ «receipt» تطبیق خورد؛ رسید **تحویل
  کالا** است، نه سند مالی
- `asan-import` / `asan-export` — پل به نرم‌افزار حسابداری بیرونی
- `ProductTimeline`, `RecentActivity`, `useDashboardStats` — مصرف‌کنندهٔ
  گزارشی، نه بخشی از خود موضوع
- `capital_allocation` — تخصیص سرمایه، موضوع مستقلی است

یعنی هر دور بعدی، بیشتر از آنکه موضوع را کامل کند، مرز را جابه‌جا می‌کند.
این نتیجهٔ خالی بودن `OUT OF SCOPE` است و تصمیمش با مالک است (فاز T1).

## مسیرهای کشف‌شده تا اینجا

```
_app.accounting.receipts.tsx                فهرست اسناد دریافت
_app.accounting.receipts.create.tsx         ثبت سند دریافت
_app.accounting.receipts.$receiptId.tsx     جزئیات یک سند
_app.accounting.receipts_.training.tsx      آموزش
_app.operations.receipts.tsx                ← مسیر دوم، بیرون از accounting
_app.accounting.payment-vouchers.tsx        اسناد پرداخت
_app.accounting.purchase-payments.tsx       پرداخت‌های خرید
_app.accounting.treasury.tsx                خزانه
_app.accounting.mutual-settlement.tsx       تهاتر
_app.accounting.payables.tsx                پرداختنی
_app.accounting.receivables.tsx             دریافتنی
_app.accounting.bank-accounts.tsx           حساب‌های بانکی
_app.accounting.external-parties.tsx        طرف حساب‌ها
_app.admin.receipt-fields.tsx               فیلدهای سفارشی فیش
_app.admin.payment-terms.tsx                شرایط پرداخت
```

## نشانهٔ زودهنگام برای هدف شما

هدف شما پرسیده بود «آیا چند مسیر موازی برای ثبت سند داریم». هنوز trace نکرده‌ام
(آن فاز T5 است)، ولی سه نقطهٔ ورود دیده می‌شود که باید در T4/T5 بررسی شوند:

- `_app.accounting.receipts.create.tsx`
- `_app.operations.receipts.tsx`
- `src/shared/components/PaymentReceiptForm.tsx` — کامپوننت مشترک

اینکه این‌ها یک مسیرند با سه در، یا سه مسیر موازی، هنوز **معلوم نیست**.
