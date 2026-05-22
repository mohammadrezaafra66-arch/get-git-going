# Lovable Change Reports

این پوشه محل ثبت گزارش اجباری تغییرات Lovable است.

هر بار که Lovable تغییری در پروژه انجام می‌دهد، باید یک فایل گزارش جدید در همین پوشه بسازد.

فرمت نام فایل پیشنهادی:

`YYYY-MM-DD-HHMM-change-title.md`

نمونه:

`2026-05-22-1430-bot-api-layer.md`

## قانون مهم

Lovable نباید بدون اعلام صریح و گزارش کامل، هیچ تغییری در دیتابیس، schema، RLS، policy، trigger، function، enum، storage bucket، auth config یا migration ایجاد کند.

اگر هر تغییری باعث نیاز به migration، backup، schema export، data export یا storage export شود، باید در گزارش با عبارت زیر مشخص شود:

`🚨 DATABASE_EXPORT_OR_BACKUP_REQUIRED 🚨`

## هدف این پوشه

این گزارش‌ها باید به‌گونه‌ای نوشته شوند که تیم لوکال افراکالا بتواند با خواندن آن بفهمد:

- چه فایل‌هایی تغییر کرده‌اند
- چه migrationهایی لازم است
- آیا دیتابیس لوکال باید backup شود
- آیا export از Lovable لازم است
- چه دستورهایی باید روی لوکال اجرا شود
- چه تست‌هایی باید بعد از آپدیت انجام شود
