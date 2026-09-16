# Torob Ops Path A — Runbook حادثه

## Kill switch (فوری)

1. `/torob-ops/settings` → روشن کردن **کلید اضطراری**
2. یا SQL: `UPDATE torob_ops_settings SET kill_switch = true WHERE id = 1;`
3. Worker در tick بعدی صفر پردازش می‌کند؛ صف UI هم صف جدید را رد می‌کند.

خاموش کردن فقط پس از رفع علت و تأیید مالک.

## CAPTCHA / ban حساب

علائم: `report_failed` با detail شامل captcha/ban/blocked؛ اکانت → `quarantine`.

اقدام:

1. Kill switch اگر چند اکانت همزمان گیر کردند
2. اکانت قرنطینه را در `/torob-ops/accounts` ببینید
3. Session را دستی تمدید کنید (JSON تازه) سپس status → `active`
4. تا spike تأیید نشده، auto را خاموش نگه دارید (`auto_report_enabled=false`)

## تغییر UI / DOM ترب

اگر health/adapter پیام «فرم زنده وصل نیست» یا خطای ساختاری داد:

1. Kill switch
2. فقط dry-run / گزارش دستی از پیش‌نمایش
3. spike مجدد روی ساختار صفحه گزارش؛ بدون دور زدن CAPTCHA

## Rate limit

`max_reports_per_hour` در settings + `daily_cap` per account.  
اگر صف انباشته شد: سقف را پایین بیاورید، نه بالا.

## Correlation

Audit: `torob_ops_*` در `audit_logs` / `log_event`.  
Report logs: `finding_id`, `account_id`, `mode`, `result`, `notes`.

## Worker

```powershell
# Staging :3100 — پس از تنظیم TOROB_OPS_WORKER_TOKEN در .env.lan
.\deploy\lan\scripts\torob-ops-report-worker.ps1
```

لاگ: `deploy/lan/logs/torob-ops-report-worker.log`

## Promote به :3000

چک‌لیست در `docs/torob-ops/PROD-TRANSFER.md` — auto flag خاموش تا تأیید کتبی.
