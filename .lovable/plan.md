
## فاز G-11 — کارگاه قیمت محصولات من (Workbench)

### پاسخ به سؤال شما (وضعیت فعلی)

| موضوع | وضعیت |
|---|---|
| جدول `product_owner_assignments` (یک محصول → چند کارمند مسئول) | ✅ موجود |
| دیالوگ انتساب مسئول `OwnerAssignDialog` | ✅ موجود — فقط در صفحه جزئیات محصول |
| فضایی که مسئول محصول وارد بشه و **فقط محصولات خودش** را ببینه | ❌ وجود ندارد |
| ویرایش inline قیمت + تغییر موجود/ناموجود سریع (موبایل/دسکتاپ) | ❌ وجود ندارد |

تأمین‌کننده در این فاز اصلاً درگیر نیست. مسئول محصول فقط دو چیز را تغییر می‌دهد:
۱) **قیمت خرید** محصولاتی که خودش مسئولشان است (بدون نیاز به انتخاب تأمین‌کننده — از تأمین‌کننده پیش‌فرض/آخرین تأمین‌کننده ثبت‌شده استفاده می‌شود؛ اگر هیچ تأمین‌کننده‌ای ثبت نشده، یک «تأمین‌کننده عمومی/داخلی» پیش‌فرض استفاده می‌شود)
۲) **وضعیت موجودی** (موجود / ناموجود / محدود)

---

### هدف مرحله

ایجاد یک صفحه «کارگاه من» (`/pricing/my-workbench`) که:
- فقط محصولاتی را نشان دهد که کاربر فعلی در `product_owner_assignments` به‌عنوان مسئول آنها ثبت شده است
- جدولی شبیه اکسل با ویرایش inline ارائه دهد
- روی موبایل، تبلت و دسکتاپ کاملاً کارا و سریع باشد
- با ۴ کلید بالا/پایین/Enter/Tab بتوان از یک ردیف به ردیف بعد رفت
- قیمت با دکمه‌های `+` / `−` (قابل تنظیم با step) و یا تایپ مستقیم تغییر کند
- موجود/ناموجود با یک Toggle/Select یک‌کلیکی عوض شود

---

### آنچه ساخته می‌شود

#### ۱) Route جدید
**`src/routes/_app.pricing.my-workbench.tsx`**
- guard: کاربر باید لاگین باشد. هر کاربر فقط محصولات خودش را می‌بیند (admin/manager همه محصولات را با toggle «نمایش همه» می‌بینند)
- هیچ محدودیت نقشی سختی نیست — فیلتر داده‌ای از طریق `product_owner_assignments` خودش امنیت را تأمین می‌کند

#### ۲) منطق داده
```
products
  ← join product_owner_assignments (user_id = auth.uid())
  ← left join لازم برای آخرین purchase_prices (تأمین‌کننده پیش‌فرض/آخرین)
  ← فیلتر: search (نام/SKU)، برند، دسته، وضعیت موجودی
```
- صفحه‌بندی ۲۵ ردیف
- جستجو با debounce ۳۰۰ms
- staleTime: 15s، realtime استفاده نمی‌شود

#### ۳) UI کارگاه (دسکتاپ)
جدول ساده با ستون‌ها:

| محصول | SKU | برند | قیمت خرید فعلی | ارز | عملیات قیمت | موجودی | ذخیره |
|---|---|---|---|---|---|---|---|
| نام | کد | برند | عدد editable | T/USD/AED | `−` `+` `±%` | Select 3گزینه | ✓ |

ویژگی‌ها:
- کلیک روی سلول قیمت → ورودی فعال می‌شود
- دکمه‌های `−` / `+` با step قابل تنظیم (پیش‌فرض ۱٪، قابل تغییر به ۰.۵٪، ۲٪، ۵٪، ۱۰٪ یا مبلغ ثابت)
- Enter → ذخیره و رفتن به ردیف بعد
- Tab → ستون بعدی
- Esc → لغو
- ردیف‌های تغییر یافته با پس‌زمینه زرد ملایم
- دکمه «ذخیره همه» در نوار چسبان پایین + شمارنده dirty rows
- Toast per-row برای موفقیت/خطا

#### ۴) UI کارگاه (موبایل)
به‌جای جدول، **کارت‌های stack شده** عمودی:
```
┌──────────────────────────────┐
│ نام محصول                     │
│ SKU · برند                    │
├──────────────────────────────┤
│ قیمت: [  1,250,000  ] تومان   │
│  [−10%] [−1%] [+1%] [+10%]    │
├──────────────────────────────┤
│ موجودی:  [موجود ▼]            │
├──────────────────────────────┤
│        [ذخیره تغییرات]         │
└──────────────────────────────┘
```
- اعداد بزرگ، دکمه‌های لمسی ۴۴×۴۴
- swipe بین کارت‌ها (اختیاری در نسخه ۲)

