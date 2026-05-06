
# جلوگیری از ثبت محصول تکراری

## معیار توافق‌شده

دو محصول وقتی **تکراری** محسوب می‌شوند که این پنج فیلد یکسان باشند (با نرمال‌سازی فارسی):
**برند + دسته + مدل + رنگ + ظرفیت**

نرمال‌سازی شامل: یکسان‌سازی «ی/ك» عربی به فارسی، حذف اعراب و ZWNJ، تبدیل اعداد فارسی به انگلیسی، حذف فاصله‌های اضافی، lowercase حروف انگلیسی.

---

## مرحله ۱ — اصلاح ۲۶ محصول موجود (پیشنیاز)

برای هر ۲۶ محصول شناسایی‌شده، نام مدل تجاری از فیلد `name` استخراج و به فیلد `model` منتقل می‌شود. لیست پیشنهادی تغییرات:

| SKU | model فعلی | model پیشنهادی |
|---|---|---|
| AFK-2026-00033 | — | md1 |
| AFK-2026-00035 | — | الگانت |
| AFK-2026-00044 | — | ECO |
| AFK-2026-00045 | — | ENZO T3 |
| AFK-2026-00046 | — | ULTRA T3 |
| AFK-2026-00047 | — | NORD D3 |
| AFK-2026-00048 | — | D BIX T3 |
| AFK-2026-00051 | — | DIVA 5 |
| AFK-2026-00052 | — | 4GEAR |
| AFK-2026-00053 | — | SPARK 5 T3 |
| AFK-2026-00054 | — | SPARK 5 |
| AFK-2026-00055 | — | MARS 5 |
| AFK-2026-00057 | — | D NIDA T3 |
| AFK-2026-00058 | — | یونیوالوکس |
| AFK-2026-00059 | — | EXTRA T3 |
| AFK-2026-00061 | — | T3 PRO |
| AFK-2026-00062 | — | T3 PRO |
| AFK-2026-00063 | — | T3 ULTRA |
| AFK-2026-00064 | — | T4 PRO |
| AFK-2026-00065 | — | ULTRA WALL |
| AFK-2026-00066 | — | TROPICAL T3 |
| AFK-2026-00067 | — | ZETTA T3 |
| AFK-2026-00068 | — | FROST SCROL T3 |
| AFK-2026-00070 | — | TITANIUM AMP INVERTER |
| AFK-2026-00071 | — | FANTOM5 |
| AFK-2026-00072 | — | FANTOM5 |

این لیست به‌صورت یک عملیات `UPDATE` روی جدول `products` اعمال می‌شود. نام محصول دست نمی‌خورد.

> اگر هر مدلی از این لیست اشتباه استخراج شده، قبل از اجرا اعلام کنید تا اصلاح شود.

---

## مرحله ۲ — قانون جلوگیری در دیتابیس (لایه نهایی)

یک migration اجرا می‌شود که شامل:

1. **تابع `normalize_fa(text)`** — `IMMUTABLE`، یکسان‌سازی فارسی برای مقایسه.
2. **ستون محاسباتی `products.dedup_key`** — `GENERATED ALWAYS AS STORED` از ترکیب پنج فیلد نرمال‌شده. وقتی برند یا دسته خالی باشد، `NULL` می‌شود (مقایسه نمی‌شود).
3. **Unique partial index** — `WHERE dedup_key IS NOT NULL AND status <> 'discontinued'`. این یعنی محصولات کنسل‌شده می‌توانند همان کلید را داشته باشند.
4. **تابع RPC `find_duplicate_product(...)`** — `SECURITY DEFINER`، فقط برای کاربران احراز شده. در فرم برای بررسی زنده استفاده می‌شود و `id, name, sku` محصول مشابه را برمی‌گرداند.

---

## مرحله ۳ — هشدار زنده در فرم (UX)

تغییرات در `src/components/products/ProductForm.tsx`:

- یک hook جدید `useDuplicateCheck` با debounce ۴۰۰ms که هر بار `brand_id, category_id, model, color, capacity` تغییر کرد، تابع RPC را صدا می‌زند.
- در حالت **ایجاد**: همه محصولات بررسی می‌شوند.
- در حالت **ویرایش**: محصول فعلی exclude می‌شود (`p_exclude_id`).
- اگر مشابه پیدا شد:
  - یک کارت هشدار قرمز بالای فرم نمایش داده می‌شود: «این محصول قبلاً با SKU مشخص ثبت شده است».
  - دکمه «ذخیره / ایجاد محصول» **غیرفعال** می‌شود.
  - یک لینک «مشاهده محصول موجود» به صفحه آن محصول.
- علاوه بر این، اگر کاربر به هر دلیلی تونست submit کند، خطای `23505` از DB گرفته شده و پیام فارسی «محصول تکراری است» نمایش داده می‌شود (در `_app.products.new.tsx` و route ویرایش).

---

## فایل‌های تحت تأثیر

- **migration جدید** در `supabase/migrations/` — تابع `normalize_fa`، ستون `dedup_key`، unique index، تابع `find_duplicate_product`، و `UPDATE` اصلاحی برای ۲۶ محصول.
- `src/lib/products/duplicate-check.ts` — wrapper برای فراخوانی RPC.
- `src/hooks/useDuplicateProductCheck.ts` — hook با debounce.
- `src/components/products/ProductForm.tsx` — اضافه شدن کارت هشدار + غیرفعال‌سازی دکمه ثبت.
- `src/routes/_app.products.new.tsx` و route ویرایش — مدیریت خطای `23505` با پیام فارسی.

---

## معیارهای پذیرش (طبق قانون مادر)

- migration reversible و idempotent (`CREATE ... IF NOT EXISTS`، `ADD COLUMN IF NOT EXISTS`).
- RLS تغییر نمی‌کند؛ تابع RPC با `SECURITY DEFINER` و `GRANT` فقط به `authenticated`.
- هیچ secret در frontend.
- بدون CDN خارجی.
- query بررسی تکراری در فرم با debounce و limit 1.
- UI: RTL، فارسی، با `Alert` از shadcn (موجود).
- audit log برای UPDATE اصلاحی نیازی نیست (اصلاح داده‌ای، نه عملیاتی کاربری).
