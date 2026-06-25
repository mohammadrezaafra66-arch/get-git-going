# بازطراحی Navigation + Hub ارتباطات همکاری

بدون migration، بدون تغییر RPC. فقط ۴ تغییر فرانت.

## ۱) ویرایش `src/components/layout/nav-items.ts`

- آیتم `/messages` (پیام‌ها): label به «ارتباطات همکاری»، `to: "/collaboration"`، آیکن `MessageSquare`. ماژول `messages` بدون تغییر.
- حذف از سایدبار: `/purchase`، `/my-penalties`، `/delivery-receipts`، `/documents` (route فایل‌هایشان دست‌نخورده باقی می‌ماند → از داخل hub قابل دسترسی).
- آیتم «کارت‌های قرمز» (`/admin/penalties`) از قبل در `group: "admin"` با `subgroup: "adm-tools"` است → فقط `subgroup` را به `"adm-settings"` تغییر می‌دهیم (طبق درخواست). label و سایر مشخصات دست‌نخورده.

## ۲) فایل جدید `src/routes/_app.collaboration.tsx`

route guard: `requirePermission("messages", "view")` (همان gate صفحه `/messages` تا دسترسی یکسان بماند).

ساختار:

- پس‌زمینه گرادیان ملایم با inline style از پالت پروژه:
  `background: linear-gradient(135deg, rgba(18,50,86,0.06), rgba(15,118,110,0.06))`
- هدر: «سلام، {full_name یا email}» + تاریخ شمسی امروز با `formatJalaliDateTime(new Date().toISOString())` (همان helper موجود در `@/lib/messenger/format`).
- گرید کارت‌ها: `grid grid-cols-2 lg:grid-cols-3 gap-4`.

برای دریافت نام کاربر: `supabase.auth.getUser()` در یک `useQuery` با key `['me-display']` (یا اگر hook موجود `useCurrentProfile` وجود داشت از همان استفاده می‌کنیم — در زمان build بررسی می‌شود).

### کارت‌ها

آرایه `hubItems` مطابق پرامپت با ۵ مورد. هر کارت:

- `Link` به `to` مربوطه با `params={{}}` (مسیرهای ثابت).
- پس‌زمینه: `bg-gradient-to-br ${color}/10` (Tailwind opacity modifier) + `border border-border/50`.
- آیکن ۴۸px در یک دایره با `bg-gradient-to-br ${color} text-white`.
- عنوان `text-lg font-bold` + توضیح `text-sm text-muted-foreground`.
- Badge عدد در گوشه بالا-چپ (RTL → سمت چپ بصری = `left-3 top-3`) فقط اگر `> 0`، با `Badge variant="destructive"` و اعداد فارسی (`toPersianDigits`).
- hover: `transition hover:-translate-y-1 hover:shadow-lg`.

### Hookهای شمارش (همه `staleTime: 60_000`, `refetchInterval: 60_000`)

فایل جدید `src/hooks/collaboration/useHubCounts.ts` که این کوئری‌ها را export می‌کند:

| name | منبع |
|---|---|
| `useUnreadMessagesCount` | جمع `unread_count` از `useMessengerGroups()` موجود (بدون کوئری اضافه) |
| `usePendingPurchaseCount` | `supabase.from('purchase_requests').select('id', { count:'exact', head:true }).eq('status','pending')` |
| `useActivePenaltyCount` | `select count` روی `performance_penalties` با `is_active=true` و `user_id=auth.uid()` |
| `usePendingReceiptCount` | `select count` روی `delivery_receipts` با `status='pending_review'` و `uploaded_by=auth.uid()` |
| `usePendingDocCount` | `select count` روی `documents` با `status='pending_review'` و `uploaded_by=auth.uid()` |

نکته: اگر ستون/جدول هر کدام موجود نبود یا کاربر دسترسی RLS نداشت، خطا را silent کن و badge را پنهان (count=0). با `useQuery` `retry: false`.

## ۳) `/messages` بدون تغییر باقی می‌ماند

فایل `_app.messages.tsx` و route آن دست‌نخورده — فقط از سایدبار حذف می‌شود. لینک‌های داخلی و کارت hub همچنان کار می‌کنند.

## ۴) date picker شمسی در `_app.admin.penalties.tsx`

- import: `JalaliDateInput` از `@/shared/components/JalaliDateInput`.
- دو `<Input type="date">` با مقدارهای `fromDate`/`toDate` → `<JalaliDateInput value={fromDate} onChange={(iso)=>{ setFromDate(iso); setPage(0); }} placeholder="انتخاب تاریخ" />` (و معادل برای `toDate`).
- نوع state همان `string` (ISO YYYY-MM-DD) باقی می‌ماند → `filters.fromIso`/`toIso` با `new Date(fromDate).toISOString()` بدون تغییر کار می‌کند.

## فایل‌های تغییریافته/جدید

- ویرایش: `src/components/layout/nav-items.ts`
- ویرایش: `src/routes/_app.admin.penalties.tsx`
- جدید: `src/routes/_app.collaboration.tsx`
- جدید: `src/hooks/collaboration/useHubCounts.ts`

## محدودیت‌ها

- بدون migration، بدون RPC جدید، بدون وابستگی npm جدید.
- همه آیکن‌ها از `lucide-react`. TypeScript strict، بدون `any`.
- RTL و mobile-first. اعداد فارسی برای badgeها و تاریخ.
- بعد از پیاده‌سازی: `tsgo --noEmit` و `npm run build` اجرا و گزارش می‌شود.

## ریسک‌ها

- ستون `is_active` در `performance_penalties` یا `status='pending_review'` در `documents`/`delivery_receipts` ممکن است نام دیگری داشته باشد. در صورت ۴۰۰، fallback به count=0 (silent) — badge مخفی می‌شود؛ اعداد دقیق در فاز بعد قابل اصلاح.
