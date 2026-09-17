# Torob Ops Path A — قرارداد محصول

## محدوده

اتوماسیون گزارش طعمه در ترب (تک‌حساب سپس چنداکانت)، روی پایهٔ فاز ۱ مسیر ب.

- گزارش فقط روی یافتهٔ `confirmed_bait` (یا `report_failed` برای retry)
- متن جعلی / جعل شکایت مشتری غیرواقعی ممنوع
- CAPTCHA شخص‌ثالث بدون تصمیم جدا ممنوع
- worker خارج از request UI؛ سقف نرخ + abort + audit

## مسیرها

| مسیر | نقش |
|------|------|
| `/torob-ops` | داشبورد |
| `/torob-ops/runs` | اسکن |
| `/torob-ops/findings` | صف + pagination + dry-run preview |
| `/torob-ops/shops` | CRUD فروشگاه‌های خودی |
| `/torob-ops/settings` | admin — قالب، flag، kill switch |
| `/torob-ops/accounts` | admin — استخر اکانت |
| `/admin/torob-ops-access` | admin — رمز ماژول |

## وضعیت یافته

`cheaper_competitor` · `suspected_bait` · `manual_review` · `confirmed_bait` · `legitimate_competitor` · `queued_for_report` · `reporting` · `reported` · `report_failed` · `cancelled`

## معیار طعمه (غنی‌سازی فقط‌خواندنی)

سیگنال‌های قوی: `no_checkout`, `phone_only`, `whatsapp_only`, `china_delivery`, `call_for_price`.  
مبهم / بدون سیگنال قوی → `manual_review`.  
فروشگاه‌های `torob_ops_own_shops` از یافته حذف می‌شوند.

## گزارش

1. اپراتور طعمه را تأیید می‌کند
2. پیش‌نمایش قالب (`report_preview` / dry-run) بدون submit
3. صف `queued_for_report` فقط از `confirmed_bait` / `report_failed`
4. Worker: `/api/public/hooks/process-torob-ops-report-queue` با `TOROB_OPS_WORKER_TOKEN`
5. تنظیمات: `auto_report_enabled` پیش‌فرض **خاموش**؛ `kill_switch` صف را متوقف می‌کند
6. لاگ در `torob_ops_report_logs` با `mode` ∈ `manual` | `dry_run` | `auto`

## چنداکانت

جدول `torob_ops_accounts`؛ انتخاب least-recent زیر روزانه؛ قرنطینه روی CAPTCHA/ban؛ dedupe product+domain در `dedupe_window_hours`.

## Session حساب

`session_ciphertext` + `session_iv` با AES-256-GCM؛ کلید از `TOROB_OPS_ACCOUNT_SECRET` (یا fallback `JWT_SECRET`). بدون plaintext در ریپو.

## Migration

- Path B: `555_torob_ops_path_b`
- Path A: `20260916210000_557_torob_ops_path_a.sql`
- Rollback A: `docs/verification/557-down.sql`

## ممنوعیت‌ها

- گزارش روی `manual_review` یا ردشده
- روشن کردن auto روی `:3000` بدون تأیید کتبی مالک + بکاپ + flag خاموش‌پیش‌فرض
- اجرای worker بدون kill switch
