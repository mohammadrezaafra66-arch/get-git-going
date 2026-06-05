# OpenAPI Canonical Resolution — Phase-0

**Phase Label:** PHASE-0  
**Status:** Active  
**Owner:** Platform maintainers  
**Date:** 2026-06-05

## تصمیم رسمی (canonical)

طبق **ADR-0007**، تنها قرارداد OpenAPI رسمی فاز صفر این مسیر است:

```
automation/openapi/automation-v1.yaml
```

همراه با JSON Schemaهای هم‌مسیر:

```
automation/schemas/heartbeat.schema.json
automation/schemas/job.schema.json
```

پیاده‌سازی Control Plane یا Worker باید **فقط** علیه این مسیر انجام شود. هیچ endpoint اجرایی جدید خارج از این قرارداد در فاز صفر ساخته نمی‌شود.

## چرا دو فایل وجود دارد؟

در ریپو دو نسخه از قرارداد automation دیده می‌شود. این دوگانگی عمدی نیست — نتیجهٔ دو موج مستندسازی موازی است.

| ویژگی | **Canonical** `automation/openapi/automation-v1.yaml` | **Legacy draft** `openapi/automation-v1.yaml` |
|--------|------------------------------------------------------|-----------------------------------------------|
| مرجع ADR | ADR-0007 (Accepted) | G-06 / WPC-0-001 (ارجاع اولیه، قبل از یکپارچه‌سازی) |
| OpenAPI version | 3.1.0 | 3.0.3 |
| `info.version` | `1.0.0-phase0` | `0.1.0` → اکنون `0.0.0-deprecated` |
| واژگان API | `jobs` — `/jobs/claim`, `/jobs/{jobId}/status` | `commands` + `runs` — `/commands/claim`, `/runs/{run_id}` |
| Schema | `$ref` به `automation/schemas/*.json` | Inline components (`AutomationCommand`, `AutomationRun`, …) |
| امنیت | `WorkerBearerAuth` (bearer) | تعریف نشده |
| Heartbeat response | `200` + `HeartbeatAck` | `202` بدون body schema |
| Claim empty queue | `204 No Content` | `200` با `command: null` |
| Status job/command | در schema جدا (job.schema) | `PENDING`, `CLAIMED`, `CANCELLED`, `EXPIRED` |
| Status اجرا | `running/succeeded/failed` در job status update | `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` در `AutomationRun` |
| Checkpoint / events | در baseline canonical نیست (فاز بعد) | `/runs/{run_id}/events` با `CHECKPOINT_SAVED` |

## هم‌راستایی با جداول DB

Migration فاز صفر (`20260605120000_phase0_automation_tables.sql`) از مدل **command + run** پیروی می‌کند:

- `automation_jobs.status` → `PENDING`, `CLAIMED`, `CANCELLED`, `EXPIRED` (نزدیک به legacy draft)
- `automation_job_runs.status` → `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`

**نکته:** canonical OpenAPI هنوز مسیر `/jobs/*` دارد، نه `/commands/*` و `/runs/*`. نگاشت DB ↔ API در Task Packet بعدی (API implementation) باید صریح شود — بدون ساخت قرارداد دوم.

## اقدام انجام‌شده

1. `openapi/automation-v1.yaml` به **stub deprecated** تبدیل شد (مسیر حفظ می‌شود؛ محتوای قراردادی حذف شد).
2. `openapi/README.md` به canonical اشاره می‌کند.
3. این سند تفاوت‌ها را ثبت و canonical را تأیید می‌کند.

## کارهای ممنوع

- پیاده‌سازی همزمان دو قرارداد
- حذف ناگهانی `openapi/automation-v1.yaml` بدون PR
- endpoint اجرایی جدید
- migration یا ربات واقعی

## به‌روزرسانی ارجاعات (WPC-0-002)

این PR اصلاح شد:

- `docs/process/PHASE0_OPEN_QUESTIONS_G01_G08.md` (G-06) → canonical path
- `docs/automation/task-packets/WPC-0-001-worker-dummy.md` → canonical path

هر ارجاع جدید باید فقط `automation/openapi/automation-v1.yaml` را cite کند.

## معیار پذیرش

- [ ] تیم canonical را `automation/openapi/automation-v1.yaml` می‌داند
- [ ] هیچ PR جدیدی علیه `openapi/automation-v1.yaml` (stub) پیاده‌سازی نمی‌کند
- [ ] نگاشت DB ↔ canonical API در Task Packet API implementation مشخص می‌شود

## Related

- [OPENAPI_BASELINE_AUDIT.md](./OPENAPI_BASELINE_AUDIT.md)
- [WPC-0-002-openapi-canonical-cleanup.md](./task-packets/WPC-0-002-openapi-canonical-cleanup.md)
- [ADR-0007-automation-contracts.md](../adr/ADR-0007-automation-contracts.md)
- [openapi/README.md](../../openapi/README.md)
- [automation/openapi/automation-v1.yaml](../../automation/openapi/automation-v1.yaml)
