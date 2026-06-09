# سیاست Source of Truth پروژه افرا اتوماسیون

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Active

## 1. اصل اصلی

برای جلوگیری از دوگانگی، GitHub منبع رسمی و نسخه‌دار پروژه است. هر چیزی که در GitHub commit نشده باشد، تصمیم رسمی پروژه محسوب نمی‌شود.

## 2. منبع حقیقت هر بخش

| بخش | Source of Truth |
|---|---|
| کد محصول | GitHub |
| اسناد نسخه‌دار | GitHub / Markdown |
| تصمیم‌های معماری | GitHub / ADR |
| قراردادهای API / Schema | GitHub / OpenAPI / JSON Schema |
| داده عملیاتی Runtime | Supabase/PostgreSQL |
| خروجی مدیریتی و مرور انسانی | Google Drive Mirror |
| خروجی اکسل/شیت | Export، نه مغز سیستم |
| خروجی Lovable | Draft تا زمانی که در GitHub merge شود |
| خروجی Cursor | Draft تا زمانی که در GitHub merge شود |

## 3. نقش Google Drive

Google Drive فقط Mirror مدیریتی و محل مطالعه انسانی است. فایل‌های Drive نباید مستقلاً تغییر رسمی ایجاد کنند. اگر سندی در Drive اصلاح شد، باید نسخه نهایی آن به GitHub برگردد و commit شود.

## 4. نقش Lovable و Cursor

Lovable و Cursor ابزار اجرای کار هستند، نه منبع حقیقت پروژه.

```text
Lovable خروجی پیشنهادی تولید می‌کند.
Cursor خروجی پیشنهادی تولید می‌کند.
GitHub تصمیم رسمی و نسخه نهایی را نگهداری می‌کند.
```

مرزبندی کامل این دو ابزار در سند زیر تعریف شده است:

```text
docs/process/lovable-cursor-boundary.md
```

## 5. رفتار مجاز

- سند اصلی در GitHub نوشته شود.
- نسخه PDF/Docx برای مطالعه در Drive منتشر شود.
- Drive Manifest به commit یا tag دقیق GitHub اشاره کند.
- تغییرات مهم فقط با PR وارد main شوند.
- تغییرات Lovable ابتدا در branch و PR بررسی شوند.
- تغییرات Cursor ابتدا در branch و PR بررسی شوند.
- API جدید ابتدا در قرارداد رسمی تعریف شود.

## 6. رفتار ممنوع

- نگهداری دو نسخه فعال از یک سند در Drive و GitHub.
- تصمیم‌گیری براساس فایل Drive بدون commit متناظر در GitHub.
- ساخت جدول، API یا ماژول جدید بدون سند و ADR در GitHub.
- استفاده از Google Sheets به‌عنوان دیتابیس اصلی سیستم.
- قبول‌کردن خروجی Lovable به‌عنوان نسخه رسمی بدون merge در GitHub.
- قبول‌کردن خروجی Cursor به‌عنوان نسخه رسمی بدون merge در GitHub.

## 7. قانون اجرایی

هر سند منتشرشده در Drive باید در ابتدای خود این جمله را داشته باشد:

> این فایل فقط Mirror مدیریتی است. نسخه رسمی و قابل استناد در GitHub قرار دارد.

هر خروجی Lovable یا Cursor تا قبل از merge باید این وضعیت را داشته باشد:

```text
Draft / Proposal — not official until merged into GitHub source of truth.
```

## 8. معیار پذیرش

این سیاست زمانی رعایت شده که برای هر فایل مهم Drive، مسیر GitHub، شماره commit/tag و وضعیت سند مشخص باشد.

برای تغییرات Lovable و Cursor نیز این سیاست زمانی رعایت شده که:

```text
branch مشخص باشد
PR مشخص باشد
scope مشخص باشد
review انجام شده باشد
main فقط بعد از پذیرش آپدیت شده باشد
```
