# Stop-The-Line Policy

Version: 3.9
Phase: 3.9.9
Owner: Mehdi Heydari
Status: Draft
Scope: Stop-The-Line policy only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که خط قرمزهای پروژه جدی و قابل اجرا باشند.

Stop-The-Line یعنی وقتی یک تغییر خطرناک، مبهم، بی‌مدرک یا خارج از مرز اتفاق افتاد، کار باید فوراً متوقف شود و PR تا اصلاح کامل merge نشود.

این سند برای جلوگیری از این خطرهاست:

- قاطی‌شدن UI و Core
- تغییر مسیرهای حساس توسط Lovable
- تغییر UI بزرگ توسط Cursor بدون Handoff
- ورود secret یا `.env` به Git
- migration بدون review
- تغییر OpenAPI بدون هماهنگی UI/docs
- merge شدن PR بدون evidence
- کار مستقیم روی `main`
- استفاده از سرور به عنوان محل تست

---

## 2. قانون طلایی

هرکس در PR یا branch یک خطر جدی دید، باید Stop-The-Line کند.

Stop-The-Line دعوا یا ایرادگیری شخصی نیست.

Stop-The-Line یعنی:

- کار خطرناک متوقف می‌شود.
- دلیل توقف نوشته می‌شود.
- مسیرهای مشکل‌دار مشخص می‌شوند.
- PR تا اصلاح merge نمی‌شود.
- بعد از اصلاح، evidence جدید لازم است.

---

## 3. چه کسی می‌تواند Stop-The-Line کند؟

این افراد می‌توانند Stop-The-Line کنند:

| نقش | مجاز است؟ | توضیح |
|---|---|---|
| Mehdi | بله | برای governance، UI boundary، Lovable/Cursor scope |
| Ali | بله | برای Core، backend، CI، worker، migration، enforcement |
| Afra | بله | برای مسیرهای حساس، production، business risk |
| Reviewer PR | بله | اگر خلاف policy ببیند |
| Builder | بله | اگر خودش ریسک یا اشتباه پیدا کند |

اگر کسی مطمئن نیست، بهتر است سؤال کند و merge را نگه دارد.

---

## 4. موارد توقف فوری

در این موارد باید فوراً Stop-The-Line شود:

1. Lovable به `supabase/**` دست زده باشد.
2. Lovable به `openapi/**` دست زده باشد.
3. Lovable به `automation/**` دست زده باشد.
4. Lovable به `.github/**` دست زده باشد.
5. Lovable به `server/**`، `src/lib/**`، `src/integrations/**` یا `src/server/**` دست زده باشد.
6. Cursor بدون Handoff تغییر UI بزرگ داده باشد.
7. PR هم UI و هم Core را بدون Handoff قاطی کرده باشد.
8. PR هم migration و هم UI را تغییر داده باشد.
9. secret، token، API key یا `.env` وارد Git شده باشد.
10. ربات واقعی یا automation واقعی در Phase 3.9 اضافه شده باشد.
11. migration بدون approval یا rollback آمده باشد.
12. OpenAPI تغییر کرده ولی UI/docs/evidence هماهنگ نشده باشد.
13. build، typecheck یا lint fail است و دلیل ثبت نشده.
14. evidence وجود ندارد.
15. PR بدون Task ID یا Phase باز شده است.
16. کسی مستقیم روی `main` کار کرده است.
17. PR خیلی بزرگ یا چندموضوعی است.
18. branch از base اشتباه ساخته شده و diff را آلوده کرده است.
19. staging به production database وصل شده باشد.
20. سرور به جای کامپیوتر شخصی محل تست شده باشد.

---

## 5. روند توقف

وقتی Stop-The-Line لازم است، این روند باید انجام شود:

1. روی PR کامنت گذاشته شود: `STOP-THE-LINE`
2. دلیل توقف دقیق نوشته شود.
3. مسیرهای مشکل‌دار لیست شوند.
4. نوع خطر مشخص شود: UI / Core / Migration / Secret / Evidence / Branch / Server / Contract
5. owner اصلاح مشخص شود.
6. PR تا اصلاح کامل merge نشود.
7. بعد از اصلاح، evidence جدید اضافه شود.
8. reviewer دوباره بررسی کند.
9. اگر مشکل حساس است، Afra یا Ali approval بدهند.
10. بعد از رفع، Stop-The-Line بسته شود.

---

## 6. قالب کامنت Stop-The-Line

برای کامنت روی PR از این قالب استفاده شود:

STOP-THE-LINE

Reason:
TODO

Problem paths:
- TODO

Policy violated:
- TODO

Required fix:
- TODO

Required evidence after fix:
- TODO

Reviewer:
TODO

Status:
Blocked until fixed

