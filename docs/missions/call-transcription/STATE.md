# STATE — رونویسی تماس، فاز A

تاریخ به‌روزرسانی: 2026-09-26 (G6 complete)
شاخه: `feature/call-transcription` @ `b895fe24`
worktree: `D:\AfraKalaTest\wt-call-transcription`

## HANDOFF STATE

- **gate فعلی:** G0–G6 تمام؛ PR باز، ادغام نشده
- **آخرین گام تمام‌شده:** commit `b895fe24` + PR #480 به staging
- **گام بعدی:** بازبینی مالک؛ فایروال C4؛ دیدن UI روی 3100
- **مسدودکننده‌های باز:** WER بدون کلیپ eval؛ فایروال C4 اقدام مالک
- **کانتینر / سرویس تازه‌استارت‌شده:** `afrakala-lan-web`؛ `afrakala-stt`
- **SHA وب 3100:** ایمیج شامل UI است؛ برچسب داخل کانتینر ممکن است هنوز `c8396231` باشد
- **PR:** https://github.com/mohammadrezaafra66-arch/get-git-going/pull/480
- **مهاجرت اعمال‌شده:** 592، 593
- **شمارهٔ بعدی پیشنهادی مهاجرت:** 594

## تصمیم‌های مالک (G1)

Q1=a Q2=a Q3=a Q4=a. C1–C6 در DESIGN.md.

## شواهد فشرده

- G2_PROOF_PASS
- C1 داخل کانتینر 200
- A4 forwarded_n=0
- A1 گرم ۸ استریم RTF max 0.37
- latency 40: p50 24.5ms p95 43.85ms
- Rocky 3.6.8 RSS 17MB
- Playwright 2 passed
- Typecheck unique 39 EXIT=0
- Ollama `/api/ps` خالی
