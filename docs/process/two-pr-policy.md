# Two PR Policy

Version: 3.9  
Phase: 3.9.5  
Owner: Mehdi Heydari  
Status: Draft  
Scope: Pull request separation policy only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که UI و Core در یک Pull Request قاطی نشوند.

وقتی یک قابلیت هم بخش فنی دارد و هم بخش ظاهری، باید با دو PR جدا جلو برود:

1. PR اول برای Core / Contract / Backend
2. PR دوم برای UI / Lovable

این قانون جلوی این خطرها را می‌گیرد:

- سخت‌شدن review
- خراب‌شدن UI توسط تغییرات Core
- خراب‌شدن backend یا contract توسط تغییرات UI
- واردشدن migration و UI در یک PR
- گم‌شدن مسئولیت بین Lovable و Cursor
- سخت‌شدن rollback

---

## 2. قانون طلایی

اگر یک کار هم UI دارد هم Core، باید دو PR جدا داشته باشد.

PR ترکیبی فقط وقتی قابل قبول است که:

- Handoff داشته باشد.
- دلیل ترکیب در PR نوشته شده باشد.
- مسیرهای تغییرکرده دقیق توضیح داده شده باشند.
- reviewer بداند چرا جداکردن ممکن نبوده است.

در حالت عادی، PR ترکیبی ممنوع است.

---

## 3. PR اول: Core / Contract / Backend

PR اول باید بخش فنی را آماده کند.

این PR می‌تواند این مسیرها را تغییر دهد:

| مسیر | کاربرد |
|---|---|
| `openapi/**` | API Contract |
| `automation/openapi/**` | Automation API Contract |
| `automation/schemas/**` | JSON Schema |
| `automation/worker-dummy/**` | Dummy worker / test boundary |
| `automation/worker-runtime/**` | Worker Runtime |
| `server/**` | Backend/server runtime |
| `src/lib/**` | Core logic |
| `src/integrations/**` | Supabase/Auth/integrations |
| `src/server/**` | Server-side app logic |
| `supabase/**` | Database/migrations only with approval |
| `docs/adr/**` | Architecture decision only when needed |
| `docs/automation/task-packets/**` | Task Packet / Contract planning |
| `docs/evidence/**` | Evidence for tests and checks |

این PR نباید UI را بازطراحی کند.

اگر Core PR نیاز دارد UI را تغییر دهد، باید یا PR دوم ساخته شود یا Handoff داشته باشد.

---

## 4. PR دوم: UI / Lovable

PR دوم باید فقط UI را به contract یا core آماده‌شده وصل کند.

این PR می‌تواند این مسیرها را تغییر دهد:

| مسیر | کاربرد |
|---|---|
| `src/routes/**` | Route/page UI |
| `src/components/**` | UI components |
| `src/components/ui/**` | Base UI components, با احتیاط |
| `src/shared/**` | UI/forms, اگر logic حساس نداشته باشد |
| `src/assets/**` | Local UI assets |
| `public/**` | Public UI assets |
| `.lovable/**` | Lovable plan/config |
| `docs/lovable-change-reports/**` | Lovable change reports |
| `docs/evidence/**` | UI screenshots / manual test evidence |

این PR نباید API حدسی بسازد.

این PR نباید migration بسازد.

این PR نباید Worker یا backend را تغییر دهد.

---

## 5. ترتیب درست کار

ترتیب استاندارد برای قابلیت مشترک:

1. تعریف نیاز
2. ساخت Handoff اگر UI و Core هر دو درگیر هستند
3. ساخت یا اصلاح Contract توسط Cursor
4. PR اول: Core / Contract / Backend
5. Review و تست PR اول
6. Merge PR اول به `staging`
7. Sync کردن branch UI با `staging`
8. PR دوم: UI / Lovable
9. تست انسانی روی `staging`
10. Merge PR دوم به `staging`
11. فقط بعد از تست نهایی، PR از `staging` به `main`

---

## 6. مثال درست: قابلیت نمایش وضعیت Worker

### PR اول

عنوان:

`core: add worker status contract`

Branch:

`cursor/api-worker-status`

مسیرهای تغییرکرده:

- `openapi/**`
- `automation/schemas/**`
- `src/lib/**`
- `docs/evidence/**`

هدف:

آماده‌کردن contract و data flow.

### PR دوم

عنوان:

`ui: add worker status panel`

Branch:

`lovable/ui-worker-status-panel`

مسیرهای تغییرکرده:

- `src/routes/**`
- `src/components/**`
- `docs/lovable-change-reports/**`
- `docs/evidence/**`

هدف:

نمایش اطلاعات آماده‌شده در UI.

---

## 7. مثال غلط

این PR غلط است:

عنوان:

`add worker status feature`

مسیرهای تغییرکرده:

- `openapi/**`
- `automation/worker-runtime/**`
- `supabase/migrations/**`
- `src/routes/**`
- `src/components/**`

چرا غلط است؟

چون contract، worker، migration و UI را در یک PR قاطی کرده است.

این PR باید split شود.

---

## 8. قانون برای Lovable

Lovable نباید PR بسازد که این مسیرها را تغییر دهد:

- `supabase/**`
- `openapi/**`
- `automation/**`
- `server/**`
- `src/lib/**`
- `src/integrations/**`
- `src/server/**`
- `.github/**`
- `deploy/**`
- `docs/adr/**`
- `docs/security/**`
- `.env*`
- `package.json`
- `package-lock.json`
- `bun.lock`
- `Dockerfile`

