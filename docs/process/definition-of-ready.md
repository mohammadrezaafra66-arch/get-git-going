# Definition of Ready

Version: 3.9
Phase: 3.9.8
Owner: Mehdi Heydari
Status: Draft
Scope: Task readiness policy only. No feature development.

---

## 1. هدف این سند

Definition of Ready یعنی یک Task فقط وقتی اجازه شروع دارد که قبل از شروع، ابهام‌های اصلی آن مشخص شده باشد.

هدف این سند این است که کارها با جمله‌های مبهم مثل «یه چیزی بساز»، «بعداً معلوم می‌شود»، یا «خودت درستش کن» شروع نشوند.

یک Task وقتی Ready است که تیم بداند:

- هدف کار چیست.
- مالک کار کیست.
- فاز و Task ID چیست.
- Lovable باید کار کند یا Cursor.
- مسیرهای مجاز کدام‌اند.
- مسیرهای ممنوع کدام‌اند.
- acceptance criteria چیست.
- evidence لازم چیست.
- اگر کار حساس است، چه review یا approval لازم دارد.
- اگر کار بین UI و Core مشترک است، Handoff دارد یا نه.

---

## 2. قانون طلایی

Task بدون Definition of Ready نباید شروع شود.

اگر Task آماده نیست، باید اول تکمیل شود، بعد وارد اجرا شود.

شروع کار بدون Ready یعنی احتمالاً در PR، review، test، merge یا deploy گیر می‌کنیم.

---

## 3. حداقل اطلاعات لازم برای Ready بودن Task

هر Task باید این اطلاعات را داشته باشد:

| مورد | لازم است؟ | توضیح |
|---|---|---|
| Task ID | بله | مثل `WPC-3.9-008` |
| Phase tag | بله | مثل `3.9.8` |
| هدف | بله | خروجی دقیق کار |
| Owner | بله | مسئول اصلی |
| Builder | بله | کسی یا ابزاری که می‌سازد |
| Reviewer | بله | کسی که review می‌کند |
| Final approver | بله، اگر حساس است | افرا/علی/مهدی بر اساس نوع کار |
| نوع کار | بله | Docs / UI / Core / Contract / Worker / Migration / Server / Enforcement |
| مسیرهای مجاز | بله | دقیق و قابل بررسی |
| مسیرهای ممنوع | بله | برای جلوگیری از scope creep |
| Acceptance Criteria | بله | معیار پایان |
| Evidence Required | بله | مدرک لازم |
| Handoff | اگر مشترک است | برای کارهای UI/Core |
| Risk note | بله | ریسک‌های مهم |
| Rollback note | اگر migration/deploy دارد | برنامه برگشت |

---

## 4. Task ID و Phase Tag

هر Task باید شناسه داشته باشد.

الگوی پیشنهادی:

| نوع | مثال |
|---|---|
| Phase 3.9 docs task | `WPC-3.9-008` |
| Handoff | `WPC-3.9-XXX-handoff` |
| Evidence | `WPC-3.9-XXX-evidence` |
| Enforcement | `WPC-3.9-XXX-enforcement` |

Task بدون شناسه رسمی Ready نیست.

---

## 5. Owner و نقش‌ها

هر Task باید مالک‌های مشخص داشته باشد.

| نقش | معنی |
|---|---|
| Requester | کسی که نیاز را مطرح کرده |
| Owner | مسئول اصلی موفقیت Task |
| Builder | کسی یا ابزاری که اجرا می‌کند |
| Reviewer | کسی که بررسی می‌کند |
| Final Approver | کسی که تأیید نهایی می‌دهد |

اگر مالک مشخص نیست، Task Ready نیست.

---

## 6. نوع کار باید مشخص باشد

هر Task باید یکی از این نوع‌ها را مشخص کند:

