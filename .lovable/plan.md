## Slice 8 — مرحله ۲: UI سیستم کارت قرمز

فقط لایه فرانت. هیچ migration یا تغییر RPC. از اسکیمای موجود استفاده می‌شود.

### فایل‌های جدید

1. `**src/lib/penalties/labels.ts**` — mapping فارسی متمرکز
  - `PENALTY_TYPE_FA`, `PENALTY_SEVERITY_FA`, `APPEAL_STATUS_FA` با همان متن‌های ارسالی شما.
  - tailwind class برای هر شدت (low=amber, medium=orange, high=red) و وضعیت اعتراض.
  - تابع `remainingAppealMs(createdAt)` و `formatRemaining(ms)` (به فارسی: «X ساعت و Y دقیقه باقی‌مانده»).
2. `**src/lib/penalties/penalties.functions.ts**` — wrapper سرور برای RPCها
  - فقط `createServerFn` + `requireSupabaseAuth` (تا header attach شود)؛ داخل handler `context.supabase.rpc(...)` صدا زده می‌شود و خطاهای فارسی RPC عیناً throw می‌شوند.
  - چهار تابع: `getUserPenalties({ userId? })`, `submitAppealFn({ penaltyId, reason })`, `voteOnAppealFn({ appealId, vote, note? })`, `getReviewerAppeals()` (لیست اعتراض‌های pending که کاربر در `appeal_reviewers` با `vote IS NULL` دارد؛ شامل join با `penalty_appeals` + `performance_penalties`).
  - `getAllPenaltiesAdmin({ filters })` برای صفحه ادمین (یک select با RLS — مدیر/ادمین همه را می‌بیند) شامل join با profiles برای نام کاربر.
  - شمارش هفتگی/ماهانه: `getPenaltyStats()`.
3. `**src/hooks/penalties/usePenalties.ts**` — React Query hooks
  - `useMyPenalties()`, `useUserPenaltyCount(userId)`, `useReviewerAppeals()`, `useAdminPenalties(filters)`, `usePenaltyStats()`.
  - mutationها: `useSubmitAppeal()`, `useVoteOnAppeal()` با invalidate صحیح + `toast` فارسی.
4. **کامپوننت‌ها زیر `src/components/penalties/**`
  - `PenaltyBadge.tsx` — props: `userId: string`, `size?: 'sm'|'md'|'lg'`. از `useUserPenaltyCount` می‌خواند؛ فقط اگر `count>0` نمایش می‌دهد. آیکن `ShieldAlert`/`AlertOctagon` lucide قرمز + عدد فارسی، tooltip «کارت قرمز فعال».
  - `MyPenaltiesPanel.tsx` — لیست کارت‌ها (Card)؛ هر کارت: نوع فارسی، badge شدت، تاریخ شمسی، badge فعال/غیرفعال، badge وضعیت اعتراض، دکمه «اعتراض» اگر `can_appeal`، یا «وضعیت اعتراض» اگر `has_appeal`. حالت‌های loading/empty/error فارسی.
  - `AppealForm.tsx` — Dialog؛ خلاصه تخلف بالا، textarea با `minLength={50}` و شمارنده کاراکتر، نوار مهلت ۲۴h (re-render هر دقیقه با `setInterval`)، اگر منقضی: دکمه disable + پیام. دکمه ارسال → `useSubmitAppeal`.
  - `AppealReviewPanel.tsx` — لیست `useReviewerAppeals()`. هر مورد: دلیل کاربر، خلاصه تخلف، شمارنده آراء فعلی (accept/reject/pending)، فیلد یادداشت اختیاری، دکمه «پذیرفتن» (سبز) و «رد کردن» (قرمز) → `useVoteOnAppeal`. پس از رأی toast + invalidate.
  - `PenaltyTypeBadge.tsx`, `SeverityBadge.tsx`, `AppealStatusBadge.tsx` — wrapper کوچک روی `Badge` shadcn برای استفادهٔ مشترک.
5. `**src/routes/_app.admin.penalties.tsx**` — صفحه ادمین
  - `beforeLoad: await requireAnyRole(['admin','manager'])`.
  - PageHeader «مدیریت کارت‌های قرمز».
  - ۳ کارت آماری بالا: «کارت قرمز این هفته»، «کارت قرمز این ماه»، «اعتراض‌های در انتظار».
  - فیلترها (state محلی + debounce): سرچ کاربر (نام)، select نوع، select شدت، JalaliDateInput بازه از/تا.
  - Table با ستون‌های: نام کاربر، نوع، شدت (badge)، تاریخ شمسی، وضعیت فعال، وضعیت اعتراض. pagination ساده (limit/offset).
  - بخش پایین: `<AppealReviewPanel />` (همان کامپوننت قابل استفاده مجدد، فقط برای hierarchy نمایشی).

### اتصال‌های کوچک (preserve UI موجود)

- در `MyPenaltiesPanel` هیچ‌جا auto-mount نمی‌شود؛ این Slice فقط route ادمین را به اپ اضافه می‌کند. اضافه‌کردن لینک به سایدبار/menu **خارج از این Slice** است (در صورت نیاز در همان turn یک خط به منوی admin اضافه می‌کنیم).
- برای نمایش `PenaltyBadge` در پروفایل کاربر، کامپوننت آماده می‌شود ولی فقط export. embedding در صفحات دیگر در slice بعدی.

### نکات فنی

- تاریخ شمسی: استفاده از helper موجود `formatJalaliDateTime` در `src/lib/messenger/format.ts` (moment-jalaali) — وابستگی جدید نصب نمی‌شود.
- خطاهای RPC فارسی: `error.message` که از Postgres می‌آید همان متن فارسی است → مستقیم به `toast.error` پاس می‌شود.
- TypeScript strict؛ بدون `any`. تایپ ردیف‌های RPC به‌صورت لوکال تعریف می‌شود (تا generate دوبارهٔ types لازم نباشد).
- بدون realtime/polling سنگین؛ refetch با invalidate بعد از mutation و `staleTime: 30s` برای لیست‌ها.
- RTL, mobile-first, کاملاً responsive.

### تست

- `npm run build`
- `npx tsgo --noEmit`
- مسیر دستی: ورود ادمین → `/admin/penalties` → دیدن لیست و فیلترها → ورود کاربر دارای کارت قرمز → `MyPenaltiesPanel` (در همان صفحه ادمین به‌عنوان دموی موقت یا route جدا اگر تأیید کنید).

### سؤال (لطفاً قبل از build تأیید)

- `MyPenaltiesPanel` در کدام صفحه mount شود؟ پیشنهاد: یک route جدید `_app.my-penalties.tsx` («کارت‌های قرمز من») با `beforeLoad: requirePermission('messages','view')` یا فقط authentication ساده. تأیید می‌کنید این route ساخته شود، یا فعلاً فقط کامپوننت export شود و mount در slice بعدی؟  
  
بله، route جدید `_app.my-penalties.tsx` بساز با authentication ساده (فقط login). همه نقش‌ها می‌توانند کارت‌های قرمز خودشان را ببینند. لینک سایدبار را هم همین الان اضافه کن — نیازی نیست به slice بعدی موکول شود.