## هدف
ذخیره فایل قوانین ثابت پروژه افراکالا در کدبیس و حافظه Lovable برای رعایت خودکار در تمام توسعه‌های آینده.

## چرا کدبیس و نه دیتابیس
سند acceptance criteria یک **قانون توسعه** است نه دیتای اپلیکیشن:
- در `docs/` با git قابل ردیابی است
- Lovable می‌تواند هنگام کد زدن آن را مستقیم بخواند
- backupهای دیتابیس را بی‌دلیل سنگین نمی‌کند
- استاندارد رایج (مثل `docs/SELF_HOSTING.md` موجود)

## مراحل

### ۱. کپی فایل به کدبیس
```
user-uploads://AFRAKALA_SELF_HOST_ACCEPTANCE_CRITERIA-2.md
  → docs/AFRAKALA_ACCEPTANCE_CRITERIA.md
```

### ۲. ثبت در حافظه پروژه Lovable (`mem://`)
- **`mem://index.md`** — Core rules همیشه در context:
  - اپ self-host روی Linux + Docker + Supabase
  - هیچ secret در frontend/GitHub
  - هیچ CDN/API خارجی حیاتی
  - RLS + RBAC هرگز دور زده نشود
  - migration reversible و سازگار با self-host
  - بهینه برای اینترنت ضعیف ایران
  - مرجع کامل: `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`

- **`mem://constraints/self-host.md`** — جزئیات معیارهای پذیرش (لیست سرویس‌های Supabase موردنیاز، قوانین storage، migration و …)

### ۳. متن آماده برای کادر Knowledge
متن کوتاه (~۵۰۰ کاراکتر، زیر سقف ۱۰،۰۰۰) را در پایان پاسخ می‌دهم تا در Settings → Knowledge → «دانش پروژه» paste کنید. این متن فقط به فایل اشاره می‌کند و اصول حیاتی را خلاصه می‌گوید.

## خارج از scope
- ذخیره در دیتابیس (نامناسب برای این نوع سند)
- هیچ تغییر کد، migration، RLS، یا auth
- هیچ تغییر UI

## نتیجه
از این پس در هر گفتگو با Lovable در این پروژه، قوانین self-host به‌صورت خودکار رعایت می‌شوند و فایل کامل به‌عنوان مرجع در `docs/` در دسترس تیم و Lovable است.