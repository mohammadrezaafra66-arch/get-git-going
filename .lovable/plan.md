## چک‌لیست تست پس از deploy روی سرور self-host

### گام ۰ — به‌روزرسانی سرور (الزامی قبل از هر تست)
1. روی سرور: `git pull && docker compose build && docker compose up -d`
2. در مرورگر: **Hard Reload** با `Ctrl+Shift+R` (کش را کاملاً پاک کنید)
3. F12 → Console → باید این خط را ببینید:
   ```
   [crypto-uuid] ready function
   ```
   اگر `function` دیدید یعنی polyfill نصب شد. اگر `undefined` دیدید یعنی build قدیمی هنوز serve می‌شود.

### گام ۱ — تست `crypto.randomUUID` (رفع خطای اصلی)
| صفحه | عملیات | انتظار |
|---|---|---|
| `/products/:id` | آپلود تصویر محصول (JPG < 5MB) | ✅ آپلود موفق، تصویر در گالری |
| `/products/:id` | آپلود PDF | ❌ رد با پیام فرمت نامعتبر |
| `/products/:id` | آپلود تصویر > 5MB | ❌ رد با پیام سایز |
| `/documents` | تب «آپلود سند جدید» (با کاربر admin/manager/accountant) | آپلود PDF موفق |
| `/delivery-receipts` | تب «آپلود رسید جدید» | آپلود موفق |
| `/api-keys` | ساخت کلید جدید | ✅ کلید ساخته می‌شود بدون خطای `digest` |

### گام ۲ — تب‌های آپلود که «دیده نمی‌شود»
اگر با کاربر admin هنوز تب آپلود در `/documents` یا `/delivery-receipts` ظاهر نشد:
- F12 → Console → اجرا: `JSON.parse(localStorage.getItem('sb-kwwkppkcihrbeurwudjh-auth-token'))?.user?.id`
- سپس در `/admin/roles` مطمئن شوید نقش `admin` یا `accountant` به این user_id اختصاص دارد.

### گام ۳ — مسنجر (خطای WebSocket)
- `/messages` → گروه تست → ارسال فایل JPG
- اگر باز خطای `Node.js detected but native WebSocket not found` دیدید، لطفاً stack trace کامل را کپی کنید (این پیام از server function می‌آید نه client).

### گام ۴ — حضور و غیاب
- در هدر داشبورد → دکمه ClockIn/Out باید دیده شود
- کلیک → `profiles.last_seen_at` باید update شود (`/presence` را باز کنید)

### گام ۵ — API عمومی
- `curl https://<your-domain>/api/public/products` → باید JSON محصولات فعال (بدون قیمت خرید) برگردد

---

### اگر چیزی fail شد
لطفاً برای هر مورد این‌ها را بفرستید:
1. نام صفحه و عملیات
2. خروجی کامل Console (به‌خصوص خط `[crypto-uuid] ready ...`)
3. خطای دقیق (متن + stack اگر هست)
4. تب Network → درخواست fail شده → Response

با این اطلاعات می‌توانم دقیقاً بگویم کدام لایه (polyfill / build cache / server function / RLS) مشکل دارد و فاز بعدی رفع را شروع کنم.
