# Fix: Pricing Workshop — Owner discoverability + sale-price refresh feedback

Branch: `fix-pricing-workshop-dashboard-and-sale-price`

## 1. Summary
بهبود تجربه کاربری «کارگاه قیمت من» (`/pricing/my-workbench`) بدون هیچ تغییر دیتابیس/schema/RLS/auth/storage و بدون فرمول جدید قیمت‌گذاری:
- افزودن سه Quick Chip «محصولات من / همه محصولات / بدون مسئول» برای discoverability فیلتر مسئول موجود.
- برجسته‌سازی label فیلتر «مسئول محصول».
- تضمین refresh ستون «قیمت فروش» بلافاصله پس از ذخیره/انتشار با `refetchQueries`.
- نگاشت خطاهای موتور قیمت‌گذاری به پیام‌های فارسی واضح و نمایش per-row (Badge قرمز + tooltip) به جای toast کلی.

## 2. Changed Files
- `src/components/pricing/workbench/WorkbenchFiltersBar.tsx`
- `src/routes/_app.pricing.my-workbench.tsx`

## 3. New Files
- `docs/lovable-change-reports/2026-05-22-1553-fix-pricing-workshop-owner-chips-and-refresh.md` (همین فایل).

## 4. Deleted Files
هیچ.

## 5. Environment Variables
هیچ تغییری در env. هیچ secret جدید.

## 6. Database Changes
**None.**

## 7. Schema Changes
**None.** هیچ تغییر در tables/columns/enums/triggers/functions/foreign keys/indexes/constraints.

## 8. Storage Changes
**None.**

## 9. Migration Required
**No.**

## 10. Local Update Steps
1. `git pull` روی نسخه Local.
2. rebuild image:
   ```bash
   docker compose -f deploy/app/docker-compose.prod.yml build app
   docker compose -f deploy/app/docker-compose.prod.yml up -d app
   ```
3. هیچ migration یا restart Supabase لازم نیست.

## 11. Backup Required
**No.** هیچ تغییر دیتایی انجام نشده.

## 12. Export Required
**No.** نه schema export، نه data export، نه storage export.

## 13. Risk Level
**LOW.** فقط Frontend؛ دو فایل React؛ هیچ تغییر در منطق ذخیره/انتشار/موتور.

## 14. Rollback Plan
`git revert` کامیت روی branch `fix-pricing-workshop-dashboard-and-sale-price` و rebuild image. هیچ rollback دیتابیسی نیاز نیست.

## 15. Post-Update Tests
1. ورود admin → `/pricing/my-workbench` → سه chip بالای فیلترها قابل کلیک و رفتار درست:
   - «محصولات من»: فقط محصولات assigned به کاربر فعلی.
   - «همه محصولات»: کل محصولات (فقط admin/manager).
   - «بدون مسئول»: محصولات بدون assignment.
2. Select «مسئول محصول» همچنان کار کند (روی هر مسئول → فقط محصولات همان فرد).
3. ویرایش قیمت خرید یک محصول با `pricing_rules` منطبق → بعد از Save، ستون «قیمت فروش» **بلافاصله** مقدار جدید از `product_computed_prices.rounded_sale_price` را نمایش دهد.
4. ویرایش قیمت خرید محصولی با rule نامنطبق → Badge قرمز «خطای محاسبه» در ردیف، tooltip متن کامل فارسی، toast هشدار فارسی. هیچ عدد جعلی نمایش داده نشود. قیمت خرید با موفقیت ذخیره شود.
5. اجرای `npm run build` و `npm run lint` روی Local.

## Self-Host Acceptance Check
- ✅ سازگار با Linux + Docker + Supabase Self-host
- ✅ بدون وابستگی به CDN/فونت/API خارجی جدید
- ✅ بدون secret در frontend
- ✅ هیچ تغییری در RLS/RBAC/auth
- ✅ هیچ migration

## Remaining Risks
- اگر mapping LAN در `pricing_rules.sale_price_type_id` / `settlement_type_id` با LAN-canonical همگام نباشد، خطای فارسی «قانون قیمت‌گذاری منطبق وجود ندارد» در ردیف نمایش داده می‌شود (که رفتار درست و امن است). remap قوانین یک تسک جدا و خارج از scope این تغییر است.