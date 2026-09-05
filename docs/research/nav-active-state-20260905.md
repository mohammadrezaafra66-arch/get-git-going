# پژوهش — وضعیت فعال ناوبری: صفحهٔ باز زیر کدام منو است؟

**READ-ONLY — هیچ چیزی تغییر نکرد.** تنها فایل نوشته‌شده در این مأموریت همین فایل است.
هیچ migration، هیچ نصب، هیچ اصلاح کد.

| | |
|---|---|
| مخزن | `D:\AfraKalaTest\app` · شاخهٔ `staging` |
| SHA خوانده‌شده | `6c812f08d0fc0373246e2d3d4fbb8ca077c917d6` |
| تاریخ | ۲۰۲۶-۰۹-۰۵ |
| وضعیت | `COMPLETE` برای Q1–Q4 روی کد؛ تأیید مرورگر انجام نشد (بخش UNVERIFIED) |

### وضعیت درخت کاری هنگام خواندن (verbatim)

```
$ git worktree list
D:/AfraKalaTest/app                                    6c812f08 [staging]
.../8c144667-.../wt-asan                               edb48fb8 [hotfix/asan-bank-export-headers]
.../8c144667-.../wt-asan2                              c816eea4 [hotfix/asan-bank-export-layout]
.../8c144667-.../wt-inline                             69ace7ca [feature/bank-account-asan-code-inline]
.../8c144667-.../wt-phonefix                           6298b97d [hotfix/quote-link-empty-phone]
.../8c144667-.../wt-terms                              ffd8315b [feature/purchase-term-is-mandatory]
.../98a8834f-.../wt/ab-export                          4d017cf0 [feature/asan-export-multidoc]
.../98a8834f-.../wt/ab-import                          f32997e4 [feature/asan-import-enforcement]
.../98a8834f-.../wt/ab-person                          1053cdb2 [feature/person-delete-and-complete]
.../98a8834f-.../wt/ab-wizard                          e600e189 [feature/receipt-any-person]
D:/AfraKalaTest/afrakala-deploy-sidebar                257ba917 (detached HEAD)
D:/AfraKalaTest/app-docs-build                         33bc6704 [feature/documents-dual-filter-export]

$ git status --porcelain
?? docs/research/asan-bridge-build-20260904.md
?? e2e/auth/generate-role-sessions.spec.ts.bak
?? pw.session.config.ts
?? r9-failures.txt
?? test-objects.txt
?? test-schema-20260831.sql
```

هیچ‌کدام از فایل‌هایی که خواندم تغییر محلی نداشتند:

```
$ git status --porcelain -- src/lib/navigation src/components/layout src/routeTree.gen.ts
(خروجی خالی)
```

پیشینهٔ فایل‌های خوانده‌شده:

| فایل | آخرین commit |
|---|---|
| `src/lib/navigation/registry.ts` | `1053cdb2` ۲۰۲۶-۰۹-۰۴ |
| `src/lib/navigation/types.ts` | `223f3cd8` ۲۰۲۶-۰۷-۲۴ |
| `src/components/layout/primary-modules.ts` | `1053cdb2` ۲۰۲۶-۰۹-۰۴ |
| `src/components/layout/AppSidebar.tsx` | `6e0201bd` ۲۰۲۶-۰۸-۰۶ |
| `src/components/layout/nav-items.ts` | `223f3cd8` ۲۰۲۶-۰۷-۲۴ |
| `src/routeTree.gen.ts` | `1053cdb2` ۲۰۲۶-۰۹-۰۴ |

---

## Verdict

**این کار UI است، نه تغییر مدل داده — ولی UI آن از صفر ساخته می‌شود، چون امروز اصلاً گروهی
رندر نمی‌شود.** [E] رجیستری از همان روز اول والد را رمزگذاری کرده است: هر ۱۲۶ مسیر دقیقاً یک
`group` و ۸۱ مسیر یک `subgroup` دارند (`registry.ts:1172` به بالا)، برچسب فارسی هر دو هم نوشته
شده (`nav-items.ts:33` و `:45`)، و `getNavigationEntryByRoute()` در `selectors.ts:22` از روی رشتهٔ
مسیر همین‌الان والد را برمی‌گرداند. پس داده هست و کامل است. چیزی که نیست، **مصرف‌کننده** است:
تنها فایلی که `group`/`subgroup` را می‌خواند `nav-items.ts` است و آن فایل را **هیچ‌کس import نمی‌کند**
(F7). سایدبار واقعی از یک لیست کاملاً جداگانه می‌خواند — `PRIMARY_MODULES` در
`primary-modules.ts` — که ۷ ماژول دارد و هیچ مفهومی از گروه یا زیرگروه در آن نیست، و آیتم‌ها را
به‌صورت **یک فهرست تخت** رندر می‌کند (`AppSidebar.tsx:575-583`). بنابراین «گروه والد خودکار باز
شود» امروز حتی معنی ندارد: چیزی برای باز شدن وجود ندارد، نه state باز/بسته‌ای هست و نه هیچ
`Collapsible`/`Accordion` در ناوبری (F8).

نیمهٔ دوم خواسته — «آیتم خودِ صفحه برجسته شود» — **پیاده‌سازی شده و کار می‌کند**، ولی فقط برای
مسیرهایی که هم در رجیستری و هم در `PRIMARY_MODULES` باشند (F5). دو دستهٔ اندازه‌گیری‌شده از این
قاعده بیرون می‌افتند و برای آن‌ها سایدبار نه‌تنها چیزی برجسته نمی‌کند بلکه **ماژول اشتباه را باز
می‌کند**: ۱۳ صفحهٔ مالی و ۱۵ صفحهٔ بدون هیچ ورودی رجیستری — جمعاً ۲۸ صفحه که همه به ماژول
`dashboard` می‌افتند (F9، F10).

دربارهٔ صفحهٔ‌ای که مالک نام برد — `/admin/persons-cleanup` — یافتهٔ صادقانه این است که **داده و
منطقِ برجسته‌سازی هر دو سر جایشان هستند** (F11): مسیر در رجیستری هست
(`registry.ts:798`, `group: "admin"`, `subgroup: "adm-tools"`)، در `PRIMARY_MODULES` هست
(`primary-modules.ts:198`)، و `resolveActiveModule("/admin/persons-cleanup")` را خودم اجرا کردم →
`admin`. پس `isItemActive` باید `true` بدهد. آنچه واقعاً غایب است دو چیز است که هر دو اندازه‌گیری
شده‌اند: (۱) هیچ سرتیتر گروهی وجود ندارد، پس حتی وقتی سطر برجسته می‌شود کاربر «مسیر رسیدن» را
نمی‌بیند؛ (۲) فهرست ماژول `admin` **۵۰ آیتم تخت** است و `/admin/persons-cleanup` آیتم **۲۸اُم**
است، داخل یک ظرف `overflow-y-auto` که بالایش هم «نیازمند اقدام»، «میانبرهای من» و «آخرین
استفاده‌ها» رندر می‌شوند، و در کل `src/components/layout/` **صفر** مورد `scrollIntoView` هست
(F12). یعنی برجسته‌سازی احتمالاً هست ولی زیر لبهٔ دید. این آخری را در مرورگر تأیید نکردم — در
بخش UNVERIFIED ثبت شده است.

