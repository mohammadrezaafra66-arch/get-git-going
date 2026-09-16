# Torob Ops Path A — چک‌لیست پذیرش (:3100)

تاریخ اجرا: 2026-09-17 (re-verified on :3100 tip 2d9a5b20)  
SHA وب: ببینید `docker exec afrakala-lan-web printenv APP_GIT_SHA`  
هارنس: `npx tsx docs/verification/torob-ops-path-a-accept.ts` → خروجی `docs/verification/_torob_path_a_accept.out`

## نتایج

| فاز | معیار | وضعیت |
|-----|--------|--------|
| ۲ | enrichment فقط‌خواندنی (≥۱ سیگنال قوی + phones) | PASS (هارنس) |
| ۲ | own shops insert | PASS |
| ۲ | pagination page size ۲۵ | PASS |
| ۳ | گیت پیش‌نمایش: `manual_review` بلاک | PASS |
| ۳ | e2e UI preview پس از unlock | PASS (۳ تست playwright) |
| ۴ | worker auto با `TOROB_OPS_SIMULATE_SUBMIT=1` + لاگ/audit | PASS (نه hit زندهٔ ترب) |
| ۴ | correlation id روی report_logs | PASS |
| ۵ | ۲ اکانت؛ quarantine A → pick B | PASS |
| ۶ | kill switch صف را صفر می‌کند | PASS |
| ۶ | flag `auto_report_enabled` پس از تست خاموش | PASS |
| ۶ | cutover `:3000` | **مسدود روی این هاست:** `C:\afrakala` گیت ندارد و کانتینر وب `:3000` در حال اجرا نیست — کد روی `staging` آمادهٔ promote است |

## عمداً باز

- اتصال adapter به فرم زندهٔ ترب (spike جدا + تأیید مالک)
- Promote به `:3000` تا وقتی ریپوی پرود و بکاپ آماده باشد

## دستور تکرار

```powershell
$env:AFRAKALA_LAN_ENV="D:\AfraKalaTest\app\deploy\lan\.env.lan"
cd D:\AfraKalaTest\wt-staging-torob
npx --yes tsx docs/verification/torob-ops-path-a-accept.ts
$env:TOROB_OPS_E2E_PASSWORD="e2e-path-a-module-pass"
$env:E2E_BASE_URL="http://127.0.0.1:3100"
npx playwright test e2e/torob-ops/torob-ops-path-a*.spec.ts --reporter=line
```

