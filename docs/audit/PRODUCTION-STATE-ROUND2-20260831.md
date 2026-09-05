# PRODUCTION STATE — ROUND 2 — ۲۰۲۶-۰۸-۳۱

**وضعیت: PARTIAL**

چهار سؤال از پنج سؤال کامل با شواهد پاسخ گرفتند. یک زیرسؤال از Q1 — «آیا هیچ‌کدام از
آن ۲۶ تابع overload دارد؟» — به‌صورت فقط‌خواندنی از این ماشین قابل پاسخ نبود، چون
فهرست آن ۲۶ تابع فقط در migration 399 است و آن فایل روی هیچ‌یک از پنج clone این ماشین
وجود ندارد. جزئیات در بخش «تأیید نشده».

**مأموریت کاملاً فقط‌خواندنی اجرا شد.** هیچ migration، ALTER، GRANT، REVOKE، INSERT،
UPDATE، DELETE، TRUNCATE یا DROP اجرا نشد. هیچ دستور docker یا git نوشتاری اجرا نشد.
هیچ view ای به‌عنوان `anon` خوانده نشد. تنها فایل نوشته‌شده همین گزارش است.

---

## هویت ماشین

```
$ hostname
DESKTOP-MT8J1VR
```

مطابق انتظار. PRODUCTION. تمام کوئری‌ها با `-d postgres` صریح اجرا شدند.

---

## یافتهٔ صفر — هیچ‌یک از migration های مرجع روی این ماشین نیست

پیش از هر چیز باید روشن می‌شد که آیا فهرست «۲۶ تابع» و «هشت view» را می‌توان از فایل
گرفت یا نه.

```
$ for d in <five clones>; do count files; find *_{370,386,387,395,399,416,419}_*.sql; done

/c/afrakala                          files=523  highest_serial=335
/c/AfraKalaServer/get-git-going01lan files=223  highest_serial=(none)
/c/afrakala-feature-tree             files=522  highest_serial=334
/c/Users/AfRa KaLa/afrakala-platform files=223  highest_serial=(none)
/c/Users/AfRa KaLa/get-git-going     files=234  highest_serial=(none)
```

هیچ‌کدام از ۳۷۰، ۳۸۶، ۳۸۷، ۳۹۵، ۳۹۹، ۴۱۶ یا ۴۱۹ در هیچ clone ای پیدا نشد. بالاترین
سریال روی کل این ماشین **۳۳۵** است. پس هر دو فهرست باید از خودِ پایگاه‌داده کشف
می‌شدند، که همین کار انجام شد.

---

## Q1 — امضاهای دقیق و بررسی overload