---

## F1..F12 — یافته‌ها

### F1 — شکل داده: فهرست تخت با فیلد `group` (و `subgroup` اختیاری) · Q1.1 · **exists-works**

نوع دقیقاً این است — `src/lib/navigation/types.ts:49-64`:

```ts
export interface NavigationEntrySeed {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  module: ModuleKey;
  group: NavigationGroupKey;
  subgroup?: NavigationSubgroupKey;
  adminOnly?: boolean;
  allowedRoles?: AppRole[];
  hiddenFromMenu?: boolean;
}
```

و کلیدهای مجاز، `types.ts:13-33`:

```ts
export type NavigationGroupKey =
  | "main" | "products-pricing" | "purchasing" | "sales-customers"
  | "finance" | "operations" | "reports" | "knowledge-comms" | "admin";

export type NavigationSubgroupKey =
  | "pp-catalog" | "pp-pricing" | "pp-publish"
  | "sc-sales" | "sc-customers"
  | "adm-users" | "adm-settings" | "adm-gamification" | "adm-tools";
```

یعنی: **فهرست تخت با فیلد گروه، دو سطح عمق (group → subgroup)، نه درخت تودرتو.**
`NavigationEntry` (خروجی) همان دو فیلد را عیناً حمل می‌کند (`types.ts:72-73`).

**پیامد برای ساخت:** مدل داده لازم را ندارید بسازید؛ فقط باید خوانده شود.

---

### F2 — از روی رشتهٔ مسیر، والد امروز قابل استخراج است · Q1.2 · **exists-works**

تابع موجود، `src/lib/navigation/selectors.ts:22-24`:

```ts
export function getNavigationEntryByRoute(route: string): NavigationEntry | undefined {
  return NAVIGATION_REGISTRY.find((entry) => entry.route === route);
}
```

خروجی آن `entry.group` و `entry.subgroup` دارد. برای مسیرهای فرزند (که خودشان ورودی رجیستری
ندارند) هم مطابقت پیشوندی از قبل نوشته شده — `src/lib/navigation/metadata.ts:22-26`:

```ts
function bestPrefixEntry(pathname: string): NavigationEntry | undefined {
  return NAVIGATION_REGISTRY.filter(
    (entry) => pathname === entry.route || pathname.startsWith(entry.route + "/"),
  ).sort((a, b) => b.route.length - a.route.length)[0];
}
```

و `resolveNavigationMetadata()` (همان فایل، `:28-51`) والد را در فیلد `group` برمی‌گرداند
(`metadata.ts:45`). این تابع **همین‌الان در برنامه اجرا می‌شود** — تنها مصرف‌کننده‌اش
`NavigationBreadcrumbs.tsx:14` است، که فقط `.breadcrumbs` را می‌خواند و `.group` را دور می‌ریزد.

**پیامد:** پیوند مسیر→والد وجود دارد و آزموده شده؛ نیازی به نوشتن lookup تازه نیست.

---

### F3 — شمارش‌ها: ۱۲۶ مسیر، **۱۲۶ تای آن‌ها والد دارند، صفر بدون والد** · Q1.3 · **exists-works**

```
registry routes: 126 | PRIMARY_MODULES paths: 113 | routeTree static app routes: 159
registry NOT in routeTree: []
routeTree NOT in registry: 33
```

توزیع `group` روی ۱۲۶ مسیر:

```
    48 "admin"            8 "operations"
    21 "products-pricing" 7 "reports"
    14 "finance"          6 "purchasing"
    12 "sales-customers"  6 "knowledge-comms"
                          4 "main"
   ────────────────────────────────────
   جمع = 126 ✓
```

`subgroup` روی ۸۱ مسیر از ۱۲۶ ست شده (۴۵ مسیر فقط `group` دارند — این استثنا نیست، `subgroup`
طبق `types.ts:55` اختیاری است).

**استثنای واقعی صفر است:** `group` در `NavigationEntrySeed` **الزامی** است (بدون `?`)، پس
TypeScript اجازهٔ ورودیِ بدون گروه را نمی‌دهد. علاوه بر آن `registry.ts:1358-1365` در زمان بارگذاری
ماژول روی id و route تکراری `throw` می‌کند:

```ts
for (const entry of NAVIGATION_REGISTRY) {
  if (ids.has(entry.id)) throw new Error("Duplicate navigation id: " + entry.id);
  if (routes.has(entry.route)) throw new Error("Duplicate navigation route: " + entry.route);
```

**پیامد:** «هیچ مسیری در رجیستری بدون والد نیست» یک ضمانت نوعی است، نه یک اتفاق. پیاده‌سازی
لازم نیست حالتِ «والد ندارد» را برای ورودی‌های رجیستری مدیریت کند — فقط برای مسیرهایی که اصلاً
در رجیستری نیستند (F10).

---

### F4 — `registry.ts:1275` یک فهرست موازیِ نقش‌هاست، نه ساختار منو · Q1.4 · **exists-partial**

خط ۱۲۷۵ داخل `ROLE_ALLOWLIST_BY_ROUTE` است (`registry.ts:1242-1312`):

```ts
const ROLE_ALLOWLIST_BY_ROUTE: Record<string, AppRole[]> = {
  ...
  "/admin/persons-cleanup": ["admin"],
```

این **ساختار منو نیست و زیرمجموعهٔ آن هم نیست** — یک نگاشت جدا از `route → AppRole[]` است که در
`toNavigationEntry` فقط به‌عنوان fallback مصرف می‌شود، `registry.ts:1343`:

```ts
allowedRoles: seed.allowedRoles ?? ROLE_ALLOWLIST_BY_ROUTE[seed.to],
```

**بله، این دو فهرست می‌توانند از هم دور بیفتند و هیچ چیزی جلویش را نمی‌گیرد.** کلید نگاشت یک
`string` خام است، نه اتحادیه‌ای از مسیرهای رجیستری؛ یک تایپو در کلید بی‌صدا `undefined` می‌دهد و
ورودی بدون allowlist می‌ماند. خودِ فایل هم این خطر را می‌شناسد — کامنت `registry.ts:1236-1241`:

> «Every entry here must mirror the route's real beforeLoad guard. A menu link that is wider than
> its guard sends the user to `/unauthorized`; one that is narrower hides a page the user is
> allowed to open.»

برای همین صفحه هم guard واقعی را خواندم و مطابق است — `src/routes/_app.admin.persons-cleanup.tsx:559-560`:

```ts
  beforeLoad: async () => {
    await requireAnyRole(["admin"]);
```

**پیامد:** به این مأموریت ربط مستقیم ندارد (نقش است، نه گروه)، ولی هر پیاده‌سازی‌ای که آیتم‌ها را
گروه‌بندی می‌کند باید همچنان از `getVisibleNavigationEntries(roles)` تغذیه شود تا فیلتر نقش را
دوباره ننویسد.

---

### F5 — برجسته‌سازیِ آیتم وجود دارد و کار می‌کند · Q3.1, Q3.2 · **exists-works**

منطق فعال‌بودن، `AppSidebar.tsx:216-217`:

```ts
  const isItemActive = (route: string) =>
    location.pathname === route || location.pathname.startsWith(route + "/");
```

و مصرف آن در `renderItem`، `AppSidebar.tsx:219-249` (نقل‌قول کوتاه‌شده):

```tsx
    const active = isItemActive(item.route);
    ...
        className={`group relative flex h-9 items-center rounded-lg transition-colors
          ${ active
              ? "bg-sidebar-accent/70 font-semibold text-sidebar-primary shadow-sm"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent/40 ..." }`}
      >
        <Link to={item.route} aria-current={active ? "page" : undefined} ...>
          {active && (
            <span className="absolute inset-y-1.5 right-0 w-[3px] rounded-l-full bg-sidebar-primary" />
          )}
```

سه نشانهٔ بصری: پس‌زمینه + وزن قلم، نوار ۳ پیکسلی لبهٔ راست (RTL درست است: `right-0` با
`rounded-l-full`)، و رنگ آیکن (`:248`). دسترس‌پذیری هم `aria-current="page"` دارد (`:241`).
همین منطق در «دسترسی سریع» تکرار شده (`:593-602`).

ردیف ماژول‌ها (ریل ۷ آیکنی) هم فعال‌بودن دارد — `AppSidebar.tsx:362`، `:370`، `:381-388`.

**پیامد:** نیمهٔ «آیتم برجسته شود» را دوباره نسازید؛ فقط باید ورودی‌اش گسترده شود (F9، F10).

---

### F6 — هیچ API فعال‌بودنِ TanStack Router در کد استفاده نشده · Q3.1 · **absent**

```
$ grep -rn "activeProps|activeOptions|useMatchRoute|useRouterState|matchRoute(" src/
No matches found
```

آنچه استفاده می‌شود فقط `useLocation` است (`AppSidebar.tsx:1`، `:64`) و مقایسهٔ دستی رشته‌ها
(F5). `aria-current` در کل `src/` فقط چهار جا هست:

```
src/components/layout/AppSidebar.tsx:241   ← آیتم منو
src/components/layout/AppSidebar.tsx:370   ← دکمهٔ ماژول
src/components/ui/breadcrumb.tsx:60        ← نامرتبط
src/components/ui/pagination.tsx:36        ← نامرتبط
```

`data-active` / `data-[active` هیچ‌جا در `src/` بیرون از `components/ui/sidebar.tsx` نیست؛
`data-state` هم در سایدبار فقط `expanded`/`collapsed` را حمل می‌کند
(`components/ui/sidebar.tsx:272-273`)، نه فعال‌بودن آیتم.

**پیامد:** پیاده‌سازی باید همان الگوی `useLocation` موجود را ادامه دهد، نه اینکه یک مکانیزم دوم
از TanStack وارد کند.

---

### F7 — `nav-items.ts` یتیم است و **مسئله را حل نمی‌کند** · Q3.3 · **not-connected**

```
$ grep -rn "nav-items|NAV_ITEMS|GROUP_LABELS|SUBGROUP_LABELS" src e2e scripts tests \
    | grep -v "^src/components/layout/nav-items.ts:"
src/components/layout/AppSidebar.tsx:32:// QUICK-ACCESS — ... Items resolve against NAV_ITEMS so
src/components/layout/primary-modules.ts:25:  /** Default route ... (must be a real path in NAV_ITEMS ...) */
src/components/layout/primary-modules.ts:27:  /** Ordered list of NAV_ITEMS `to` paths ... */
src/components/layout/primary-modules.ts:33: * user-facing route in NAV_ITEMS must be mapped ...
src/components/layout/primary-modules.ts:34: * these 7. RBAC filtering happens downstream against NAV_ITEMS.
src/components/layout/primary-modules.ts:242: * Filter NAV_ITEMS to those belonging to a given primary module ...
```

**هر شش تطبیق کامنت است. هیچ `import` واقعی وجود ندارد** — تأیید یتیم‌بودن.

محتوایش را خواندم. یک تلاش ناوبریِ رهاشدهٔ کامل **نیست**؛ یک لایهٔ نگاشت نازک روی همان رجیستری
است (`nav-items.ts:22-32`):

```ts
export const NAV_ITEMS: NavItem[] = NAVIGATION_REGISTRY.filter(
  (entry) => !entry.hiddenFromMenu,
).map((entry) => ({ to: entry.route, label: entry.title, icon: entry.icon,
  module: entry.module, group: entry.group, subgroup: entry.subgroup,
  adminOnly: entry.adminOnly }));
```

**ولی چیزی دارد که هیچ‌جای دیگر نیست: برچسب فارسی گروه‌ها و زیرگروه‌ها** (`nav-items.ts:33-55`) —
مثلاً `admin: "مدیریت سیستم"`، `"adm-tools": "ابزارها و یکپارچه‌سازی"`،
`"products-pricing": "محصولات و قیمت‌گذاری"`. این ۹ + ۹ برچسب دقیقاً همان متنی است که یک سرتیتر
گروه باید نشان دهد.

**پیامد:** حل‌نشده، ولی نصفِ کارِ متن‌نویسی فارسی از قبل انجام شده و در همین فایل یتیم نشسته
است. هر پیاده‌سازی باید تصمیم بگیرد این دو ثابت را برمی‌دارد یا فایل را زنده می‌کند — تصمیمِ
«ماژول موازی نسازیم» (قاعدهٔ ۱۴ در CLAUDE.md) اینجا مطرح می‌شود.

---

### F8 — هیچ گروهی رندر نمی‌شود؛ هیچ state باز/بسته‌ای وجود ندارد · Q2.3, Q1 · **absent**

سایدبار آیتم‌ها را **تخت** رندر می‌کند — `AppSidebar.tsx:567-583`:

```tsx
                <div className="flex items-center gap-2 px-2 pb-1.5 text-[11px] ...">
                  {activeModuleMeta && (
                    <>
                      <activeModuleMeta.icon className="h-3.5 w-3.5" />
                      <span>{activeModuleMeta.label}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  {submenuItems.length > 0 ? (
                    submenuItems.map(renderItem)
                  ) : (
                    <div className="px-3 py-4 text-center text-xs ...">
                      موردی برای نمایش وجود ندارد
                    </div>
                  )}
                </div>
```

تنها سرتیتر، **برچسب ماژول** است (یکی از ۷ تا)، نه گروه. `submenuItems` هم از
`primary-modules.ts` می‌آید، نه از `group` — `AppSidebar.tsx:102-105`:

```ts
  const submenuItems = useMemo(
    () => itemsForModule(activeModule, visible),
    [activeModule, visible],
  );
```

و `itemsForModule` (`primary-modules.ts:245-257`) صرفاً به ترتیبِ `PRIMARY_MODULES.paths` فیلتر
می‌کند و هیچ ارجاعی به `group`/`subgroup` ندارد.

جست‌وجوی کامل مصرف‌کنندگان `group`/`subgroup` در `src/` سه محل داد و بس:
`registry.ts` (تولید)، `types.ts` (تعریف)، `nav-items.ts` (فایل یتیم F7)، و `metadata.ts`
(که در آن `.group` تولید می‌شود ولی هیچ مصرف‌کننده‌ای ندارد — F2). **هیچ مؤلفهٔ رندری نمی‌خواندشان.**

هیچ `Collapsible` یا `Accordion` در ناوبری نیست:

```
$ grep -rn "Collapsible|Accordion" src/  (بیرون از components/ui/*)
src/components/pricing/MarketRateIngestionHistory.tsx:8,120,121,132,133,334,335
src/components/pricing/MarketRateMappingsPanel.tsx:26,150,151,162,163
src/routes/_app.operations.receipts.tsx:22-25,313-324
```

هر سه بی‌ربط به ناوبری‌اند.

تنها stateهای سایدبار اینهاست (`AppSidebar.tsx:67-72`):

```ts
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [quickSalesBurst, setQuickSalesBurst] = useState(0);
  const [activeModule, setActiveModule] = useState<PrimaryModuleKey>(() =>
    resolveActiveModule(location.pathname),
  );
```

و همگام‌سازی آن با مسیر (`:75-77`):

```ts
  useEffect(() => {
    setActiveModule(resolveActiveModule(location.pathname));
  }, [location.pathname]);
```

**پیامد:** «گروه والد خودکار باز شود» امروز هیچ هدفی ندارد. state باز/بسته باید از صفر ساخته
شود — و تنها معادل امروزیِ آن، `activeModule` است که *همین‌الان* از روی مسیر باز می‌شود. یعنی
الگوی «از مسیر بخوان و باز کن» در همین فایل نمونهٔ کاری دارد.

---

### F9 — ۱۳ صفحهٔ مالی در رجیستری هستند ولی هرگز در سایدبار ظاهر نمی‌شوند · Q4 · **exists-broken**

```
=== registry routes absent from PRIMARY_MODULES (in registry, never in submenu) ===
    /accounting/bank-accounts          /accounting/purchase-payments
    /accounting/documents              /accounting/receipts
    /accounting/dynamic-capital        /accounting/receipts/training
    /accounting/external-parties       /accounting/receivables
    /accounting/mutual-settlement      /accounting/salesperson-scoring
    /accounting/payables               /accounting/treasury
    /accounting/payment-vouchers
```

عمدی است — `primary-modules.ts:135-147`:

```
    // The finance section is one entry: مرکز مالی. Everything that used to be listed here is
    // reached from that page instead.
    ...
    paths: ["/accounting/receipts/create"],
```

اثر اندازه‌گیری‌شده روی این مأموریت: `resolveActiveModule` را روی هر ۱۳ مسیر اجرا کردم —

```
  /accounting/bank-accounts        -> module dashboard
  /accounting/receipts             -> module dashboard
  /accounting/treasury             -> module dashboard
  ...  (هر ۱۳ تا)
```

چون `itemsForModule` **دقیق** تطبیق می‌دهد نه پیشوندی (`primary-modules.ts:41`:
«matches paths exactly, not by prefix»)، `/accounting/receipts` با
`/accounting/receipts/create` جور نمی‌شود، هیچ ماژولی مطابقت نمی‌کند، و fallback مستند
(`primary-modules.ts:238`: `return best?.key ?? "dashboard"`) کاربر را به ماژول **داشبورد**
می‌برد.

**پیامد:** برای این ۱۳ صفحه سایدبار نه‌تنها چیزی برجسته نمی‌کند بلکه ماژول اشتباهی را باز نگه
می‌دارد. این‌ها `group: "finance"` دارند، پس داده برای درست‌کردنشان موجود است — ولی اصلاح آن
تصمیمِ «مرکز مالی یک ورودی است» را زیر سؤال می‌برد و **تصمیم مالک است، نه پیاده‌ساز**.

---

### F10 — ۳۳ مسیر در `routeTree` هستند و در رجیستری نیستند؛ ۱۵ تای آن‌ها هیچ والدی ندارند · Q4.1, Q4.2 · **absent**

شمارش (خروجی اسکریپت):

```
registry routes: 126 | PRIMARY_MODULES paths: 113 | routeTree static app routes: 159
registry NOT in routeTree: []          ← هیچ لینک مرده‌ای در رجیستری نیست
routeTree NOT in registry: 33
```

از آن ۳۳ تا، بر اساس مطابقت پیشوندی (همان الگوریتم `isItemActive` و `bestPrefixEntry`):

```
=== A. NO registry ancestor -> sidebar highlights NOTHING (15) ===
    /accounting/customer-capital-allocations     /my-penalties
    /accounting/daily-capital                    /operations/api-keys
    /accounting/salesperson-capital-allocations  /operations/gamification
    /admin/gamification                          /operations/purchase-advisor
    /admin/gamification/achievements             /operations/receipts
    /api-keys                                    /presence
    /delivery-receipts
    /documents
    /integrations/didar

=== B. registry ancestor exists but ancestor NOT in PRIMARY_MODULES (0) ===

=== C. ancestor IS in PRIMARY_MODULES -> parent row highlights today (18) ===
   /academy/manage                          -> /academy
   /bot-api-keys/docs                       -> /bot-api-keys
   /bot-api-keys/playground                 -> /bot-api-keys
   /bot-api-keys/usage                      -> /bot-api-keys
   /data-tables/new                         -> /data-tables
   /feedback/create                         -> /feedback
   /gamification/achievements               -> /gamification
   /gamification/admin                      -> /gamification
   /knowledge/manage                        -> /knowledge
   /persons/create                          -> /persons
   /pricing/owner-attention                 -> /pricing
   /pricing/sale-lists/new                  -> /pricing/sale-lists
   /products/regenerate-names               -> /products
   /purchases/create                        -> /purchases
   /sales/customers/create                  -> /sales/customers
   /sales/customers/credit-allocation-guide -> /sales/customers
   /sales/quotes/new                        -> /sales/quotes
   /sales/search                            -> /sales

CHECK 15+0+18=33 of 33 ✓
```

چهار صفحه‌ای که بریف نام برده بود (`/api-keys`، `/operations/receipts`، `/documents`،
`/presence`) **هر چهار تا در دستهٔ A هستند** — نه در رجیستری، نه هیچ نیای رجیستری‌ای.
`resolveActiveModule` روی هر ۱۵ تای دستهٔ A اجرا شد: **هر ۱۵ تا → ماژول `dashboard`.**

نکتهٔ قابل‌توجه: `/sales/search` در دستهٔ C است ولی خودِ سایدبار در هدرش به آن لینک می‌دهد
(`AppSidebar.tsx:340` و `:406`) — یعنی سایدبار به صفحه‌ای لینک می‌دهد که خودش برای آن ورودی
رجیستری ندارد؛ در بهترین حالت والدش `/sales` برجسته می‌شود.

**پیامد:** برای ۱۵ صفحهٔ دستهٔ A، «کدام منو؟» پاسخ ندارد چون داده‌ای نیست — این نقطه‌ای است که
کار از UI به داده سُر می‌خورد، و افزودن ورودی رجیستری برای این ۱۵ تا تصمیم مالک است (کدام گروه؟).
برای ۱۸ صفحهٔ دستهٔ C، مطابقت پیشوندی از قبل کار می‌کند و رفتار «والد را برجسته کن» را می‌دهد.

---

### F11 — `/admin/persons-cleanup`: داده و منطق هر دو حاضرند · Q1, Q2 · **exists-partial**

ورودی رجیستری، `registry.ts:790-804` (کامنت‌ها کوتاه‌شده):

```ts
  {
    // A-5a — completing (or removing) the people the Asan import left half-finished.
    // A worklist like the collision queue above, so adm-tools rather than adm-settings.
    to: "/admin/persons-cleanup",
    label: "تکمیل و پاک‌سازی اشخاص",
    icon: UserRoundCog,
    module: "roles",
    group: "admin",
    subgroup: "adm-tools",
  },
```

در `PRIMARY_MODULES` هم هست، `primary-modules.ts:198`:

```ts
      "/admin/persons-cleanup",
```

و اجرای `resolveActiveModule` روی آن:

```
  /admin/persons-cleanup                     -> module admin
```

پس زنجیره کامل است: ماژول `admin` باز می‌شود → آیتم در `submenuItems` هست →
`isItemActive("/admin/persons-cleanup")` روی همان مسیر `true` می‌دهد → `renderItem` کلاس فعال و
`aria-current="page"` می‌گذارد.

**پیامد:** علتِ گزارش‌شدهٔ «هیچ چیز برجسته نمی‌شود» برای *این* صفحه با داده توضیح داده نمی‌شود.
دو توضیح باقی‌مانده در F8 (هیچ گروهی دیده نمی‌شود، پس «مسیر» دیده نمی‌شود) و F12 (زیر لبهٔ دید)
است.

---

### F12 — فهرست ماژول `admin` ۵۰ آیتم تخت است و هیچ scroll-into-view ندارد · Q2 · **exists-broken**

شمارش آیتم هر ماژول (از تجزیهٔ `PRIMARY_MODULES`):

```
dashboard    6 paths      finance      1 paths
assistant   11 paths      analytics    8 paths
catalog     24 paths      admin       50 paths
sales       13 paths      ────────────────────
                          TOTAL 113 (0 duplicate across modules)
```

`/admin/persons-cleanup` آیتم **۲۸اُم از ۵۰** است (شمارش روی خطوط ۱۷۰–۲۲۱).

ظرف پیمایش، `AppSidebar.tsx:401`:

```tsx
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto py-2 pl-2 group-data-[collapsible=icon]:hidden">
```

و بالای فهرست ماژول، به‌ترتیب اینها رندر می‌شوند: کادر جست‌وجوی چسبان (`:402`)، «نیازمند اقدام»
(`:474-517`)، «میانبرهای من» (`:519-542`)، «آخرین استفاده‌ها» (`:545-566`) — و تازه بعد از آن
برچسب ماژول (`:567`) و فهرست (`:575`).

```
$ grep -rn "scrollIntoView" src/components/layout/ src/components/ui/sidebar.tsx
(none)
```

**پیامد:** حتی وقتی سطر فعال درست علامت می‌خورد، هیچ چیز آن را داخل دید نمی‌آورد. هر پیاده‌سازیِ
«گروه والد باز شود» بدون scroll-into-view، برای ماژول ۵۰ آیتمیِ admin همچنان به‌نظر کاربر
بی‌اثر خواهد بود.

---

## Duplicates

| تلاش | وضعیت | شواهد |
|---|---|---|
| `src/components/layout/nav-items.ts` | **یتیم** — صفر import واقعی؛ ۶ تطبیق grep همه کامنت‌اند | F7 |
| `src/components/ui/navigation-menu.tsx` | **یتیم** — `grep -rn "ui/navigation-menu" src/` بیرون از خود فایل: هیچ. یک primitive استاندارد shadcn است، نه تلاش ناوبری این پروژه | این فایل |
| `src/components/ui/menubar.tsx` | **یتیم** — همان، `grep` هیچ مصرف‌کننده‌ای نداد | این فایل |
| `PRIMARY_MODULE_PATHS` در `registry.ts` | **حذف‌شده ۲۰۲۶-۰۸-۰۸** — یک کپی دوم از نگاشت مسیر→ماژول بود که روی ۸ مسیر drift کرده بود. سنگ قبرش با دلیل کامل در `registry.ts:1174-1184` مانده | نقل‌قول در F8 |
| `src/lib/navigation/metadata.ts` → `.group` | **تولید می‌شود، مصرف نمی‌شود** — `metadata.ts:45` مقدار می‌دهد، تنها فراخوان (`NavigationBreadcrumbs.tsx:14`) فقط `.breadcrumbs` را می‌خواند | F2 |
| `src/components/messenger/ConversationsSidebar.tsx` | **بی‌ربط** — سایدبار گفتگوهای پیام‌رسان است، نه ناوبری برنامه | `find` زیر |

### جست‌وجوهایی که چیزی پیدا نکردند (ثبت‌شده به‌عمد)

```
$ grep -rn "activeProps|activeOptions|useMatchRoute|useRouterState|matchRoute(" src/
No matches found

$ grep -rn "scrollIntoView" src/components/layout/ src/components/ui/sidebar.tsx
(none)

$ grep -rn "aria-current|isItemActive|highlight" e2e/
(none)   ← هیچ تست e2e برای وضعیت فعال وجود ندارد

$ find src -type f \( -iname "*nav*" -o -iname "*sidebar*" -o -iname "*menu*" -o -iname "*breadcrumb*" \)
src/components/layout/AppSidebar.tsx
src/components/layout/MobileBottomNav.tsx
src/components/layout/NavigationBreadcrumbs.tsx
src/components/layout/NavigationCommandPalette.tsx
src/components/layout/nav-items.ts
src/components/messenger/ConversationsSidebar.tsx
src/components/ui/breadcrumb.tsx
src/components/ui/context-menu.tsx
src/components/ui/dropdown-menu.tsx
src/components/ui/menubar.tsx
src/components/ui/navigation-menu.tsx
src/components/ui/sidebar.tsx
src/hooks/navigation/useNavigationFavorites.ts
src/hooks/navigation/useNavigationRecent.ts
```

هیچ تلاش ناوبری رهاشدهٔ دیگری زیر نام متفاوت پیدا نشد.

---

## Numbers

| کمیت | مقدار | دستور شمارش |
|---|---|---|
| مسیرهای رجیستری | **۱۲۶** | استخراج `to: "…"` از بازهٔ `NAVIGATION_SEEDS` تا `] satisfies NavigationEntrySeed[]` |
| از آن‌ها والد (`group`) دارند | **۱۲۶** (۱۰۰٪) | توزیع `group` — جمع ۴۸+۲۱+۱۴+۱۲+۸+۷+۶+۶+۴ = ۱۲۶ ✓ |
| از آن‌ها والد ندارند | **۰** | `group` در `types.ts:54` الزامی است |
| از آن‌ها `subgroup` دارند | **۸۱** | استخراج `subgroup: "…"` (۴۵ تا فقط `group` دارند — اختیاری بودن، نه نقص) |
| مسیرهای `PRIMARY_MODULES` | **۱۱۳ یکتا** (۱۱۳ ورودی) | تجزیهٔ آرایه‌های `paths:` هر ۷ ماژول |
| مسیر در بیش از یک ماژول | **۰** | مقایسهٔ ۱۱۳ ورودی با ۱۱۳ یکتا |
| مسیرهای رجیستری که در `PRIMARY_MODULES` نیستند | **۱۳** | `set(reg) - set(pm)` — ۱۲۶ − ۱۱۳ = ۱۳ ✓ |
| مسیرهای `PRIMARY_MODULES` که در رجیستری نیستند | **۰** | `set(pm) - set(reg)` |
| مسیرهای ایستای برنامه در `routeTree.gen.ts` | **۱۵۹** | `FileRoutesByFullPath` (۲۰۸ ورودی) منهای مسیرهای پارامتری `$`، `/api/*`، `/.well-known`, `/.mcp`، و ۸ مسیر بیرون از `_app` (login/register/…)، با نرمال‌سازی `/` انتهایی |
| در `routeTree` ولی نه در رجیستری | **۳۳** | ۱۵۹ − ۱۲۶ = ۳۳ ✓ |
| از آن ۳۳ تا، بدون هیچ نیای رجیستری | **۱۵** | مطابقت پیشوندی؛ ۱۵ + ۰ + ۱۸ = ۳۳ ✓ |
| در رجیستری ولی نه در `routeTree` (لینک مرده) | **۰** | `set(reg) - set(rt)` |
| صفحاتی که سایدبار برایشان ماژول اشتباه (`dashboard`) باز می‌کند | **۲۸** = ۱۳ (F9) + ۱۵ (F10-A) | اجرای `resolveActiveModule` روی هر ۲۸ مسیر |
| آیتم‌های ماژول `admin` | **۵۰** | شمارش خطوط `"/…"` در `primary-modules.ts:170-221` |
| API فعال‌بودن TanStack در کد | **۰** | grep در F6 |
| تست e2e برای وضعیت فعال | **۰** | grep در Duplicates |

**بستنِ حساب:** ۱۲۶ (رجیستری) + ۳۳ (فقط routeTree) = ۱۵۹ (کل ایستای برنامه) ✓ ·
۱۲۶ = ۱۱۳ (در PRIMARY_MODULES) + ۱۳ (نیستند) ✓ · ۳۳ = ۱۵ (A) + ۰ (B) + ۱۸ (C) ✓

---

## Exceptions

**صفحاتی که والد ندارند** — ۱۵ مسیر، هیچ‌کدام ورودی رجیستری و هیچ‌کدام نیای رجیستری ندارند
(اجرای `resolveActiveModule` روی هر ۱۵ تا → `dashboard`):

`/accounting/customer-capital-allocations` · `/accounting/daily-capital` ·
`/accounting/salesperson-capital-allocations` · `/admin/gamification` ·
`/admin/gamification/achievements` · `/api-keys` · `/delivery-receipts` · `/documents` ·
`/integrations/didar` · `/my-penalties` · `/operations/api-keys` · `/operations/gamification` ·
`/operations/purchase-advisor` · `/operations/receipts` · `/presence`

**صفحاتی که والد دارند ولی والدشان هرگز در سایدبار نیست** — ۱۳ مسیر مالی، همه `group: "finance"`
دارند، همه به‌عمد از `PRIMARY_MODULES` بیرون گذاشته شده‌اند (F9):

`/accounting/bank-accounts` · `/accounting/documents` · `/accounting/dynamic-capital` ·
`/accounting/external-parties` · `/accounting/mutual-settlement` · `/accounting/payables` ·
`/accounting/payment-vouchers` · `/accounting/purchase-payments` · `/accounting/receipts` ·
`/accounting/receipts/training` · `/accounting/receivables` · `/accounting/salesperson-scoring` ·
`/accounting/treasury`

**صفحاتی که بیش از یک والد دارند: هیچ.**
در رجیستری غیرممکن است — `registry.ts:1360-1362` روی route تکراری `throw` می‌کند، پس هر مسیر
دقیقاً یک `group` دارد. در `PRIMARY_MODULES` هم اندازه‌گیری شد: ۱۱۳ ورودی، ۱۱۳ یکتا، صفر تکرار.
**پس تصمیمی برای مالک در این مورد وجود ندارد.**

**یک نکتهٔ مرزی:** `/sales/search` — سایدبار در هدرش (`AppSidebar.tsx:340`, `:406`) به آن لینک
می‌دهد ولی خودش ورودی رجیستری ندارد؛ فقط والدش `/sales` می‌تواند برجسته شود.

---

## Constraints

**کامپوننت‌های سایدبار — یکی است، نه چند تا:**

- `src/components/layout/AppSidebar.tsx` (۸۰۰+ خط) — **تنها** رندرکنندهٔ ناوبری. هم دسکتاپ هم
  موبایل از همین یک نمونه می‌آیند: `AppShell.tsx:23` یک `<AppSidebar />` رندر می‌کند، و
  `components/ui/sidebar.tsx:246-264` روی موبایل همان children را داخل یک `<Sheet>` می‌گذارد.
  **پس یک پیاده‌سازی هر دو را می‌پوشاند.**
- `src/components/layout/MobileBottomNav.tsx` — نوار پایینِ موبایل، فقط ۴ میانبر ثابت به‌ازای
  نقش. مفهوم گروه ندارد و منطق فعال‌بودن جداگانهٔ خودش را دارد (`MobileBottomNav.tsx:84`:
  `location.pathname.startsWith(it.to)` — بدون `/` انتهایی، پس `/dashboard` با `/dashboardX`
  هم جور می‌شود؛ یک ناهماهنگی با `isItemActive` است ولی خارج از دامنهٔ این مأموریت).
- `src/components/layout/NavigationCommandPalette.tsx` — پالت جست‌وجو (Ctrl+K)؛ `group` نمی‌خواند
  (تنها ارجاعش به کلمهٔ «group» متغیر محلی `seen` نیست بلکه هیچ — بررسی شد).
- `src/components/ui/sidebar.tsx` — primitive شadcn؛ فقط باز/بستهٔ **کل** سایدبار را دارد.

**محل state باز/بسته:** برای گروه‌ها **وجود ندارد** (F8). نزدیک‌ترین چیز موجود:

```ts
// AppSidebar.tsx:70-77
  const [activeModule, setActiveModule] = useState<PrimaryModuleKey>(() =>
    resolveActiveModule(location.pathname),
  );
  useEffect(() => {
    setActiveModule(resolveActiveModule(location.pathname));
  }, [location.pathname]);
```

یعنی `useState` محلی در خود کامپوننت، همگام‌شده با مسیر. نه context، نه store، نه URL state،
نه Radix. **یک ظرافت:** این `useEffect` انتخاب دستی کاربر را هم بازنویسی می‌کند — اگر کاربر روی
آیکن ماژول دیگری بزند (`:373` `setActiveModule(m.key)`) و بعد مسیر عوض شود، انتخابش پاک می‌شود.
هر state «گروهِ باز» باید همین کشمکش «خودکار در برابر دستی» را حل کند.

**سایدبار به‌عنوان یک کل جمع‌شدنی است:** `AppSidebar.tsx:304`:

```tsx
      <Sidebar side="right" collapsible="icon" className="border-l-0">
```

در حالت جمع‌شده، **پنل زیرمنو کاملاً ناپدید می‌شود** — `AppSidebar.tsx:401` کلاس
`group-data-[collapsible=icon]:hidden` دارد. تنها چیزی که می‌ماند ریل ۱۴ واحدیِ ۷ آیکن ماژول
است. پس در حالت جمع‌شده **«برجسته کردن آیتم» فقط می‌تواند یعنی برجسته کردن آیکن ماژول** — که
از قبل هم انجام می‌شود (`:370` `aria-current`، `:381-388` حلقهٔ رنگی + نوار لبه). عرض هم
تغییرپذیر است (`SidebarResizeHandle`، `:306`؛ مقدار در `localStorage`،
`ui/sidebar.tsx:111`, `:121`) و `AppShell.tsx:21` پیش‌فرض را `20rem` می‌کند.

**سایر محدودیت‌ها:**
- RTL: سایدبار `side="right"` است؛ نوار فعالِ موجود `right-0` + `rounded-l-full` است — هر نشانهٔ
  گروه باید همین قرارداد را نگه دارد.
- برچسب‌های فارسی گروه/زیرگروه فقط در فایل یتیم `nav-items.ts:33-55` وجود دارند (F7).
- فیلتر نقش باید از `getVisibleNavigationEntries(roles)` بیاید (`selectors.ts:55`)؛ دوباره‌نویسیِ
  آن `adminOnly`، `allowedRoles` و ردیف‌های runtimeیِ `role_permissions` را از دست می‌دهد —
  خودِ `selectors.ts:30-37` این را با جزئیات هشدار می‌دهد.
- قاعدهٔ ۱۴ در `CLAUDE.md`: ماژول/سرویس/کامپوننت موازی ساخته نشود. `nav-items.ts` از قبل یک
  نمونهٔ موازیِ نیمه‌مردهٔ همین سطح است.

---

## Coverage

**بررسی‌شده (با دستور):**

| موضوع | چطور |
|---|---|
| شکل رجیستری، همهٔ ۱۲۶ ورودی | خواندن کامل `types.ts`، سر و ته `registry.ts`، تجزیهٔ برنامه‌ای کل آرایهٔ seed |
| مصرف‌کنندگان `group`/`subgroup` | `grep -rn "\.subgroup|subgroup\b|NavigationGroupKey|GROUP_LABELS|entry\.group" src/` — کل خروجی بازبینی شد |
| یتیم‌بودن `nav-items.ts` | `grep -rn "nav-items|NAV_ITEMS|GROUP_LABELS|SUBGROUP_LABELS" src e2e scripts tests` |
| APIهای فعال‌بودن TanStack | `grep -rn "activeProps|activeOptions|useMatchRoute|useRouterState|matchRoute("` روی `src/` |
| نشانه‌های استایل | `grep` روی `aria-current`، `data-active`، `data-[active`، `data-state`، `isActive` |
| رندر سایدبار | خواندن کامل `AppSidebar.tsx` خطوط ۱–۶۲۰ و `AppShell.tsx`، `MobileBottomNav.tsx`، `NavigationBreadcrumbs.tsx` |
| state باز/بسته | `grep` روی `useState`/`Collapsible`/`Accordion`؛ خواندن `ui/sidebar.tsx` خطوط مربوط |
| شمارش مسیرها | اسکریپت Python که مستقیم `registry.ts`، `primary-modules.ts`، `routeTree.gen.ts` را تجزیه می‌کند (خروجی‌ها در بخش Numbers نقل شده) |
| `resolveActiveModule` روی ۳۱ مسیر مشکوک | بازپیاده‌سازی دقیق تابع (`primary-modules.ts:229-239`) در Python و اجرا |
| guard صفحهٔ `/admin/persons-cleanup` | `grep -n "beforeLoad|requireAnyRole" src/routes/_app.admin.persons-cleanup.tsx` |
| پوشش e2e | `ls e2e/navigation/` + `grep -rn "aria-current|isItemActive|highlight" e2e/` |

**بررسی‌نشده، با دلیل:**

| موضوع | دلیل |
|---|---|
| رفتار واقعی در مرورگر روی `192.168.170.8:3100` | نیاز به ورود با نقش admin؛ بریف تأیید مرورگری نخواسته و مأموریت read-only است. نتیجه: فرضیهٔ «زیر لبهٔ دید» در F12 تأیید نشده |
| ۹۳ مسیر پارامتری (`$id` و مانند آن) در `routeTree` | ۲۰۸ − ۱۵۹ − ۸ مسیر بیرون از `_app` − مسیرهای `/api/*` و `/.well-known`؛ این‌ها صفحات جزئیات‌اند و `bestPrefixEntry` (F2) پوششان می‌دهد. شمارش «صفحات بدون والد» عمداً به مسیرهای ایستا محدود شد |
| گزارش پیشین «۱۴ صفحه» (۲۰۲۶-۰۹-۰۴) | نتوانستم سندش را پیدا کنم (`grep` در `docs/research/` و `docs/audits/` آن یافته را نداد). شمارش خودم را جایگزین کردم: ۳۳ خارج از رجیستری که ۱۵ تای آن‌ها هیچ والدی ندارند — و هر چهار صفحه‌ای که بریف نام برده بود در همان ۱۵ تا هستند |
| ناهماهنگی `MobileBottomNav.tsx:84` (`startsWith` بدون `/`) | خارج از دامنه؛ فقط ثبت شد |
| باقی ۱۱ درخت کاری موازی | بریف صریحاً گفت درخت را همان‌طور که هست بخوان و شاخه عوض نکن |

---

## UNVERIFIED / UNKNOWN

1. **`UNVERIFIED` — چرا `/admin/persons-cleanup` در عمل چیزی برجسته نمی‌کند.** [U] گزارش مالک.
   [E] کد می‌گوید باید برجسته شود (F11). دو توضیح کد-محورِ اندازه‌گیری‌شده دارم — نبودِ هرگونه
   سرتیتر گروه (F8) و آیتم ۲۸اُم از ۵۰ در ظرف پیمایش بدون scroll-into-view (F12) — ولی **هیچ‌کدام
   را در مرورگر ندیدم.** ممکن است علت سومی باشد که فقط در اجرا پیداست.
2. **`UNKNOWN` — سند ممیزی ۲۰۲۶-۰۹-۰۴ با یافتهٔ «۱۴ صفحه».** پیدا نشد. عدد خودم ۱۵ است
   (F10-A) و هر چهار مثال بریف در آن هست، ولی نتوانستم عدد ۱۴ را با عدد ۱۵ آشتی بدهم چون
   معیار شمارش آن ممیزی را نمی‌دانم.
3. **`UNKNOWN` — آیا هر یک از ۱۵ صفحهٔ بدون والد اصلاً باید در منو باشند.** بعضی مثل `/presence`
   یا `/operations/api-keys` ممکن است عمداً بی‌لینک باشند. تصمیم مالک است، نه یافتهٔ فنی.
4. **`UNKNOWN` — آیا ۱۳ صفحهٔ مالی باید از تصمیم «مرکز مالی یک ورودی است» مستثنا شوند.**
   کامنت `primary-modules.ts:135-147` تصمیم را ثبت کرده ولی دربارهٔ برجسته‌سازی حرفی نمی‌زند؛
   وقتی آن تصمیم گرفته شد این خواسته وجود نداشت.
5. **`UNKNOWN` — رفتار در حالت جمع‌شده مورد نظر مالک چیست.** [E] پنل زیرمنو در حالت جمع‌شده کاملاً
   مخفی می‌شود (`AppSidebar.tsx:401`)، پس تنها معنای ممکن، آیکن ماژول است — که از قبل کار می‌کند.
   خواستهٔ [U] دربارهٔ این حالت ساکت است.
6. **`UNKNOWN` — `bun run build` / `npx tsc --noEmit` اجرا نشد.** این مأموریت read-only بود و
   هیچ کدی تغییر نکرد، پس معیار پایه‌ای برای مقایسه معنا نداشت. طبق `CLAUDE.md` صریحاً ثبت
   می‌کنم: **اجرا نشد، ادعای موفقیت هم نمی‌کنم.**

---

## Self-check

1. هر زیربندِ Q1.1–Q1.4، Q2.1–Q2.4، Q3.1–Q3.4، Q4.1–Q4.3 حکم دارد یا `UNKNOWN` با دلیل: ✅
   (Q1.1→F1 · Q1.2→F2 · Q1.3→F3 · Q1.4→F4 · Q2.1→Constraints · Q2.2→Constraints (یکی است) ·
   Q2.3→F8 · Q2.4→Constraints · Q3.1→F6 · Q3.2→F5+F6 · Q3.3→F7 · Q3.4→Duplicates ·
   Q4.1→F10 · Q4.2→F10 · Q4.3→Exceptions (صفر))
2. حساب می‌بندد: ۱۲۶+۳۳=۱۵۹ ✓ · ۱۲۶=۱۱۳+۱۳ ✓ · ۳۳=۱۵+۰+۱۸ ✓ · توزیع group جمعش ۱۲۶ ✓
3. چیزی که نخواندم یا اجرا نکردم ادعا نشد؛ موارد باقی‌مانده در UNVERIFIED/UNKNOWN آمده.
4. **هیچ چیزی تغییر نکرد** — تنها فایل نوشته‌شده همین سند است.

**وضعیت: COMPLETE** برای هر چهار سؤال در سطح کد. تنها موردی که در سطح مرورگر باز مانده
مورد ۱ در UNVERIFIED است.
