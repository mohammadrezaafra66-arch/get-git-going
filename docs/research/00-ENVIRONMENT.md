# فصل ۰ — تثبیت محیط (Environment)

> تاریخ اجرا: ۱۴۰۵/۰۵/۰۳ (2026-07-25). این فصل مرجع بقیهٔ گزارش‌هاست.

## ۰.۱ محل پروژه و وضعیت git

- **مسیر پروژه:** `D:\AfraKalaTest\app`
- **remote:** `origin → https://github.com/mohammadrezaafra66-arch/get-git-going.git` ✅ (همان remote موردانتظار بریف)
- **برنچ فعلی (checked out):** `feature/navigation-modernization`
- **HEAD:** `a9315e78 feat(accounting): expose bank account accounting code in the UI` — زمان commit: `2026-07-24 17:41:19 +0330`
- **git status:** فقط فایل‌های markdown پلن در ریشه (untracked) + این فایل‌های گزارش. هیچ فایل اپلیکیشنی dirty نیست.

## ۰.۲ واگرایی برنچ‌ها (اندازه‌گیری واقعی)

| مقایسه | نتیجه |
|---|---|
| `main ... security/rls-permissive-select-fix` | main=0 عقب، security **۱۳۳۶ commit جلوتر** |
| `main ... feature/navigation-modernization` | main=0 عقب، nav **۱۳۹۵ commit جلوتر** |
| `security ... feature/navigation-modernization` | security=0 عقب، nav **۵۹ commit جلوتر** |

**نتیجهٔ کلیدی:** `feature/navigation-modernization` یک **سوپرست** از `security/rls-permissive-select-fix` است (همهٔ commit های security + ۵۹ commit اضافه). یعنی هرچه روی security هست، روی nav هم هست.

## ۰.۳ 🔴 مهم‌ترین یافته: سرور از کدام برنچ build شده

بریف فرض کرده بود سرور روی `security/rls-permissive-select-fix` است. **این فرض غلط است.**

شواهد قطعی از کانتینر در حال اجرا:
- `docker inspect afrakala-lan-web` → env: **`APP_GIT_SHA=a9315e78`** ، `APP_BUILD_TIME=2026-07-24T16:45:16Z` ، `APP_ENV=lan`
- `a9315e78` دقیقاً HEAD برنچ **`feature/navigation-modernization`** است.
- image `afrakala-app:lan` ساخته‌شده در `2026-07-24T16:46:55Z`.
- سرویس web از همین مخزن build می‌شود: `deploy/lan/docker-compose.yml` → `build.context: ../..`, `dockerfile: Dockerfile` (خطوط ۲۸–۴۰).

**⟹ برنچ سروری = `feature/navigation-modernization` = برنچ فعلی که الان چک‌اوت شده.**

پیامد برای کل تحقیق: تمام migration های ۱۴۱ تا ۱۵۵ و کدهای مربوط که روی nav هستند، **روی سرور فعال‌اند**. قانون «کد روی main ≠ کد روی سرور» اینجا به نفع ما کار می‌کند: سرور جلوترین برنچ است، نه عقب‌ترین. برای هر آیتم فقط باید چک شود که آیا فایل/تابع روی همین working tree (که = سرور است) وجود دارد.

> نکته: هر یافته‌ای که در working tree فعلی هست ⟹ روی سرور هست. نیازی به مقایسهٔ سه‌برنچی برای هر آیتم نیست؛ کافی است چک شود روی `feature/navigation-modernization` (HEAD فعلی) هست یا نه.

## ۰.۴ اتصال به دیتابیس

