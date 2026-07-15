## علت

در `recordManualScoreAdjustment` بررسی نقش با `context.supabase.rpc("has_role", ...)` انجام می‌شود؛ کلاینت با نشان Bearer کاربر (کلید publishable) صدا زده می‌شود و در برخی حالات پاسخ RPC به‌شکل `data: null` برمی‌گردد (به‌ویژه با کلیدهای جدید `sb_publishable_*`). چون کد فقط `if (!isAdmin)` را چک می‌کند، `null` هم Forbidden می‌سازد — درحالی‌که کاربر (Mohammadreza Afra) در جدول `user_roles` نقش `admin` دارد و صدا زدن مستقیم `has_role(...)` روی پایگاه‌داده `true` می‌دهد.

## راه‌حل

در `src/lib/gamification/manual-score.functions.ts` بررسی نقش را از طریق `supabaseAdmin` (که از قبل داخل handler import می‌شود) و با گرفتن خطا انجام می‌دهیم:

```ts
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
  _user_id: userId,
  _role: "admin",
});
if (roleErr) throw new Error(roleErr.message);
if (!isAdmin) throw new Error("Forbidden: admin role required");
```

`supabaseAdmin` با service role اجرا می‌شود و RPC روی `has_role` را قطعی و بدون وابستگی به نوع کلید کاربر برمی‌گرداند. باقی handler بدون تغییر.

## چک پس از اعمال

۱. با کاربر ادمین در `/gamification/settings` → «ثبت امتیاز دستی» → توست موفقیت (بدون Forbidden، بدون WebSocket).
۲. کارت «امتیاز من» در `/dashboard` مقدار جدید را نشان دهد.
۳. با کاربر غیرادمین همان endpoint را صدا بزنیم → همچنان «Forbidden: admin role required».
