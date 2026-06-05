# تصمیم نهایی اجرای پروژه — AfraKala Automation / Multi-Robot Platform

**Phase Label:** PHASE-0  
**Status:** Accepted — Executive Decision  
**Owner:** محمدرضا افرا  
**Date:** 2026-06-05  
**Repository:** `get-git-going` (Control Plane / Core)

> این سند مرجع اجرایی رسمی فاز صفر و دروازه ورود به فاز ۱ است.  
> نسخه قابل استناد فقط در GitHub است. Google Drive فقط Mirror / Review Pack.

---

## ۱. Freeze کردن baseline فعلی

**تصمیم:** قبل از هر توسعهٔ جدید، baseline فعلی پروژه freeze و ثبت می‌شود.

| مورد | مسیر / مرجع |
|------|-------------|
| Baseline manifest | `docs/baseline/BASELINE_MANIFEST.md` |
| Baseline pointer | `docs/baseline/BASELINE_POINTER.md` |
| Tag پیشنهادی | `baseline/v2026.06.05` یا tag بعدی پس از Review Baseline |
| ADRهای freeze | `docs/adr/ADR-0001` … `ADR-0008` + `ADR-0001-phase0-architecture-freeze.md` |

**قانون:** هیچ Task Packet Phase-1 قبل از ثبت و review baseline جدید شروع نمی‌شود.

---

## ۲. GitHub = Source of Truth رسمی

**تصمیم:** GitHub تنها منبع رسمی کد، سند، ADR، قرارداد، migration و تصمیم معماری است.

| لایه | Source of Truth |
|------|-----------------|
| کد و schema | GitHub |
| ADR و governance | GitHub |
| Runtime data | Supabase / PostgreSQL |
| UI | React / TanStack / Lovable (فقط UI) |

مرجع: `docs/process/SOURCE_OF_TRUTH.md`, ADR-0002, ADR-0008

---

## ۳. Google Drive = Mirror / Review Pack فقط

**تصمیم:** Drive محل تصمیم‌گیری، نسخه اصلی، یا ویرایش رسمی نیست.

- جهت مجاز: GitHub → Drive (export/mirror)
- ممنوع: Drive → GitHub بدون PR
- ممنوع: secret، `.env`، dump روی Drive

مرجع: ADR-0008, `docs/process/SOURCE_OF_TRUTH.md`

---

## ۴. Review Baseline قبل از هر توسعه جدید

**تصمیم:** هر شروع توسعه (شامل Task Packet جدید) باید Review Baseline گذرانده باشد.

چک‌لیست رسمی: [`REVIEW_BASELINE_CHECKLIST.md`](./REVIEW_BASELINE_CHECKLIST.md)

حداقل موارد:

1. `npm run build`
2. typecheck (اگر script مستقل وجود دارد)
3. `npm run lint`
4. بررسی اسناد پایه (ADR، baseline، Phase Label، G-01…G-08)
5. بررسی migrationها و dependencyها

**قانون توقف:** اگر Review Baseline fail شود، Task بعدی شروع نمی‌شود.

---

## ۵. بستن ابهام‌های G-01 تا G-08 قبل از Phase 1

**تصمیم:** ورود به Phase 1 فقط پس از بسته شدن کامل G-01…G-08 مجاز است.

مرجع: `docs/process/PHASE0_OPEN_QUESTIONS_G01_G08.md`  
وضعیت: [`G01_G08_CLOSURE_STATUS.md`](./G01_G08_CLOSURE_STATUS.md)

---

## ۶. محدوده Phase 0 Automation

**تصمیم:** فاز صفر اتوماسیون **فقط** شامل موارد زیر است:

| # | محور | وضعیت هدف | Task Packet / مسیر |
|---|------|-----------|-------------------|
| 1 | Contract | تعریف و یکپارچه‌سازی | `automation/openapi/`, `automation/schemas/`, WPC-0-002 |
| 2 | Database Table / Migration | جداول automation | migration جدا (Task Packet migration) |
| 3 | Worker Dummy | بدون اتصال خارجی | WPC-0-001 |
| 4 | Heartbeat | قرارداد + مسیر dummy | OpenAPI + Worker Dummy |
| 5 | Checkpoint | قرارداد + ثبت dummy | DB + events (فاز پیاده‌سازی) |
| 6 | Job Lifecycle | command → claim → run → complete | OpenAPI + DB |
| 7 | E2E Demo | UI → DB → Worker → UI | WPC-0-001 |
| 8 | Acceptance Review | تأیید رسمی پایان فاز ۰ | `PHASE0_ACCEPTANCE_GATE.md` |

