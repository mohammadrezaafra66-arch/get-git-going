# تغییرات تکمیر Write Paths

**تاریخ شروع:** ۲۲ ژوئن ۲۰۲۶  
**مسؤول:** Claude Assistant  
**هدف:** یکپارچه‌سازی write paths برای Customers، Invoices، Accounting

---

## 🔍 وضعیت فعلی

### ✅ قسمت‌های درست شده:

1. **Customers Module**
   - ✅ `src/lib/customers/functions.ts` — کامل serverFn layer
   - ✅ RLS و RBAC پیاده‌شده
   - ⚠️ Direct write: `audit_logs.insert()` در export (بی‌اهمیت)

2. **Invoices Module**
   - ✅ Routes از طریق serverFn می‌نویسند
   - ✅ عملیات اصلی کنترل‌شده

3. **Accounting Module**
   - ✅ PaymentReceipt از طریق serverFn

### ⚠️ مسائل باقی‌مانده:

1. **Phase 3 Migration (بحرانی)**
   - فایل موجود: `20260615101000_phase3_automation_driver_outputs_phase_label.sql`
   - Constraint: `PHASE-3` اضافه کردن
   - **وضعیت:** در draft branch، نیاز به اجرا روی LAN
   
2. **Audit Log Consolidation**
   - ۳۰+ فایل پخش‌شده
   - نیاز به مرکزی‌سازی

---

## 📋 برنامهٔ اقدام

### مرحلهٔ ۱: Phase 3 Migration (۱-۲ روز)

```bash
# ۱. اجرای migration روی LAN
# ۲. تست: PHASE-3 insert می‌شود
# ۳. commit
```

### مرحلهٔ ۲: Audit Log Consolidation (۲-۳ روز)

```bash
# ۱. مرکزی‌سازی در src/lib/audit/index.ts
# ۲. حذف ۳۰+ فایل پخش‌شده
# ۳. commit
```

### مرحلهٔ ۳: Test Suite (۳-۵ روز)

```bash
# ۱. Frontend tests (Customers، Invoices)
# ۲. Backend tests (serverFn)
# ۳. Database tests (migrations)
# ۴. CI/CD setup
```

---

## 📊 تقدم

| مرحله | وضعیت | نتیجه |
|-------|--------|--------|
| ۱. Phase 3 | ⏳ شروع شود | - |
| ۲. Audit | ⏳ انتظار | - |
| ۳. Tests | ⏳ انتظار | - |

---

**آپدیت آخر:** ۲۲ ژوئن ۲۰۲۶، ۱۱:۴۰
