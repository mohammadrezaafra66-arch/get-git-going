# رفع دکمه‌ی مرده‌ی پیام‌رسان — تکمیل شد

**تاریخ:** ۱۷ مرداد ۱۴۰۵
**ساعت:** ۰۴:۴۰ به وقت تهران
**موضوع:** تابع گم‌شده‌ی `set_messenger_group_member_role` برای تغییر نقش عضو گروه
**وضعیت:** ✅ کامل
**گزینهٔ انتخاب‌شده:** **ب** — تابع از صفر (معادل زنده وجود نداشت)

> فرانت از قبل درست صدا می‌زد؛ فقط RPC روی LAN غایب بود. مهاجرت قدیمی ۲۲۵ در گیت
> بود ولی اعمال نشده بود و `add_messenger_group_member` را هم بازنویسی می‌کرد؛ طبق
> قاعدهٔ خواندن تعریف زنده، مهاجرت تازهٔ **۳۱۶** فقط تابع نقش را افزود.

## خلاصه‌ی یافته‌ها

- فراخوان در `src/components/messenger/GroupMembersDialog.tsx:166` با
  `p_group_id` / `p_user_id` / `p_role`.
- روی `pg_proc` زنده فقط `add_messenger_group_member` و `is_messenger_group_member`
  بودند؛ `set_messenger_group_member_role` نبود.
- `messenger_group_members` سیاست UPDATE ندارد؛ مسیر مستقیم UPDATE هم بی‌فایده است.
- الگوی امنیتی از تعریف زندهٔ `add_messenger_group_member` گرفته شد:
  `SECURITY DEFINER` + فقط ادمین گروه (نه بازنویسی تابع افزودن).

## فایل‌های تغییریافته

| مسیر | چرا |
|---|---|
| `supabase/migrations/20260808065000_316_set_messenger_group_member_role.sql` | ایجاد RPC |
| `docs/verification/316-down.sql` | برگشت‌پذیر |
| `docs/execution/3-messenger-rpc-fix-mission.md` | متن مأموریت |
| `docs/execution/messenger-rpc-fix-mission-COMPLETE.md` | همین گزارش |
| `PROGRESS.md` | هماهنگی چندعامله |

فرانت و `types.ts` دست‌نخورده ماندند (امضا از قبل درست بود).

## Assumptions

- الگوی مجوز همان ادمین گروه است (مثل `add_*` زنده)، نه نسخه‌ی ۲۲۵ که system-admin را هم باز می‌کرد.
- مهاجرت ۲۲۵ را دوباره اعمال نکردیم تا رفتار `add_*` عوض نشود.
- پاک‌سازی E2E فقط گروه با پیشوند `RPC_FIX_E2E_316_` بود.

## Evidence

- Dry-run (داخل `BEGIN…ROLLBACK`): PASS ۱–۶ + `ALL_DRY_RUN_ASSERTIONS_PASSED`.
- اعمال با `docker cp` + `psql --single-transaction -v ON_ERROR_STOP=1`؛ سپس
  `docker restart afrakala-lan-rest`.
- Down در تراکنش برگشتی: بعد از DROP شمارش تابع ۰؛ بعد از ROLLBACK دوباره ۱.
- Wire E2E با JWT واقعی (minted HS256):
  `create-group` → `add-member` → `set-role` → DB=`purchaser` → `viewer` →
  `remove-member` → cleanup. خروجی: `ALL_E2E_ASSERTIONS_PASSED` (دو بار تکرار شد).
- فارسی داخل `prosrc` سالم ماند.
- typecheck: بدون تغییر TS؛ baseline پروژه ۷۰ خطای از پیش‌موجود.
- تست اسکریپت پروژه وجود ندارد — گزارش شد نه ادعا شد.

## Migration / RLS / Audit

- Migration: **۳۱۶** (فقط `CREATE OR REPLACE FUNCTION` + GRANT/REVOKE).
- RLS: بدون تغییر سیاست؛ SECURITY DEFINER همان الگوی افزودن عضو.
- Audit log: ندارد (هم‌تراز `add_messenger_group_member`).

## Manual test path

1. ورود با کاربری که ادمین یک گروه پیام‌رسان است.
2. مدیریت اعضا → تغییر نقش یک عضو غیرخود به «مسئول خرید» / «بیننده».
3. باید toast موفقیت بیاید و نقش در لیست عوض شود.

## Self-Host Acceptance Check

- بدون وابستگی ابری تازه؛ فقط Postgres/PostgREST موجود.
- اسرار در کامیت نیست.

## آیا چیزی خراب شد؟

خیر. افزودن/حذف عضو در E2E همچنان سبز بود. دادهٔ واقعی پیام‌رسان حذف نشد.

## مانده‌ها و ریسک‌ها

- مهاجرت ۲۲۵ هنوز در گیت است و اگر روی DB تازه همه‌ی فایل‌ها اعمال شوند،
  `add_*` را به نسخه‌ی system-admin تغییر می‌دهد؛ خارج از دامنهٔ این مأموریت.
- UI وب نیاز به rebuild ندارد چون فقط RPC دیتابیس عوض شد؛ PostgREST ری‌استارت شد.

## تصمیم‌های باز

ندارد.