#### ۵) منطق ذخیره‌سازی
- **تغییر موجودی**: `UPDATE products SET stock_status = ? WHERE id = ?`
- **تغییر قیمت**: 
  1. `UPDATE` ردیف فعلی purchase_prices: `expires_at = now()`، `is_active = false`
  2. `INSERT` ردیف جدید: `effective_at = now()`، `is_active = true`، `registered_by = auth.uid()`، `supplier_id` = همان تأمین‌کننده ردیف قبلی (یا یک تأمین‌کننده پیش‌فرض «داخلی» اگر هیچ ردیفی نبود)
  3. `INSERT` در `audit_logs` با `action = 'workbench_price_update'` یا `'workbench_stock_update'` و diff کامل (قیمت قبل/بعد، درصد تغییر)

#### ۶) Migration کوچک (RLS)
چون مسئول محصول معمولاً نقش admin/manager/accountant ندارد، باید RLS اجازه‌ی ویرایش به owner را بدهد:

```sql
-- تابع کمکی: آیا این کاربر مسئول این محصول است؟
CREATE OR REPLACE FUNCTION public.is_product_owner(_user_id uuid, _product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.product_owner_assignments
    WHERE user_id = _user_id AND product_id = _product_id
  )
$$;

-- اجازه به owner برای update روی stock_status
CREATE POLICY "owners_update_product_stock" ON public.products
FOR UPDATE TO authenticated
USING (
  public.is_product_owner(auth.uid(), id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
)
WITH CHECK (
  public.is_product_owner(auth.uid(), id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
);

-- اجازه به owner برای insert/update روی purchase_prices محصول خودش
CREATE POLICY "owners_write_purchase_prices" ON public.purchase_prices
FOR INSERT TO authenticated
WITH CHECK (
  public.is_product_owner(auth.uid(), product_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
);

CREATE POLICY "owners_update_purchase_prices" ON public.purchase_prices
FOR UPDATE TO authenticated
USING (
  public.is_product_owner(auth.uid(), product_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
);
```

#### ۷) آیتم منو
در `nav-items.ts` زیر گروه «قیمت‌گذاری»:
```ts
{ to: "/pricing/my-workbench", label: "کارگاه من", icon: Edit3, module: "pricing", group: "pricing" }
```
نمایش این آیتم مشروط به این است که کاربر حداقل یک رکورد در `product_owner_assignments` داشته باشد (با یک query سبک هنگام بارگذاری sidebar).

---

### آنچه ساخته نمی‌شود (out of scope)
- بدون تغییر در صفحات `pricing/purchase-prices` و `pricing/live-price-list`
- بدون انتخاب تأمین‌کننده در فرم (تأمین‌کننده‌ی قبلی/پیش‌فرض حفظ می‌شود)
- بدون تغییر در نقش‌ها یا اضافه کردن نقش جدید
- بدون realtime، بدون edge function، بدون چت/notification
- بدون paste از اکسل، بدون درگ‌اند‌دراپ (در فاز بعدی قابل افزودن)
- بدون تغییر قیمت فروش (فقط قیمت خرید — قیمت فروش از pricing engine محاسبه می‌شود)

---

### فایل‌های تأثیرگذار
- **Created**: `supabase/migrations/<ts>_g11_owner_workbench_rls.sql`
- **Created**: `src/routes/_app.pricing.my-workbench.tsx`
- **Created**: `src/components/pricing/WorkbenchRowDesktop.tsx`
- **Created**: `src/components/pricing/WorkbenchCardMobile.tsx`
- **Created**: `src/lib/pricing/workbench.ts` (queryها + mutationها + helper درصد/مبلغ)
- **Edited**: `src/components/layout/nav-items.ts` (یک خط)

---

### چند سؤال قبل از شروع

۱. **مرحله تأیید**: آیا تغییر قیمت توسط مسئول باید فوراً اعمال شود، یا نیاز به تأیید مدیر/حسابدار داشته باشد (مثلاً صف pending)؟
۲. **محدودیت تغییر**: آیا سقفی برای درصد تغییر قیمت در یک بار وجود داشته باشد (مثلاً اگر بیشتر از ۲۰٪ تغییر داد، تأیید مدیر لازم باشد)؟
۳. **پیش‌فرض step**: دکمه‌های افزایش/کاهش پیش‌فرض چه باشند؟ پیشنهاد: `−10%` `−1%` `+1%` `+10%` به‌علاوه فیلد عددی برای ورود مستقیم.
۴. **دلیل تغییر**: آیا برای هر تغییر قیمت، انتخاب «دلیل تغییر» (از `price_change_reasons`) اجباری باشد یا اختیاری؟

با پاسخ این ۴ سؤال، فاز G-11 آماده اجراست.