---

## 7. مسیرهای حساس که توقف سریع می‌خواهند

| مسیر | دلیل حساسیت | reviewer لازم |
|---|---|---|
| `supabase/**` | database/source of truth | Afra / Ali |
| `supabase/migrations/**` | schema/RLS/RBAC | Afra / Ali |
| `openapi/**` | API contract | Ali / Afra |
| `automation/**` | worker/runtime/future bots | Ali / Afra |
| `.github/**` | enforcement/CI/protection | Ali / Afra |
| `deploy/**` | server/deployment | Ali / Afra |
| `server/**` | backend/runtime | Ali / Afra |
| `src/lib/**` | core logic | Ali / Afra |
| `src/integrations/**` | auth/supabase/integrations | Ali / Afra |
| `.env*` | secrets | Afra / Ali |
| `docs/adr/**` | architecture decisions | Afra |

---

## 8. Stop-The-Line برای Lovable

Lovable باید فقط UI کار کند.

اگر Lovable یکی از این کارها را انجام داد، Stop-The-Line شود:

- تغییر `supabase/**`
- تغییر `openapi/**`
- تغییر `automation/**`
- تغییر `.github/**`
- تغییر `server/**`
- تغییر `src/lib/**`
- تغییر `src/integrations/**`
- تغییر `src/server/**`
- ساخت endpoint حدسی
- اضافه‌کردن secret
- تغییر dependency بدون approval
- تغییر business logic یا pricing logic
- تغییر RLS/RBAC
- تغییر migration

Lovable اگر به یکی از این موارد نیاز داشت، باید Handoff بسازد.

---

## 9. Stop-The-Line برای Cursor

Cursor نباید بدون Handoff وارد UI گسترده شود.

اگر Cursor یکی از این کارها را انجام داد، Stop-The-Line شود:

- تغییر گسترده `src/routes/**`
- بازطراحی UI بدون UI task
- تغییر navigation اصلی بدون Handoff
- تغییر تجربه کاربری مشتری بدون approval
- قاطی‌کردن Core و UI در یک PR
- ساخت migration بدون rollback
- تغییر OpenAPI بدون توضیح مصرف‌کننده
- تغییر server/deploy بدون evidence
- اجرای real bot در Phase 3.9

---

## 10. Stop-The-Line برای Branch و PR

در این موارد PR باید متوقف شود:

- branch از `main` ساخته شده باشد.
- branch مستقیماً روی `main` کار کرده باشد.
- branch name با Branch Policy نمی‌خواند.
- PR به base اشتباه باز شده باشد.
- docs branch فایل‌های feature code را تغییر داده باشد.
- Lovable branch مسیرهای Core را تغییر داده باشد.
- Cursor branch مسیر UI گسترده را بدون Handoff تغییر داده باشد.
- PR بیشتر از یک موضوع اصلی دارد.
- PR توضیح نداده چه فایل‌هایی عمداً تغییر کرده‌اند.

---

## 11. Stop-The-Line برای Evidence

در این موارد PR آماده merge نیست:

- evidence ندارد.
- فقط نوشته «انجام شد».
- test plan ندارد.
- migration impact مشخص نیست.
- RLS/RBAC impact مشخص نیست.
- secret impact مشخص نیست.
- UI تغییر کرده ولی screenshot یا دلیل نبودن screenshot ندارد.
- contract تغییر کرده ولی input/output ندارد.
- server تغییر کرده ولی rollback ندارد.
- Handoff لازم است ولی Handoff ندارد.

---

## 12. Stop-The-Line برای Server

سرور نباید محل آزمون و خطا باشد.

در این موارد توقف لازم است:

- تغییر قبل از تست local روی سرور اجرا شده.
- backup قبل از deploy گرفته نشده.
- rollback plan وجود ندارد.
- `.env` سرور وارد Git شده.
- staging/test به production database وصل شده.
- smoke test انجام نشده.
- خطای جدی بعد از deploy رخ داده و rollback plan اجرا نشده.
- نسخه‌ای که روی سرور می‌رود از branch مشخص نیست.

---

## 13. پنج مثال واقعی یا فرضی

### مثال 1: Lovable به Supabase دست زده

وضعیت:

branch با `lovable/` شروع شده ولی فایل‌های `supabase/**` تغییر کرده‌اند.

تصمیم:

STOP-THE-LINE

دلیل:

Lovable حق تغییر database، migration، RLS یا RBAC را ندارد.

اصلاح لازم:

تغییرات Supabase باید حذف شود یا در branch جداگانه Cursor با approval افرا/علی انجام شود.

---

### مثال 2: PR هم UI دارد هم migration

وضعیت:

یک PR هم `supabase/migrations/**` را تغییر داده و هم `src/routes/**` را.

