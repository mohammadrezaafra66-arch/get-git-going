# دستیار هوشمند افراکالا — فاز اول (Skeleton معماری)

## هدف فاز اول

ساخت **اسکلت کامل** برنامه: layout، routing، احراز هویت، RBAC، دیتابیس پایه، استانداردهای UI/UX، و route خالی برای همه ماژول‌ها. **در این فاز هیچ منطق تجاری پیچیده‌ای پیاده نمی‌شود** — فقط زیربنای محکم تا فازهای بعدی روی آن ساخته شود.

---

## ۱. تصمیمات کلیدی (تأییدشده)

- **Backend**: Lovable Cloud (Postgres + Auth + RLS + Realtime). Schema استاندارد SQL است و هر زمان لازم شد به Supabase self-hosted روی سرور اختصاصی قابل مهاجرت است.
- **فونت**: Vazirmatn — به صورت local در `public/fonts/` (هیچ Google Fonts/CDN خارجی).
- **نقش‌ها**: `admin`, `manager`, `sales`, `accountant`, `viewer`.
- **ماژول‌ها**: همه ۱۲ ماژول از روز اول route و layout دارند.
- **زبان/جهت**: کامل فارسی، `dir="rtl"`، mobile-first.

---

## ۲. استک نهایی

| لایه | انتخاب | دلیل |
|---|---|---|
| Framework | TanStack Start (موجود) | SSR + file-based routing + type-safe |
| UI | shadcn/ui + Tailwind v4 (موجود) | کاملاً local، بدون CDN |
| فونت | Vazirmatn (woff2 محلی) | فارسی، open-source، بدون وابستگی خارجی |
| State سرور | TanStack Query | cache + debounce + کنترل بار |
| فرم/اعتبارسنجی | react-hook-form + zod | استاندارد، type-safe |
| دیتابیس | Lovable Cloud (Postgres + RLS) | self-host-able بعداً |
| آیکون | lucide-react (محلی) | بدون CDN |
| تاریخ شمسی | dayjs + dayjs-jalali | local، سبک |

---

## ۳. ساختار پوشه‌ها (ماژولار)

```
src/
  routes/                         # File-based routing
    __root.tsx                    # shell + RTL + فونت + QueryProvider
    index.tsx                     # ریدایرکت بر اساس auth
    login.tsx
    _app.tsx                      # layout محافظت‌شده (sidebar + header)
    _app/
      dashboard.tsx
      products/index.tsx          # ماژول محصولات
      pricing/index.tsx           # موتور قیمت‌گذاری
      purchases/index.tsx         # خرید
      sales/index.tsx             # فروش
      invoices/index.tsx          # فاکتور
      price-lists/index.tsx       # لیست قیمت
      users/index.tsx             # کاربران
      roles/index.tsx             # نقش‌ها و دسترسی‌ها
      reports/index.tsx           # گزارش‌ها
      knowledge/index.tsx         # دانش سازمانی
      feedback/index.tsx          # بازخورد
      messages/index.tsx          # پیام‌های داخلی
    unauthorized.tsx

  modules/                        # منطق هر ماژول جدا
    products/    { components, hooks, queries, types, schemas }
    pricing/     { engine/, rules/, components, ... }
    purchases/   ...
    sales/       ...
    invoices/    ...
    price-lists/ ...
    users/       ...
    roles/       ...
    reports/     ...
    knowledge/   ...
    feedback/    ...
    messages/    ...

  components/
    layout/      { AppShell, Sidebar, Header, MobileNav, Breadcrumbs }
    ui/          # shadcn (موجود)
    common/      { DataTable, EmptyState, PageHeader, ConfirmDialog, JalaliDatePicker }
    rbac/        { RoleGuard, PermissionGate }

  lib/
    auth/        { useAuth, AuthProvider, permissions.ts }
    rbac/        { roles.ts, permissions-matrix.ts, hasPermission.ts }
    i18n/        { fa.ts, formatters.ts }
    db/          { client wrappers, query helpers }
    utils/       { jalali, currency, validation }

  styles/
    globals.css  (شامل @import فونت Vazirmatn local)

public/
  fonts/vazirmatn/  # woff2 وزن‌های 300-700
```

