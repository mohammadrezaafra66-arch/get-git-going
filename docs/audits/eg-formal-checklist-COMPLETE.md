# eg-checklist — تکمیل شد

**تاریخ:** ۲۰۲۶-۰۸-۰۸  
**ابزار:** Cursor (Agent 7)  
**موضوع:** چک‌لیست رسمی هشت‌بندی برای دامنه‌های E (دریافت) و G (سند دوبل/دفتر)  
**وضعیت:** ✅ کامل — فقط‌خواندنی؛ بدون تغییر کد / migration / داده

---

## Files inspected

| منبع | نقش |
|---|---|
| `docs/audits/7-eg-checklist-mission.md` | فایل مأموریت |
| `docs/audits/full-accounting-audit.md` (بخش‌های E و G ≈۷۰۱–۱۰۲۲) | شواهد تفصیلی از قبل؛ پایهٔ ارجاع |
| `docs/audits/full-accounting-audit-COMPLETE.md` | خلاصهٔ ممیزی قبلی؛ تصمیم باز #۲ |
| `PROGRESS.md` / `AGENTS.md` / `CLAUDE.md` | هماهنگی و قوانین تحویل |
| مسیرها و registry: `_app.accounting.receipts*.tsx`, `_app.operations.receipts.tsx`, `registry.ts`, `primary-modules.ts` | بند ۱ E/G |
| SQL زنده روی `afrakala-lan-db` | بازبینی شمارش‌ها، CHECK، `role_permissions`، callers تابع توازن |

## Files changed

| فایل | چرا |
|---|---|
| `docs/audits/full-accounting-audit.md` | بخش رسمی هشت‌بندی E و G + جدول دلتای زنده ۲۰۲۶-۰۸-۰۸ |
| `docs/audits/eg-formal-checklist-COMPLETE.md` | گزارش تحویل استاندارد AGENTS.md |
| `docs/audits/full-accounting-audit-COMPLETE.md` | بستن تصمیم #۲؛ به‌روز کردن ادعاهای `accounting` RP و `supplier_payable` |
| `PROGRESS.md` | ردیف eg-checklist + تاریخچه |

## Migration / RLS / Audit impact

- **Migration:** هیچ (فقط‌خواندنی).
- **RLS/RBAC:** تغییری اعمال نشد. مشاهدهٔ زنده: ماژول `accounting` اکنون **۷ ردیف** در `role_permissions` دارد (مهاجرت ۳۱۵ / db-hygiene؛ `created_at=2026-08-08 00:51:44+00`) — ادعای «صفر» در متن قدیمی منسوخ است.
- **Audit log:** بدون اثر.

## Live deltas vs prior audit text

1. `journal_lines_account_kind_chk` اکنون شامل `supplier_payable` است (۷ مقدار؛ مهاجرت ۳۱۲).
2. `role_permissions` برای `accounting` = ۷ (قبلاً صفر گزارش شده بود).
3. بدون تغییر: receipts=۶، links=۳ (همه quote)، journal=۱/۲، ۴ فیش با `beneficiary_accounting_code`، بدون جدول `ocr_*`، `validate_journal_entry_balance` همچنان ۰ caller.

## Structural defects still open (documented, not fixed)

| شدت | دامنه | خلاصه |
|---|---|---|
| 🔴 | E | `beneficiary_accounting_code` به سند نمی‌رسد |
| 🟠 | E | تخصیص پس از approve فقط `invoices` را JOIN می‌کند؛ پیوندهای زنده همه quoteاند |
| 🔴 | G | بدون الزام توازن دوطرفه |
| 🟠 | G | `validate_journal_entry_balance` نوشته‌شده و وصل‌نشده |
| 🟠 | G | بدون UI دفتر مستقل |

## Build / lint / typecheck / test

بدون build/typecheck/e2e — مأموریت تحقیق فقط‌خواندنی است. معیار: هر ادعا شاهد `file:line` یا SQL زنده دارد.

## Manual test path

N/A برای تغییر محصول. بازبینی شواهد: خواندن بخش جدید در انتهای `full-accounting-audit.md` («چک‌لیست رسمی هشت‌بندی — دامنه‌های E و G»).

## Self-Host Acceptance Check

N/A — بدون استقرار یا تغییر runtime.

## Remaining risks

- متن قدیمی بخش E بند ۸ («صفر ردیف role_permissions») در بدنهٔ اصلی هنوز ممکن است خواننده را گمراه کند؛ جدول رسمی جدید و این COMPLETE آن را جایگزین می‌کنند — بازنویسی درجا انجام نشد تا تاریخچهٔ شواهد حفظ شود.
- نقص‌های ساختاری بالا عمداً باز مانده‌اند (خارج از محدودهٔ فقط‌خواندنی).

## Verdict

چک‌لیست رسمی هشت‌بندی برای E و G بسته شد. دو دلتای واقعی نسبت به گزارش اصلی ثبت شد؛ نقص‌های ساختاری با شواهد زنده تأیید و مستند ماندند.
