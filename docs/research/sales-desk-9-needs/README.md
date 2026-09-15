# میز فروش — ۹ نیاز تیم فروش (راهنمای استفاده)

شاخه: `feature/sales-desk` · مهاجرت‌های LAN: **۵۴۵–۵۴۸**  
اسناد همراه: [`HANDOFF.md`](./HANDOFF.md) · ممیزی اولیه: [`AUDIT-20260916.md`](./AUDIT-20260916.md)

---

## URLها و ناوبری

| صفحه | مسیر | نقش‌ها |
|------|------|--------|
| میز فروش | `/operations/sales-desk` | admin / manager / sales |
| پرونده مشتری ۳۶۰ | `/sales/customers/$customerId/dossier` | همان گیت مسیر فروش |
| فعالیت تلفنی داخلی‌ها | `/operations/call-activity` | admin / manager / sales |

در سایدبار، زیر بخش عملیات داخلی، برچسب **«میز فروش»** به `/operations/sales-desk` و **«فعالیت تلفنی»** به `/operations/call-activity` وصل است (`src/lib/navigation/registry.ts`).

---

## بدون Issabel هم کار می‌کند

مرکز تلفن (Issabel / CDR) **الزام نیست**.

- صفحهٔ میز فروش صریحاً برای تعاملات دستی طراحی شده: ثبت سریع درخواست، پیگیری امروز، آمار ماهانه.
- `createSalesInteraction` فقط RPC مرورگری `sales_interaction_create` را صدا می‌زند (`source` پیش‌فرض `"manual"`) — وابسته به ایمپورت CDR نیست.
- پاپ‌آپ تماس ورودی بدون دادهٔ ایزابل خالی می‌ماند و بی‌ضرر است؛ از همان میز می‌توان درخواست دستی ساخت.
- فرم خلاصه تماس / یادداشت روی پرونده هم بدون Issabel قابل استفاده است.

وقتی Issabel وصل باشد، ایمپورت CDR علاوه بر درج `call_logs`، برای هر روز متمایز تهران `derive_staff_call_metrics` را صدا می‌زند (نیاز ۳).

---

## نقشهٔ ۹ نیاز → کجا استفاده شود

| # | نیاز | کجا / چطور |
|---|------|------------|
| ۱ | کالر آی‌دی + ثبت ناشناس | پاپ‌آپ تماس ورودی در پوستهٔ اپ؛ لینک به پرونده؛ ثبت سریع از میز |
| ۲ | ثبت سریع درخواست | میز فروش → فرم درخواست سریع (`kind=request`) |
| ۳ | شمارش خودکار تماس | پس از ایمپورت موفق Issabel در `import-issabel-calls.server.ts` → `derive_staff_call_metrics`؛ کارت آمار ماهانه روی میز |
| ۴ | جستجو/ثبت + مسئول | ثبت تعامل با انتخاب شخص/مشتری و `salesperson_id`؛ مسئول مشتری از قبل روی `customers.responsible_id` |
| ۵ | خلاصه مکالمه + تاریخچه | پروندهٔ ۳۶۰ + تایم‌لاین تعاملات؛ فرم یادداشت/تماس |
| ۶ | موفق/ناموفق + آمار من | دکمه‌های outcome روی تعامل؛ کارت «آمار ماه من» روی میز |
| ۷ | پیگیری فردا + هشدار | `next_follow_up_at` + بلوک «خلاصه امروز من»؛ اعلان ارجاع (نیاز ۹) |
| ۸ | پرونده مشتری ۳۶۰ | `/sales/customers/$customerId/dossier` — شخص، مشتریان، پیش‌فاکتورها، تعاملات، تماس‌ها |
| ۹ | اعلان ارجاع به من | نوع `sales_interaction_assigned` در `notification_queue`؛ تریگر روی تغییر `salesperson_id` (مهاجرت ۵۴۷) |

---

## مهاجرت‌های ۵۴۵–۵۴۸ (LAN)

اعمال‌شده روی دیتابیس تست LAN `afrakala` با ثبت در لجر (`checkpoint-d1.md` / `checkpoint-d1b-548.md`):

| NNN | فایل | نقش |
|-----|------|-----|
| ۵۴۵ | `20260916030000_545_sales_interactions.sql` | جدول `sales_interactions` + RLS + اندیس |
| ۵۴۶ | `20260916031000_546_sales_interaction_rpcs.sql` | RPCهای create / update_status / set_follow_up / sales_my_month_stats |
| ۵۴۷ | `20260916032000_547_sales_interaction_assign_notify.sql` | CHECK نوع اعلان + تریگر ارجاع |
| ۵۴۸ | `20260916033000_548_sales_interactions_lock_author_id.sql` | قفل immutability برای `author_id` (رفع C6) + REVOKE DELETE |

اسکریپت‌های برگشت در `orchestration/*-down.sql` هستند. **روی production اعمال نشده‌اند.**

---

## تست سریع

```text
E2E_BASE_URL=http://127.0.0.1:8080
node_modules\.bin\playwright.cmd test e2e/business-flows/sales-desk-9.spec.ts --workers=1 --reporter=line
```

روی Vite شاخهٔ `feature/sales-desk` گزارش T1: **۷ passed**. کانتینر LAN `:3100` تا قبل از redeploy مسیرهای F1 را نداشت (۴۰۴) — برای تست روی LAN باید image وب دوباره build/deploy شود.

---

## وضعیت انتشار

- شاخه: `feature/sales-desk` — **merge به staging نشده**
- push به remote: در اختیار orchestrator (این بستهٔ اسناد push نمی‌کند)
- ریسک باز: اسپم اعلان با ارجاع مکرر (MEDIUM امنیتی؛ خارج از قفل C6)