---

## ۴. مدل دیتابیس پایه

### نقش‌ها (پترن امن، بدون recursion)

```sql
create type app_role as enum ('admin','manager','sales','accountant','viewer');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  role app_role not null,
  assigned_by uuid references auth.users,
  assigned_at timestamptz default now(),
  unique(user_id, role)
);

-- security definer برای جلوگیری از RLS recursion
create function has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from user_roles where user_id=_user_id and role=_role) $$;
```

### Audit log (مرکزی برای همه ماژول‌ها)

```sql
create table audit_logs (
  id bigserial primary key,
  actor_id uuid references auth.users,
  entity_type text not null,    -- 'product','invoice',...
  entity_id text not null,
  action text not null,         -- 'create','update','delete'
  diff jsonb,                   -- before/after
  ip text,
  created_at timestamptz default now()
);
create index on audit_logs(entity_type, entity_id);
create index on audit_logs(actor_id, created_at desc);
```

### جداول stub برای هر ماژول (فقط ساختار حداقلی + RLS)

محصولات، دسته‌ها، واحدها، مشتریان، تأمین‌کنندگان، فاکتورها، اقلام فاکتور، لیست‌های قیمت، قوانین قیمت‌گذاری (با versioning)، پیام‌ها، بازخوردها، مقالات دانش. **در این فاز فقط جدول‌های پایه + RLS ساخته می‌شوند**؛ منطق در فازهای بعد.

همه جداول مهم یک ستون `created_at`, `updated_at`, و trigger برای ثبت در `audit_logs` خواهند داشت.

### RLS policies پایه

- هر کاربر فقط profile خودش را می‌بیند/ویرایش می‌کند.
- `admin` به همه چیز دسترسی دارد (از طریق `has_role`).
- جداول business: خواندن برای `admin/manager/sales/accountant/viewer`، نوشتن بر اساس نقش (مثلاً فاکتور = sales/admin).
- جدول `user_roles`: فقط `admin` می‌تواند نقش بدهد/بگیرد.

---

## ۵. RBAC و کنترل دسترسی

### ماتریس دسترسی (نمونه، کامل در `lib/rbac/permissions-matrix.ts`)

| ماژول | admin | manager | sales | accountant | viewer |
|---|---|---|---|---|---|
| محصولات | CRUD | CRUD | R | R | R |
| قیمت‌گذاری | CRUD | CRU | R | R | R |
| خرید | CRUD | CRUD | – | R | R |
| فروش/فاکتور | CRUD | CRUD | CRU | R | R |
| کاربران/نقش‌ها | CRUD | – | – | – | – |
| گزارش‌ها | All | All | Sales | Finance | All-R |
| دانش | CRUD | CRU | R | R | R |
| پیام/بازخورد | All | All | Own | Own | Own |

### کامپوننت‌های guard

- `<RoleGuard roles={['admin','manager']}>...</RoleGuard>` — render conditional
- `<PermissionGate module="invoices" action="create">...</PermissionGate>`
- در سطح route: `beforeLoad` با `redirect` به `/unauthorized` اگر نقش کافی ندارد.

---

## ۶. UI/UX استاندارد

### Layout

- **AppShell** = Sidebar (راست در RTL) + Header + Main + (Mobile: Bottom Nav).
- **Sidebar** قابل جمع‌شدن، گروه‌بندی ماژول‌ها: عملیات / مالی / مدیریت / ارتباطات.
- **Header**: جستجوی سراسری، اعلان‌ها، پروفایل، تغییر کاربر.
- **Mobile**: Drawer + bottom nav با ۵ مورد پراستفاده.

### Design system

