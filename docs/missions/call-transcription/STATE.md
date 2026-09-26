# STATE — رونویسی تماس، فاز A

تاریخ به‌روزرسانی: 2026-09-26 (R1–R6 rework)
شاخه: `feature/call-transcription`
worktree: `D:\AfraKalaTest\wt-call-transcription`

## HANDOFF STATE

- **gate فعلی:** G6 بازکاری R1–R6؛ REPORT بازنویسی شد؛ PR #480 باز، ادغام نشده
- **آخرین گام تمام‌شده:** شواهد A1/A4–A9/A11؛ بنچ WER چهار موتور؛ preload+/health not-ready؛ runbook؛ STATUS PARTIAL
- **گام بعدی:** مالک runbook؛ ثابت نگه داشتن ۳۱۰۰ روی این شاخه (Q2=a) — ایمیج چند بار با `staging`/`77e25dfb` عوض شد
- **مسدودکننده‌های باز:** A2 timeoutها؛ A3 نه ۳۴۵ دقیقه صدا؛ A10 SHA بعد از commit
- **کانتینر:** `afrakala-stt` preload؛ `afrakala-lan-web` باید `feature/call-transcription` باشد
- **PR:** https://github.com/mohammadrezaafra66-arch/get-git-going/pull/480
- **مهاجرت:** 592، 593
- **شمارهٔ بعدی مهاجرت:** 594

## تصمیم‌های مالک (G1)

Q1=a Q2=a Q3=a Q4=a. C1–C6 در DESIGN.md.

## موتور (§5)

- زنده: vosk-model-fa-0.42 (A1)
- نهایی: AmirMohseni/whisper-small-persian CT2 int8
- مدل‌ها: `D:\afrakala-stt\models`

## شواهد فشرده

- WER: vosk 0.193 / fa-small-ct2 0.270 / large-v3 0.311 / small 0.622
- A5 2/2 + 2/2
- A6/A7 G2_PROOF_PASS
- A8_PASS
- A9 CPU_PCT=0.750 RSS_MB=16.83 TOKEN_ON_CMDLINE=no
- typecheck unique 39 EXIT=0
- health not-ready → ready ~58s