| نوع کار | ابزار معمول | مثال |
|---|---|---|
| Docs / Governance | Mehdi / Cursor | ساخت policy |
| UI / Lovable | Lovable | صفحه، فرم، layout |
| Core / Backend | Cursor | logic، service، integration |
| Contract / API | Cursor | OpenAPI، schema |
| Worker / Automation | Cursor | Worker runtime |
| Database / Migration | Cursor با approval | Supabase migration |
| Server / Deploy | Ali / Afra | deployment checklist |
| Enforcement | Ali / Cursor | CODEOWNERS، GitHub Actions |

اگر نوع کار مشخص نیست، branch و PR هم درست انتخاب نمی‌شود.

---

## 7. مسیرهای مجاز باید قبل از شروع مشخص باشند

هر Task باید بگوید اجازه تغییر کدام مسیرها را دارد.

مثال برای Task سندی:

| مسیر مجاز | دلیل |
|---|---|
| `docs/process/**` | سند governance |
| `docs/evidence/**` | evidence مربوط |
| `docs/handoffs/**` | handoff مربوط |

مثال برای UI:

| مسیر مجاز | دلیل |
|---|---|
| `src/routes/**` | route/page UI |
| `src/components/**` | UI components |
| `src/assets/**` | assets |
| `public/**` | public assets |
| `.lovable/**` | Lovable config |

مثال برای Core:

| مسیر مجاز | دلیل |
|---|---|
| `openapi/**` | API contract |
| `server/**` | backend |
| `src/lib/**` | core logic |
| `src/integrations/**` | integration |
| `automation/**` | worker/runtime |
| `supabase/**` | database, only with approval |

اگر مسیرهای مجاز مشخص نیست، Task Ready نیست.

---

## 8. مسیرهای ممنوع باید قبل از شروع مشخص باشند

هر Task باید بگوید به چه مسیرهایی نباید دست بزند.

برای Lovable معمولاً این مسیرها ممنوع‌اند:

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

برای Docs branch معمولاً این‌ها ممنوع‌اند:

- feature code
- migration
- worker runtime
- backend logic
- UI implementation
- dependency changes

اگر مسیرهای ممنوع مشخص نیست، Task Ready نیست.

---

## 9. Acceptance Criteria باید واضح باشد

Acceptance Criteria یعنی چه زمانی می‌گوییم کار واقعاً انجام شده است.

Acceptance Criteria باید قابل بررسی باشد.

نمونه بد:

- کار درست شود.
- سند خوب باشد.
- UI قشنگ شود.

نمونه خوب:

- فایل `docs/process/evidence-policy.md` ساخته شده باشد.
- PR فقط فایل‌های سندی را تغییر داده باشد.
- migration impact در PR برابر None باشد.
- Handoff template مسیرهای مجاز و ممنوع داشته باشد.
- اگر UI تغییر کرده، screenshot یا دلیل نبودن screenshot ثبت شده باشد.

اگر معیار پذیرش قابل بررسی نیست، Task Ready نیست.

---

## 10. Evidence Required باید مشخص باشد

قبل از شروع، باید مشخص باشد چه evidence لازم است.

| نوع Task | Evidence لازم |
|---|---|
| Docs | PR body کامل، changed files، migration impact، secret impact، test plan |
| UI | screenshot، UI checklist، local test، forbidden paths check |
| Core | typecheck، lint، build، local test، contract check |
| Migration | migration impact، rollback، RLS/RBAC impact |
| Server | precheck، backup، smoke test، rollback plan |
| Enforcement | test PR، workflow result، rule explanation |

اگر evidence لازم مشخص نیست، Task Ready نیست.

---

## 11. Handoff برای کار مشترک UI/Core

اگر یک Task هم UI دارد هم Core، باید Handoff داشته باشد.

مواردی که Handoff لازم دارند:

- UI به API جدید نیاز دارد.
- Cursor contract جدید می‌سازد و Lovable باید مصرف کند.
- migration روی UI اثر دارد.
- مسیر `src/routes/**` هم UI و هم logic دارد.
- مسیر `src/shared/**` شامل logic حساس است.
- pricing، products، sales، accounting یا RBAC درگیر است.

