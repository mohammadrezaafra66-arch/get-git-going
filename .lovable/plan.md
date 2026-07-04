سخه پاکنویس نهایی که من ۱۰۰٪ با آن موافقم:

```

```

```
## هدف

حذف input تاریخ native مرورگر از UIهای کاربرمحور، مثل `mm/dd/yyyy`، و جایگزینی با تقویم شمسی، بدون تغییر فرمت ذخیره در DB/API.

فرمت ذخیره‌سازی باید همچنان Gregorian/ISO با فرمت `YYYY-MM-DD` بماند.

---

## نکته مهم قبل از شروع

در پروژه یک کامپوننت آماده و منطبق با نیاز وجود دارد:

`src/shared/components/JalaliDateInput.tsx`

این کامپوننت:
- از `react-multi-date-picker` استفاده می‌کند.
- از calendar `persian` استفاده می‌کند.
- از locale `persian_fa` استفاده می‌کند.
- مقدار ورودی/خروجی را ISO Gregorian با فرمت `YYYY-MM-DD` نگه می‌دارد.
- UI را شمسی نمایش می‌دهد.
- placeholder، disabled، min، max و className را پشتیبانی می‌کند.

طبق قانون workspace:
“Prefer extending existing components. Avoid parallel modules.”

بنابراین کامپوننت جدید موازی نساز. به‌جای duplicate کردن منطق، یک wrapper نازک بساز.

---

## ۱) ساخت wrapper مشترک

فایل زیر را اضافه کن:

`src/components/common/PersianDatePicker.tsx`

این فایل باید فقط wrapper نازک روی `JalaliDateInput` باشد.

API عمومی:

```ts
value: string | null
onChange: (value: string | null) => void
placeholder?: string
disabled?: boolean
className?: string
clearable?: boolean
min?: string
max?: string
```

رفتار:

-   
مقدار ورودی `value` می‌تواند `string | null` باشد.  

-   
اگر `JalaliDateInput` مقدار خالی برگرداند، wrapper باید آن را به `null` نرمال کند.  

-   
خروجی همیشه `YYYY-MM-DD` میلادی یا `null` باشد.  

- `clearable` به‌صورت پیش‌فرض `true` باشد.  

-   
اگر `clearable` فعال بود و مقدار وجود داشت، یک دکمه کوچک ✕ برای پاک‌کردن تاریخ نمایش بده.  

-   
هیچ منطق تبدیل تاریخ جدید ننویس؛ منطق تبدیل باید از همان `JalaliDateInput` بیاید.  


---

## ۲) اصلاح صفحه `/sales/quotes`

اولویت اصلی این صفحه است، چون الان در UI هنوز `mm/dd/yyyy` دیده می‌شود.

فایل احتمالی:

`src/routes/_app.sales.quotes.index.tsx`

کارها:

-   
دو فیلتر تاریخ که الان native date input هستند را پیدا کن.  

-   
هر دو `<Input type="date">` را با `<PersianDatePicker>` جایگزین کن.  

-   
placeholderها:  

  - `از تاریخ`  

  - `تا تاریخ`  

-   
state داخلی `dateFrom` و `dateTo` همچنان string با فرمت `YYYY-MM-DD` بماند.  

-   
منطق query/filter/API را تغییر نده.  

-   
بعد از اصلاح، در صفحه `/sales/quotes` نباید `mm/dd/yyyy` دیده شود.  


---

## ۳) اصلاح بقیه فایل‌های user-facing

در فایل‌های زیر هر `type="date"` که برای کاربر قابل مشاهده است باید با `PersianDatePicker` جایگزین شود:

- `src/routes/_app.sales.quotes.new.tsx`  

- `src/routes/_app.sales.stock-alerts.tsx`  

- `src/routes/_app.sales.send-queue.tsx`  

- `src/routes/_app.sales.quote-share-logs.tsx`  

- `src/routes/_app.marketing.suggestions-history.tsx`  

- `src/routes/_app.gamification.admin.analytics.tsx`  

- `src/routes/_app.gamification.admin.leagues.tsx`  

- `src/components/operations/mood/DailyMoodAdminTable.tsx`  

- `src/components/products/ProductForm.tsx`  

- `src/components/profile/DynamicProfileFields.tsx`  

- `src/shared/components/CustomerForm.tsx`  

- `src/shared/components/WaybillCustomFieldsInput.tsx`  


در هر فایل:

-   
فقط ورودی تاریخ را تغییر بده.  

-   
منطق ذخیره‌سازی، query، mutation، API و DB را تغییر نده.  

-   
مقدارهایی که قبلاً `YYYY-MM-DD` بودند، همان `YYYY-MM-DD` بمانند.  

-   
اگر فرم با react-hook-form کار می‌کند، bind را دقیق انجام بده:  

  - `value={field.value ?? null}`  

  - `onChange={(v) => field.onChange(v ?? "")}` یا متناسب با schema همان فرم  

-   
اگر state ساده است:  

  - `value={value || null}`  

  - `onChange={(v) => setValue(v ?? "")}`  


---

## ۴) دیتابیس / RLS / migration

هیچ تغییری در موارد زیر انجام نده:

-   
دیتابیس  

-   
migration  

-   
RLS  

-   
GRANT  

-   
policy  

-   
API contracts  


این تغییر فقط UI است.

---

## ۵) تأیید فنی

بعد از تغییرات اجرا کن:

```

```

```
bunx tsgo --noEmit
bun run build
```

بعد بررسی کن:

```

```

```
rg 'type="date"' src/
rg "PersianDatePicker" src/
```

انتظار:

- `PersianDatePicker` باید در فایل‌های اصلاح‌شده دیده شود.  

-   
در صفحه `/sales/quotes` دیگر `mm/dd/yyyy` دیده نشود.  

- `type="date"` در فایل‌های user-facing بالا باقی نماند.  

-   
اگر موردی از `type="date"` باقی ماند، باید در گزارش پایان با دلیل توضیح داده شود.  


---

## ۶) تست دستی

صفحه زیر را باز کن:

`/sales/quotes`

باید:

1.   
فیلترهای تاریخ شمسی باشند.  

2.   
placeholderها فارسی باشند:  

  - `از تاریخ`  

  - `تا تاریخ`  

3.   
تقویم شمسی باز شود.  

4.   
بعد از انتخاب تاریخ، فیلتر همچنان درست کار کند.  

5.   
در UI دیگر `mm/dd/yyyy` دیده نشود.  


همچنین صفحات زیر را سریع smoke test کن:

-   
ساخت پیش‌فاکتور جدید  

-   
هشدار موجودی  

-   
صف ارسال  

-   
گزارش ارسال پیش‌فاکتور  

-   
تاریخ تولد مشتری  

-   
فصل‌های گیمیفیکیشن  


---

## ۷) گزارش پایان

بعد از اجرا، لطفاً این موارد را گزارش بده:

-   
نام branch  

-   
commit hash  

-   
فایل‌های تغییرکرده  

-   
وضعیت صفحه `/sales/quotes`  

-   
نتیجه `bunx tsgo --noEmit`  

-   
نتیجه `bun run build`  

-   
خروجی خلاصه `rg 'type="date"' src/`  

-   
اگر `type="date"` باقی مانده، دلیل باقی‌ماندن هر مورد