# Definition of Success

Version: 3.9
Phase: 3.9.14
Owner: Mehdi Heydari
Status: Draft
Scope: Final success criteria for Phase 3.9. No feature development.

---

## 1. هدف این سند

هدف این سند این است که معیار موفقیت نهایی فاز 3.9 روشن باشد.

فاز 3.9 فقط با نوشتن سندها کامل نمی‌شود.

فاز 3.9 وقتی کامل است که حداقل یک Guard واقعی در GitHub فعال شده باشد و evidence آن ثبت شده باشد.

---

## 2. قانون طلایی

فاز 3.9 بدون حداقل یک Guard واقعی بسته نمی‌شود.

Guard واقعی یعنی چیزی که در GitHub یا روند PR واقعاً فعال شده باشد و فقط در سند نوشته نشده باشد.

---

## 3. حداقل معیار موفقیت

حداقل معیار موفقیت فاز 3.9 این است:

1. حداقل یک Guard واقعی فعال شده باشد.
2. Guard روی یک PR واقعی یا آزمایشی تست شده باشد.
3. evidence اجرای Guard ثبت شده باشد.
4. مشخص باشد Guard دقیقاً چه چیزی را کنترل می‌کند.
5. مشخص باشد چه محدودیت‌هایی هنوز باقی مانده‌اند.

---

## 4. Guardهای قابل قبول

حداقل یکی از این Guardها برای بستن فاز کافی است:

| Guard | آیا برای بستن فاز کافی است؟ | Evidence لازم |
|---|---|---|
| PR Template فعال | بله، حداقل قابل قبول | diff فایل و PR نمونه |
| CODEOWNERS فعال | بله، بهتر | diff فایل و PR با reviewer |
| Boundary Guard فعال | بله، بهترتر | workflow file و PR آزمایشی |
| Staging Check فعال | بله، خوب | workflow file و نتیجه check |
| Branch Protection فعال | بله، اگر evidence دارد | screenshot یا توضیح تنظیمات |

---

## 5. حداقل Guard قابل قبول: PR Template

PR Template وقتی برای بستن فاز قابل قبول است که از PR بخواهد:

- Task ID / Phase
- Branch type
- Change type
- Files intentionally changed
- Forbidden paths check
- Migration impact
- RLS/RBAC impact
- Secret impact
- Handoff required?
- Evidence location
- Local test result
- Server deploy impact
- Remaining risks
- Stop-The-Line reviewed?

اگر PR Template فقط یک متن ساده و غیرالزام‌آور باشد، Guard ضعیف است و باید evidence داشته باشد که واقعاً در PR استفاده شده است.

---

## 6. Guard بهتر: CODEOWNERS

CODEOWNERS وقتی برای بستن فاز قابل قبول است که حداقل مسیرهای حساس را پوشش دهد:

- `supabase/**`
- `supabase/migrations/**`
- `openapi/**`
- `automation/**`
- `.github/**`
- `deploy/**`
- `server/**`
- `src/lib/**`
- `src/integrations/**`
- `src/server/**`
- `docs/adr/**`
- `docs/security/**`

---

## 7. Guard بهترتر: Boundary Guard

Boundary Guard وقتی برای بستن فاز قابل قبول است که حداقل این قانون را کنترل کند:

اگر branch با `lovable/` شروع شد و یکی از مسیرهای ممنوع را تغییر داد، workflow باید warning یا fail بدهد.

مسیرهای ممنوع Lovable:

- `supabase/**`
- `openapi/**`
- `automation/**`
- `server/**`
- `src/lib/**`
- `src/integrations/**`
- `src/server/**`
- `.github/**`
- `deploy/**`
- `.env*`

---

## 8. Evidence لازم برای بستن فاز

برای بستن فاز باید evidence وجود داشته باشد.

مسیر پیشنهادی:

`docs/evidence/WPC-3.9-enforcement.md`

حداقل evidence:

- Guard فعال‌شده چیست؟
- کدام فایل یا تنظیمات تغییر کرده؟
- کدام PR آزمایشی یا واقعی آن را تست کرده؟
- نتیجه چه بوده؟
- چه چیزهایی هنوز enforce نشده؟
- آیا Afra یا Ali approval لازم بوده؟
- وضعیت نهایی فاز چیست؟

---

## 9. وضعیت‌های ممکن فاز

| وضعیت | معنی |
|---|---|
| Not complete | سندها نوشته شده‌اند ولی Guard واقعی فعال نیست |
| Complete with minimum enforcement | حداقل یک Guard مثل PR Template فعال است |
| Complete with strong enforcement | PR Template و CODEOWNERS و حداقل یک workflow guard فعال هستند |
| Blocked | Guard لازم فعال نشده یا evidence کافی نیست |

---

## 10. معیار پذیرش این سند

این سند وقتی قبول است که:

1. بگوید فاز بدون Guard واقعی بسته نمی‌شود.
2. حداقل Guard قابل قبول را تعریف کند.
3. Guard بهتر و بهترتر را تعریف کند.
4. evidence لازم برای بستن فاز را مشخص کند.
5. مسیر evidence را پیشنهاد دهد.
6. وضعیت‌های نهایی فاز را مشخص کند.
7. با Ali Implementation Handoff هماهنگ باشد.

---

## 11. وضعیت فعلی

Status: Ready for review.
