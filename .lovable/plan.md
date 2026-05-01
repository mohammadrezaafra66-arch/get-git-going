## مشکل

روی مانیتور سمت راست (لینک منتشرشده) صفحه ورود پیغام «Missing Supabase environment variables» نشان می‌دهد.

علت: چند مسیر ابتدایی برنامه (`/`, `/register`, `/pending-approval`) در `beforeLoad` خود مستقیماً `supabase.auth.*` یا `ensureAuthReady()` را صدا می‌زنند **بدون محافظ SSR**. وقتی سایت منتشرشده در Worker سمت سرور پیش‌رندر می‌شود، متغیرهای `import.meta.env.VITE_SUPABASE_*` در باندل سرور موجود نیستند و کلاینت Supabase موقع ساخت شدن خطا پرتاب می‌کند → کل HTML سرور با همان پیغام ارور برمی‌گردد و کاربر روی هر صفحه‌ای که زود به این مسیرها برسد همان متن قرمز را می‌بیند.

`/login` و `/_app` قبلاً اصلاح شده‌اند ولی روت‌های زیر هنوز محافظ ندارند. روت `/` به‌خصوص خطرناک است چون نقطه ورود پیش‌فرض است.

## تغییرات (فقط ۳ فایل کوچک، بدون تغییر منطق)

### ۱. `src/routes/index.tsx`
در `beforeLoad` قبل از فراخوانی `supabase.auth.getSession()`:

```ts
beforeLoad: async () => {
  if (typeof window === "undefined") {
    // در SSR هیچ کاری نکن؛ هیدریشن سمت کلاینت تصمیم می‌گیرد.
    throw redirect({ to: "/login" });
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  } catch (err) {
    if (err && typeof err === "object" && "isRedirect" in err) throw err;
    // اگر کلاینت Supabase به هر دلیل ساخته نشد، فقط به /login بفرست.
  }
  throw redirect({ to: "/login" });
}
```

### ۲. `src/routes/register.tsx`
`beforeLoad` را با همان الگوی موجود در `login.tsx` بپیچ:

```ts
beforeLoad: async () => {
  if (typeof window === "undefined") return;
  try {
    const auth = await ensureAuthReady();
    if (auth.user) throw redirect({ to: "/dashboard" });
  } catch (err) {
    if (err && typeof err === "object" && "isRedirect" in err) throw err;
    console.error("[register] beforeLoad auth check failed", err);
  }
}
```

### ۳. `src/routes/pending-approval.tsx`
دقیقاً همان الگو:

```ts
beforeLoad: async () => {
  if (typeof window === "undefined") return;
  try {
    const auth = await ensureAuthReady();
    if (!auth.user) throw redirect({ to: "/login" });
    if (auth.profile?.status === "active") throw redirect({ to: "/dashboard" });
  } catch (err) {
    if (err && typeof err === "object" && "isRedirect" in err) throw err;
    console.error("[pending-approval] beforeLoad auth check failed", err);
  }
}
```

## چیزهایی که تغییر نمی‌کند

- `src/integrations/supabase/client.ts` (تولیدشده — قابل ویرایش نیست).
- منطق ورود/خروج، RBAC، کوئری‌ها، UI و طراحی هیچ تغییری نمی‌کند.
- مهاجرت دیتابیس یا فایل `.env` لازم نیست.

## بعد از پیاده‌سازی

۱. روی **Publish → Update** کلیک کن تا باندل تازه روی `https://get-git-going.lovable.app` منتشر شود. (اگر یک‌بار republish نشود، نسخهٔ کش‌شدهٔ قبلی همان خطا را نشان می‌دهد.)
۲. صفحهٔ `/login` را در یک پنجرهٔ ناشناس تست کن.
