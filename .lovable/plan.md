## مشکل

هنگام بارگذاری پنل اعتراض‌ها برای بازبین، خطای «infinite recursion detected in policy for relation "appeal_reviewers"» می‌آید. علت: دو جدول سیاست‌های متقاطع دارند که به یکدیگر ارجاع می‌دهند.

- `appeal_reviewers` سیاست «appellant sees reviewers of own appeal» → از `penalty_appeals` می‌خواند.
- `penalty_appeals` سیاست «reviewers see assigned appeals» → از `appeal_reviewers` می‌خواند.

Postgres هنگام ارزیابی هر SELECT وارد حلقهٔ بی‌نهایت می‌شود.

## راه‌حل

سیاست‌های متقاطع را با توابع `SECURITY DEFINER` که RLS را دور می‌زنند جایگزین می‌کنیم تا حلقه شکسته شود. رفتار مجاز بودن دسترسی بدون تغییر می‌ماند:

- بازبین همچنان می‌تواند اعتراض‌های اختصاص‌یافته به خودش را ببیند.
- شاکی همچنان می‌تواند فهرست بازبین‌های اعتراض خودش را ببیند.
- ادمین/مدیر همچنان همه را می‌بیند.

### تغییرات دیتابیس (یک migration)

1. ایجاد تابع `public.is_reviewer_of_appeal(_appeal_id uuid, _user uuid) RETURNS boolean` — `SECURITY DEFINER`، `SET search_path = public`، از `appeal_reviewers` می‌خواند.
2. ایجاد تابع `public.is_appellant_of_appeal(_appeal_id uuid, _user uuid) RETURNS boolean` — `SECURITY DEFINER`، از `penalty_appeals` می‌خواند.
3. حذف و بازنویسی سیاست‌های SELECT:
   - `appeal_reviewers`: سیاست «appellant sees reviewers of own appeal» با استفاده از `is_appellant_of_appeal(appeal_id, auth.uid())`.
   - `penalty_appeals`: سیاست «reviewers see assigned appeals» با استفاده از `is_reviewer_of_appeal(id, auth.uid())`.
4. `GRANT EXECUTE` هر دو تابع به `authenticated`.

بقیهٔ سیاست‌ها (ادمین/مدیر، مالک ردیف) دست‌نخورده باقی می‌مانند.

## تست پس از اعمال

- ورود با بازبین (عضو `appeal_reviewers`) → `/admin/penalties` → پنل «اعتراض‌های در انتظار بررسی شما» بدون خطا لود شود.
- رأی تأیید/رد → توست موفقیت.
- ورود با شاکی → `/my-penalties` → کارت اعتراض دیده شود.
- ورود با کاربر بی‌ارتباط → نه اعتراض دیگران را ببیند نه بازبین‌های آن‌ها را.