- رنگ‌ها از `index.css` به‌صورت HSL token (روشن/تاریک از روز اول).
- پالت پیشنهادی: primary سبز-آبی شرکتی، neutral گرم، accent برای هشدار/موفقیت.
- Spacing/typography mobile-first (حداقل touch target 44px).
- همه اعداد فارسی (`toLocaleString('fa-IR')`)، تاریخ شمسی.
- کامپوننت‌های مشترک: `<DataTable>` با pagination/filter/sort + export، `<PageHeader>`، `<EmptyState>`، `<ConfirmDialog>`، `<JalaliDatePicker>`.

### فونت Vazirmatn

- فایل‌های `.woff2` (وزن‌های 300/400/500/700) در `public/fonts/vazirmatn/`.
- در `globals.css` با `@font-face` و `font-display: swap` + در Tailwind theme به عنوان فونت پیش‌فرض.

---

## ۷. رفتار real-time و کارایی

- TanStack Query با `staleTime` معقول (مثلاً 30s برای لیست‌ها).
- subscribe به Realtime فقط برای ماژول پیام‌ها و notification (نه برای جداول سنگین).
- debounce روی جستجوها (400ms).
- pagination سرور-side در همه DataTable ها.
- index روی ستون‌های پراستفاده (`created_at`, FKها، فیلدهای جستجو).

---

## ۸. self-host و GitHub sync

- هیچ import از CDN در کد.
- همه فونت‌ها/آیکون‌ها/کتابخانه‌ها از `node_modules` یا `public/`.
- `.env` فقط شامل URL/Key (در self-host با مقادیر سرور خود جایگزین می‌شود).
- ساختار پوشه تمیز و فلت در `src/modules/` تا هر تیمی روی ماژول جدا کار کند.
- README با راهنمای اتصال به GitHub و نکات self-host (Docker در فاز بعد).

---

## ۹. خروجی این فاز (چک‌لیست)

1. نصب فونت Vazirmatn local + اعمال در Tailwind.
2. تنظیم `<html lang="fa" dir="rtl">` و کامنت theme.
3. فعال‌سازی Lovable Cloud + migration برای: `profiles`, `user_roles`, `app_role`, `has_role()`, `audit_logs` + جداول stub همه ۱۲ ماژول + RLS پایه.
4. trigger خودکار ساخت `profile` و نقش `viewer` پیش‌فرض روی signup.
5. صفحه `login` (email/password + Google) و `signup`.
6. `AppShell` + `Sidebar` + `Header` + `MobileNav` با ناوبری همه ماژول‌ها.
7. ساخت route خالی برای همه ۱۲ ماژول با `PageHeader` + `EmptyState` («به‌زودی»).
8. `lib/rbac/` کامل + کامپوننت‌های `RoleGuard` و `PermissionGate`.
9. صفحه‌های `/users` و `/roles` با عملکرد واقعی (مدیریت کاربران و تخصیص نقش — تنها ماژول کامل در فاز اول، چون پیش‌نیاز بقیه است).
10. کامپوننت‌های مشترک: `DataTable`, `PageHeader`, `EmptyState`, `ConfirmDialog`, `JalaliDatePicker`.
11. صفحه `unauthorized` و 404 فارسی.
12. README فارسی با راهنمای اجرا، GitHub sync، و roadmap فازهای بعدی.

---

## ۱۰. روی چه چیزی فاز اول کار **نمی‌کند** (به فازهای بعد)

- منطق واقعی محصولات/فاکتور/قیمت‌گذاری (فقط جدول و route).
- موتور rule-based قیمت‌گذاری با versioning (طراحی schema می‌شود اما UI و engine در فاز ۲).
- گزارش‌های پیشرفته و chart.
- پیام‌رسان/AI/integration خارجی (طبق قانون ۱۳).
- Docker compose برای self-host (فاز جداگانه).

---

## بعد از تأیید شما

با تأیید این plan، وارد build mode می‌شوم و این ۱۲ مورد چک‌لیست را به ترتیب پیاده‌سازی می‌کنم. خروجی فاز اول یک skeleton کاملاً قابل اجرا با login، RBAC، مدیریت کاربر، و route همه ماژول‌ها خواهد بود — آماده برای ساخت منطق هر ماژول در iteration بعدی.
