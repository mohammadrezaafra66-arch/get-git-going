# STATE — رونویسی تماس، فاز A

تاریخ به‌روزرسانی: 2026-09-26 (G2 complete → G3)
شاخه: `feature/call-transcription`
worktree: `D:\AfraKalaTest\wt-call-transcription`

## HANDOFF STATE

- **gate فعلی:** G2 تمام شد؛ بعدی G3
- **آخرین گام تمام‌شده:** مهاجرت 592+593، hook، RLS/idempotency/cross-link، typecheck
- **گام بعدی:** سرویس STT در `deploy/stt/` + مدل‌ها روی `D:\afrakala-stt\` + بنچمارک
- **مسدودکننده‌های باز:** هیچ
- **کانتینر / سرویس تازه‌استارت‌شده توسط این مأموریت:** فقط `docker restart afrakala-lan-rest` بعد از 592 و 593
- **SHA وب 3100 پیش از هر deploy این مأموریت:** `e0374408`
- **مهاجرت اعمال‌شده:** `20260926183000` (592)، `20260926184500` (593)
- **شمارهٔ بعدی پیشنهادی مهاجرت:** 594

## تصمیم‌های مالک (G1)

Q1=a (Python 3.6؛ خروجی PBX نچسبید). Q2=a (3100 روی این شاخه بماند). Q3=a. Q4=a. C1–C6 در DESIGN.md.

## شواهد G2

- Unit: `npx tsx --test` روی filename/validate/CDR meta — 14 pass, EXIT=0
- Live Kong: `node docs/missions/call-transcription/g2-proof.mjs` → `G2_PROOF_PASS`
  - sales=1, accountant=1, viewer=0, manager=4, admin=4, anon_n=0 (401)
  - idempotency before=1 after=1
  - two calls 40s apart: `crossLinkUnlinked=t`
  - anon RPC 401 / 42501؛ sales RPC 403 / 42501
- Typecheck: raw 73، unique 39، at or below baseline 39، EXIT=0

## سازگاری‌ها

| فرض | یافته | کار به‌جای آن |
|---|---|---|
| `MIN(uuid)` در SQL | Postgres MIN برای uuid ندارد | 593 با COUNT + SELECT جدا |
| Ollama در Docker | API روی `:11434` idle است | حد CPU همان طرح |
| worktree بدون `node_modules` | junction به `app\node_modules` برای typecheck | commit نمی‌شود |

## بنچمارک

خالی — مال G3.
