## دو تغییر کوچک

### ۱) رفع خطای `crypto.randomUUID is not a function` هنگام آپلود رسید
- polyfill در `src/lib/polyfills/crypto-uuid.ts` وجود دارد و `src/start.ts` هم آن را import کرده، ولی در محیط self-host روی HTTP LAN همچنان خطا می‌آید. علت: در برخی مسیرها ماژول `start.ts` به‌اندازه‌ی کافی زود در بندل کلاینت اجرا نمی‌شود.
- **اصلاح:** اولین خط `src/routes/__root.tsx` را با یک import ساده‌ی side-effect به polyfill اضافه می‌کنیم:
  ```ts
  import "@/lib/polyfills/crypto-uuid";
  ```
  همین یک خط تضمین می‌کند که polyfill قبل از هر ماژول دیگر (از جمله supabase-js) در بروزر بارگذاری شود.

### ۲) سخت‌کردن سیاست دسترسی: فقط فرد تخصیص‌یافته (assignee) می‌تواند رسید ثبت کند
سیاست‌های فعلی جدول `purchase_receipts`:
- INSERT فقط `uploaded_by = auth.uid()` را چک می‌کند → هر کاربری می‌تواند رسید بزند.
- سیاست Storage روی bucket `purchase-receipts` قبلاً صحیح است (فقط assignee/manager/admin).

**Migration کوچک** روی `public.purchase_receipts`:
- DROP POLICY "assignee can upload receipt"
- CREATE POLICY جدید با شرط:
  ```sql
  uploaded_by = auth.uid()
  AND (
    has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'manager')
    OR EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = request_id AND pr.assigned_to = auth.uid()
    )
  )
  ```
- بقیه‌ی سیاست‌ها (SELECT/DELETE) دست‌نخورده.

### خارج از این پلن
- UI/کد آپلود دست‌نخورده باقی می‌ماند.
- خطای Ollama و اصلاحات استعلام قبلی مرتبط نیستند.

### تست پس از اعمال
1. `/admin/purchase` → یک درخواست، آپلود رسید → دیگر خطای `crypto.randomUUID` دیده نشود و رسید ثبت شود.
2. با کاربری غیر از assignee (و بدون نقش admin/manager) تلاش برای آپلود → پیام permission denied از دیتابیس (rejection صحیح).
3. با assignee → آپلود موفق.