- **کانتینر DB:** `afrakala-lan-db` (image `supabase/postgres:15.6.1.139`, internal only، publish نشده).
- **دیتابیس واقعی:** `afrakala` ✅ (تأییدشده با `SELECT current_database()` → `afrakala`).
- **الگوی اتصال کارآمد (بدون مشکل quoting):**

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
@"
SELECT ...;
"@ | docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -A -F '|'
```

- کانتینر `afrakala-local-db` (روی `127.0.0.1:54322`) یک stack **جدا و قدیمی** است؛ به آن دست نزن.

## ۰.۵ نقشهٔ سیستم

### نقش‌ها (`app_role` enum)
`admin`, `manager`, `sales`, `accountant`, `viewer`, `purchase_specialist`, `site`

> ⚠️ **ناسازگاری نام نقش:** در `role_permissions.role_name` ردیف‌ها با متن `purchasing_expert` seed شده‌اند، ولی enum مقدار `purchase_specialist` دارد. join در `has_dynamic_permission` روی `ur.role::text = rp.role_name` است ⟹ کاربرِ `purchase_specialist` با هیچ ردیف `purchasing_expert` مطابقت نمی‌کند و برای **همهٔ ماژول‌ها** به fallback می‌افتد. (یافتهٔ بحرانی — در پکیج G/H مرتبط.)

### ماتریس دسترسی: ساختار `role_permissions`
ستون‌ها: `role_name(text)`, `module(text)`, `can_view`, `can_create`, `can_update`, `can_delete`, `can_approve`, `can_export`, `can_view_sensitive` (همه boolean).

**ماژول‌های seed‌شده (۱۹):** `academy, audit-logs, bot-api-keys, dashboard, data-tables, feedback, invoices, knowledge, messages, persons, price-lists, pricing, products, purchases, reports, roles, sales, suppliers, users`

**ماژول‌های seed‌نشده که در آیتم‌ها لازم می‌شوند:** `accounting`، `gamification`، `marketing`، `treasury`، `warehouse/inventory`، `currencies` — هیچ ردیفی ندارند ⟹ رفتار fallback (زیر).

### 🟡 تصحیح مهم بریف: رفتار fallback در `has_dynamic_permission`
بریف (قانون ۰.۴.۴) می‌گفت «ماژول seed‌نشده = دسترسی باز برای همه». **این دقیق نیست.** خواندن `pg_get_functiondef` نشان می‌دهد fallback به یک ماتریس استاتیک قدیمی می‌رود، نه «همه»:

```
admin → همیشه true (shortcut اول تابع)
اگر ماژول ردیف داشت → bool_or ستون مربوطه
اگر ماژول هیچ ردیفی نداشت (fallback):
  view            → admin, manager, accountant, sales, viewer
  create/update   → admin, manager
  delete          → admin
  approve/export  → admin, manager, accountant
  view_sensitive  → admin, manager, accountant