### کوئری

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       p.prosecdef AS sec_definer,
       has_function_privilege('anon',p.oid,'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authed_exec
  FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace
   AND p.proname IN ('award_xp_from_score',
                     'check_and_unlock_achievements_for_employee',
                     'check_and_update_mission_progress_for_employee',
                     'claim_pricing_recompute_jobs',
                     'enqueue_pricing_recompute',
                     'revoke_user_role_txt')
 ORDER BY 1,2;
```

### خروجی

```
                    proname                     |                                                    identity_args                                                    | sec_definer | anon_exec | authed_exec
------------------------------------------------+---------------------------------------------------------------------------------------------------------------------+-------------+-----------+-------------
 award_xp_from_score                            | _employee_id uuid                                                                                                   | t           | f         | f
 check_and_unlock_achievements_for_employee     | _employee_id uuid, _event_type text                                                                                 | t           | f         | f
 check_and_update_mission_progress_for_employee | _employee_id uuid, _event_type text                                                                                 | t           | f         | f
 claim_pricing_recompute_jobs                   | _batch_size integer, _max_attempts integer                                                                          | t           | f         | f
 enqueue_pricing_recompute                      | _product_ids uuid[], _reason text, _source_table text, _source_id uuid, _sale_price_type_id uuid, _priority integer | t           | f         | f
 revoke_user_role_txt                           | _target_user uuid, _role text                                                                                       | t           | t         | t
(6 rows)
```

### خطوط GRANT آماده — اجرا نشدند

```sql
GRANT EXECUTE ON FUNCTION public.award_xp_from_score(_employee_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_unlock_achievements_for_employee(_employee_id uuid, _event_type text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_update_mission_progress_for_employee(_employee_id uuid, _event_type text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pricing_recompute_jobs(_batch_size integer, _max_attempts integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_pricing_recompute(_product_ids uuid[], _reason text, _source_table text, _source_id uuid, _sale_price_type_id uuid, _priority integer) TO authenticated;
```

### ⚠ این یافته با ground truth مأموریت در تضاد است

ground truth می‌گوید این پنج تابع «grant صریح برای authenticated ندارند و دسترسی‌شان
فقط از راه PUBLIC می‌آید، پس `REVOKE ... FROM PUBLIC` در ۳۹۹ دسترسی authenticated را
هم می‌گیرد». روی **این** پایگاه‌داده چنین نیست. ACL خام:

```sql
SELECT p.proname, array_to_string(p.proacl, E'\n') FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND p.proname IN (...);
```

```
 award_xp_from_score                            | postgres=X/supabase_admin
                                                | supabase_admin=X/supabase_admin
                                                | service_role=X/supabase_admin
 check_and_unlock_achievements_for_employee     | (همان سه ورودی)
 check_and_update_mission_progress_for_employee | (همان سه ورودی)
 claim_pricing_recompute_jobs                   | (همان سه ورودی)
 enqueue_pricing_recompute                      | (همان سه ورودی)
 revoke_user_role_txt                           | =X/supabase_admin
                                                | postgres=X/supabase_admin
                                                | supabase_admin=X/supabase_admin
                                                | anon=X/supabase_admin
                                                | authenticated=X/supabase_admin
                                                | service_role=X/supabase_admin
```

```
                    proname                     | public_exec | postgres_exec |     owner
------------------------------------------------+-------------+---------------+----------------
 award_xp_from_score                            | f           | t             | supabase_admin
 check_and_unlock_achievements_for_employee     | f           | t             | supabase_admin
 check_and_update_mission_progress_for_employee | f           | t             | supabase_admin
 claim_pricing_recompute_jobs                   | f           | t             | supabase_admin
 enqueue_pricing_recompute                      | f           | t             | supabase_admin
 revoke_user_role_txt                           | t           | t             | supabase_admin
```

**تفسیر.** آن پنج تابع فقط `postgres`، `supabase_admin` و `service_role` را در ACL
دارند. هیچ ورودی PUBLIC (که به‌صورت `=X/...` با نقشِ خالی نوشته می‌شود)، هیچ `anon` و
هیچ `authenticated`. یعنی EXECUTE پیش‌فرض PUBLIC روی آن‌ها از قبل گرفته شده. پس روی
تولید این پنج تابع **از الان قفل‌اند** و بلاکری که ground truth توصیف می‌کند اینجا
وجود ندارد.

فقط `revoke_user_role_txt` است که هر سه مسیر را دارد: `=X` (PUBLIC) به‌علاوهٔ
`anon=X` و `authenticated=X`. یعنی حتی اگر PUBLIC گرفته شود، grant صریح `anon` باقی
می‌ماند.

اینکه ground truth از کجا آمده معلوم نیست؛ محتمل‌ترین توضیح این است که روی سرور تست
(که در ۴۱۹ است و خودِ مأموریت می‌گوید پایگاه‌دادهٔ دیگری است) به‌دست آمده.

### overload

```sql
SELECT p.proname, count(*) FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND p.proname IN (...) GROUP BY 1;
```

```
 award_xp_from_score                            | 1
 check_and_unlock_achievements_for_employee     | 1
 check_and_update_mission_progress_for_employee | 1
 claim_pricing_recompute_jobs                   | 1
 enqueue_pricing_recompute                      | 1
 revoke_user_role_txt                           | 1
```

هیچ‌کدام از این شش overload ندارد. ولی وقتی همان بررسی روی کل مجموعهٔ SECURITY
DEFINER های قابل‌اجرا برای `anon` انجام شد:

```sql
SELECT count(*) FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
   AND has_function_privilege('anon',p.oid,'EXECUTE');
-- 304

SELECT p.proname, count(*) FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
   AND has_function_privilege('anon',p.oid,'EXECUTE')
 GROUP BY 1 HAVING count(*) > 1;
```

```
   proname    | overloads
--------------+-----------
 has_any_role |         2
 has_role     |         2
```

```
   proname    |          identity_args           | anon_exec
--------------+----------------------------------+-----------
 has_any_role | _user_id uuid, _roles app_role[] | t
 has_any_role | _user_id uuid, _roles text[]     | t
 has_role     | _user_id uuid, _role app_role    | t
 has_role     | _user_id uuid, _role text        | t
```

**بلاکر واقعی همین است.** `has_role` و `has_any_role` هرکدام دو overload دارند و هر
چهار نسخه برای `anon` قابل اجرا هستند. هر migration ای که بر اساس **نام** تطبیق دهد،
روی این دو نام یا نصف کار را می‌کند یا assertion اش عدد غیرمنتظره می‌گیرد.

همچنین توجه کنید که **۳۰۴** تابع SECURITY DEFINER در `public` برای `anon` قابل اجرا
هستند — نه ۲۶. سطح تماس بسیار بزرگ‌تر از چیزی است که ۳۹۹ پوشش می‌دهد.

---

## Q2 — نشتی view ها: **باز است**

### کشف

فایل‌های ۳۷۰/۳۸۶/۳۸۷/۳۹۵ اینجا نیستند (یافتهٔ صفر)، پس فهرست هشت view از فایل قابل
استخراج نبود و از خود پایگاه‌داده کشف شد.

```sql
SELECT count(*) AS total_views,
       count(*) FILTER (WHERE has_table_privilege('anon',c.oid,'SELECT')) AS anon_selectable,
       count(*) FILTER (WHERE c.reloptions::text LIKE '%security_invoker%') AS with_security_invoker
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='v';
```

```
 total_views | anon_selectable | with_security_invoker
-------------+-----------------+-----------------------
          20 |              13 |                    10
```

```sql
SELECT c.relname, has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       coalesce(c.reloptions::text,'(none)') AS reloptions
  FROM pg_class c
 WHERE c.relnamespace='public'::regnamespace AND c.relkind='v'
   AND has_table_privilege('anon',c.oid,'SELECT') ORDER BY 1;
```

```
                relname                 | anon_select |       reloptions
----------------------------------------+-------------+-------------------------
 academy_quiz_questions_public          | t           | {security_invoker=true}
 effective_currencies_view              | t           | {security_invoker=true}
 employee_monthly_hours                 | t           | {security_invoker=true}
 product_computed_prices_public         | t           | (none)
 publish_recipients_view                | t           | (none)
 v_dynamic_customer_capital_balances    | t           | (none)
 v_dynamic_salesperson_capital_balances | t           | (none)
 v_latest_active_purchase_prices        | t           | {security_invoker=true}
 v_league_tiers_public                  | t           | {security_invoker=true}
 v_pricing_recompute_queue_summary      | t           | {security_invoker=true}
 v_promotion_suggestions                | t           | (none)
 vw_account_balances                    | t           | (none)
 vw_purchase_float                      | t           | {security_invoker=true}
(13 rows)
```

### شش view در معرض — مالک و guard

```
                relname                 |   view_owner   | owner_is_superuser | owner_bypasses_rls
----------------------------------------+----------------+--------------------+--------------------
 product_computed_prices_public         | supabase_admin | t                  | t
 publish_recipients_view                | supabase_admin | t                  | t
 v_dynamic_customer_capital_balances    | supabase_admin | t                  | t
 v_dynamic_salesperson_capital_balances | supabase_admin | t                  | t
 v_promotion_suggestions                | supabase_admin | t                  | t
 vw_account_balances                    | supabase_admin | t                  | t
```

بدون `security_invoker`، view با حقوق **مالک** اجرا می‌شود. مالک `supabase_admin` است
که هم superuser است و هم `rolbypassrls = true`. یعنی RLS تمام جدول‌های زیرین دور
زده می‌شود.

بررسی وجود guard در هر ۱۳ view:

```
                relname                 |       reloptions        | has_guard | defn_len
----------------------------------------+-------------------------+-----------+----------
 product_computed_prices_public         | (none)                  | t         |      738
 publish_recipients_view                | (none)                  | t         |      457
 v_dynamic_customer_capital_balances    | (none)                  | t         |     1048
 v_dynamic_salesperson_capital_balances | (none)                  | t         |      914
 v_promotion_suggestions                | (none)                  | t         |     6422
 vw_account_balances                    | (none)                  | t         |     1812
 academy_quiz_questions_public          | {security_invoker=true} | f         |      219
 effective_currencies_view              | {security_invoker=true} | f         |      394
 employee_monthly_hours                 | {security_invoker=true} | f         |      392
 v_latest_active_purchase_prices        | {security_invoker=true} | f         |      376
 v_league_tiers_public                  | {security_invoker=true} | f         |      343
 v_pricing_recompute_queue_summary      | {security_invoker=true} | f         |      894
 vw_purchase_float                      | {security_invoker=true} | f         |      836
```

طراحی منسجم است: یا `security_invoker` (RLS به‌عنوان فراخوان اعمال می‌شود و guard لازم
نیست)، یا guard داخل خود view. هفت view اول گروه دوم، شش view گروه اول.

### guard نقل‌شده — هر شش‌تا یکی است

```
product_computed_prices_public          →  WHERE NOT is_viewer_only(auth.uid());
publish_recipients_view                 →  WHERE NOT is_viewer_only(auth.uid());
v_dynamic_customer_capital_balances     →  WHERE NOT is_viewer_only(auth.uid());
v_dynamic_salesperson_capital_balances  →  WHERE NOT is_viewer_only(auth.uid());
v_promotion_suggestions                 →  WHERE NOT is_viewer_only(auth.uid());
vw_account_balances                     →  WHERE NOT is_viewer_only(auth.uid());
```

هیچ‌کدام بررسی نمی‌کند که فراخوان اصلاً احراز هویت شده باشد. برای فراخوان ناشناس
`auth.uid()` برابر NULL است، پس همه‌چیز به رفتار `is_viewer_only(NULL)` بستگی دارد.

### تعیین‌کننده

```sql
SELECT pg_get_functiondef(oid) FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname='is_viewer_only';
```

```sql
CREATE OR REPLACE FUNCTION public.is_viewer_only(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = _user_id AND ur.role = 'viewer')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = _user_id AND ur.role <> 'viewer');
$function$
```

```sql
SELECT is_viewer_only(NULL::uuid) AS is_viewer_only_null,
       (NOT is_viewer_only(NULL::uuid)) AS guard_passes_for_anon;
```

```
 is_viewer_only_null | guard_passes_for_anon |              verdict
---------------------+-----------------------+-----------------------------------
 f                   | t                     | LEAK OPEN - anon passes the guard
```

**چرا `false` و نه NULL:** تابع از `EXISTS(...) AND NOT EXISTS(...)` ساخته شده.
`EXISTS` هرگز NULL برنمی‌گرداند. با `_user_id = NULL` بند اول `false` و بند دوم
`true` می‌شود، پس حاصل `false` است — نه NULL. بنابراین `NOT false = TRUE` و guard
پاس می‌شود.

### حکم Q2: **نشتی روی تولید باز است**

یک فراخوان احراز‌هویت‌نشده که به Kong روی پورت ۸۰۰۰ برسد، می‌تواند هر شش view را
به‌طور کامل بخواند، در حالی که RLS تمام جدول‌های زیرین دور زده شده. از جمله
`vw_account_balances` (مانده‌های حساب بانکی)،
`v_dynamic_customer_capital_balances` و `v_dynamic_salesperson_capital_balances`
(مانده‌های سرمایه) و `publish_recipients_view`.

**هیچ view ای به‌عنوان `anon` خوانده نشد.** حکم صرفاً از امتیازهای کاتالوگ، مالکیت
view، و ارزیابی یک عبارت بولی به‌دست آمد — هیچ ردیف داده‌ای از پایگاه‌داده خارج نشد.

**تعداد شش است، نه هشت.** فهرست هشت‌تایی به migration های ۳۷۰/۳۸۶/۳۸۷/۳۹۵ گره خورده
که اینجا نیستند. آنچه گزارش می‌شود، چیزی است که واقعاً در این پایگاه‌داده هست.

---

## Q3 — گسترهٔ کامل حفرهٔ TRUNCATE

```sql
SELECT count(*) FILTER (WHERE has_table_privilege('anon',c.oid,'TRUNCATE'))          AS anon_truncate,
       count(*) FILTER (WHERE has_table_privilege('authenticated',c.oid,'TRUNCATE')) AS authed_truncate,
       count(*) AS total_tables
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r';
```

```
 anon_truncate | authed_truncate | total_tables
---------------+-----------------+--------------
           197 |             208 |          221
```

### جدول‌هایی که هیچ‌کدام از دو نقش TRUNCATE ندارند — فقط ۱۳ تا از ۲۲۱

```
 customer_capital_allocations_dynamic
 daily_capital_inputs
 daily_capital_settings
 daily_capital_snapshots
 profiles
 purchase_idempotency
 purchase_items
 purchase_request_fulfillments
 purchase_requests
 purchases
 role_permissions
 salesperson_capital_allocations_dynamic
 user_roles
```

سه‌تای آن‌ها (`profiles`، `role_permissions`، `user_roles`) امروز با هات‌فیکس جداگانه
بسته شدند. ده‌تای دیگر از قبل بسته بودند.

### ۱۱ جدولی که فقط `authenticated` روی آن‌ها TRUNCATE دارد

```
 category_required_services
 marketing_channels
 marketing_task_templates
 mutual_settlements
 person_aliases
 platform_releases
 product_service_types
 sales_quote_item_services
 sales_quote_items
 sales_quotes
 score_level_thresholds
```

### ۱۹۷ جدولی که `anon` روی آن‌ها TRUNCATE دارد (فهرست کامل)

`anon` روی هر ۱۹۷ جدول زیر TRUNCATE دارد و `authenticated` نیز روی همان ۱۹۷ به‌علاوهٔ
۱۱ جدول بالا.

```
academy_courses, academy_lessons, academy_quiz_attempts, academy_quiz_questions,
academy_quizzes, academy_user_progress, achievements, ai_conversations,
ai_generated_content, ai_provider_health, ai_providers, ai_usage_routes,
appeal_reviewers, asan_control_accounts, asan_export_numbers, asan_import_batches,
asan_import_person_rows, asan_import_product_rows, audit_logs, automation_artifacts,
automation_checkpoints, automation_driver_outputs, automation_job_runs, automation_jobs,
automation_log_events, automation_modules, automation_worker_heartbeats,
automation_workers, bank_accounts, bot_api_key_audit_log, bot_api_key_label_access,
bot_api_key_table_access, bot_api_keys, bot_api_usage_logs, brands, call_logs,
capital_allocation_ledger, categories, category_product_attributes, credit_requests,
credit_score_snapshots, credit_scoring_rules, currencies, currency_rate_fetches,
currency_rates, currency_sources, custom_roles, customer_credit_balance,
customer_credit_ledger, customer_credit_profile, customers, daily_mood_entries,
daily_mood_hafez_poems, daily_mood_questions, daily_mood_scenarios,
dashboard_ticker_events, delivery_receipt_status_history, delivery_receipts,
didar_activities, didar_import_log, document_status_history, documents,
dynamic_entity_scores, dynamic_parameter_weights, dynamic_parameter_weights_backup_142,
dynamic_parameter_weights_backup_20260722, dynamic_scoring_parameters,
dynamic_table_cells, dynamic_table_columns, dynamic_table_row_counters,
dynamic_table_rows, dynamic_tables, employee_achievements, employee_leagues,
employee_level_up_events, employee_mission_progress, employee_profiles,
employee_progress, employee_score_events, employee_scores, employee_streaks,
external_parties, feedback, feedback_items, gamification_kpi_rules, gamification_kpis,
gamification_rewards, inquiries, inquiry_price_cache, inquiry_replies,
inquiry_status_history, inquiry_transfers, invoice_workflow_stages, journal_entries,
journal_lines, knowledge_articles, knowledge_confirmations, knowledge_document_chunks,
knowledge_documents, knowledge_documents_backup_20260722, league_seasons,
league_settings, market_indicators, market_product_match_events, market_product_matches,
market_rate_ingestion_runs, market_rate_source_mappings, market_rate_sources,
market_rate_ticks, message_embeddings, messages, messenger_attachments,
messenger_group_members, messenger_groups, messenger_messages, messenger_read_receipts,
missions, notification_events, notification_queue, payment_receipt_custom_fields,
payment_receipt_documents, payment_receipt_links, payment_receipts,
payment_receipts_backup_20260722, payment_terms, payment_vouchers, penalty_appeals,
performance_penalties, person_context_links, person_field_definitions,
person_field_values, person_identifiers, person_merge_candidates, person_merge_log,
persons, phone_collisions, presence_logs, price_alert_notifications, price_alert_rules,
price_calculation_snapshots, price_change_reasons, price_list_items, price_lists,
pricing_board_access_requests, pricing_board_settings, pricing_board_viewer_sessions,
pricing_recompute_queue, pricing_rules, product_attribute_groups, product_attributes,
product_category_attribute_values, product_computed_prices, product_images,
product_interaction_events, product_label_links, product_labels,
product_owner_assignments, product_recommendation_overrides, product_sale_price_history,
product_sku_counters, product_suppliers, product_video_chain, product_video_chain_events,
products, profile_field_definitions, profile_field_values, promotion_nomination_policy,
promotion_nominations, purchase_prices, purchase_receipts,
purchase_request_status_history, recent_purchase_settings, sale_list_items,
sale_list_versions, sale_lists, sale_price_types, sales_quote_counters,
sales_quote_send_queue, sales_quote_share_logs, sales_reminders, score_snapshots,
settlement_types, shipping_cost_rules, shop_settings, staff_daily_performance_metrics,
stock_alert_requests, stock_movements, stock_transfer_items, stock_transfers, suppliers,
tasks, validation_rules, visitors, warehouse_stock, warehouses, waybill_number_counter,
workflow_settings
```

**نکته:** TRUNCATE در PostgreSQL تابع RLS نیست — هیچ‌جا. آن ۶۴۶ policy که روی این
پایگاه‌داده تعریف شده‌اند، این مسیر را پوشش نمی‌دهند. جدول‌های حساسی که `anon`
می‌تواند خالی کند شامل `persons`، `products`، `audit_logs`، `payment_receipts`،
`journal_entries`، `journal_lines`، `bank_accounts`، `customer_credit_ledger` و
`pricing_recompute_queue` هستند.

---

## Q4 — ساختار واقعی، شیء به شیء

```sql
SELECT t.tbl, t.col,
       CASE WHEN c.column_name IS NULL THEN 'MISSING' ELSE 'EXISTS' END AS status,
       coalesce(c.data_type,'-'), coalesce(c.is_nullable,'-')
  FROM (VALUES ('sales_quotes','accepted_at'),
               ('sales_quotes','canceled_at'),
               ('settlement_types','days')) AS t(tbl,col)
  LEFT JOIN information_schema.columns c
         ON c.table_schema='public' AND c.table_name=t.tbl AND c.column_name=t.col;
```

```
       tbl        |     col     | status  |        data_type         | nullable
------------------+-------------+---------+--------------------------+----------
 sales_quotes     | accepted_at | MISSING | -                        | -
 sales_quotes     | canceled_at | EXISTS  | timestamp with time zone | YES
 settlement_types | days        | EXISTS  | integer                  | NO
```

### تریگر `sales_quotes_validate_status`

```sql
SELECT tgname, tgrelid::regclass, tgenabled, pg_get_triggerdef(oid)
  FROM pg_trigger WHERE NOT tgisinternal AND tgname='sales_quotes_validate_status';
-- (0 rows)
```

با آن نام دقیق تریگری وجود ندارد. ولی جست‌وجوی همهٔ تریگرهای `sales_quotes` نشان داد
معادلش هست، با پیشوند `trg_`:

```
 trg_sales_quotes_validate_status | O | CREATE TRIGGER trg_sales_quotes_validate_status
                                        BEFORE UPDATE ON public.sales_quotes
                                        FOR EACH ROW EXECUTE FUNCTION sales_quotes_validate_status()
```

یعنی `sales_quotes_validate_status` نامِ **تابع** است، نه نام تریگر. تابع هم موجود
است:

```
           proname            | args | prosecdef
------------------------------+------+-----------
 sales_quotes_validate_status |      | t
```

این دقیقاً همان دام تطبیق‌بر‌اساس‌نام است که Q1 دربارهٔ آن هشدار می‌دهد: یک migration
که به‌دنبال تریگری با نام `sales_quotes_validate_status` بگردد، آن را «غایب» می‌بیند و
دوباره می‌سازد — و آن‌وقت دو تریگر با یک منطق روی یک جدول خواهیم داشت.

نُه تریگر روی `sales_quotes` وجود دارد: `trg_asan_burn_sales_quote_number`،
`trg_audit_sales_quotes`، `trg_normalize_phone`، `trg_product_video_chain_on_accept`،
`trg_sales_quotes_assign_number`، `trg_sales_quotes_derive_person`،
`trg_sales_quotes_stock_out`، `trg_sales_quotes_updated_at`،
`trg_sales_quotes_validate_status` — همه با `tgenabled = O` (فعال).

### تابع `update_sales_quote_status`

**موجود است**، `SECURITY DEFINER`:

```
          proname          |                           args                            | prosecdef
---------------------------+-----------------------------------------------------------+-----------
 update_sales_quote_status | p_quote_id uuid, p_next sales_quote_status, p_reason text | t
```

تعریفش کامل استخراج شد. نکات ساختاری مهم در بدنه:

- در ابتدا `IF _uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است.'` — این تابع
  برخلاف شش view بالا، فراخوان ناشناس را رد می‌کند.
- مجوزدهی نقش‌محور: `admin`/`manager` همه‌کاره؛ `accountant` فقط `rejected`؛ `sales`
  فقط روی پیش‌فاکتور خودش و فقط به `draft|sent|rejected|canceled`.
- برای `canceled` و `rejected` دلیل الزامی است.
- برای `accepted` بلوکی با عنوان «requirement 223 — layers 4 and 5» خدمات اجباری
  دسته‌بندی را دوباره اعمال و سپس راستی‌آزمایی می‌کند و در صورت کمبود
  `ERRCODE 23514` می‌دهد؛ سپس یک task در صف `store` می‌سازد (idempotent).
- `sales_quote_status` enum است با مقادیر: `draft, sent, accepted, rejected, canceled`.

### نتیجهٔ Q4

وضعیت **ترکیبی** است و به هیچ «migration N» نگاشت نمی‌شود:

| شیء | وضعیت |
|---|---|
| `sales_quotes.accepted_at` | **غایب** |
| `sales_quotes.canceled_at` | موجود (timestamptz, NULL-پذیر) |
| `settlement_types.days` | موجود (integer, **NOT NULL**) |
| تریگر با نام `sales_quotes_validate_status` | غایب — ولی `trg_sales_quotes_validate_status` موجود و فعال |
| تابع `sales_quotes_validate_status()` | موجود، SECURITY DEFINER |
| تابع `update_sales_quote_status(...)` | موجود، SECURITY DEFINER |

از یک جفت ستون یکی هست و دیگری نیست. تابع هست ولی تریگر با نام مورد انتظار نیست.
`settlement_types.days` هست با اینکه ۴۱۶ در درخت نیست. **schema و فایل‌های migration
واگرا شده‌اند و شواهد ساختاری باید همیشه شیء‌به‌شیء گزارش شود.**

---

## Q5 — آیا اصلاً می‌توان schema دو طرف را مقایسه کرد؟

سرور تست (`192.168.170.8`) از اینجا در دسترس نیست و در حدود این مأموریت هم نبود.
هیچ تلاشی برای رسیدن به آن انجام نشد.

### یک مقایسهٔ معتبر به این‌ها نیاز دارد

1. **یک dump فقط‑schema از هر طرف**، تولیدشده با **نسخهٔ یکسان `pg_dump`** و **پرچم‌های
   یکسان**. خروجی `pg_dump` بین نسخه‌های مختلف مرتب‌سازی و قالب متفاوتی دارد، پس
   نسخهٔ متفاوت تفاوت‌های ساختگی می‌سازد.
2. **حذف نویز محیطی** با `--no-owner --no-privileges`، وگرنه تفاوت مالکیت و ACL
   (که خودشان یافتهٔ جداگانه‌اند) روی تفاوت ساختار سایه می‌اندازند.
3. **محدود کردن به `--schema=public`**، چون schema های `auth` و `storage` را نسخهٔ
   ایمیج Supabase تعیین می‌کند نه migration های این پروژه.
4. **ابزار مقایسه**: `diff -u` روی دو فایل کافی است برای دیدن تفاوت‌ها، ولی برای
   قضاوت باید مرتب باشند — یا از ابزاری مثل `migra` / `apgdiff` استفاده شود که
   خروجی را به‌صورت تفاوت معنایی می‌دهد نه متنی.
5. **مقایسه در جای سومی** انجام شود، نه با انتقال dump تولید به ماشین دیگر. dump
   فقط‑schema داده ندارد ولی نقشهٔ کامل سیستم است.

### دستور فقط‑خواندنی برای این طرف

```bash
docker exec afrakala-lan-db pg_dump -U postgres -d postgres \
  --schema-only --no-owner --no-privileges --schema=public \
  > /tmp/prod-schema-20260831.sql        # خروجی به stdout؛ مقصد را خودتان تعیین کنید
```

**این دستور اجرا نشد**، چون فایل دوم می‌ساخت و مأموریت فقط اجازهٔ نوشتن همین گزارش را
می‌دهد.

### آنچه بدون نوشتن فایل تولید شد — اثر انگشت schema

برای اینکه اعتبار دستور اثبات شود بدون ساختن فایل، خروجی مستقیم به hash داده شد:

```bash
$ docker exec afrakala-lan-db pg_dump --version
pg_dump (PostgreSQL) 15.6
$ docker exec afrakala-lan-db psql -U postgres -d postgres -tAc "SHOW server_version;"
15.6

$ docker exec afrakala-lan-db pg_dump -U postgres -d postgres \
      --schema-only --no-owner --no-privileges --schema=public | md5sum
ff08c58bec3d49b16567b8a929b53ea6

$ ... | wc -c
1846105
```

این اثر انگشت فقط وقتی قابل مقایسه است که طرف مقابل هم `pg_dump 15.6` و دقیقاً همین
پرچم‌ها را داشته باشد.

### مبنای سبک‌تر و مقاوم‌تر برای مقایسه

شمارش اشیاء نسبت به نسخهٔ `pg_dump` حساس نیست و برای «آیا اصلاً نزدیک‌اند؟» بهتر است:

```
     k     | count
-----------+-------
 tables    |   221
 views     |    20
 functions |   823
 triggers  |   256
 enums     |    27
 indexes   |   841
 policies  |   646
```

---

## تأیید نشده

1. **فهرست آن ۲۶ تابع migration 399.** فایل ۳۹۹ روی هیچ‌یک از پنج clone این ماشین
   نیست (یافتهٔ صفر). فقط شش نام از متن مأموریت در دست بود. **چه چیزی این را حل
   می‌کند:** خودِ فایل `..._399_....sql` یا خروجی `git show` آن از مخزن — که نیازمند
   `git fetch` است و در این مأموریت ممنوع بود. بدون آن فهرست، پاسخ «آیا هیچ‌کدام از
   ۲۶ تا overload دارد» ناقص است؛ آنچه توانستم اثبات کنم این است که هیچ‌یک از آن شش
   نام overload ندارد، ولی در کل مجموعهٔ ۳۰۴ تابع SECURITY DEFINER قابل‌اجرا برای
   `anon`، دو نام overload دارند (`has_role`, `has_any_role`).
2. **فهرست هشت‌تایی view های G-1.** فایل‌های ۳۷۰/۳۸۶/۳۸۷/۳۹۵ اینجا نیستند. شش view
   واقعاً در معرض از خود پایگاه‌داده کشف شد. اینکه آن شش دقیقاً زیرمجموعهٔ آن هشت
   باشند تأیید نشد. **چه چیزی این را حل می‌کند:** خواندن آن چهار فایل migration.
3. **بهره‌برداری واقعی از نشتی view ها آزمایش نشد** — عمداً. حکم از امتیازها و
   ارزیابی بولی به‌دست آمد. **چه چیزی این را قطعی‌تر می‌کند:** یک درخواست از بیرون به
   Kong با کلید anon و بدون توکن کاربر — که داده را از پایگاه‌داده خارج می‌کند و
   ممنوع بود.
4. **بهره‌برداری واقعی از TRUNCATE آزمایش نشد** — چون داده را نابود می‌کرد.
5. **منشأ تناقض Q1 با ground truth مشخص نشد.** فقط می‌دانم وضعیت روی *این*
   پایگاه‌داده چیست. **چه چیزی این را حل می‌کند:** اجرای همان کوئری ACL روی سرور تست.
6. **صحت خودِ guard ها برای کاربرانِ احراز‌هویت‌شده بررسی نشد.** فقط رفتارشان برای
   فراخوان ناشناس تعیین شد.
7. **`sales_quotes.accepted_at` غایب است؛ اینکه کدام کد به آن وابسته است بررسی نشد.**

---

## برای بردن نسخهٔ جدید چه چیزی لازم است

به ترتیب، و فقط بر پایهٔ آنچه در این گزارش اثبات شد:

**۱. یک منبع حقیقت برای schema، چون ledger بی‌ارزش است.**
هر ۵۲۳ ردیف ledger یک timestamp واحد دارند؛ ledger یک backfill است و دربارهٔ آنچه
واقعاً اجرا شده هیچ نمی‌گوید. Q4 نشان داد schema و فایل‌ها واگرا شده‌اند:
`settlement_types.days` هست بدون آنکه ۴۱۶ باشد، و `sales_quotes.accepted_at` نیست.
تا وقتی یک dump فقط‑schema از این طرف با یکی از طرف تست مقایسه نشود، هیچ migration ای
نمی‌داند از چه نقطه‌ای شروع می‌کند. دستورش در Q5 آمده.

**۲. هر migration باید بر اساس امضای دقیق تطبیق دهد، نه نام.**
دو شاهد در همین گزارش: `has_role` و `has_any_role` هرکدام دو overload دارند و هر چهار
برای `anon` قابل اجرا هستند؛ و تریگر `trg_sales_quotes_validate_status` اگر با نام
`sales_quotes_validate_status` جست‌وجو شود «غایب» به‌نظر می‌رسد. یک migration که با نام
تطبیق دهد، یا نصف کار را می‌کند یا شیء تکراری می‌سازد.

**۳. فایل migration 399 باید در دسترس این ماشین باشد و بازنویسی شود.**
اینجا نیست، پس نه می‌توان اجرایش کرد و نه assertion هایش را ارزیابی کرد. وقتی هم که
برسد، شرطی که برایش نوشته شده روی این پایگاه‌داده صدق نمی‌کند: آن پنج تابع اینجا
دسترسی PUBLIC ندارند و از قبل قفل‌اند، در حالی که ۳۰۴ تابع SECURITY DEFINER دیگر برای
`anon` باز است. ۳۹۹ برای وضعیتی نوشته شده که وضعیت این سرور نیست.

**۴. نشتی view ها باید قبل از هر کار دیگری تصمیم‌گیری شود.**
شش view با مالک superuserِ دورزنندهٔ RLS، برای `anon` باز، و guard مشترکشان
(`NOT is_viewer_only(auth.uid())`) برای فراخوان ناشناس **پاس می‌شود**. این تنها یافتهٔ
این گزارش است که همین الان داده را از پایگاه‌داده بیرون می‌دهد و نیازی به هیچ اعتباری
ندارد. دو راه ساختاری وجود دارد که هر دو خارج از حدود این مأموریت بودند: افزودن
`security_invoker=true` به آن شش view، یا سخت‌کردن guard به شکلی که NULL را رد کند.

**۵. حفرهٔ TRUNCATE باید به‌صورت گروهی بسته شود، نه جدول‌به‌جدول.**
۲۰۸ جدول از ۲۲۱ در معرض‌اند. هات‌فیکس امروز سه‌تا را بست. ادامهٔ این کار به‌صورت
تک‌تک عملی نیست و به یک تصمیم دربارهٔ کل الگوی grant نیاز دارد.

**۶. صف قیمت باید قبل از هر deploy جدید تعیین‌تکلیف شود.**
`v_pricing_recompute_queue_summary` همین امروز به کاربران واقعی خطای ۵۰۰ می‌دهد.
هر نسخهٔ جدیدی که این صفحه را داشته باشد، همان خطا را خواهد داشت.

**۷. برچسب‌های compose باید یکدست شوند.**
`storage` و `rest` هنوز به مسیر بازنشستهٔ `C:\AfraKalaServer\get-git-going01lan`
اشاره می‌کنند، در حالی که شش سرویس دیگر روی `C:\afrakala` هستند و هر دو زیر یک نام
پروژه. یک `compose` از پوشهٔ اشتباه می‌تواند نیمی از استک را با تعریف دیگری بازسازی
کند.

---

*تمام ادعاهای این گزارش با کوئری و خروجی خام آن همراه‌اند. هیچ نوشتنی روی پایگاه‌داده،
داکر، گیت یا هیچ فایل دیگری انجام نشد. تنها فایل ساخته‌شده همین گزارش است.*
