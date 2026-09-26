# STATE — رونویسی تماس، فاز A

تاریخ به‌روزرسانی: 2026-09-26 (G6 docs؛ PR بعدی)
شاخه: `feature/call-transcription`
worktree: `D:\AfraKalaTest\wt-call-transcription`

## HANDOFF STATE

- **gate فعلی:** G3–G5 تمام؛ G6 در حال commit/PR
- **آخرین گام تمام‌شده:** Playwright زنده+نهایی 2 passed؛ بنچمارک در g3-bench.json
- **گام بعدی:** commit + push + `gh pr create` به staging (ادغام نشود)
- **مسدودکننده‌های باز:** WER بدون کلیپ eval؛ فایروال C4 اقدام مالک
- **کانتینر / سرویس تازه‌استارت‌شده:** `afrakala-lan-web` (چند recreate)؛ `afrakala-stt`
- **SHA وب 3100:** ایمیج شامل UI است؛ برچسب GIT_SHA تا commit بعدی `c8396231`
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
