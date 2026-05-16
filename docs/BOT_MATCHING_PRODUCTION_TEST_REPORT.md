# BOT-MATCHING-PRODUCTION-TEST — گزارش اجرایی

تاریخ: 2026-05-16

تست production-like end-to-end برای زنجیره matching → enforcement → observatory.
هیچ scraper/crawler ساخته نشد؛ هیچ schema/API/UI تغییر نکرد.

## محصول تست‌شده
- name: ظرفشویی بوش 46nw01
- afrakala_product_id: 567966de-1dc9-4fb9-a775-d304035672ba
- SKU: AFK-2026-00025

## Source item تست‌شده
- source_name: torob
- source_product_id: dt7-production-like-test-001
- source_product_url: https://example.test/torob/dt7-production-like-test-001
- confidence_score: 85

## نتایج
- Test 1 candidate upsert: ✅ 201 pending
- Test 2 نمایش UI: ⚠️ تأیید از DB انجام شد، UI session اجرا نشد (warning)
- Test 3 approve: ✅ approved، afrakala_product_id ست شد، matched_by=human، event status_changed
- Test 4 resolve approved: ✅ resolved=true، afrakala_product_id صحیح
- Test 5 upsert رصدخانه با source_match: ✅ mode=updated، duplicate نشد
- Test 6 read-time computation: ✅ values market برگشتند؛ formulas (price_gap_to_market_avg, price_gap_percent_to_market_avg) read-time محاسبه می‌شوند
- Test 7 approved_match_required: ✅ rejected (403)
- Test 8 mismatch: ✅ rejected (409 match_product_mismatch)
- Test 9 quick sales snippet: ⚠️ اجرا نشد (خارج از scope عملیاتی)
- Test 10 PDF hint: ⚠️ اجرا نشد (visual session نبود)

## Cleanup
- match تست disabled شد + event ثبت شد
- 5 cell بازار از row محصول حذف شد
- bot key تستی deactivated + deleted، table access ها حذف شد
- تعداد کل ردیف‌های رصدخانه: 156 (بدون duplicate)

## فایل‌های تغییرکرده
هیچ کد منبعی تغییر نکرد. فقط این فایل گزارش اضافه شد.

## وضعیت نهایی: PASS WITH WARNINGS
دلیل warnings: Test 2 (UI session)، Test 9 (quick sales)، Test 10 (PDF hint) از طریق session بصری اجرا نشدند.
