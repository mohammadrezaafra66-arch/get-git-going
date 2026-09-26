# درخواست بازبینی — `feature/call-transcription` → `staging`

ادغام نکنید مگر مالک بگوید. فقط تست `192.168.170.8`.

## چه چیزی عوض شد

- جداول `call_transcript_sessions` / `call_transcript_segments` + RLS + توابع لینک (592/593)
- هوک `POST /api/public/hooks/call-transcript` با توکن اختصاصی
- importer: `recording_files` / `leg_uniqueids` در metadata
- سرویس `deploy/stt` (compose جدا `afrakala-stt` روی `:8090`)
- `capture_agent.py` stdlib / Python 3.6
- UI زنده داخل شیت تماس ورودی + پرونده + فعالیت تلفنی

## ریسک

- مهاجرت‌ها additive هستند؛ `MIN(uuid)` در 592 با 593 عوض شد
- وب 3100 روی این شاخه است (Q2=a) — به `e0374408` برنگشت
- STT تا ۶ CPU / ۱۶GB می‌گیرد؛ Ollama روی هاست idle بود
- فایروال 8090 هنوز باز نشده (C4 اقدام مالک)

## تست‌شده

- G2_PROOF_PASS (RLS/idempotency/cross-link/anon deny)
- C1 از داخل کانتینر STT
- A4 سکوت/نویز
- A1 گرم ۸ استریم RTF 0.37
- Playwright `e2e/sales-desk/call-transcript-live.spec.ts` — 2 passed
- typecheck unique 39 / baseline 39

## تست‌نشده

- PBX واقعی / Issabel
- WER روی گفتار فارسی ضبط‌شده
- پیام‌رسان → `/v1/audio/transcriptions`
- قاعده فایروال ویندوز
