# STATE — رونویسی تماس، فاز A

تاریخ به‌روزرسانی: 2026-09-26 (G1 awaiting owner)
شاخه: `feature/call-transcription`
worktree: `D:\AfraKalaTest\wt-call-transcription`
HEAD: `e0374408`

## HANDOFF STATE

- **gate فعلی:** G1 نوشته شد؛ منتظر پاسخ مالک
- **آخرین گام تمام‌شده:** `DESIGN.md` commit شد
- **گام بعدی:** اعمال پاسخ مالک (یا پیش‌فرض‌های «تأیید») در بخش «تصمیم‌های مالک»، commit، سپس G2 بدون توقف
- **مسدودکننده‌های باز:** پاسخ G1 مالک (پرسش‌های ۱–۴ در DESIGN.md)
- **کانتینر / سرویس تازه‌استارت‌شده توسط این مأموریت:** هیچ
- **SHA وب 3100 پیش از هر deploy این مأموریت:** `e0374408` (برابر `origin/staging` و برابر `printenv APP_GIT_SHA` در `afrakala-lan-web`)
- **مهاجرت اعمال‌شده توسط این مأموریت:** هیچ
- **بالاترین مهاجرت زنده روی DB تست `afrakala`:** `20260926161000` (سریال 591، `deal_history_permission`)
- **شمارهٔ بعدی پیشنهادی مهاجرت:** 592 — در لحظهٔ نوشتن دوباره از دیسک و remote گرفته شود

## تصمیم‌ها (با دلیل)

