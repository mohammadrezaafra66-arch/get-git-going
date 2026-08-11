# Handoff Policy

Version: 3.9  
Phase: 3.9.6  
Owner: Mehdi Heydari  
Status: Draft  
Scope: Handoff policy only. No feature development.

---

## 1. هدف این سند

هدف این سند این است که ارتباط بین Lovable و Cursor شفاهی، مبهم و سلیقه‌ای نباشد.

هر وقت کاری بین UI و Core مشترک است، قبل از شروع باید یک Handoff نوشته شود.

Handoff یعنی:

- دقیقاً مشخص کنیم چه چیزی از یک نفر یا ابزار به نفر یا ابزار دیگر تحویل داده می‌شود.
- مسیرهای مجاز و ممنوع را روشن کنیم.
- مشخص کنیم API، contract، mock data یا ورودی/خروجی چیست.
- قبل از شروع کار، معیار پذیرش و evidence را مشخص کنیم.

---

## 2. چرا Handoff لازم است؟

بدون Handoff این خطرها پیش می‌آید:

1. Lovable API حدسی می‌سازد.
2. Cursor بدون اطلاع، UI را تغییر می‌دهد.
3. UI و backend با هم مچ نمی‌شوند.
4. PRها قاطی می‌شوند.
5. معلوم نمی‌شود مسئول خرابی کیست.
6. تست local سخت می‌شود.
7. سرور تبدیل به محل آزمون و خطا می‌شود.

---

## 3. چه زمانی Handoff اجباری است؟

Handoff در این موارد اجباری است:

| وضعیت | آیا Handoff لازم است؟ | دلیل |
|---|---|---|
| UI به API جدید نیاز دارد | بله | Lovable نباید API حدسی بسازد |
| Cursor contract جدید آماده می‌کند و UI باید مصرف کند | بله | UI باید input/output را بداند |
| مسیر `src/routes/**` هم UI دارد هم logic | بله | مسیر مشترک است |
| تغییر در `src/shared/**` شامل business logic است | بله | ممکن است UI و Core قاطی شوند |
| تغییر در pricing / products / sales / accounting UI است | بله | مسیرهای حساس تجاری هستند |
| migration روی UI اثر دارد | بله | UI باید بداند data shape عوض شده |
| فقط یک سند governance نوشته می‌شود | معمولاً نه | مگر اینکه برای enforcement به علی تحویل شود |
| فقط UI ظاهری بدون data change است | نه | اگر مسیرهای ممنوع تغییر نکند |
| فقط refactor داخلی کوچک Cursor است | نه | اگر UI و contract را تغییر ندهد |

---

## 4. انواع Handoff

| نوع Handoff | از طرف | به طرف | مثال |
|---|---|---|---|
| Core to UI | Cursor / Ali | Lovable / Mehdi | API آماده شده و UI باید وصل شود |
| UI to Core | Lovable / Mehdi | Cursor / Ali | UI به endpoint یا data جدید نیاز دارد |
| Docs to Enforcement | Mehdi | Ali | policy باید به CODEOWNERS یا GitHub Actions تبدیل شود |
| Contract to UI | Cursor | Lovable | OpenAPI یا schema آماده مصرف UI است |
| Migration to UI | Cursor / Ali | Lovable / Mehdi | data shape تغییر کرده و UI باید هماهنگ شود |
| Review Handoff | Mehdi | Afra / Ali | تصمیم حساس نیاز به review دارد |

---

## 5. قانون اصلی Handoff

هیچ کار مشترک بین Lovable و Cursor بدون Handoff شروع نمی‌شود.

اگر Handoff وجود ندارد:

- Lovable نباید API بسازد.
- Lovable نباید مسیرهای Core را تغییر دهد.
- Cursor نباید UI گسترده تغییر دهد.
- PR نباید به عنوان آماده review اعلام شود.
- کار باید متوقف شود تا Handoff ساخته شود.

---

## 6. Handoff باید چه چیزهایی داشته باشد؟

هر Handoff باید حداقل این بخش‌ها را داشته باشد:

1. شناسه Handoff
2. هدف کار
3. نوع Handoff
4. مالک‌ها
5. مسیرهای مجاز
6. مسیرهای ممنوع
7. ورودی/خروجی یا contract
8. mock data اگر لازم است
9. acceptance criteria
10. evidence required
11. risks
12. review process
13. exit criteria

---

## 7. مسیر فایل‌های Handoff

همه Handoffها باید در این مسیر ساخته شوند:

| نوع | مسیر |
|---|---|
| Template | `docs/handoffs/_template.md` |
| Handoff واقعی | `docs/handoffs/WPC-3.9-xxx-short-title.md` |
| Handoff به علی | `docs/process/ali-implementation-handoff.md` |

---

