# ممیزی گرنت‌های `anon` روی شِمای `public`

**تاریخ سنجش:** ۱۴۰۵/۰۶/۰۱ (2026-08-22) — روی سرور تست `192.168.170.8`، پایگاه‌دادهٔ `afrakala`.
**تولید (`192.168.170.10`) لمس نشد.**
**وضعیت این پرونده:** فقط گزارش. **هیچ `REVOKE`ای ندارد، حتی کامنت‌شده.**

این ممیزی خروجی فاز ۳ مأموریت OG-25 است. آن مأموریت شیرِ
`ALTER DEFAULT PRIVILEGES … TO anon` را برای اشیای **آینده** بست و به دستور
صریح مالک هیچ شیء موجودی را باطل نکرد. این پرونده عددهایی را می‌دهد که مالک
برای اندازه‌گیری آن تصمیم بعدی لازم دارد.

---

## ۱. عددهای سرخط

| | |
|---|---|
| اشیایی که `anon` روی آن‌ها گرنتی دارد | **۲۱۶** |
| — جدول با `SELECT` | ۲۰۲ |
| — view با `SELECT` | ۷ |
| — بدون `SELECT`، ولی با امتیاز نوشتن | ۲ (`sale_lists`, `sale_list_items`) |
| — **sequence با `USAGE`** | **۵** |
| اشیایی که `anon` می‌تواند `SELECT` بزند | ۲۰۹ |
| **اشیایی که `anon` واقعاً روی آن‌ها ردیف می‌بیند** | **۵** |
| اشیایی که RLS همه‌چیز را فیلتر می‌کند (صفر ردیف) | ۱۹۸ |
| اشیایی که برای `anon` خطا می‌دهند | ۶ |
| کل جدول‌های `public` | ۲۲۴ |
| کل viewهای `public` | ۲۰ |

**نسبتی که کل تصمیم بر آن سوار است: از ۲۰۹ شیء که `anon` اجازهٔ خواندنشان را
دارد، فقط روی ۵ تا واقعاً چیزی می‌بیند.** یعنی گرنت برای ۲۰۴ شیء لایه‌ای است
که هیچ کاری نمی‌کند، و RLS تنها چیزی است که بار را می‌کشد.

روش سنجش: برای هر شیء، `count(*)` یک‌بار به‌عنوان مالک و یک‌بار با
`SET LOCAL ROLE anon` و `request.jwt.claims = {"role":"anon"}`، همه داخل
`BEGIN … ROLLBACK`.

---

## ۲. ستون تعیین‌کننده: «گرنت‌دار و در دسترس» در برابر «گرنت‌دار و بی‌مصرف»

### ۲.۱ — اشیایی که `anon` واقعاً روی آن‌ها داده می‌بیند (۵)

| شیء | ردیف anon | ردیف مالک | مصرف‌کنندهٔ عمومی | حکم |
|---|---|---|---|---|
| `products` | ۳۵۵ | ۳۵۵ | `/api/public/products` و `public.sale-lists` | **گرنت‌دار و در دسترس — لازم** |
| `brands` | ۴۰ | ۴۰ | `public.sale-lists` | گرنت‌دار و در دسترس |
| `categories` | ۱۲ | ۱۲ | `public.sale-lists` | گرنت‌دار و در دسترس |
| `profile_field_definitions` | ۴ | ۵ | `register.tsx` | **گرنت‌دار و در دسترس — لازم** |
| `v_pricing_recompute_queue_summary` | ۱ | ۱ | هیچ | پوستهٔ تجمیعی، بدون داده |

نکته دربارهٔ ردیف آخر: این یک view تجمیعی است و **همیشه** یک ردیف برمی‌گرداند.
جدول پایه‌اش ۴۱٬۷۹۵ ردیف دارد و RLS همه را فیلتر می‌کند، پس مقادیر صفر
برمی‌گردند. داده‌ای نشت نمی‌کند. (این همان موردی است که در مأموریت G-1 نزدیک
بود اشتباه «نشتی» ثبت شود.)

نکته دربارهٔ `products`: انتشارش عمدی است، با دو سیاست صریح
`products_public_read` (`is_active`) و `public_api_read_active_products`
(`is_active AND stock_status <> 'unavailable'`). نام و SKU عمومی است؛ قیمت نه —
`/api/public/products` قیمت‌ها را صفر می‌دهد و پشت پرچم `PUBLISH_PUBLIC_PRICES`
نگه داشته می‌شود (**OG-29**، باز).

