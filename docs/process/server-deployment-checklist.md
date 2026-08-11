# Server Deployment Checklist

Version: 3.9
Phase: 3.9.11
Owner: Mehdi Heydari
Status: Draft
Scope: Server deployment checklist only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که لپ‌تاپ سرور محل تست نباشد.

هر تغییری باید اول روی کامپیوتر شخصی یا محیط تست بررسی شود، بعد اگر evidence کامل بود، وارد سرور شود.

سرور فقط باید نسخه‌ای را دریافت کند که:

- روی branch درست آماده شده باشد.
- PR آن review شده باشد.
- تست local انجام شده باشد.
- evidence کامل داشته باشد.
- rollback plan داشته باشد.
- `.env` سرور داخل Git نباشد.
- ریسک production ناگهانی نداشته باشد.

---

## 2. قانون طلایی

هیچ نسخه‌ای نباید مستقیم و بدون تست local روی لپ‌تاپ سرور اجرا شود.

اگر روی کامپیوتر شخصی تست نشده، روی سرور هم نباید تست شود.

سرور محل اجرای نسخه آماده است، نه محل آزمون و خطا.

---

## 3. چه زمانی این چک‌لیست لازم است؟

این چک‌لیست قبل از هر انتقال به سرور لازم است:

| نوع تغییر | نیاز به چک‌لیست سرور |
|---|---|
| تغییر UI ساده | اگر قرار است روی سرور برود، بله |
| تغییر backend/core | بله |
| تغییر database/migration | بله، با approval |
| تغییر deployment config | بله |
| تغییر `.github/**` | اگر روی release/deploy اثر دارد، بله |
| تغییر فقط docs | معمولاً نه، مگر برای release رسمی |
| hotfix | بله، حتی اگر فوری باشد |

---

## 4. شرط‌های قبل از انتقال به سرور

قبل از انتقال به سرور باید این موارد کامل باشد:

| مورد | وضعیت لازم |
|---|---|
| PR روی کامپیوتر شخصی تست شده | بله |
| PR review شده | بله |
| evidence کامل است | بله |
| branch نهایی مشخص است | بله |
| base branch مشخص است | بله |
| tag یا release مشخص است | اگر لازم است |
| backup plan وجود دارد | بله |
| rollback plan وجود دارد | بله |
| `.env` سرور داخل Git نیست | بله |
| smoke test آماده است | بله |
| تغییر production ناگهانی ندارد | بله |
| مسیرهای ممنوع تغییر نکرده‌اند | بله |

---

## 5. چیزهایی که قبل از سرور باید reject شوند

این موارد نباید وارد سرور شوند:

1. PR بدون review.
2. PR بدون evidence.
3. PR بدون local test.
4. branch نامشخص.
5. تغییر مستقیم روی `main`.
6. migration بدون rollback.
7. migration بدون approval.
8. تغییر OpenAPI بدون هماهنگی UI/docs.
9. تغییر `.env` یا secret داخل Git.
10. نسخه‌ای که روی staging یا local تست نشده.
11. تغییری که مسیرهای ممنوع را شکسته.
12. تغییری که owner یا final approver ندارد.

---

## 6. precheck قبل از deploy

قبل از deploy باید این‌ها بررسی شوند:

| سؤال | پاسخ لازم |
|---|---|
| آیا آخرین نسخه از branch درست گرفته شده؟ | بله |
| آیا PR مربوط merge شده؟ | بله |
| آیا local test انجام شده؟ | بله |
| آیا build یا test لازم پاس شده؟ | بله یا دلیل ثبت شده |
| آیا backup گرفته شده؟ | بله |
| آیا rollback plan مشخص است؟ | بله |
| آیا `.env` سرور خارج از Git است؟ | بله |
| آیا smoke test آماده است؟ | بله |
| آیا کسی مسئول deploy مشخص شده؟ | بله |
| آیا زمان deploy مناسب است؟ | بله |

---

## 7. دستورهای پیشنهادی قبل از deploy

این دستورها بسته به نوع پروژه و وضعیت سرور ممکن است تغییر کنند، اما ترتیب کنترل باید حفظ شود.

1. `git status --short`

2. `git branch --show-current`

3. `git pull origin <deploy-branch>`

4. `git log --oneline -5`

5. `npm install`

6. `npm run typecheck`

7. `npm run lint`

8. `npm run build`

9. backup را بگیر.

10. smoke test plan را آماده کن.

اگر هرکدام fail شد، deploy متوقف می‌شود مگر دلیل و approval ثبت شده باشد.

---

## 8. backup قبل از deploy

قبل از deploy باید backup مشخص باشد.

حداقل موارد backup:

| مورد | لازم است؟ |
|---|---|
| database backup | اگر database درگیر است، بله |
| فایل‌های config سرور | بله |
| `.env` فعلی سرور | بله، خارج از Git |
| نسخه قبلی قابل اجرا | بله |
| مسیر rollback | بله |

بدون backup، deploy نباید انجام شود.

---

## 9. rollback plan

هر deploy باید rollback plan داشته باشد.

rollback plan باید مشخص کند:

- اگر deploy شکست خورد، به کدام commit یا release برمی‌گردیم.
- چه کسی rollback را انجام می‌دهد.
- چه زمانی rollback لازم است.
- database migration چطور برگشت داده می‌شود یا recovery می‌شود.
- چطور تأیید می‌کنیم سیستم دوباره سالم است.

اگر rollback plan وجود ندارد، deploy آماده نیست.

---

## 10. smoke test بعد از deploy

بعد از انتقال به سرور باید smoke test انجام شود.

حداقل smoke test:

| تست | نتیجه لازم |
|---|---|
| صفحه اصلی باز شود | Pass |
| login تست شود | Pass |
| اتصال دیتابیس درست باشد | Pass |
| APIهای اصلی پاسخ دهند | Pass |
| لاگ‌ها خطای جدی نداشته باشند | Pass |
| UI اصلی لود شود | Pass |
| دسترسی roleها خراب نشده باشد | Pass، اگر مرتبط است |
| worker یا automation ناخواسته اجرا نشده باشد | Pass |

اگر smoke test fail شد، باید rollback یا Stop-The-Line بررسی شود.

---

## 11. بررسی اتصال دیتابیس

بعد از deploy باید بررسی شود:

- سرور به database درست وصل است.
- staging به production database وصل نشده باشد، مگر با approval رسمی.
- production به test database وصل نشده باشد.
- connection string داخل Git نیست.
- service role key در client یا repo نیست.
- RLS/RBAC به هم نخورده است.

اتصال اشتباه دیتابیس Stop-The-Line است.

---

## 12. بررسی لاگ‌ها

بعد از deploy باید لاگ‌ها بررسی شوند.

حداقل بررسی:

- خطای startup وجود ندارد.
- خطای auth وجود ندارد.
- خطای database connection وجود ندارد.
- خطای permission یا RLS وجود ندارد.
- خطای frontend build وجود ندارد.
- secret یا اطلاعات حساس در log چاپ نشده است.

اگر خطای جدی وجود دارد، deploy نباید موفق اعلام شود.

---

## 13. موارد Stop-The-Line در deploy

در این موارد deploy باید متوقف شود:

1. local test انجام نشده.
2. evidence کامل نیست.
3. backup گرفته نشده.
4. rollback plan وجود ندارد.
5. `.env` یا secret وارد Git شده.
6. branch نهایی مشخص نیست.
7. PR مربوط merge نشده.
8. migration بدون approval دارد.
9. smoke test fail شده.
10. اتصال database اشتباه است.
11. خطای جدی در logها وجود دارد.
12. deploy روی سرور برای آزمون و خطا انجام شده.

---

## 14. خروجی قابل قبول deploy

بعد از deploy باید گزارش کوتاه ثبت شود:

| مورد | وضعیت |
|---|---|
| Deploy branch | TODO |
| Commit / tag | TODO |
| Deployed by | TODO |
| Deploy time | TODO |
| Backup confirmed | Yes / No |
| Rollback plan confirmed | Yes / No |
| Smoke test result | Pass / Fail |
| Login test | Pass / Fail |
| DB connection check | Pass / Fail |
| Logs checked | Yes / No |
| Final decision | Approved / Rolled back / Blocked |

---

## 15. Server evidence

اگر deploy انجام شود، evidence باید در یکی از این مسیرها ثبت شود:

- `docs/evidence/WPC-3.9-xxx-server.md`
- یا مسیر evidence مرتبط با همان PR

Server evidence باید شامل این موارد باشد:

- server-precheck
- backup confirmation
- smoke test
- rollback plan
- deploy decision

---

## 16. ارتباط با اسناد دیگر

این سند باید با این فایل‌ها هماهنگ باشد:

- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`
- `docs/process/two-pr-policy.md`
- `docs/process/handoff-policy.md`
- `docs/process/evidence-policy.md`
- `docs/process/definition-of-ready.md`
- `docs/process/definition-of-done.md`
- `docs/process/stop-the-line.md`
- `docs/process/local-test-checklist.md`

اگر یکی از این سندها تغییر کند، باید بررسی شود که Server Deployment Checklist هم نیاز به update دارد یا نه.

---

## 17. خروجی مورد انتظار برای علی

علی باید بعداً بتواند از این سند این موارد را enforce یا اجرا کند:

1. server precheck template بسازد.
2. backup confirmation را قبل از deploy اجباری کند.
3. smoke test checklist را بعد از deploy اجرا کند.
4. rollback plan را قبل از deploy اجباری کند.
5. deploy بدون local test را reject کند.
6. deploy branch و commit را ثبت کند.
7. server deployment evidence را به PR یا release وصل کند.

---

## 18. معیار پذیرش این سند

این سند وقتی قبول است که:

1. روشن کند سرور محل تست نیست.
2. پیش‌شرط‌های قبل از سرور را مشخص کند.
3. backup و rollback را اجباری کند.
4. smoke test بعد از deploy داشته باشد.
5. login، database و logs را پوشش دهد.
6. Stop-The-Line برای deploy داشته باشد.
7. خروجی قابل قبول deploy را مشخص کند.
8. قابل تبدیل به runbook یا checklist عملیاتی باشد.

---

## 19. وضعیت فعلی

Status: Ready for review.