## 8. Handoff برای Lovable

اگر Handoff به Lovable داده می‌شود، باید خیلی روشن بگوید:

- Lovable فقط کدام route یا component را تغییر دهد.
- Lovable از چه API یا mock data استفاده کند.
- Lovable چه مسیرهایی را نباید تغییر دهد.
- Lovable اجازه ساخت endpoint جدید ندارد.
- Lovable اجازه تغییر Supabase، OpenAPI، automation، server، src/lib و src/integrations را ندارد.
- خروجی Lovable باید شامل changed files و risks باشد.

---

## 9. Handoff برای Cursor

اگر Handoff به Cursor داده می‌شود، باید خیلی روشن بگوید:

- Cursor دقیقاً چه contract یا backend logic را آماده کند.
- Cursor حق تغییر UI دارد یا نه.
- Cursor حق migration دارد یا نه.
- اگر migration لازم است، approval و rollback لازم است.
- Cursor باید evidence تولید کند.
- Cursor نباید feature خارج از scope بسازد.

---

## 10. Handoff برای علی

اگر Handoff برای علی است، باید قابل تبدیل به enforcement باشد.

مثلاً باید بگوید:

| Policy خروجی مهدی | اجرای فنی علی |
|---|---|
| Path Ownership Matrix | CODEOWNERS و Boundary Guard |
| Branch Policy | Branch Protection و branch naming check |
| Two PR Policy | PR Template و mixed-path warning |
| Evidence Policy | PR Template و evidence checklist |
| Stop-The-Line Policy | label و workflow warning |

علی نباید مجبور شود policy را از نو طراحی کند.

---

## 11. Handoff و Two PR Policy

اگر یک کار هم UI دارد هم Core، Handoff باید مشخص کند:

1. PR اول چیست؟
2. PR دوم چیست؟
3. کدام PR اول merge می‌شود؟
4. UI با چه contract یا mock data جلو می‌رود؟
5. چه evidence برای هر PR لازم است؟

بدون این موارد، کار مشترک آماده شروع نیست.

---

## 12. Stop-The-Line مرتبط با Handoff

در این موارد باید Stop-The-Line شود:

1. Lovable بدون Handoff به API جدید نیاز پیدا کند.
2. Lovable بدون Handoff مسیرهای Core را تغییر دهد.
3. Cursor بدون Handoff UI گسترده تغییر دهد.
4. PR مشترک UI/Core بدون Handoff باز شود.
5. Handoff مسیرهای مجاز و ممنوع را مشخص نکرده باشد.
6. Handoff acceptance criteria نداشته باشد.
7. Handoff evidence required نداشته باشد.
8. مسیرهای تغییرکرده با Handoff نمی‌خواند.

---

## 13. مثال Handoff درست

مثال:

- نیاز: نمایش وضعیت Worker در UI
- نوع: Core to UI
- PR اول: Cursor contract را آماده می‌کند
- PR دوم: Lovable UI را به contract وصل می‌کند
- مسیرهای Core: `openapi/**`, `src/lib/**`, `automation/schemas/**`
- مسیرهای UI: `src/routes/**`, `src/components/**`
- mock data: وضعیت worker شامل `online`, `paused`, `error`
- evidence: contract check، screenshot، local test

این قابل قبول است.

---

## 14. مثال Handoff غلط

مثال غلط:

- نیاز: صفحه وضعیت Worker بساز
- مسیرها: مشخص نشده
- API: بعداً معلوم می‌شود
- mock data: ندارد
- evidence: ندارد
- owner: مشخص نیست

این Handoff قابل قبول نیست و نباید کار شروع شود.

---

## 15. ارتباط با اسناد دیگر

این سند باید با این فایل‌ها هماهنگ بماند:

- `docs/process/boundary-inventory-report.md`
- `docs/process/path-ownership-matrix.md`
- `docs/process/lovable-cursor-boundary.md`
- `docs/process/branch-policy.md`
- `docs/process/two-pr-policy.md`

اگر یکی از این سندها تغییر کند، باید بررسی شود که Handoff Policy هم نیاز به update دارد یا نه.

---

## 16. معیار پذیرش این سند

این سند وقتی قبول است که:

1. بگوید Handoff چه زمانی لازم است.
2. انواع Handoff را مشخص کند.
3. مسیر فایل‌های Handoff را مشخص کند.
4. برای Lovable قانون روشن بدهد.
5. برای Cursor قانون روشن بدهد.
6. برای علی خروجی قابل enforcement بدهد.
7. با Two PR Policy هماهنگ باشد.
8. Stop-The-Line مرتبط با Handoff داشته باشد.
9. با Path Ownership Matrix و Boundary Policy هماهنگ باشد.

---

## 17. وضعیت فعلی

Status: Ready for review.