تصمیم:

STOP-THE-LINE

دلیل:

Migration و UI نباید در یک PR قاطی شوند مگر Handoff و دلیل خیلی روشن وجود داشته باشد.

اصلاح لازم:

PR باید split شود:

1. PR migration / core
2. PR UI بعد از merge و تست PR اول

---

### مثال 3: Cursor بدون Handoff UI را بازطراحی کرده

وضعیت:

branch `cursor/api-contract` علاوه بر OpenAPI، چند صفحه UI را هم تغییر داده است.

تصمیم:

STOP-THE-LINE

دلیل:

Cursor بدون Handoff نباید تغییر گسترده UI بدهد.

اصلاح لازم:

تغییرات UI باید حذف شود یا در PR جداگانه Lovable با Handoff انجام شود.

---

### مثال 4: PR بدون evidence آمده

وضعیت:

PR توضیح داده تغییر انجام شده، ولی test plan، migration impact، secret impact و evidence location ندارد.

تصمیم:

STOP-THE-LINE

دلیل:

طبق Evidence Policy، PR بدون evidence کامل نیست.

اصلاح لازم:

PR body باید تکمیل شود و evidence لازم اضافه شود.

---

### مثال 5: Secret وارد Git شده

وضعیت:

فایل `.env` یا token واقعی در commit دیده شده است.

تصمیم:

STOP-THE-LINE

دلیل:

secret نباید وارد Git شود.

اصلاح لازم:

secret باید فوراً حذف شود، history و exposure بررسی شود، key rotate شود و evidence امنیتی ثبت شود.

---

### مثال 6: OpenAPI تغییر کرده ولی UI هماهنگ نشده

وضعیت:

`openapi/**` تغییر کرده ولی PR مشخص نکرده UI مصرف‌کننده چیست یا آیا PR دوم لازم است.

تصمیم:

STOP-THE-LINE

دلیل:

تغییر contract بدون مصرف‌کننده و هماهنگی UI/docs خطرناک است.

اصلاح لازم:

PR باید Handoff یا Two PR plan داشته باشد.

---

### مثال 7: کار مستقیم روی main

وضعیت:

commit مستقیم روی `main` انجام شده یا PR از branch نامشخص به main باز شده است.

تصمیم:

STOP-THE-LINE

دلیل:

طبق Branch Policy هیچ‌کس مستقیم روی `main` کار نمی‌کند.

اصلاح لازم:

کار باید به branch درست منتقل شود و از مسیر `staging` تست شود.

---

## 14. بعد از رفع مشکل چه اتفاقی می‌افتد؟

بعد از اصلاح:

1. مسیرهای مشکل‌دار دوباره بررسی می‌شوند.
2. evidence جدید اضافه می‌شود.
3. reviewer دوباره PR را بررسی می‌کند.
4. اگر مسیر حساس بوده، approval لازم گرفته می‌شود.
5. اگر مشکل رفع شده، PR از حالت Blocked خارج می‌شود.
6. فقط بعد از این مراحل PR می‌تواند merge شود.

---

## 15. ارتباط با اسناد دیگر

این سند باید با این فایل‌ها هماهنگ باشد:

- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`
- `docs/process/two-pr-policy.md`
- `docs/process/handoff-policy.md`
- `docs/process/evidence-policy.md`
- `docs/process/definition-of-ready.md`
- `docs/process/definition-of-done.md`

اگر یکی از این سندها تغییر کند، باید بررسی شود که Stop-The-Line Policy هم نیاز به update دارد یا نه.

---

## 16. خروجی مورد انتظار برای علی

علی باید بعداً بتواند از این سند این موارد را enforce کند:

1. label به نام `stop-the-line`
2. PR Template با بخش Stop-The-Line
3. GitHub Action برای مسیرهای ممنوع Lovable
4. GitHub Action برای branchهای docs که feature code تغییر داده‌اند
5. warning برای PRهایی که `supabase/**` و UI را با هم تغییر داده‌اند
6. warning برای نبود evidence
7. CODEOWNERS برای مسیرهای حساس

---

## 17. معیار پذیرش این سند

این سند وقتی قبول است که:

1. موارد توقف فوری را روشن کند.
2. روند توقف را مشخص کند.
3. قالب کامنت Stop-The-Line داشته باشد.
4. Lovable و Cursor را جداگانه پوشش دهد.
5. Branch، PR، Evidence و Server را پوشش دهد.
6. حداقل ۵ مثال واقعی یا فرضی داشته باشد.
7. مشخص کند PR تا اصلاح merge نمی‌شود.
8. قابل تبدیل به label، PR Template و GitHub Actions باشد.

---

## 18. وضعیت فعلی

Status: Ready for review.
