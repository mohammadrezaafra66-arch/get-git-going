# افزودن دکمه میانبر «برچسب‌زدن» در صفحه محصولات

## بررسی معیارهای پذیرش (AFRAKALA_ACCEPTANCE_CRITERIA.md)
این تغییر کاملاً UI/UX است:
- بدون migration جدید (از همان جدول `product_label_links` و RLS موجود استفاده می‌شود)
- بدون secret یا CDN خارجی
- RBAC: دکمه فقط برای کاربران با `products.update` نمایش داده می‌شود
- فارسی، RTL، mobile-first
- بدون افزایش وابستگی
✅ همه معیارها رعایت می‌شود.

## هدف
کاربر می‌خواهد دکمه «برچسب‌زدن» مستقیماً در ستون «عملیات» جدول محصولات (و کارت موبایل) قرار بگیرد، تا بدون ورود به فرم کامل ویرایش محصول، فقط برچسب‌های آن محصول قابل ویرایش باشد. خود فرم ویرایش محصول هم بدون تغییر باقی می‌ماند (همانطور که کاربر تأکید کرد: «داخل فرم همه‌چیز مثل قبل باشد»).

## تغییرات

### 1) کامپوننت جدید: دیالوگ برچسب‌زدن سریع
فایل جدید: `src/components/products/ProductLabelsQuickDialog.tsx`

- یک `Dialog` shadcn با عنوان «مدیریت برچسب‌های محصول» و نام محصول در توضیحات
- بارگیری همه برچسب‌های موجود از `product_labels`
- بارگیری برچسب‌های فعلی این محصول از `product_label_links`
- نمایش به‌صورت لیست checkbox با رنگ هر برچسب (مشابه آنچه در فرم ویرایش محصول هست)
- دکمه‌های «انصراف» و «ذخیره»
- در ذخیره: diff بین انتخاب فعلی و قبلی → insert/delete روی `product_label_links` (دقیقاً همان منطق صفحه edit، خطوط ۸۹–۱۰۶)
- پس از موفقیت: `toast.success` + `queryClient.invalidateQueries({ queryKey: ["products"] })` تا برچسب‌های جدید بلافاصله در جدول دیده شوند
- Guard: اگر کاربر `products.update` ندارد، دکمه باز کننده اصلاً نمایش داده نمی‌شود (در صفحه index)

### 2) صفحه محصولات: افزودن دکمه در ستون عملیات
فایل: `src/routes/_app.products.index.tsx`

- import آیکن `Tag` از `lucide-react` و کامپوننت دیالوگ جدید
- state محلی: `labelTarget: { id: string; name: string } | null`
- در ستون «عملیات» (دسکتاپ، خطوط ۲۲۵–۲۳۶) بعد از دکمه ویرایش، یک `Button` آیکنی با `<Tag />` و `aria-label="برچسب‌زدن"` اضافه می‌شود — فقط وقتی `canUpdate`
- در کارت موبایل (خطوط ۲۶۷–۲۷۴) نیز یک دکمه «برچسب» در کنار دکمه ویرایش
- یک نمونه `<ProductLabelsQuickDialog>` در انتهای صفحه که با `labelTarget` کنترل می‌شود
- onClick دکمه‌ها: `setLabelTarget({ id: p.id, name: formatProductDisplayNameWithFallback(p) })`

### 3) مواردی که تغییر **نمی‌کنند**
- `src/routes/_app.products_.$id.edit.tsx` (فرم ویرایش محصول دقیقاً مثل قبل، شامل بخش برچسب‌ها)
- `src/routes/_app.products.labels.tsx` (مدیریت تعریف برچسب‌ها)
- schema یا RLS

## فایل‌های تحت تأثیر
- ایجاد: `src/components/products/ProductLabelsQuickDialog.tsx`
- ویرایش: `src/routes/_app.products.index.tsx`

## گزارش Self-Host Acceptance
- ✅ بدون CDN/secret/API خارجی
- ✅ بدون migration یا تغییر RLS
- ✅ RBAC رعایت شده (products.update)
- ✅ Persian + RTL + mobile-first
- ✅ بدون dependency جدید
- ✅ سازگار با Docker/Linux self-host
