# AfraKala Phase 6 - Lovable Prompt Rules

Status: Active Governance Rule
Phase: 6
Scope: Fixed operating prompt for Lovable UI work
Source of truth: GitHub repository

---

## 1. هدف این سند

این سند قانون ثابت استفاده از Lovable در پروژه AfraKala است.

Lovable فقط برای کارهای UI استفاده می‌شود.

Lovable نباید منبع تصمیم‌گیری برای backend، database، Worker، automation، OpenAPI، deployment یا governance باشد.

این سند باید همراه این دو سند خوانده شود:

- docs/governance/LOVABLE_CURSOR_BOUNDARY.md
- docs/governance/BRANCH_STRATEGY.md

---

## 2. نقش Lovable

Lovable فقط مجاز است روی این موارد کار کند:

- ظاهر صفحات
- کامپوننت‌های React
- فرم‌ها
- جدول‌ها
- داشبوردهای ظاهری
- layout
- منوی سایت
- متن‌های فارسی قابل نمایش به کاربر
- RTL
- responsive design
- loading state
- empty state
- error state
- اتصال UI به APIهای تاییدشده

Lovable نباید کارهای زیر را انجام دهد:

- backend logic
- Worker runtime
- multi-robot execution
- database migrations
- Supabase migrations
- authentication security logic
- pricing engine logic
- GitHub Actions
- deployment
- production configuration
- governance rules

---

## 3. Branch مجاز Lovable

Branch پیشنهادی برای Lovable:

lovable/ui-staging

Lovable نباید مستقیم روی این branchها کار کند:

- main
- staging
- cursor/api-*
- cursor/worker-*
- cursor/db-*
- cursor/phase6-*
- hotfix/*

قبل از شروع کار در Lovable باید این موارد چک شود:

1. branch فعال Lovable چیست؟
2. آیا branch فعال همان lovable/ui-staging است؟
3. آیا آخرین نسخه branch sync شده؟
4. آیا کار خواسته‌شده فقط UI است؟
5. آیا API موردنیاز از قبل تعریف شده؟
6. اگر backend/API/database/Worker لازم است، Lovable باید توقف کند و گزارش بدهد.

---

## 4. مسیرهای مجاز برای Lovable

Lovable معمولاً فقط می‌تواند این مسیرها را تغییر دهد:

- src/components/**
- src/routes/**
- src/shared/components/**
- src/hooks/** فقط برای رفتار UI
- src/lib/** فقط اگر helper ظاهری UI باشد
- .lovable/**

تغییرات باید کوچک، مشخص و قابل review باشند.

---

## 5. مسیرهای ممنوع برای Lovable

Lovable نباید این مسیرها را تغییر دهد:

- automation/**
- automation/worker-runtime/**
- automation/openapi/**
- openapi/**
- supabase/migrations/**
- server/**
- .github/**
- .cursor/**
- deploy/**
- docs/governance/**
- .env
- .env.*
- فایل‌های secret
- production config

اگر Lovable به یکی از این مسیرها نیاز داشت، باید توقف کند و از Cursor بخواهد آن بخش را در branch مناسب انجام دهد.

---

## 6. قانون API برای Lovable

Lovable حق ندارد API حدسی بسازد.

Lovable حق ندارد endpoint جدید از خودش اختراع کند.

Lovable حق ندارد payload یا response shape را حدس بزند.

Lovable فقط باید از APIهای تاییدشده استفاده کند.

مکان قراردادهای API:

- automation/openapi/automation-v1.yaml
- openapi/** اگر بعداً اضافه شود

اگر API لازم وجود نداشت، Lovable باید این گزارش را بدهد:

Missing API required for UI

Page/component:
-

User action:
-

Required endpoint:
-

Required request data:
-

Required response data:
-

Why UI cannot continue without backend/API support:
-

Suggested owner:
Cursor API branch

---

## 7. پرامپت ثابت برای Lovable

این متن باید ابتدای کارهای Lovable استفاده شود:

You are working on the AfraKala platform.

Your role is UI-only.

Before making changes:
1. Confirm that the active branch is the approved Lovable UI branch.
2. Sync the latest state of the active branch.
3. Treat GitHub as the source of truth.
4. Follow these files:
   - docs/governance/LOVABLE_CURSOR_BOUNDARY.md
   - docs/governance/BRANCH_STRATEGY.md
   - docs/governance/LOVABLE_PROMPT_RULES.md
5. Check whether the task is UI-only.

Allowed:
- Improve UI pages, React components, forms, tables, dashboards, layout, RTL, Persian copy, mobile responsiveness, loading states, empty states, error states, and navigation.
- Connect UI only to approved API contracts.

Forbidden:
- Do not edit automation, Worker, backend, database migrations, GitHub Actions, deployment, governance files, secrets, production configs, auth/security logic, pricing engine, or business logic.
- Do not create API endpoints by guessing.
- Do not create database migrations.
- Do not create Worker logic.
- Do not connect staging to production data.
- Do not work directly on main.

If backend/API/database/Worker work is needed:
- Stop.
- Do not implement it.
- Report the missing requirement clearly.
- Explain which UI action needs which API/data.

---

## 8. قانون نهایی

Lovable مجاز است UI را بهتر کند.

Lovable مجاز نیست معماری پروژه را تغییر دهد.

اگر کار فقط UI نیست، Lovable باید توقف کند و موضوع را برای Cursor گزارش کند.