### ۲.۲ — اشیایی که برای `anon` خطا می‌دهند (۶)

گرنت جدول را دارند، ولی چیز دیگری در مسیر سد می‌شود:

```
pricing_rules            42501 permission denied for function has_dynamic_permission
product_computed_prices  42501 permission denied for function has_dynamic_permission
shipping_cost_rules      42501 permission denied for function has_dynamic_permission
sales_quote_send_queue   42501 permission denied for table sales_quotes
sales_quote_share_logs   42501 permission denied for table sales_quotes
vw_purchase_float        42501 permission denied for table purchases
```

این‌ها **سدهای اتفاقی**اند، نه طراحی‌شده — دقیقاً همان الگویی که در G-1 روی
`v_dynamic_*` دیده شد، جایی که ۴۰۱ از نبودِ `EXECUTE` روی یک تابع کمکی می‌آمد
نه از گرنت. اگر ACL آن تابع یا آن جدول پایه روزی عوض شود، این شش‌تا بی‌سروصدا
باز می‌شوند. **برای یک REVOKE دسته‌جمعی این‌ها اولویت‌اند: امروز امن به‌نظر
می‌رسند به دلیلی که هیچ‌کس عمداً انتخاب نکرده.**

### ۲.۳ — ۱۹۸ شیء که RLS نگهشان می‌دارد

گرنت دارند، `anon` صفر ردیف می‌بیند. از این ۱۹۸ تا، **۶۴** تا برای مالک هم
خالی‌اند — یعنی جدول‌های بی‌داده که «صفر ردیف برای anon» دربارهٔ ایمنی‌شان
چیزی ثابت نمی‌کند. اگر روزی داده بگیرند، تنها چیزی که بینشان و یک تماس ناشناس
می‌ایستد سیاست RLSشان است.

### ۲.۴ — اشیایی که از مسیر عمومی خوانده می‌شوند ولی صفر ردیف می‌دهند

پیمایش گذرای importها از هر ۳۱ مسیر خارج از `_app` نشان داد این‌ها از هر
صفحهٔ عمومی (`__root`, `index`, `login`, `register`, `pending-approval`) از
راه `lib/auth/session.ts`، `lib/auth/AuthProvider.tsx` و `lib/rbac/*` لمس
می‌شوند:

```
profiles        user_roles        custom_roles        role_permissions        log_event (rpc)
```

هر پنج‌تا به‌عنوان `anon` صفر ردیف می‌دهند. این‌ها **دادهٔ منتشرشده نیستند، راه‌اندازی
احراز هویت‌اند**. عمداً در مهاجرت‌های ۳۷۴/۳۷۶ گرنت صریح نگرفتند، چون ثبتشان
به‌عنوان «سطح عمومی» نادرست می‌بود. **ولی یک REVOKE دسته‌جمعی باید قبل از دست
زدن به آن‌ها این مسیر را بیازماید** — نه به این دلیل که داده می‌دهند، بلکه چون
از هر بار بارگذاری صفحه فراخوانده می‌شوند و رفتار خطایشان سنجیده نشده.

### ۲.۵ — پنج sequence که در نسخهٔ اول این ممیزی شمرده نشده بودند

> **این بند پس از بازبینی مستقل افزوده شد.** نسخهٔ اول ممیزی فقط `relkind`های
> `r` و `v` را می‌شمرد. `information_schema.role_table_grants` اصلاً sequence
> نمی‌بیند، پس پنج شیء زیر نامرئی مانده بودند — و همان نقطهٔ کوری بود که باعث
> شد عدد «۲۱۶ از ۲۲۴» را «قابل‌آشتی‌نشدنی» ثبت کنم.

```
audit_logs_id_seq            anon=rwU/postgres
bot_api_usage_logs_id_seq    anon=rwU/postgres
employee_score_events_id_seq anon=rwU/postgres
payment_voucher_number_seq   anon=rwU/supabase_admin
score_snapshots_id_seq       anon=rwU/postgres
```

`rwU` یعنی `SELECT`, `UPDATE`, `USAGE`. تنها sequenceی که گرنت ندارد
`platform_release_number_seq` است.

