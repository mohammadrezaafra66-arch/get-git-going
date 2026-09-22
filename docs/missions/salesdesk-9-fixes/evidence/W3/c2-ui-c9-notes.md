# C2 UI — مسئول معامله
- QuickRequestForm: label «مسئول معامله», empty default (no __me__), UI error before submit, zod/message map RESPONSIBLE_REQUIRED→«مسئول معامله الزامی است»
- Evidence: src/components/sales-desk/QuickRequestForm.tsx + src/lib/sales-desk/errors.ts

# C3 — ایجاد کننده معامله
- Read-only on QuickRequestForm (current profile.full_name)
- Deal detail shows author + salesperson
- MyWorkDeals list column + author filter

# C4 — کارهای من
- Tab on /operations/sales-desk
- Filter salesperson_id = me
- NotificationBell shows n.title (already); navigates sales_interaction_assigned → deal detail

# C5 — معاملات ثبت‌شده برای دیگران
- Route /operations/sales-desk/deals-for-others
- Module sales-deals-for-others (migration 571 applied)

# C7 — status labels
- open→جاری, won→موفق, lost→ناموفق
- Buttons موفق شد / ناموفق شد; reopen → جاری

# C8 — lost reasons
- Settings /settings/deal-lost-reasons
- LostReasonDialog on ناموفق شد
- Report /sales/reports/deal-lost
- Modules deal-lost-reasons + deal-lost-report (571)

# C9 — ایجاد پیش‌فاکتور
- Deal detail button + quotes tab
- quotes/new?interactionId= prefill + post-create link salesperson_id + interaction_id
