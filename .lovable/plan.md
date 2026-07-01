## مشکل
صفحه `/gamification/admin/kpi-rules` (و همه‌ی زیرمسیرهای `/gamification/*`) با پیام «Unauthorized» و errorComponent شکست می‌خورد.

### علت ریشه‌ای
در `src/routes/_app.gamification.tsx` (خطوط ۲۴–۳۳)، `beforeLoad` روت والد این چک را دارد:

```ts
if (typeof window === "undefined") return;
const ctx = context as { user?: { id: string } | null };
if (!ctx?.user) {
  throw new Error("Unauthorized");
}
```

اما `context.user` هیچ‌جا در client-side router context ست نمی‌شود (auth از طریق `AuthProvider` / `ensureAuthReady` مدیریت می‌شود، نه router context). پس روی client `ctx.user` همیشه undefined است و همیشه throw می‌شود → errorComponent با متن "Unauthorized" نمایش داده می‌شود.

این کد در تلاش قبلی برای رفع خطای SSR اضافه شده بود، اما درست کار نمی‌کند — auth واقعی already توسط:
- `_app` (والد بالاتر با AuthProvider)
- `requireAnyRole(["admin", "manager"])` در خود روت `kpi-rules`

انجام می‌شود، پس این گارد اضافی نه‌تنها لازم نیست بلکه صفحه را می‌شکند.

## اصلاح

فقط کل بلاک `beforeLoad` را از `src/routes/_app.gamification.tsx` حذف می‌کنم:

```diff
 export const Route = createFileRoute("/_app/gamification")({
-  beforeLoad: ({ context }) => {
-    if (typeof window === "undefined") return;
-    const ctx = context as { user?: { id: string } | null };
-    if (!ctx?.user) {
-      throw new Error("Unauthorized");
-    }
-  },
   component: GamificationRoutePage,
 });
```

## دامنه تغییرات
- تنها فایل تغییر یافته: `src/routes/_app.gamification.tsx`
- بدون migration، بدون تغییر RLS/RBAC، بدون تغییر UI
- صفحات محافظت‌شده‌ی زیرمسیر (`admin/kpi-rules`, `admin/rewards`, ...) همچنان توسط `requireAnyRole` / `requireAdmin` در `beforeLoad` خودشان محافظت می‌شوند

## تأیید
- بارگذاری `/gamification/admin/kpi-rules` باید لیست قوانین را نشان دهد (نه errorComponent)
- بارگذاری `/gamification` (پروفایل شخصی) باید کار کند
- SSR اولیه‌ی این مسیرها همچنان بدون throw می‌ماند چون `requireAnyRole` روی SSR فقط `resolveAuthWithRetry` را در `typeof window === "undefined"` مسیر برمی‌گرداند null و اجازه‌ی prerender می‌دهد