**چرا `UPDATE` روی یک sequence اهمیت دارد:** به دارنده اجازهٔ `setval()` می‌دهد.
یعنی یک تماس ناشناس که به PostgREST برسد در اصل می‌تواند شمارندهٔ
`payment_voucher_number_seq` را جابه‌جا کند. **RLS روی sequenceها اعمال
نمی‌شود** — sequence سیاست ندارد — پس اینجا **گرنت تنها لایه است**، برخلاف
۲۰۲ جدول که RLS پشتشان ایستاده. یک REVOKE دسته‌جمعی باید این پنج‌تا را جدا و
زودتر از بقیه ببیند.

### ۲.۶ — دو مصرف‌کننده که نسخهٔ اول این ممیزی «بدون مصرف‌کننده» فهرست کرده بود

> نیز از بازبینی مستقل. هر دو اکنون در مهاجرت **۳۷۷** با نام مصرف‌کننده ثبت شده‌اند.

| شیء | مصرف‌کنندهٔ واقعی | چرا مهم است |
|---|---|---|
| `shop_settings` | `src/routes/api.healthz.ts` — probe سلامت، با `fetch` دستی و کلید anon | اگر REVOKE شود: probe ۴۰۱، `state: "down"`، HTTP ۵۰۳، و healthcheck هر کانتینر وب روی دستگاه را ری‌استارت می‌کند |
| `recent_purchase_settings` | از راه `get_recent_purchase_label*` که `SECURITY DEFINER` است | فقط از زمینهٔ تعریف‌کننده در دسترس است. آن تابع زمان آخرین خرید را به تماس ناشناس می‌دهد در حالی که `purchases` برای همان تماس ۴۰۱ است — **OG-33** |

---

## ۳. کلاس G-2 — جایی که RLS تنها چیزی است که رد می‌کند

این همان یافتهٔ G-2 از بازبینی Gate A است، حالا با عدد.

**هر ۲۰۲ جدولی که `anon` می‌تواند `SELECT` بزند، RLS روشن دارند.**

```
tables with RLS on   : 202
tables with RLS OFF  : 0
tables FORCED        : 0
```

خبر خوب: هیچ جدولی نیست که `anon` گرنت داشته باشد و RLS خاموش باشد. یعنی امروز
افشای مستقیمی وجود ندارد.

خبر بدی که باید کنارش گذاشت: **هیچ‌کدام `FORCE ROW LEVEL SECURITY` ندارند.**
RLS برای مالک جدول اعمال نمی‌شود مگر FORCE باشد — که دقیقاً همان مکانیزمی است
که G-1 را ممکن کرد. و برای ۲۰۲ جدول از ۲۰۲ جدول، لایهٔ گرنت هیچ کاری نمی‌کند:
اگر RLS روی یکی از آن‌ها غیرفعال شود یا سیاستی اشتباه نوشته شود، هیچ لایهٔ دومی
وجود ندارد.

---

## ۴. کلاس G-1 — viewهای `SECURITY DEFINER`

`SECURITY DEFINER` پیش‌فرض PostgreSQL برای view است. چنین viewی RLS جدول پایه
را کاملاً دور می‌زند، چون با حقوق مالک اجرا می‌شود.

**۸ از ۲۰ view در `public` هنوز `SECURITY DEFINER` هستند.**

| view | anon SELECT | کلاس نگهبان G-1؟ |
|---|---|---|
| `api_product_price_rows` | خیر | خیر |
| `api_products_pricing` | خیر | خیر |
| `publish_recipients_view` | خیر | بله |
| `v_dynamic_customer_capital_balances` | خیر | بله |
| `v_dynamic_salesperson_capital_balances` | خیر | بله |
| `vw_account_balances` | خیر | بله |
| `vw_customer_receivables` | خیر | بله |
| `vw_supplier_payables` | خیر | بله |

از هشت viewی که G-1 پیدا کرد، **دو تا** با مهاجرت ۳۷۰ به `security_invoker`
تبدیل شدند (`product_computed_prices_public` و `v_promotion_suggestions` — تنها
دو موردی که سنجش ثابت کرد هیچ خوانندهٔ واردشده‌ای را نمی‌شکنند) و **شش تا
همچنان `SECURITY DEFINER` هستند**. هیچ‌کدام از آن شش‌تا دیگر گرنت `anon` ندارند،
پس G-1 بسته است — ولی سازوکاری که G-1 را ممکن کرد هنوز سر جایش است.

هفت viewی که هنوز گرنت `anon` دارند **همگی** `security_invoker=true` هستند، یعنی
RLS جدول پایه برایشان اعمال می‌شود:

