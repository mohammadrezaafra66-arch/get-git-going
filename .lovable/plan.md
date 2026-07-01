## تشخیص مشکل فعلی

خطای فعلی از خود فرم یا مقدار سرمایه نیست. درخواست `run_daily_capital_allocation` هنوز با خطای دیتابیس برمی‌گردد:

```text
column "user_id" of relation "audit_logs" does not exist
```

یعنی تابع بعد از محاسبه تخصیص‌ها، در مرحله ثبت audit log شکست می‌خورد و کل تراکنش rollback می‌شود؛ بنابراین snapshot و سرمایه هم ذخیره نمی‌شود.

## علت دقیق

ساختار واقعی جدول `audit_logs` این ستون‌ها را دارد:

```text
id, actor_id, entity_type, entity_id, action, diff, created_at
```

اما داخل تابع `run_daily_capital_allocation` هنوز این insert قدیمی وجود دارد:

```sql
INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
```

دو ستون `user_id` و `metadata` در جدول وجود ندارند. معادل درست آن‌ها در ساختار فعلی:

```text
user_id  -> actor_id
metadata -> diff
```

## پلن اصلاح

1. یک migration کوچک و محدود برای بازنویسی تابع `run_daily_capital_allocation` اعمال شود.
2. فقط بخش ثبت audit log اصلاح شود:
   - `user_id` به `actor_id`
   - `metadata` به `diff`
3. منطق‌های قبلاً اصلاح‌شده دست‌نخورده بمانند:
   - حذف ستون‌های ناموجود تخصیص مشتری
   - `binding_constraint = 'formula'` برای حالت بدون پروفایل
   - `WHERE true` برای bulk updateها
   - ساخت temp table خارج از loop
4. بعد از اجرای migration، همان RPC با مقدار تستی بررسی شود که دیگر به خطای audit log نخورد.
5. اگر RPC بعد از این مرحله خطای بعدی بدهد، همان خطا را جداگانه بررسی می‌کنیم؛ ولی خطای فعلی مشخصاً مربوط به mismatch جدول `audit_logs` است.

## اثر تغییر

- UI جدید اضافه نمی‌شود.
- جدول جدید ساخته نمی‌شود.
- RLS/RBAC تغییر نمی‌کند.
- فقط تابع موجود با schema واقعی audit log هماهنگ می‌شود.
- audit log همچنان ثبت می‌شود، اما در ستون‌های صحیح جدول فعلی.