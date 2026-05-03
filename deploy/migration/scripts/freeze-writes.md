# Freeze Writes — قبل از Cutover

قبل از شروع مهاجرت نهایی، باید **نوشتن** روی Supabase Cloud (source) را
متوقف کنیم تا data drift رخ ندهد. بدون freeze، رکوردهای جدید بعد از
dump گرفته می‌شوند و گم می‌شوند.

## روش‌های پیشنهادی (ترکیبی استفاده شود)

1. **اعلام به کاربران** — حداقل ۲۴ ساعت قبل، اعلام پنجره maintenance.
2. **Maintenance flag در اپلیکیشن** — یک flag سراسری (env یا remote config) که
   تمام mutationها (POST/PATCH/DELETE و server functions نوشتن) را با پیام
   «در حال ارتقا، لطفاً بعداً تلاش کنید» رد کند. خواندن همچنان مجاز.
3. **محدودسازی نقش‌ها در DB** — به‌صورت موقت از طریق REVOKE یا تغییر RLS،
   نوشتن نقش `authenticated` را ببندید (فقط ادمین/سرویس می‌تواند بنویسد).
   نمونه:
   ```sql
   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE FROM authenticated;
   ```
   پس از مهاجرت روی target، حقوق را بازگردانید.
4. **توقف jobهای پس‌زمینه** — cronها، webhookها و خوراک‌های ورودی را خاموش کنید.

## تاییدیه قبل از ادامه

- [ ] Maintenance banner در اپ فعال است
- [ ] mutation API ها بلاک شده‌اند
- [ ] هیچ job/webhook فعالی روی source نیست
- [ ] زمان شروع freeze ثبت شد: __________

بدون این چهار آیتم، dump اعتبار ندارد.