```
academy_quiz_questions_public   effective_currencies_view   employee_monthly_hours
v_latest_active_purchase_prices  v_league_tiers_public       v_pricing_recompute_queue_summary
vw_purchase_float
```

---

## ۵. آنچه یک REVOKE دسته‌جمعی باید در نظر بگیرد

این بخش برای این نوشته شده که مالک بتواند اندازهٔ آن تصمیم را بدون سنجش دوباره
برآورد کند. هیچ توصیه‌ای اینجا نیست؛ فقط آنچه باید حساب شود.

1. **دامنه.** ۲۱۶ شیء گرنت `anon` دارند (۲۰۴ جدول، ۷ view، ۵ sequence). باطل‌کردن همه‌شان روی ۵ شیء اثر
   قابل‌مشاهده می‌گذارد؛ ۲۰۴ تای دیگر امروز هیچ داده‌ای نمی‌دهند.

2. **فهرست نگه‌داشتنی‌ها امروز پنج‌تاست.** `products`, `brands`, `categories`,
   `sale_price_types`, `profile_field_definitions` — به‌علاوهٔ `EXECUTE` روی
   `refresh_sale_list_prices`. مهاجرت‌های ۳۷۴ و ۳۷۶ همین‌ها را با نام
   مصرف‌کننده ثبت کرده‌اند، پس این فهرست دیگر لازم نیست حدس زده شود.

3. **`sale_price_types` نگه‌داشتنی است ولی امروز صفر ردیف می‌دهد.** RLS آن
   (`sale_price_types_auth_read` فقط `{authenticated}`) هر ردیف را از `anon`
   می‌گیرد. گرنت لازم است ولی کافی نیست — ببینید Owner-Gate پایین.

4. **پنج شیء راه‌اندازی احراز هویت** (`profiles`, `user_roles`, `custom_roles`,
   `role_permissions`, `log_event`) از هر صفحهٔ عمومی لمس می‌شوند و صفر ردیف
   می‌دهند. رفتارشان پس از REVOKE سنجیده **نشده**. این ریسک‌دارترین بخش یک
   REVOKE دسته‌جمعی است، چون از هر بار بارگذاری صفحه رد می‌شود.

5. **شش شیء با سد اتفاقی** (بند ۲.۲) امروز امن‌اند به دلیلی که کسی انتخاب نکرده.
   REVOKE آن‌ها را واقعاً امن می‌کند، ولی اگر ترتیب اشتباه باشد ممکن است چیزی
   را که سد اتفاقی پنهانش کرده بود آشکار کند.

6. **دو شیء با امتیاز نوشتن ولی بدون `SELECT`** — `sale_lists` و
   `sale_list_items` — امروز به `anon` اجازهٔ `DELETE`, `INSERT`, `UPDATE`,
   `TRUNCATE` می‌دهند و اجازهٔ `SELECT` نمی‌دهند. فقط RLS جلوی نوشتن را می‌گیرد.
   این عجیب‌ترین حالت ACL در کل شِماست و احتمالاً کسی نیمی از یک REVOKE را
   انجام داده.

7. **۶۴ جدول برای مالک هم خالی‌اند.** «صفر ردیف برای anon» دربارهٔ آن‌ها چیزی
   ثابت نمی‌کند. اگر داده بگیرند، فقط RLSشان می‌ماند.

8. **هیچ جدولی `FORCE ROW LEVEL SECURITY` ندارد** (بند ۳). این مستقل از REVOKE
   است و مسئلهٔ جداگانه‌ای است.

9. **شیر بسته است ولی اشیای موجود قدیمی‌اند.** پس از مهاجرت ۳۷۳، هر شیء تازه‌ای
   بدون گرنت `anon` متولد می‌شود. یعنی این ۲۱۶ عدد **دیگر رشد نمی‌کند** — یک
   مجموعهٔ بسته است، نه یک هدف متحرک. این کار REVOKE بعدی را ساده‌تر می‌کند.

---

## ۶. پیوست — ۲۰۲ جدولی که `anon` می‌تواند بخواند

