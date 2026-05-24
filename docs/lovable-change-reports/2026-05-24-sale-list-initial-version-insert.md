# Sale List — درج رکورد اولیه version هنگام ایجاد لیست فروش

تاریخ: 2026-05-24
Scope: فقط Frontend (بدون migration، بدون تغییر backend)

## 1. Summary

در جریان ایجاد لیست فروش جدید (`/pricing/sale-lists/new`)، بعد از insert
موفق `sale_lists` و `sale_list_items` هیچ رکوردی در `sale_list_versions`
درج نمی‌شد. صفحه جزئیات لیست برای رندر header/items/PDF به
`sale_list_versions.snapshot_data` متکی است، در نتیجه لیست تازه‌ساخته‌شده
به‌درستی نمایش داده نمی‌شد.

این تغییر بلافاصله بعد از insert موفق `sale_list_items` یک snapshot کامل
با `version_number = 1` در `sale_list_versions` درج می‌کند. شکل snapshot
دقیقاً مطابق جریان ویرایش در
`src/routes/_app.pricing.sale-lists_.$listId.tsx` است تا صفحه جزئیات
یکنواخت رندر کند.

در صورت خطا در ساخت snapshot یا insert نسخه، rollback تمیز انجام می‌شود
(`sale_list_items` و سپس `sale_lists` حذف می‌شوند) تا هیچ رکورد یتیمی
باقی نماند.

## 2. Files Changed

- `src/routes/_app.pricing.sale-lists_.new.tsx` — افزودن بلاک ساخت
  snapshot + insert در `sale_list_versions` + rollback خطا.

## 3. New Files

- `docs/lovable-change-reports/2026-05-24-sale-list-initial-version-insert.md`
  (همین گزارش)

## 4. Deleted Files

هیچ.

## 5. Database / Migration / RLS / Storage Changes

**هیچ.**

- جدول `sale_list_versions` از قبل وجود دارد و schema آن صحیح است
  (`sale_list_id`, `version_number`, `snapshot_data jsonb`, `created_by uuid`).
- RLS فعال است و policy موجود
  `sale_list_versions_write_privileged` اجازه‌ی write به نقش‌های
  `admin/manager/accountant` می‌دهد — همان نقش‌هایی که `pricing.create`
  دارند. بنابراین کاربرانی که می‌توانند لیست فروش بسازند، می‌توانند
  version اولیه را هم درج کنند.
- migration جدیدی ساخته نمی‌شود.

توضیح درباره فایل `supabase/migrations/20260523105325_c6fbd8c4-068c-4f52-901e-0aca4a7fa18f.sql`:
این فایل صرفاً یک POLICY روی `currency_rate_fetches` ایجاد می‌کند و هیچ
ارتباطی به `sale_list_versions` ندارد. دست‌نخورده باقی می‌ماند.

## 6. Environment Variables

هیچ.

## 7. Snapshot Shape (مرجع)

```json
{
  "id": "<sale_list_id>",
  "name": "...",
  "description": null,
  "terms_text": null,
  "seller_info": null,
  "status": "draft",
  "sale_price_type_id": "...",
  "settlement_type_id": null,
  "selected_columns": ["name", "brand", "sale_price", ...],
  "items": [
    {
      "product_id": "...",
      "product_name": "...",
      "sku": "...",
      "brand_name": "...",
      "category_name": "...",
      "current_price": 0,
      "previous_price": null,
      "change_amount": null,
      "change_percent": null,
      "stock_status": "in_stock",
      "sort_order": 0
    }
  ]
}
```

## 8. Manual Test Checklist

1. `/pricing/sale-lists/new` → انتخاب نوع قیمت + ۲ محصول + settlement
   = none → ذخیره → toast موفقیت.
2. در DB:
   `SELECT count(*) FROM sale_list_versions WHERE sale_list_id = '<new-id>';`
   باید `1` باشد.
3. `SELECT version_number FROM sale_list_versions WHERE sale_list_id = '<new-id>';`
   باید `1` باشد.
4. `SELECT jsonb_array_length(snapshot_data->'items') FROM sale_list_versions WHERE sale_list_id = '<new-id>';`
   باید برابر تعداد محصولات انتخاب‌شده باشد.
5. صفحه جزئیات لیست تازه‌ساخته‌شده باید header، آیتم‌ها و PDF را
   بدون خطا نمایش دهد.
6. ایجاد لیست با محصولاتی از چند صفحه‌ی نتایج (مثلاً ۵ محصول از
   صفحه ۱ + ۳ محصول از صفحه ۲) → همه‌ی ۸ محصول در
   `snapshot_data.items` حضور دارند با `product_name` و `brand_name`
   صحیح.
7. شبیه‌سازی خطا در version insert (مثلاً موقتاً revoke کردن مجوز یا
   ارسال داده نامعتبر) → toast خطا + در DB رکورد `sale_lists` و
   `sale_list_items` متناظر وجود نداشته باشد (rollback تمیز).

## 9. Build / Lint Status

توسط harness Lovable به‌صورت خودکار اجرا می‌شود.

## 10. Risk Level

**LOW** — یک insert اضافه با rollback تمیز در همان flow ساخت لیست،
بدون تغییر UI/wizard/منطق step.

## 11. Rollback Plan

`git revert <commit-sha>` روی همین تغییر. هیچ migration/DB rollback لازم
نیست. نسخه‌های اولیه‌ای که قبل از revert ایجاد شده‌اند بی‌ضرر باقی
می‌مانند (داده‌ی معتبر هستند).

## 12. What Was NOT Changed

- ❌ هیچ migration جدید.
- ❌ `src/routes/_app.pricing.sale-lists_.$listId.tsx`
- ❌ `src/lib/pdf/sale-list-pdf.ts`
- ❌ routeهای public، RLS، Auth، Storage، Docker، env، `package.json`،
  `src/routeTree.gen.ts`.
- ❌ UI، wizard، منطق stepها.