```

پیامد واقعی: برای ماژول seed‌نشده، **همه نقش‌ها دسترسی کامل نمی‌گیرند**؛ ولی `sales` و `viewer` به‌طور پیش‌فرض `view` می‌گیرند حتی اگر ماژول قرار بوده خصوصی باشد. `purchase_specialist` و `site` در fallback هیچ `view` نمی‌گیرند مگر از راه دیگر. این ریسک «افشای ناخواسته» است، نه «دسترسی باز کامل».

### فهرست کامل جداول (BASE TABLE, schema public)
> ذخیره‌شده کامل. برجسته‌های مرتبط با آیتم‌ها:

- **سرمایه/امتیاز (A):** `daily_capital_inputs`, `daily_capital_settings`, `daily_capital_snapshots`, `capital_allocation_ledger`, `salesperson_capital_allocations`, `salesperson_capital_allocations_dynamic`, `customer_capital_allocations`, `customer_capital_allocations_dynamic`, `dynamic_parameter_weights` (+`_backup_142`, `_backup_20260722`), `dynamic_scoring_parameters`, `dynamic_entity_scores`, `employee_scores`, `employee_score_events`, `score_snapshots`
- **متریک روزانه/گیمیفیکیشن (B):** `staff_daily_performance_metrics`, `gamification_kpi_rules`, `gamification_kpis`, `gamification_rewards`, `employee_*` (achievements, leagues, level_up_events, mission_progress, profiles, progress, scores, streaks), `missions`, `achievements`, `league_seasons`, `league_settings`
- **فروش/پیش‌فاکتور (C,D):** `sales_quotes`, `sales_quote_items`, `sales_quote_counters`, `sales_quote_send_queue`, `sales_quote_share_logs`, `invoices`, `invoice_items`, `invoice_workflow_stages`, `settlement_types`, `sale_price_types`, `payment_terms`, `sale_lists`, `sale_list_items`, `sale_list_versions`
- **مارکتینگ (E):** `marketing_channels`, `promotion_nominations`, `promotion_nomination_policy`, `product_recommendation_overrides`
- **فیش/OCR/AI (F):** `payment_receipts` (+`_backup_20260722`), `payment_receipt_links`, `payment_receipt_documents`, `payment_receipt_custom_fields`, `ai_providers`, `ai_provider_health`, `ai_conversations`, `ai_generated_content`, `bot_api_keys`, `knowledge_documents`, `knowledge_document_chunks`
- **اشخاص/خرید (G):** `customers`, `external_parties`, `persons`, `person_identifiers`, `person_field_definitions`, `person_field_values`, `person_context_links`, `suppliers`, `purchases`, `purchase_items`, `purchase_prices`, `purchase_receipts`, `purchase_requests`, `product_suppliers`
- **انبار (H):** ❌ **هیچ جدول `warehouses` وجود ندارد.** موجودی: ستون روی `products` (باید در پکیج H تأیید شود) — هیچ `stock_movements` مستقل در فهرست نیست. (پکیج H باید قطعی کند.)
- **خزانه (I):** `payment_receipts`, `bank_accounts`, `journal_entries`, `journal_lines`
- **گزارش سررسیدی (J):** `vw_customer_receivables`, `vw_supplier_payables`, توابع `get_receivables_*`/`get_payables_*`
- **واحد پول (K):** `currencies`, `currency_rates`, `currency_sources`, `currency_rate_fetches`

### View ها (۱۴)
`academy_quiz_questions_public, effective_currencies_view, employee_monthly_hours, product_computed_prices_public, publish_recipients_view, v_dynamic_customer_capital_balances, v_dynamic_salesperson_capital_balances, v_latest_active_purchase_prices, v_league_tiers_public, v_pricing_recompute_queue_summary, v_promotion_suggestions, vw_customer_receivables, vw_purchase_float, vw_supplier_payables`

### توابع کلیدی (منتخب از ~۲۰۰ تابع public)
- **زنجیرهٔ سرمایه (A):** `compute_daily_capital`, `run_daily_capital_allocation`, `save_daily_capital_snapshot`, `_latest_active_capital_setting`, `compute_salesperson_capital_allocations(p_capital_snapshot_id)`, `save_salesperson_capital_allocations`, `compute_customer_capital_allocations(p_salesperson_allocation_id)`, `save_customer_capital_allocations`, `can_use_customer_capital_allocation`, `consume_capital_allocation`, `hold/release/refund_capital_allocation`, `_capital_alloc_used` — **زنجیرهٔ دو مرحله‌ای کارشناس→مشتری در سطح تابع وجود دارد.**
- **امتیاز (A):** `calculate_employee_score`, `calculate_dynamic_score(entity_type,entity_id,period_month)`, `calculate_salesperson_collected_sales`, `recompute_all_employee_scores`, `upsert_dynamic_parameter_weight`
- **متریک دستی (B):** `upsert_staff_daily_performance_metric(...)`, `manual_daily_metrics_totals(...)`
- **جستجوی فروش (C):** `get_sales_search_products(...)`, `search_product_ids`
- **مارکتینگ/نامزدی (E):** `nominate_product_for_promotion`, `cancel_promotion_nomination`, `compute_promotion_scores`, `get_promotion_nomination_quota`, `v_promotion_suggestions`
- **AI (F):** `admin_upsert_ai_provider`, `admin_delete_ai_provider`, `ai_get_provider_key`, `ai_record_provider_health`, `replace_knowledge_document_chunks`, `search_knowledge_chunks_semantic`
- **گزارش (J):** `get_receivables_list/summary/detail`, `get_payables_list/summary/detail`, `calculate_customer_realtime_credit`, `get_customer_dynamic_credit`
- **اشخاص (G):** `customer_set_person`, `customer_clear_person`

## ۰.۶ فهرست route ها (۱۷۲ فایل در `src/routes/`)
همه زیر لِی‌اوت `_app.*` (نیازمند auth). route های مرتبط با آیتم‌ها در گزارش هر پکیج نقل شده‌اند. نبودِ قابل‌توجه:
- **هیچ route با نام `warehouse`/`inventory`/`treasury`/`visitor`/`ویزیتور` وجود ندارد** (باید در پکیج‌های H/D قطعی شود، ولی در سطح نام فایل route غایب است).

## ۰.۷ منابعی که استفاده نشد
- `schema_full_export.sql` (قدیمی) — استفاده نشد؛ مرجع، DB زندهٔ `afrakala` بود.
- DB `postgres` کهنه — به آن وصل نشدیم.
</content>