**خارج از scope فاز ۰:** هر ماژول عملیاتی واقعی، ربات واقعی، AI/OCR/STT production.

> **توجیه:** این بند migration را در فاز ۰ مجاز می‌داند (هم‌راستا با G-04). در صورت تناقض با خط قدیمی ADR-0005 دربارهٔ «عدم migration»، **این سند executive decision** اولویت دارد.

---

## ۷. ممنوعیت‌های سخت Phase 0

در فاز صفر ساخت موارد زیر **مجاز نیست:**

- Divar real bot
- WhatsApp real bot
- Instagram real bot
- Real Torob extractor
- OCR/STT production
- AI production
- Parallel core / database / admin panel / API
- Redis/RabbitMQ بدون ADR جدید
- Laravel یا backend موازی

مرجع: ADR-0001, ADR-0004, ADR-0005, `docs/process/PHASE_LABEL_POLICY.md`

---

## ۸. دروازه ورود به Phase 1

**تصمیم:** Phase 1 فقط پس از **تأیید کامل Phase 0 Acceptance Criteria** مجاز است.

مرجع: [`PHASE0_ACCEPTANCE_GATE.md`](./PHASE0_ACCEPTANCE_GATE.md)

امضای موردنیاز:

- [ ] مالک فنی (محمدرضا افرا)
- [ ] Review Baseline آخرین commit
- [ ] G-01…G-08 بسته
- [ ] E2E dummy بدون real bot
- [ ] هیچ parallel core در diff

---

## ۹. اجرای Phase 1 با Task Packetهای شماره‌دار

**تصمیم:** Phase 1 فقط از طریق Task Packetهای شماره‌دار اجرا می‌شود:

- از **Task Packet 1.1**
- تا **Task Packet 2.6**

فهرست قفل‌شده تا پایان فاز ۰: [`PHASE1_TASK_PACKET_INDEX.md`](./PHASE1_TASK_PACKET_INDEX.md)

هر Packet باید داشته باشد: Phase Label، Allowed/Forbidden files، ADR refs، Test plan، Stop conditions (طبق `docs/process/DOR.md` / `DOD.md`).

---

## ۱۰. ممنوعیت شروع Phase 1 قبل از اتمام Phase 0

**تصمیم:** هیچ Task Packet از Phase 1 (1.1…2.6) قبل از بسته شدن کامل Phase 0 وارد اجرا نمی‌شود.

Cursor، Lovable و contributors باید در PR template و Task Packet صراحتاً بنویسند:

> Phase 0 complete: NO — do not start Phase 1 work

یا پس از acceptance:

> Phase 0 complete: YES — Phase 1 packet &lt;ID&gt; authorized

---

## نگاشت به ADR

| تصمیم | ADR |
|-------|-----|
| 1–3 | ADR-0001, ADR-0008, ADR-0002 |
| 4 | — (عملیاتی؛ `REVIEW_BASELINE_CHECKLIST.md`) |
| 5 | G-01…G-08 |
| 6–7 | ADR-0005, ADR-0006, ADR-0007 |
| 8–10 | ADR-0005, `PHASE_LABEL_POLICY` |

---

## Related

- [REVIEW_BASELINE_CHECKLIST.md](./REVIEW_BASELINE_CHECKLIST.md)
- [PHASE0_ACCEPTANCE_GATE.md](./PHASE0_ACCEPTANCE_GATE.md)
- [G01_G08_CLOSURE_STATUS.md](./G01_G08_CLOSURE_STATUS.md)
- [PHASE1_TASK_PACKET_INDEX.md](./PHASE1_TASK_PACKET_INDEX.md)
- [RUNBOOK_PHASE0.md](./RUNBOOK_PHASE0.md)
