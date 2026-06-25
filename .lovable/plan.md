## Slice 11-A — مرحله ۲: UI تنظیمات گردش‌کار

فقط لایه فرانت، بدون migration و بدون تغییر RPC. پایه‌ی RPCها از مرحله ۱ آماده است:
`get_workflow_settings()` و `update_workflow_setting(...)`.

### فایل‌های جدید

1. **`src/lib/settings/labels.ts`**
   - `ROLE_FA`: نگاشت admin/manager/sales/accountant/viewer → فارسی
   - `PENALTY_FOR_FA`: uploader/reviewer/both → «آپلودکننده» / «تأییدکننده» / «هر دو»
   - `formatMinutes(min)`: اگر ≥۶۰ خروجی «X ساعت»، در غیر این صورت «Y دقیقه» (با ارقام فارسی)

2. **`src/hooks/settings/useWorkflowSettings.ts`**
   - تایپ `WorkflowSetting` (همان شکل سطر جدول)
   - `useWorkflowSettings()` → React Query، `queryKey: ['workflow-settings']`، فراخوانی `supabase.rpc('get_workflow_settings')`، `staleTime: 60_000`
   - `useUpdateWorkflowSetting()` → useMutation، فراخوانی `supabase.rpc('update_workflow_setting', { p_process_key, p_uploader_role, p_reviewer_role, p_timer_minutes, p_penalty_enabled, p_penalty_for, p_is_active })`
   - onSuccess: `invalidateQueries(['workflow-settings'])` + `toast.success('تنظیمات ذخیره شد')`
   - onError: `toast.error('خطا در ذخیره تنظیمات')` با پیام فارسی (بدون نمایش raw error انگلیسی)

3. **`src/components/settings/WorkflowSettingRow.tsx`**
   - props: `setting: WorkflowSetting`
   - state داخلی برای ویرایش inline (draft) + flag تغییر‌نکرده برای غیرفعال‌سازی دکمه ذخیره
   - فیلدها:
     - نام فرایند: متن فقط‌خواندنی
     - آپلودکننده / تأییدکننده: `Select` با گزینه‌های نقش‌ها از `ROLE_FA` + گزینهٔ «—» برای null
     - تایمر: `Input type=number min=1` + نمایش `formatMinutes` کنارش
     - کارت قرمز: `Switch`
     - کارت قرمز برای: `Select` با سه گزینه؛ فقط زمانی فعال که کارت قرمز روشن باشد
     - وضعیت فرایند: `Switch`
   - زیر ردیف: تاریخ شمسی آخرین تغییر با `formatJalaliDateTime` (در صورت وجود `updated_at`)
   - دکمه «ذخیره» → `useUpdateWorkflowSetting().mutate(...)` با loading state

4. **`src/components/settings/WorkflowSettingsTable.tsx`**
   - استفاده از `useWorkflowSettings()`
   - حالت loading: skeleton فارسی (سه ردیف placeholder)
   - حالت empty: «تنظیماتی یافت نشد»
   - حالت error: پیام فارسی «خطا در بارگذاری تنظیمات»
   - دسکتاپ: `Table` با ستون‌های فرایند / آپلودکننده / تأییدکننده / تایمر / کارت قرمز / وضعیت / اقدام
   - موبایل: لیست کارت‌ها (همان `WorkflowSettingRow` در حالت stacked) — mobile-first

5. **`src/routes/_app.admin.workflow-settings.tsx`**
   - `createFileRoute('/_app/admin/workflow-settings')`
   - `beforeLoad: requireAnyRole(['admin','manager'])` (هم‌خوان با routeهای فعلی)
   - `PageHeader` با عنوان «تنظیمات گردش‌کار» و توضیح «تایمر، نقش‌ها و کارت قرمز هر فرایند را از اینجا تنظیم کنید»
   - `<WorkflowSettingsTable />`

### فایل‌های ویرایش‌شده

6. **`src/components/layout/nav-items.ts`**
   - افزودن یک آیتم در گروه `admin`، subgroup `adm-settings`:
     ```ts
     { to: '/admin/workflow-settings', label: 'تنظیمات گردش‌کار',
       icon: Settings, module: 'roles', group: 'admin',
       subgroup: 'adm-settings', adminOnly: true }
     ```

### رعایت قواعد پروژه

- RTL، mobile-first، فارسی، بدون متن خام انگلیسی در UI
- TypeScript strict، بدون `any` (تایپ خروجی RPC به‌صورت explicit)
- بدون وابستگی جدید (همه از shadcn موجود + sonner)
- بدون CDN/فونت آنلاین
- RBAC: route با `requireAnyRole`، nav با `adminOnly`، و RPC مرحله ۱ از سمت DB بررسی نقش می‌کند (دفاع لایه‌ای)
- ممیزی: `update_workflow_setting` در مرحله ۱ به `audit_logs` می‌نویسد — تغییری لازم نیست
- بدون migration، بدون تغییر RPC، بدون تغییر سایر hookها/صفحات

### وارسی پایان کار

- `npm run build`
- `npm run lint`
- اگر `tsgo --noEmit` در پروژه موجود نبود، صراحتاً گزارش می‌شود
- مسیر تست دستی: لاگین با admin → `/admin/workflow-settings` → تغییر تایمر/نقش/کارت قرمز یک ردیف → ذخیره → toast سبز → reload → مقادیر باقی مانده‌اند → بررسی ثبت در `audit_logs`