اگر Lovable به این مسیرها نیاز داشت، باید Handoff بسازد و کار به Cursor منتقل شود.

---

## 9. قانون برای Cursor

Cursor نباید بدون Handoff در PR فنی این کارها را انجام دهد:

- بازطراحی UI
- تغییر مسیرهای گسترده `src/routes/**`
- تغییر navigation اصلی
- تغییر تجربه کاربری بدون task UI
- تغییر کامپوننت‌های پایه UI بدون دلیل
- تغییرات ظاهری Lovable در همان PR فنی

اگر Cursor همزمان نیاز به UI دارد، باید PR دوم ساخته شود.

---

## 10. قانون برای Database و Migration

هر PR که migration دارد، باید مستقل باشد یا دلیل واضح داشته باشد.

Migration PR باید مشخص کند:

- چرا migration لازم است.
- چه جدول یا policy تغییر می‌کند.
- rollback یا recovery plan چیست.
- آیا RLS/RBAC تغییر می‌کند یا نه.
- آیا تست روی staging انجام شده یا نه.

Migration نباید با UI PR قاطی شود.

---

## 11. قانون برای API / Contract

هر API جدید یا تغییر contract باید اول در contract ثبت شود.

مسیرهای contract:

- `openapi/**`
- `automation/openapi/**`
- `automation/schemas/**`
- `docs/automation/task-packets/**`

اگر UI به endpoint جدید نیاز دارد، Lovable نباید endpoint را حدس بزند.

Lovable باید درخواست را در Handoff بنویسد.

Cursor باید contract را آماده کند.

---

## 12. قانون Evidence برای دو PR

هر دو PR باید evidence داشته باشند.

### Evidence برای PR اول: Core / Contract / Backend

حداقل evidence:

- فایل‌های contract یا core که تغییر کرده‌اند
- test یا توضیح نبودن test
- build/lint/typecheck اگر مرتبط است
- migration impact
- RLS/RBAC impact
- secret impact
- rollback note اگر migration یا deploy دارد

### Evidence برای PR دوم: UI / Lovable

حداقل evidence:

- screenshot یا توضیح دستی UI
- مسیر تست انسانی
- اینکه از API موجود استفاده شده
- اینکه API حدسی ساخته نشده
- اینکه مسیرهای ممنوع تغییر نکرده‌اند

---

## 13. چه زمانی PR ترکیبی قابل قبول است؟

PR ترکیبی فقط در شرایط محدود قابل قبول است:

- تغییر خیلی کوچک باشد.
- جداکردن PRها ریسک را بیشتر کند.
- Handoff وجود داشته باشد.
- مسیرهای تغییرکرده شفاف باشند.
- reviewerها قبول کنند.
- PR evidence کامل داشته باشد.

حتی در این حالت، PR نباید شامل migration حساس، تغییر worker runtime و UI بزرگ باشد.

---

## 14. Stop-The-Line

در این موارد باید PR متوقف شود:

1. یک PR هم UI و هم migration را تغییر دهد.
2. یک PR هم Worker Runtime و هم UI را تغییر دهد.
3. Lovable مسیر ممنوع را تغییر دهد.
4. Cursor بدون Handoff تغییر UI گسترده دهد.
5. API جدید بدون contract ساخته شود.
6. UI endpoint جدید را حدس بزند.
7. migration بدون rollback یا review آمده باشد.
8. PR چند موضوع جدا را قاطی کرده باشد.
9. evidence وجود نداشته باشد.
10. مسیرهای تغییرکرده با branch type نمی‌خواند.

---

## 15. ارتباط با اسناد دیگر

این سند باید با اسناد زیر هماهنگ بماند:

- `docs/process/boundary-inventory-report.md`
- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`

اگر یکی از این سندها تغییر کند، باید بررسی شود که این سند هم نیاز به update دارد یا نه.

---

## 16. خروجی مورد انتظار برای علی

علی باید بعداً بتواند از این سند این موارد را enforce کند:

1. PR Template بپرسد آیا PR فقط UI است یا فقط Core.
2. PR Template بپرسد آیا PR ترکیبی است یا نه.
3. Boundary Guard بررسی کند Lovable مسیر ممنوع را تغییر نداده باشد.
4. Boundary Guard بررسی کند docs branch فقط docs را تغییر داده باشد.
5. CI یا PR check هشدار دهد اگر `supabase/**` و `src/routes/**` در یک PR تغییر کرده‌اند.
6. CI یا PR check هشدار دهد اگر `automation/**` و `src/components/**` در یک PR تغییر کرده‌اند.

---

## 17. معیار پذیرش این سند

این سند وقتی قبول است که:

1. تفاوت PR فنی و PR UI را روشن کند.
2. مسیرهای مجاز Core PR را مشخص کند.
3. مسیرهای مجاز UI PR را مشخص کند.
4. ترتیب اجرای دو PR را مشخص کند.
5. مثال درست و غلط داشته باشد.
6. Stop-The-Line برای PRهای ترکیبی داشته باشد.
7. Evidence لازم برای هر PR را مشخص کند.
8. قابل تبدیل به PR Template و GitHub Actions باشد.
9. با Branch Policy و Path Ownership Matrix هماهنگ باشد.

---

## 18. وضعیت فعلی

Status: Ready for review.
