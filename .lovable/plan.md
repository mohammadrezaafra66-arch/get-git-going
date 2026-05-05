## مشکل

دکمه «ثبت فیش» در `/accounting/receipts/create` کلیک می‌شود ولی هیچ اتفاقی نمی‌افتد. پس از بررسی `PaymentReceiptForm.tsx` دو علت قطعی پیدا شد:

### علت ۱ — اعتبارسنجی Zod ساکت رد می‌شود
`form.handleSubmit` وقتی schema fail می‌کند، فقط خطاها را در `formState.errors` می‌گذارد و هیچ toast/پیام کلی نمایش نمی‌دهد. فیلدهای الزامی فعلی:
- `customer_id` (انتخاب مشتری)
- `payer_name`, `receiver_name` (حداقل ۲ کاراکتر)
- `tracking_number` (شماره پیگیری)
- `payment_date`, `payment_time`
- `amount`
- **refine سختگیر**: دقیقاً یکی از `destination_bank_account_id` یا `receiver_party_id` باید پر باشد (هر دو یا هیچ‌کدام = خطا)

اگر کاربر فقط مبلغ ۸۰٬۰۰۰٬۰۰۰ را وارد کرده (که در session replay دیده می‌شود) و گیرنده/مشتری/پیگیری را نگذاشته، دکمه کلیک می‌شود اما کاری نمی‌کند چون validation در پس‌زمینه رد می‌شود و فقط border قرمز روی فیلدها می‌آید — در فرم بلند کاربر متوجه نمی‌شود.

### علت ۲ — دکمه disabled می‌شود بدون توضیح
خط ۱۷۲۰:
```ts
disabled={
  mutation.isPending ||
  (watchedReceiptType === "payment" && (allocations.length === 0 || overAllocated))
}
```
وقتی نوع رسید «پرداخت بدهی» است و کاربر هیچ پیش‌فاکتوری اختصاص نداده، دکمه خاکستری/غیرفعال می‌شود ولی هیچ راهنمایی کنارش نیست.

---

## راه‌حل

### ۱) نشان‌دادن خطاهای اعتبارسنجی به‌صورت toast + اسکرول
به `form.handleSubmit` پارامتر دوم `(errors) => {...}` اضافه شود:
- toast.error با لیست عناوین فارسی فیلدهای ناقص
- اسکرول خودکار به اولین فیلد خطادار
- پیام مخصوص برای refine گیرنده: «گیرنده را مشخص کنید: یا حساب بانکی ما یا یک طرف خارجی»

### ۲) پیام راهنما کنار دکمه disabled
زیر دکمه ثبت، وقتی disabled است متن کوچک قرمز نمایش داده شود:
- اگر `allocations.length===0` → «حداقل یک پیش‌فاکتور را برای تخصیص انتخاب کنید» + لینک به بخش تخصیص
- اگر `overAllocated` → «مجموع تخصیص بیشتر از مبلغ فیش است»

### ۳) Console log در onSubmit برای debug آینده
یک `console.warn("[receipt-form] validation failed", errors)` تا اگر کاربر دوباره گیر کرد، در logs ببینیم.

### فایل‌های تغییر
- `src/shared/components/PaymentReceiptForm.tsx` — تنها فایل لازم

### بدون تغییر در
- migration/RLS/schema (مشکل صرفاً UX است، نه backend)

---

## معیار پذیرش
- کلیک روی «ثبت فیش» با فرم خالی → toast فارسی با لیست فیلدهای الزامی + اسکرول به اولین خطا
- نوع پرداخت بدون allocation → پیام راهنمای واضح زیر دکمه disabled
- فرم کامل → همان مسیر فعلی (duplicate check → warnings → mutation)
