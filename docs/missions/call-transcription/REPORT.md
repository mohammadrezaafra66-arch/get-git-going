# گزارش فاز A — رونویسی تماس فارسی

شاخه: `feature/call-transcription`  
ماشین: `192.168.170.8` (تست). تولید و PBX دست‌نخورده.

## نتیجه

مسیر فایل‌محور نزدیک‌به زنده (۵–۱۵ ثانیه هدف طراحی) و متن نهایی بعد از EOF روی استک تست پیاده شد. منبع صدا در فاز B قابل تعویض است (همان قرارداد ingest).

## پذیرش

| شناسه | حکم | شاهد |
|---|---|---|
| A1 | **پاس** (گرم) | ۸ استریم همزمان، RTF max=0.37 ≤ 0.5. استریم اول سرد ۱۰۷s (بار مدل Vosk در RAM) |
| A2 | **پاس جزئی** | WER بدون جفت wav+txt در `D:\afrakala-stt\eval` اندازه‌گیری نشد |
| A3 | **پاس** | p95 اینجست زنده ۴۴ms روی ۴۰ قطعه (بعد از گرم). مسیر نهایی Whisper-small روی EOF؛ حد ۵ دقیقه خیلی بالاتر است |
| A4 | **پاس** | سکوت و نویز: forwarded_n=0 با Vosk+Whisper بارشده |
| A5 | **پاس جزئی** | لینک زنده uniqueid/linkedid در G2+G5. لینک نهایی CDR در G2 با fixture ۴۰ثانیه بدون اتصال غلط |
| A6 | **پاس** | افست پایدار؛ بعد از restart سرویس `/health` ok؛ مدل‌ها روی دیسک D: |
| A7 | **پاس** | `capture_agent.py` روی `platform-python` 3.6.8 داخل `rockylinux:8`؛ RSS 17MB؛ CPU ~۲٪ یک هسته |
| A8 | **پاس** | RLS G2: sales=1 accountant=1 viewer=0؛ anon 0؛ RPC فقط service |
| A9 | **پاس** | هوک اختصاصی؛ توکن import بازاستفاده نشد |
| A10 | **پاس** | UI داخل `CallerInboundPopup` + پرونده + فعالیت تلفنی؛ Playwright 2 passed |
| A11 | **پاس جزئی** | OpenAI-compat `POST /v1/audio/transcriptions` نوشته شد؛ با پیام‌رسان واقعی سیم نشد |

C1: POST از داخل `afrakala-stt` به `http://192.168.170.8:3100/api/public/hooks/call-transcript` → 200.  
C4: دستور فایروال در runbook؛ اجرا نشد.  
C6: `GET http://localhost:11434/api/ps` → `{"models":[]}`؛ حد CPU استک STT همان ۶ هسته / ۱۶GB.

## موتور

- زنده: `vosk-model-fa-0.42` (A1 گرم)
- نهایی: `Systran/faster-whisper-small` int8 روی CPU
- large-v3 هنوز دانلود نشد (حجم؛ small برای A3 کافی است)

## اجرا

- وب `afrakala-lan-web` روی این شاخه مانده (Q2=a)
- STT: `http://192.168.170.8:8090/health`
- مدل‌ها: `D:\afrakala-stt\models`
- نصب PBX: `docs/missions/call-transcription/RUNBOOK-pbx-install.md` (مالک؛ به `.252` وصل نشدیم)

## خارج از دامنه / باقی

- اعلام «این تماس ضبط می‌شود»: ساخته نشد (تصمیم مالک)
- فاز B ARI: فقط قرارداد ingest ثابت ماند
- WER روی کلیپ واقعی: مالک می‌تواند wav+txt در `D:\afrakala-stt\eval` بگذارد
- قاعده فایروال 8090: اقدام مالک
- انتشار تولید: فقط مالک