```
  academy_courses                       academy_lessons                       academy_quiz_attempts                 academy_quiz_questions
  academy_quizzes                       academy_user_progress                 achievements                          ai_conversations
  ai_generated_content                  ai_provider_health                    ai_providers                          ai_usage_routes
  appeal_reviewers                      asan_control_accounts                 asan_export_numbers                   asan_import_batches
  asan_import_person_rows               asan_import_product_rows              audit_logs                            automation_artifacts
  automation_checkpoints                automation_driver_outputs             automation_job_runs                   automation_jobs
  automation_log_events                 automation_modules                    automation_worker_heartbeats          automation_workers
  bank_accounts                         bot_api_key_audit_log                 bot_api_key_label_access              bot_api_key_table_access
  bot_api_keys                          bot_api_usage_logs                    brands                                call_logs
  capital_allocation_ledger             categories                            category_product_attributes           credit_requests
  credit_score_snapshots                credit_scoring_rules                  currencies                            currency_rate_fetches
  currency_rates                        currency_sources                      custom_roles                          customer_credit_balance
  customer_credit_ledger                customer_credit_profile               customers                             daily_mood_entries
  daily_mood_hafez_poems                daily_mood_questions                  daily_mood_scenarios                  dashboard_ticker_events
  delivery_receipt_status_history       delivery_receipts                     didar_activities                      didar_import_log
  document_attachments                  document_numbers                      document_status_history               documents
  dual_documents                        dynamic_entity_scores                 dynamic_parameter_weights             dynamic_parameter_weights_backup_142
  dynamic_parameter_weights_backup_20260722dynamic_scoring_parameters            dynamic_table_cells                   dynamic_table_columns
  dynamic_table_row_counters            dynamic_table_rows                    dynamic_tables                        employee_achievements
  employee_leagues                      employee_level_up_events              employee_mission_progress             employee_profiles
  employee_progress                     employee_score_events                 employee_scores                       employee_streaks
  external_parties                      feedback                              feedback_items                        gamification_kpi_rules
  gamification_kpis                     gamification_rewards                  inquiries                             inquiry_price_cache
  inquiry_replies                       inquiry_status_history                inquiry_transfers                     invoice_workflow_stages
  journal_entries                       journal_lines                         knowledge_articles                    knowledge_confirmations
  knowledge_document_chunks             knowledge_documents                   knowledge_documents_backup_20260722   league_seasons
  league_settings                       market_indicators                     market_product_match_events           market_product_matches
  market_rate_ingestion_runs            market_rate_source_mappings           market_rate_sources                   market_rate_ticks
  marketing_channels                    message_embeddings                    messages                              messenger_attachments
  messenger_group_members               messenger_groups                      messenger_messages                    messenger_read_receipts
  missions                              notification_events                   notification_queue                    payment_receipt_custom_fields
  payment_receipt_documents             payment_receipt_links                 payment_receipts                      payment_receipts_backup_20260722
  payment_terms                         payment_vouchers                      penalty_appeals                       performance_penalties
  person_context_links                  person_field_definitions              person_field_values                   person_identifiers
  person_merge_candidates               person_merge_log                      persons                               phone_collisions
  presence_logs                         price_alert_notifications             price_alert_rules                     price_calculation_snapshots
  price_change_reasons                  price_list_items                      price_lists                           pricing_board_access_requests
  pricing_board_settings                pricing_board_viewer_sessions         pricing_recompute_queue               pricing_rules
  product_attribute_groups              product_attributes                    product_category_attribute_values     product_computed_prices
  product_images                        product_interaction_events            product_label_links                   product_labels
  product_owner_assignments             product_recommendation_overrides      product_sale_price_history            product_sku_counters
  product_suppliers                     product_video_chain                   product_video_chain_events            products
  profile_field_definitions             profile_field_values                  profiles                              promotion_nomination_policy
  promotion_nominations                 purchase_prices                       purchase_receipts                     purchase_request_status_history
  recent_purchase_settings              role_permissions                      sale_list_versions                    sale_price_types
  sales_quote_counters                  sales_quote_send_queue                sales_quote_share_logs                sales_reminders
  score_snapshots                       settlement_types                      shipping_cost_rules                   shop_settings
  staff_daily_performance_metrics       stock_alert_requests                  stock_movements                       stock_transfer_items
  stock_transfers                       suppliers                             tasks                                 user_roles
  validation_rules                      visitors                              warehouse_stock                       warehouses
  waybill_number_counter                workflow_settings
```

۵ شیءِ بند ۲.۱ و ۶ شیءِ بند ۲.۲ در همین فهرست‌اند.
هفت view دارای گرنت در بند ۴ فهرست شده‌اند و اینجا تکرار نشده‌اند.