| تصمیم | دلیل |
|---|---|
| کار فقط در `wt-call-transcription` / `feature/call-transcription` | قاعدهٔ مأموریت + M5 |
| مبدأ شاخه `origin/staging` @ `e0374408` | دستور G0؛ PR بعدی به `staging` |
| محل داده/مدل روی `D:\afrakala-stt\` | C: حدود 39.7 GB آزاد؛ D: حدود 822.4 GB آزاد؛ دیسک Docker روی C است |
| در G5 متن زنده داخل popup تماس جاسازی می‌شود | `origin/feature/salesdesk-9-fixes` جدِ `origin/staging` است (`merge-base --is-ancestor` exit 0) |

## سازگاری‌ها (فرض → یافته → کار به‌جای آن)

| فرض مأموریت / پژوهش 8f4ef3ee | یافته روی staging زنده | کار به‌جای آن |
|---|---|---|
| کار Caller ID فقط در worktree `wt-salesdesk-9-fixes` است و نباید popup را ویرایش کرد مگر جد بودن | `106ae89a` جد `e0374408` است؛ popup نسخهٔ 9-fixes روی همین checkout است (مهاجرت 563 هم هست) | G5 متن زنده را داخل `CallerInboundPopup` می‌گذارد |
| Ollama روی همین CPU روشن است و باید در بنچمارک لحاظ شود | در G0 هیچ کانتینر/فرآیند `ollama` در `docker ps` و `Get-Process` دیده نشد | در G3 بار ماشین همان لحظه دوباره اندازه گرفته می‌شود؛ اگر Ollama روشن شد در جدول بنچمارک ثبت می‌شود |
| پوشهٔ `D:\afrakala-stt` از قبل هست | پوشه وجود ندارد | در G3 ساخته می‌شود (`models`, `data`, `eval`) |
| پژوهش روی شاخهٔ `test/collab-e2e-20260921-2352` @ `8f4ef3ee` | این worktree `e0374408` است؛ آخرین مهاجرت 591 است نه 558 | هر وابستگی دوباره روی این checkout و DB زنده سنجیده شد |

## Ground truth re-verified

| واقعیت | هنوز درست؟ | شاهد |
|---|---|---|
| CDR گام ۲ `recordingfile` را SELECT نمی‌کند | بله (هنوز غایب) | `src/lib/calls/issabel-cdr.server.ts:357-361`؛ نوع `CdrLeg` بدون فیلد ضبط |
| `uniqueid` و `linkedid` در SELECT پاها هست | بله | همان SELECT |
| `call_logs.external_id = linkedid` | بله | `import-issabel-calls.server.ts:10,364` |
| کلیدهای `metadata` نوشته‌شده: `unknown_number, leg_count, dcontexts, queue, raw_number, stripped_number, matched_via` | بله؛ مسیر ضبط نیست | `import-issabel-calls.server.ts:370-385` + شمارش پژوهش |
| ستون‌های زندهٔ `call_logs` همان ۱۵ ستون پژوهش | بله | `information_schema` روی `afrakala` در G0 |
| ایندکس یکتای `call_logs_external_id_unique_idx` | بله | `pg_indexes` زنده |
| ستون‌های زندهٔ `call_ring_events` شامل `linkedid`, `uniqueid`, `extension`, `employee_id`, `direction` | بله | `information_schema` |
| یکتایی ring: `(linkedid, extension, direction)` وقتی هر دو ناتهی | بله | `call_ring_events_linkedid_ext_dir_uidx` |
| RLS `call_logs` SELECT: خود / admin / manager | بله | `pg_policies` زنده: `Self/admin/manager can view call logs` |
| RLS `call_ring_events` SELECT برای authenticated باز است | بله | `call_ring_events_select_authenticated` |
| هیچ ماژول `call|transcript|phone|issabel` در `role_permissions` | بله | `COUNT=0` روی DB زنده |
| `user_roles.role` از نوع TEXT است | بله | `information_schema` |
| hook حلقه: Bearer `ISSABEL_IMPORT_WORKER_TOKEN` + `checkToken` + `supabaseAdmin` | بله | `issabel-ami-ring.ts:21-28,96` |
| پیام‌رسان: `${WHISPER_API_URL}/v1/audio/transcriptions` زبان `fa`؛ بدون URL خاموش | بله | `transcribe.functions.ts:24-27,61,67` |
| `WHISPER_*` در compose وب نیست | بله | `deploy/lan/docker-compose.yml` |
| popup polling 1000 ms ring / 5000 ms CDR | بله | `CallerInboundPopup.tsx:48-49` |
| Realtime روی این استک نیست | بله (از پژوهش؛ compose بدون سرویس realtime) | پژوهش + `docker ps` بدون کانتینر realtime |
| داخلی‌های نقشه‌شده فقط `403` و `412` | بله | `call_log_extensions`: 10 ردیف، mapped=true فقط آن دو |
| شمار `call_logs` / `call_ring_events` | به‌روز شد | 6979 / 2196 در G0 (پژوهش: 6943 / 2168) |
| `feature/salesdesk-9-fixes` جد `origin/staging` | **تغییر نسبت به پژوهش** — حالا بله | `git merge-base --is-ancestor` exit 0 |
| آخرین مهاجرت فایل و DB | 591 / `20260926161000` | دیسک + `schema_migrations` |
| پوشهٔ `services/` در ریپو نیست | بله | مسیر غایب؛ docs می‌گوید `src/lib/**` |
| Boundary Guard به `feature/*` اجازهٔ مهاجرت می‌دهد | بله | `boundary-guard.yml` (گزارش بازبین) |
| حساب‌های تست `test.<role>@afrakala.local` | بله (اسناد) | `e2e/helpers/role-session.ts:33-39` |
| IP LAN این ماشین `192.168.170.8` | بله | `ipconfig` Ethernet |
| وب 3100 الان `APP_GIT_SHA=e0374408` | بله | `docker exec afrakala-lan-web printenv APP_GIT_SHA` |
| C: کم‌جا / D: جا دارد | بله | C free 39.7 GB؛ D free 822.4 GB |

## شبکه (پروب HEAD، بدون دانلود مدل)

| مقصد | نتیجه | شاهد |
|---|---|---|
| `https://huggingface.co` | 200 | `Invoke-WebRequest -Method Head` 2026-09-26 |
| `https://alphacephei.com` | 200 | همان |
| `https://pypi.org` | 200 | همان |
| `https://hub.docker.com` | 200 | همان |

اتصال به `192.168.170.252` و `192.168.170.10` انجام نشد (ممنوع).

## کانتینرهای دیده‌شده در G0 (فقط مشاهده)

`afrakala-lan-web` (healthy)، `afrakala-lan-kong`، `afrakala-lan-db`، `afrakala-lan-auth`، `afrakala-lan-caddy`، `afrakala-lan-storage`، `afrakala-lan-meta`، `afrakala-lan-rest`، به‌علاوهٔ استک `claudegreenapi-*` که دست‌نخورده می‌ماند.

## بنچمارک

خالی — مال G3.

## فایل‌های کلیدی برای ویرایش بعدی

- `src/lib/calls/issabel-cdr.server.ts` — افزودن `recordingfile` و جمع پاها
- `src/lib/calls/import-issabel-calls.server.ts` — `metadata.recording_files` و `metadata.leg_uniqueids`
- `src/routes/api/public/hooks/` — hook تازهٔ transcript
- `src/components/sales-desk/CallerInboundPopup.tsx` — متن زنده (G5، چون جد بودن تأیید شد)
- `src/routes/_app.sales_.customers_.$customerId.dossier.tsx` + `src/lib/sales-desk/dossier.ts`
- `src/routes/_app.operations.call-activity.tsx` — لیست `call_logs`
- `supabase/migrations/` — جدول + RLS + `role_permissions`
- سرویس STT جدا (محل دقیق در DESIGN.md)
