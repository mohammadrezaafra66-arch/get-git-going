STATUS: PARTIAL

`39683da8` (قبل از این commit) — PR https://github.com/mohammadrezaafra66-arch/get-git-going/pull/480

## A1–A11

| # | Criterion | حکم | شاهد |
|---|---|---|---|
| A1 | Live RTF ≤ 0.5 per stream با ۸ استریم هم‌زمان | PASS | `python deploy/stt/simulator/bench.py` گرم ۸ استریم: RTF mean=0.237 max=0.37 ≤ 0.5. موتور زنده `vosk-model-fa-0.42`. هیچ Whisperای A1 را در ۸ استریم ندارد (large-v3 RTF mean 1.33). |
| A2 | اولین متن زنده در DB ≤ ۱۵s بعد از نوشتن گفته (p95، ≥۴۰) | FAIL | `python docs/missions/call-transcription/a2-a3-latency.py`. n=40. موفق‌ها ۰.۳۵–۲.۸s. ۲۲/۴۰ بدون ردیف تا سقف ۱۵s (timeout). p50=15.0 p95=15.0. انتظار: هر ۴۰ گفته ردیف ≤۱۵s. |
| A3 | متن نهایی ≤ ۵ دقیقه بعد از close (p95) در بار اوج روز (۳۴۵ دقیقه صدا) | FAIL | ۴۸ تماس ۸تایی: p95 close→eof+hook = ۵۷.۵s ≤ ۳۰۰s. `audio_min=14.23` نه ۳۴۵. انتظار: ۳۴۵ دقیقه صدا. `evidence/A3-final.json`. |
| A4 | سکوت و نویز → ۰ قطعه | PASS | bench: silence forwarded_n=0، noise forwarded_n=0. VAD RMS+CV. |
| A5 | ۱۰۰٪ لینک زنده + نهایی روی fixture | PASS | `node docs/missions/call-transcription/a5-link-proof.mjs` → live 2/2، final 2/2، cross 40s unlinked. |
| A6 | RLS به ازای نقش | PASS | `node docs/missions/call-transcription/g2-proof.mjs`: sales=1 accountant=1 viewer=0 manager=4 admin=4 anon_n=0. |
| A7 | تحویل تکراری → ۱ ردیف | PASS | همان g2-proof: beforeDup=1 afterDup=1. |
| A8 | چهار آزمون خطا G4 | PASS | `python docs/missions/call-transcription/g4-faults.py` → `evidence/A8-faults.json`. kill STT: agent ماند، offset ماند، بعد از start ready. kill agent: offset resume. duplicate chunk HTTP 200/200. truncated: crash نشد، offset 8044، closed. |
| A9 | CPU < ۲٪ یک هسته و RSS < ۵۰MB روی Rocky ۸ با ۸ فایل | PASS | `rockylinux:8` + `g4-rocky-retest.sh`: Python 3.6.8. `CPU_PCT=0.750` `RSS_KB=17232` `RSS_MB=16.83`. `PS_AFTER pcpu=1.5 rss=17232`. `TOKEN_ON_CMDLINE=no`. `OFFSET_WRITTEN=yes` owner asterisk. |
| A10 | typecheck بدون خطای جدید؛ e2e سبز؛ `APP_GIT_SHA` = HEAD | FAIL | typecheck: unique 39 / baseline 43، EXIT=0. آخرین deploy `APP_GIT_SHA=39683da8`. بعد از این commit HEAD عوض می‌شود مگر rebuild فوری. Playwright قبلی ۲ passed روی ایمیج شاخه. |
| A11 | هیچ رازی در git | PASS | `git log -p` روی `STT_INGEST_TOKEN` / `CALL_TRANSCRIPT_WORKER_TOKEN`: فقط نام و `=` خالی. هیچ hex بعد از `=`. |

## موتور

قاعدهٔ §5: زنده = دقیق‌ترین با A1؛ نهایی = دقیق‌ترین با A3.

| نامزد | نقش | WER میانگین (۲۰ کلیپ FLEURS fa، ۸ kHz mono) | RTF mean |
|---|---|---|---|
| vosk-model-fa-0.42 | زنده | 0.1926 | — (A1 گرم ۰.۳۷) |
| AmirMohseni/whisper-small-persian CT2 int8 | نهایی | 0.2703 | 0.332 |
| oi-uae/farsi-faster-whisper-large-v3 int8 | نهایی | 0.3110 | 1.334 |
| Systran/faster-whisper-small int8 | baseline | 0.6216 | 0.377 |

انتخاب: زنده `vosk-model-fa-0.42`. نهایی `whisper-small-persian-ct2` (دقیق‌ترین Whisper؛ A3 latency را دارد). large-v3 دانلود شد (`D:\afrakala-stt\models\farsi-faster-whisper-large-v3`، model.bin ۳٫۰۸GB) ولی WER بدتر و RTF>1.

## Unresolved

| انتظار | واقعی |
|---|---|
| A2: p95 ≤ ۱۵s با ردیف واقعی برای ≥۴۰ گفته | ۲۲ timeout بدون ردیف؛ هوک چند بار با ایمیج `staging` (مثل `77e25dfb` PR #483) عوض شد و ۴۰۴ داد |
| A3: ۳۴۵ دقیقه صدا در بار فشرده | ۱۴٫۲۳ دقیقه؛ p95 نهایی ۵۷٫۵s |
| A10: `APP_GIT_SHA` == `git rev-parse --short HEAD` روی ۳۱۰۰ بعد از commit | آخرین verify برابر `39683da8` بود |
| تماس واقعی PBX | آزموده نشده — به `.252` وصل نشدیم |
| فایروال C4 | آزموده نشده — اقدام مالک |

## اقدامات مالک

1. `RUNBOOK-pbx-install.md` روی Issabel
2. یک تماس واقعی
3. اختیاری: ۲۰ ضبط + متن مرجع در `D:\afrakala-stt\eval\` و `python docs/missions/call-transcription/wer-bench.py` داخل `afrakala-stt`
4. بازبینی Gate A — ادغام نکنید
5. انتشار تولید فقط مالک