اگر کار مشترک است ولی Handoff ندارد، Ready نیست.

---

## 12. تأیید افرا یا علی برای مسیرهای حساس

اگر Task به مسیرهای حساس دست می‌زند، باید reviewer یا approver مشخص باشد.

| مسیر حساس | Review / Approval |
|---|---|
| `supabase/**` | Afra / Ali |
| `supabase/migrations/**` | Afra / Ali |
| `openapi/**` | Ali / Afra |
| `automation/**` | Ali / Afra |
| `.github/**` | Ali / Afra |
| `deploy/**` | Ali / Afra |
| `docs/adr/**` | Afra |
| `docs/security/**` | Afra / Ali |

اگر مسیر حساس دارد ولی approval مشخص نیست، Task Ready نیست.

---

## 13. Branch باید از قبل مشخص باشد

Task باید branch درست داشته باشد.

| نوع کار | Branch |
|---|---|
| Docs phase 3.9 | `docs/WPC-3.9-xxx-short-title` |
| Lovable UI | `lovable/ui-xxx` |
| Cursor API | `cursor/api-xxx` |
| Cursor Worker | `cursor/worker-xxx` |
| Cursor DB | `cursor/db-xxx` |
| Cursor Governance | `cursor/governance-xxx` |
| Hotfix | `hotfix/xxx` |

اگر branch مشخص نیست، Task Ready نیست.

---

## 14. Checklist آماده شروع

قبل از شروع، این سؤال‌ها باید جواب داشته باشند:

| سؤال | وضعیت |
|---|---|
| هدف Task مشخص است؟ | باید بله باشد |
| Task ID دارد؟ | باید بله باشد |
| Owner دارد؟ | باید بله باشد |
| Builder مشخص است؟ | باید بله باشد |
| Reviewer مشخص است؟ | باید بله باشد |
| Phase tag دارد؟ | باید بله باشد |
| نوع کار مشخص است؟ | باید بله باشد |
| مسیرهای مجاز مشخص‌اند؟ | باید بله باشد |
| مسیرهای ممنوع مشخص‌اند؟ | باید بله باشد |
| Acceptance Criteria دارد؟ | باید بله باشد |
| Evidence Required مشخص است؟ | باید بله باشد |
| Branch درست مشخص است؟ | باید بله باشد |
| اگر UI/Core مشترک است، Handoff دارد؟ | باید بله باشد |
| اگر مسیر حساس دارد، approval مشخص است؟ | باید بله باشد |
| اگر migration/deploy دارد، rollback مشخص است؟ | باید بله باشد |

---

## 15. Stop-The-Line برای Ready نبودن

در این موارد کار نباید شروع شود:

1. Task ID ندارد.
2. Owner ندارد.
3. مسیرهای مجاز مشخص نیست.
4. مسیرهای ممنوع مشخص نیست.
5. Acceptance Criteria ندارد.
6. Evidence Required ندارد.
7. UI/Core مشترک است ولی Handoff ندارد.
8. مسیر حساس دارد ولی approval مشخص نیست.
9. migration دارد ولی rollback مشخص نیست.
10. branch درست مشخص نیست.

---

## 16. ارتباط با اسناد دیگر

این سند باید با این فایل‌ها هماهنگ باشد:

- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`
- `docs/process/two-pr-policy.md`
- `docs/process/handoff-policy.md`
- `docs/process/evidence-policy.md`

---

## 17. معیار پذیرش این سند

این سند وقتی قبول است که:

1. Ready بودن Task را قابل بررسی کند.
2. قبل از شروع، owner و branch و scope را اجباری کند.
3. مسیرهای مجاز و ممنوع را اجباری کند.
4. Acceptance Criteria را اجباری کند.
5. Evidence Required را اجباری کند.
6. Handoff را برای کار مشترک UI/Core اجباری کند.
7. approval را برای مسیر حساس مشخص کند.
8. قابل تبدیل به PR Template یا Task Template باشد.

---

## 18. وضعیت فعلی

Status: Ready for review.
