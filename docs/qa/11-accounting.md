# ماژول ۱۱ — حسابداری و خزانه

**تستر مسئول:** حانیه (`test.accountant`). تست منفی: آرمین (`test.sales`) و محمدرضا (`test.viewer`).
**مسیرها:** `/accounting/receipts`, `/accounting/receipts/create`, `/accounting/receivables`, `/accounting/payables`, `/accounting/purchase-payments`, `/accounting/bank-accounts`, `/accounting/external-parties`, `/accounting/daily-capital`, `/accounting/dynamic-capital`, `/accounting/customer-capital-allocations`, `/accounting/salesperson-capital-allocations`.

## الف) این ماژول چه کاری می‌کند
فیش‌های واریزی مشتریان ثبت و به فاکتورها لینک می‌شوند؛ مطالبات مشتریان و بدهی تأمین‌کنندگان دیده می‌شوند؛ حساب‌های بانکی و طرف‌های حساب مدیریت می‌شوند؛ و «سرمایهٔ روز» و تخصیص سرمایه (مشتری/فروشنده) محاسبه و ذخیره می‌شود. کل ماژول فقط برای admin/manager/accountant است.

> پیش‌نیاز: با `test.accountant` وارد شو. برای تست کامل فیش، حداقل یک فاکتور موجود باشد (ماژول ۰۹).

## ب) تست‌کیس‌ها

| شناسه | عنوان | اولویت | پیش‌نیاز | مراحل | نتیجهٔ مورد انتظار | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|---|---|---|
| ACC-001 | فهرست فیش‌های واریزی | P1 | `test.accountant` | ۱) `/accounting/receipts` را باز کن | فهرست فیش‌ها نمایش داده می‌شود | | |
| ACC-002 | ثبت فیش واریزی | P0 | admin/accountant | ۱) `/accounting/receipts/create` ۲) مبلغ/تاریخ/بانک را وارد کن ۳) ذخیره | فیش ثبت و در فهرست دیده می‌شود | | |
| ACC-003 | OCR فیش (اختیاری) | P2 | فایل تصویر فیش | ۱) تصویر فیش را بارگذاری کن ۲) استخراج خودکار را بزن | متن/مبلغ استخراج می‌شود (فقط admin/accountant؛ در صورت غیرفعال بودن OCR پیام مناسب) | | |
| ACC-004 | مطالبات مشتریان | P0 | `test.accountant` | ۱) `/accounting/receivables` را باز کن | فهرست مطالبات با مانده و سررسید (RPC `get_receivables_list`) | | |
| ACC-005 | بدهی تأمین‌کنندگان | P0 | `test.accountant` | ۱) `/accounting/payables` را باز کن | فهرست بدهی‌ها (RPC `get_payables_list`) | | |
| ACC-006 | حساب‌های بانکی | P1 | admin/accountant | ۱) `/accounting/bank-accounts` ۲) یک حساب بانکی بساز/ویرایش کن | ذخیره می‌شود؛ toast «ذخیره شد» / «به‌روزرسانی شد» | | |
| ACC-007 | طرف‌های حساب | P2 | `test.accountant` | ۱) `/accounting/external-parties` را باز کن | فهرست طرف‌های حساب نمایش داده می‌شود | | |
| ACC-008 | ورودی‌های سرمایهٔ روز | P1 | `test.accountant` | ۱) `/accounting/daily-capital` ۲) ورودی‌های روز را وارد و ذخیره کن | toast «ورودی‌های روز ذخیره شد.» | | |
| ACC-009 | اسنپ‌شات سرمایهٔ روز | P2 | مرحلهٔ قبل | ۱) روی ذخیرهٔ اسنپ‌شات کلیک کن | toast «اسنپ‌شات سرمایه روز ذخیره شد.» | | |
| ACC-010 | تخصیص سرمایهٔ پویا | P1 | admin/accountant | ۱) `/accounting/dynamic-capital` را باز کن ۲) اجرای تخصیص | تخصیص محاسبه و ذخیره می‌شود | | |
| ACC-011 | خروجی (export) | P2 | داده موجود | ۱) روی خروجی کلیک کن | فایل تولید می‌شود؛ اگر داده نبود toast «داده‌ای برای خروجی وجود ندارد» | | |

## ج) تست‌های منفی (هر سه لایه)

| شناسه | نقش/سناریو | اولویت | چه کاری امتحان کن | نتیجهٔ مورد انتظار | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|---|---|
| ACC-N01 | `test.sales` — UI | P0 | منو | گروه «مالی و حسابداری» نباید برای sales دیده شود (module `accounting`، sales دسترسی ندارد) | | |
| ACC-N02 | `test.sales` — route | P0 | `/accounting/receipts` را مستقیم باز کن | باید به `/unauthorized` هدایت شوی (guard `requireAnyRole(["admin","manager","accountant"])`) | | |
| ACC-N03 | `test.viewer` — route | P0 | `/accounting/receivables` را مستقیم باز کن | باید به `/unauthorized` هدایت شوی | | |
| ACC-N04 | `test.manager` — نوشتن محدود | P0 | با manager، ثبت فیش واریزی را امتحان کن | برخی نوشتن‌ها فقط admin/accountant است (نه manager) — اگر manager نتوانست ثبت کند، طبق انتظار؛ اگر توانست، بررسی شود | | ⚠️ نیاز به تأیید |
| ACC-N05 | RLS مستقیم | P0 | با `test.sales`، اگر جوری به داده رسیدی | RLS جداول مالی (`payment_receipts`, `bank_accounts`, ledgerها) باید خالی برگرداند — **اگر داده دیده شد = یافتهٔ امنیتی `رد`** | | |

## د) موبایل

| شناسه | صفحه | بررسی | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|
| ACC-M01 | `/accounting/receivables` | جدول مطالبات داخل کانتینر اسکرول‌شونده؛ مبالغ با جداکنندهٔ هزارگان | | |
| ACC-M02 | `/accounting/receipts/create` | فرم ثبت فیش روی موبایل قابل‌استفاده، تاریخ شمسی | | |
| ACC-M03 | `/accounting/daily-capital` | ورودی‌ها و دکمهٔ ذخیره روی موبایل خوانا، RTL | | |
