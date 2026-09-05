# گزارش بررسی شکاف تولید و شاخه توسعه

تاریخ بررسی: 2026-08-10  
دامنه: کاملاً فقط‌خواندنی؛ تنها فایل نوشته‌شده همین گزارش است.  
مراجع: main = cb7c070f60f368a88313d990155d6bf3deebe9e6 و origin/feature/navigation-modernization = 9e79b3ee867a7a04361b71258071aea7bad15aea.

نکته: شاخه feature محلی وجود ندارد و مرجع موجود remote-tracking است. هیچ fetch، pull، checkout یا تغییر ref انجام نشد.

## ۱ — تصویر کلی شکاف

خروجی زنده git rev-list --left-right --count برابر 0 2332 است: feature دقیقاً ۲٬۳۳۲ commit جلو و main صفر commit اختصاصی دارد. این با برآورد مأموریت (۱٬۶۴۵) متفاوت است.

- قدیمی‌ترین commit: c850cd668b81733ae0f014c3006126e333eff16b، 2026-05-27T06:52:51+03:30.
- جدیدترین commit: 9e79b3ee867a7a04361b71258071aea7bad15aea، 2026-08-10T16:11:35+05:00.
- ۱٬۷۸۳ فایل تغییر کرده؛ ۳۴۵٬۳۷۷ insertion و ۱۹٬۳۰۲ deletion.
- migrationهای main: ۲۲۳؛ feature: ۵۲۲؛ افزوده خالص: ۲۹۹.

تفکیک تقریبی subjectها: feat=208، fix=56، docs=359، test=32، refactor=3، chore/build/ci=57 و 1,617 عنوان غیراستاندارد. 125 عنوان صریحاً migration/db/schema/RLS/RPC دارند. به علت انبوه عنوان‌های «Changes/Work in progress»، این آمار فقط تقریبی است.

## ۲ — Migrationها

روش: SQL هر ۲۹۹ فایل با git show خوانده شد. DML داخل تعریف function/procedure اجرای زمان migration نیست؛ DML سطح فایل/DO block معیار است.

- دسته الف: ۲۳۵ فایل، بدون DML سطح migration.
- دسته ب: ۱۲ فایل، فقط DML سطح migration.
- دسته ج: ۵۲ فایل، DDL و DML سطح migration.

الف الزاماً بی‌خطر نیست؛ DROP/ALTER/constraint نیز ممکن است مخرب باشد.

| # | فایل migration | دسته | DML سطح migration / داده هدف |
|---:|---|:---:|---|
| 1 | 20260608074437_f083f980-caa6-4216-b802-1ccf77e2c3c8.sql | الف | — |
| 2 | 20260608091000_phase1_automation_driver_outputs.sql | الف | — |
| 3 | 20260610070014_5fb492d4-ceb0-4f9e-babe-a037c0a321a4.sql | ج | INSERT INTO public.profiles؛ INSERT INTO public.audit_logs |
| 4 | 20260610081305_dfc40263-399d-4b55-b9fa-c279baef47b5.sql | الف | — |
| 5 | 20260610082452_5ef0c5f0-35fe-42aa-a027-0424884f6ab0.sql | الف | — |
| 6 | 20260610101847_c0be9a2e-a367-454c-952c-3ef27e4bff7c.sql | الف | — |
| 7 | 20260613090000_phase2_torob_automation_queue_gate.sql | ج | INSERT INTO public.automation_modules |
| 8 | 20260613123000_phase2_automation_driver_outputs_phase_label.sql | الف | — |
| 9 | 20260615065224_4f833d42-0d4a-40fa-a908-bf37cb560dbd.sql | الف | — |
| 10 | 20260615070932_973c9ead-45fb-47e6-a6a9-fe98c69e572a.sql | الف | — |
| 11 | 20260615080500_afk_g2_028_tokenized_product_search.sql | الف | — |
| 12 | 20260615101000_phase3_automation_driver_outputs_phase_label.sql | الف | — |
| 13 | 20260615130747_ab9a3b13-6279-4d6a-af93-669b18528b02.sql | الف | — |
| 14 | 20260616070854_fc55e9cc-1302-4801-b639-0ffc3a795983.sql | الف | — |
| 15 | 20260616090000_afk_g3_004_trusted_credit_customers.sql | الف | — |
| 16 | 20260616102000_afk_g3_013_preinvoice_workflow_tasks.sql | الف | — |
| 17 | 20260616113000_afk_g3_012_fix_overdue_customer_id_ambiguity.sql | الف | — |
| 18 | 20260616113206_5c4e5251-101e-48cd-9df5-39b74d3172aa.sql | الف | — |
| 19 | 20260616120931_15b7b645-2de9-40dc-b4e1-a555d1d36946.sql | الف | — |
| 20 | 20260616123000_afk_g3_012_fix_invoice_overdue_rpc_alias.sql | الف | — |
| 21 | 20260616143000_add_daily_weighted_promotion_rotation.sql | الف | — |
| 22 | 20260616170000_afk_g3_014_task_kpi_analytics.sql | الف | — |
| 23 | 20260617052612_sf_1_c4_revoke_authenticated_update_sales_quotes.sql | الف | — |
| 24 | 20260617105834_promotion_daily_rotation.sql | الف | — |
| 25 | 20260624104300_457106f3-277d-4736-a4c3-c512b7f772d0.sql | الف | — |
| 26 | 20260624104327_6215d165-450b-46a5-bd79-0696cc6299b2.sql | الف | — |
| 27 | 20260624105148_064aedb9-91b6-4df1-a2e0-a80ccd01d239.sql | الف | — |
| 28 | 20260624111051_55855031-79c8-4d8e-b924-7cc0af0d4ecb.sql | الف | — |
| 29 | 20260624121249_e52c989b-04e1-4dac-ba4b-76354dc4d05d.sql | الف | — |
| 30 | 20260624124802_a99251da-4298-471b-9936-b4ea7606b2a1.sql | الف | — |
| 31 | 20260624141510_8bceb89c-8ae9-4c75-88f9-3c1d4a8d65ce.sql | الف | — |
| 32 | 20260625010705_7dac7f74-e617-4197-8ecd-da73467a6fba.sql | الف | — |
| 33 | 20260625014207_da0fc955-3bb5-4044-a7f0-d192a27b54ce.sql | الف | — |
| 34 | 20260625014241_4d30ae45-313d-4c00-8e10-3b55b2687e6f.sql | الف | — |
| 35 | 20260625021232_64c09e8b-cb88-45b4-b181-64f0de6414ef.sql | الف | — |
| 36 | 20260625021259_f8cb94ce-5a0a-4902-8314-6c1507e4f597.sql | الف | — |
| 37 | 20260625031700_692a2321-cc74-43c1-889a-9e8354feb5e8.sql | ج | INSERT INTO public.workflow_settings |
| 38 | 20260625033526_f13a673d-24d4-49c1-93bc-fc8bc40b5adc.sql | الف | — |
| 39 | 20260625045136_679bc284-705f-46b2-af43-85bcc8d86785.sql | الف | — |
| 40 | 20260625072325_0b5157f5-ee2c-4f52-aaac-d27b3a36e808.sql | الف | — |
| 41 | 20260625073354_e49bb411-5e71-4f2a-b885-9e4dfe9d8ae6.sql | الف | — |
| 42 | 20260625084041_915afee0-3526-4a05-84ab-f67ae2c2c0bb.sql | الف | — |
| 43 | 20260626081718_549e4252-287f-4783-91ad-e3cc2026241a.sql | الف | — |
| 44 | 20260626082118_1fb37b74-23f9-4768-b9fa-9966b2bba475.sql | الف | — |
| 45 | 20260626082534_f95221d8-2e8c-4c40-acd3-4395a4077d31.sql | الف | — |
| 46 | 20260626083132_bb3da1f2-459e-4fde-a0c9-07f7c34097f6.sql | الف | — |
| 47 | 20260626083253_7925f074-d3bb-4057-950f-9e410d6689a3.sql | الف | — |
| 48 | 20260626083408_d48f10f2-a148-47c9-976c-2c4acaa73193.sql | الف | — |
| 49 | 20260626083725_56864dba-2c9b-4edf-abd8-bec94a596520.sql | الف | — |
| 50 | 20260626085149_b2c3f7cc-8dfc-46a0-a163-44a98d865861.sql | الف | — |
| 51 | 20260626085400_ee12b526-6744-4d44-b37e-b7948dc53d0f.sql | الف | — |
| 52 | 20260626085857_ed9a5d87-ad31-41ad-8f37-74646327eb87.sql | ج | INSERT INTO public.shop_settings |
| 53 | 20260626141801_bbced51d-fa03-4344-aed6-4c821cfe3970.sql | الف | — |
| 54 | 20260626141822_ead1a634-6c7a-42d4-952e-7e896630e280.sql | الف | — |
| 55 | 20260626142302_0e2e9c7f-5b91-41db-b59d-db4e3753cfe5.sql | الف | — |
| 56 | 20260626145739_3a47c1a2-9f4f-4d79-9ad6-c7de6ff90da1.sql | الف | — |
| 57 | 20260626150154_9864e1d5-fbe5-486f-b40d-651a2019f12a.sql | الف | — |
| 58 | 20260626150551_992db441-dd53-49c9-8c55-a702884e5197.sql | الف | — |
| 59 | 20260628150706_24522f7a-107d-426e-a2f2-d5a18eef0956.sql | الف | — |
| 60 | 20260628152124_7f20ac8d-9223-47e6-b99d-d37fcd29b9b1.sql | الف | — |
| 61 | 20260628152240_c38759fb-bd55-40b6-9ec6-dfc3f2cccb9b.sql | الف | — |
| 62 | 20260628152353_593af746-6a62-44c8-82c5-808e4e3abd27.sql | الف | — |
| 63 | 20260628152557_e5b2090b-408f-4637-97c0-82ae2ad10d7e.sql | الف | — |
| 64 | 20260630153730_e9245bc6-41f4-4666-9cb4-d8c4f5f99943.sql | الف | — |
| 65 | 20260630154342_fd2f77bf-255e-4c62-b499-8d98768571f8.sql | الف | — |
| 66 | 20260630161610_658b1124-c26a-4061-a11b-002487d7f54b.sql | الف | — |
| 67 | 20260630162146_4c2c624d-d76f-4f6f-8bef-37f4573044e8.sql | الف | — |
| 68 | 20260630164949_7a46d8b4-dc71-45b1-b494-796038912d7f.sql | الف | — |
| 69 | 20260630170433_4df3fd6c-e732-478f-9004-54339719bae5.sql | الف | — |
| 70 | 20260630171113_7f6bbb34-3d4d-4a39-9948-2fadd8ede49b.sql | الف | — |
| 71 | 20260630190509_eff31b1a-e98c-4e4b-ad4b-9b7a9ada8d0c.sql | ج | INSERT INTO public.pricing_rules؛ INSERT INTO public.shop_settings |
| 72 | 20260701131009_04e38255-d735-4135-b69d-2930eadb4f30.sql | الف | — |
| 73 | 20260701131755_b873adb2-96b5-4234-8c75-e58c0f4cbe1e.sql | الف | — |
| 74 | 20260701134828_b1042fa4-cc4f-4dd7-8cde-6bf02c3c303c.sql | الف | — |
| 75 | 20260701143759_82f2784c-579a-41b8-ba51-e31be06a89fa.sql | الف | — |
| 76 | 20260701144445_05fdda28-2706-44a1-bed2-6139ff5b11f3.sql | الف | — |
| 77 | 20260701163134_a3cfb24b-e9ff-4663-8cdb-97c24938a793.sql | الف | — |
| 78 | 20260701163903_72e524ea-2751-40a8-9699-2d132352914e.sql | الف | — |
| 79 | 20260702085512_43949939-6351-4bc3-9faa-c667e8e0dba1.sql | الف | — |
| 80 | 20260702091255_58a274bb-6026-444d-87fe-3a5ffb9407c2.sql | الف | — |
| 81 | 20260703042200_860f244e-f454-4c0f-96e6-3e3eb1766017.sql | ب | DELETE FROM public.daily_capital_settings |
| 82 | 20260703060737_86f61bcc-4a5b-450d-9c57-ff3eb528f513.sql | ج | DELETE FROM public.dynamic_scoring_parameters؛ INSERT INTO public.dynamic_scoring_parameters؛ INSERT INTO public.dynamic_parameter_weights |
| 83 | 20260703062127_dc4bdb0a-b119-4617-aabf-c49102d6f195.sql | الف | — |
| 84 | 20260703104944_d7e183ee-1101-4fd0-acae-3eae3bdb3bae.sql | الف | — |
| 85 | 20260703153337_f401c5f0-f8e3-4a87-976a-0087e8d13a23.sql | الف | — |
| 86 | 20260704112015_cd3cae42-509d-4d21-ab8d-a2e993648c30.sql | الف | — |
| 87 | 20260704112140_0c497f29-6b98-4146-9136-2eef3bae03f4.sql | الف | — |
| 88 | 20260704133438_2cc1a3d9-fba9-4089-a9cb-afdbff93ab2b.sql | الف | — |
| 89 | 20260704161735_c261578a-4412-4cd3-8fdf-f4828a69fed6.sql | الف | — |
| 90 | 20260704181332_511770d4-ccad-43b5-9056-ce96816504ff.sql | الف | — |
| 91 | 20260704201224_5b27aa49-2ffa-464d-b683-f4b1d0852730.sql | الف | — |
| 92 | 20260705022529_e3b5433c-e152-4ebe-8265-d719d6e7fb85.sql | الف | — |
| 93 | 20260711162316_412d3a92-b0d8-4889-9eb8-bd1b4a7b1deb.sql | الف | — |
| 94 | 20260712090916_23e74c80-1759-408c-adbc-7cfa67960120.sql | الف | — |
| 95 | 20260712091446_6091ceac-42c8-468e-b2d5-ab10daa71586.sql | الف | — |
| 96 | 20260712091711_16e75a66-0cca-41a4-a97e-d660ebacb2f4.sql | الف | — |
| 97 | 20260712120000_create_missing_storage_buckets.sql | ب | INSERT INTO storage.buckets |
| 98 | 20260715084810_36239494-f925-475d-8378-92cd52e33c58.sql | الف | — |
| 99 | 20260715085412_286dc4af-8ac2-445e-a606-ea46f150ded9.sql | الف | — |
| 100 | 20260715091458_6aa3444f-90ae-44c3-9910-4d6268387925.sql | الف | — |
| 101 | 20260715091854_a1893b58-c2be-4f90-84c4-e7e44b2a5e8b.sql | الف | — |
| 102 | 20260715094331_c2fb7033-4409-4ad6-995b-ea3732c1b1da.sql | الف | — |
| 103 | 20260715095203_2f6ef353-1707-4a9a-b21e-6fbcf54ed4ce.sql | الف | — |
| 104 | 20260715095831_723a774b-22c7-4361-9648-4b7a6c79d9b5.sql | الف | — |
| 105 | 20260715100517_67b64369-3784-4895-8f29-06638566a711.sql | الف | — |
| 106 | 20260715103419_46b08028-f09f-4369-8682-cac8cda80d4c.sql | الف | — |
| 107 | 20260715104735_2e648ed0-d0ca-4467-b863-f6ab8ae685c9.sql | الف | — |
| 108 | 20260715110933_5c93650f-f825-420e-8db9-c0a7e3d73bc1.sql | الف | — |
| 109 | 20260715111716_30c73bc3-41f4-424a-9182-375497d9aec0.sql | الف | — |
| 110 | 20260715114218_d5e29ec2-bcb6-4d41-8b49-14ed13e9678d.sql | الف | — |
| 111 | 20260715123708_0ec65799-378c-4e1e-9311-df3de64f0c4c.sql | الف | — |
| 112 | 20260715124453_8b172d85-2dde-4a4f-9f41-a0472600c82f.sql | الف | — |
| 113 | 20260716161316_0d735265-e7a7-4ea7-bc61-991751936b40.sql | الف | — |
| 114 | 20260716161317_dba1_interaction_events_session_and_event_type.sql | الف | — |
| 115 | 20260716161500_dba2_unify_mi_weights.sql | الف | — |
| 116 | 20260716161700_124_sales_search_all_active_price_types.sql | الف | — |
| 117 | 20260716162000_126_notify_accountants_sale_price_change.sql | الف | — |
| 118 | 20260716162300_128_sales_reminders.sql | ج | INSERT INTO public.sales_reminders |
| 119 | 20260716162600_dbc_promotion_nominations.sql | ج | INSERT INTO public.promotion_nomination_policy |
| 120 | 20260716162900_dbd_promotion_nomination_rpcs.sql | الف | — |
| 121 | 20260718083808_5cf2dec7-e328-4040-9ef9-aeee5d68b2ba.sql | ج | INSERT INTO public.custom_roles |
| 122 | 20260718093858_fb940e5c-1b88-45a6-bda8-ff51e1e0d15f.sql | ج | UPDATE public.inquiry_price_cache |
| 123 | 20260718095035_b4c60bc0-ad9c-491d-9792-f7ca9d21d09c.sql | الف | — |
| 124 | 20260718194029_settlement_dimension_computed_prices.sql | الف | — |
| 125 | 20260718194633_settlement_baseline_view_filter.sql | الف | — |
| 126 | 20260718195703_sales_search_per_settlement_prices.sql | الف | — |
| 127 | 20260719120000_rls_permissive_select_fix.sql | الف | — |
| 128 | 20260719130000_quote_price_bounds_validation.sql | الف | — |
| 129 | 20260719140000_sale_lists_pdf_column_widths.sql | الف | — |
| 130 | 20260720100000_fix_update_sales_quote_status_text_cast.sql | الف | — |
| 131 | 20260720110000_credit_customers_search_by_accounting_code.sql | الف | — |
| 132 | 20260720120000_phase_e_payment_discipline_score100.sql | ج | UPDATE public.dynamic_scoring_parameters؛ UPDATE public.dynamic_entity_scores |
| 133 | 20260720130000_product_view_counts_7d.sql | الف | — |
| 134 | 20260721100000_phase_j_quote_settlement_floor.sql | الف | — |
| 135 | 20260722111653_130_sales_search_stock_sort.sql | الف | — |
| 136 | 20260722140000_134_receipt_type_four_values.sql | ج | UPDATE public.payment_receipts |
| 137 | 20260722150000_135_invoice_accounting_markers.sql | الف | — |
| 138 | 20260722160000_135a_scope_invoice_gamification_trigger.sql | الف | — |
| 139 | 20260722170000_141_capital_allocation_balances_view.sql | الف | — |
| 140 | 20260722180000_141_2_seed_salesperson_scoring_params.sql | ج | INSERT INTO public.dynamic_scoring_parameters؛ INSERT INTO public.dynamic_parameter_weights |
| 141 | 20260722190000_141_3_dynamic_capital_balance_views.sql | الف | — |
| 142 | 20260722200000_132_1_staff_daily_performance_metrics.sql | الف | — |
| 143 | 20260722230000_142_fix_weight_validity_month_start.sql | ج | DELETE FROM public.dynamic_parameter_weights؛ UPDATE public.dynamic_parameter_weights |
| 144 | 20260722235000_143_remove_corrupted_seeded_knowledge_documents.sql | ج | DELETE FROM public.knowledge_documents |
| 145 | 20260723121101_146_gamification_sales_source_switch.sql | ج | INSERT INTO public.shop_settings |
| 146 | 20260723130000_147_quote_accounting_markers.sql | الف | — |
| 147 | 20260723170000_147_link_sales_quotes_to_customers.sql | ج | UPDATE public.sales_quotes |
| 148 | 20260723170500_sales_quote_rpc_customer_id.sql | الف | — |
| 149 | 20260724080000_148_receipt_links_to_quotes_write_path.sql | الف | — |
| 150 | 20260724090000_149_repair_receipt_posting_model_b.sql | الف | — |
| 151 | 20260724100000_150_collected_from_quote_receipts.sql | الف | — |
| 152 | 20260724110000_151_credit_and_receivables_from_quotes.sql | الف | — |
| 153 | 20260724120000_152_enforce_allocation_limits.sql | الف | — |
| 154 | 20260724130000_153_ai_providers_and_key_vault.sql | ج | INSERT INTO public.ai_providers |
| 155 | 20260724140000_154_knowledge_chunks_rag.sql | الف | — |
| 156 | 20260724150000_155_bank_accounting_code.sql | ج | UPDATE public.payment_receipts؛ UPDATE public.invoices؛ INSERT INTO public.journal_entries؛ INSERT INTO public.journal_lines؛ UPDATE public.journal_entries |
| 157 | 20260725100000_201_phase1_config_activation.sql | ب | UPDATE public.role_permissions؛ UPDATE public.gamification_kpis؛ UPDATE public.promotion_nomination_policy |
| 158 | 20260726090000_202_phase2_currency_toman.sql | الف | — |
| 159 | 20260726100000_203_phase3_aging_buckets.sql | الف | — |
| 160 | 20260726101000_204_phase3_aging_lists.sql | الف | — |
| 161 | 20260726110000_205_phase6_cheque_receive_side.sql | الف | — |
| 162 | 20260726120000_206_phase6_quote_rejections.sql | الف | — |
| 163 | 20260726130000_207_phase7_marketing.sql | ج | INSERT INTO public.gamification_kpi_rules؛ INSERT INTO public.gamification_kpis |
| 164 | 20260726131000_208_phase7_promotion_kpi_score.sql | الف | — |
| 165 | 20260726140000_209_phase8_1_warehouse_tables.sql | ج | INSERT INTO public.role_permissions |
| 166 | 20260726141000_210_phase8_2_5_stock_engine.sql | الف | — |
| 167 | 20260726142000_211_phase8_5_fix_stock_notify.sql | الف | — |
| 168 | 20260726150000_212_phase9_1_payment_vouchers.sql | الف | — |
| 169 | 20260726151000_213_phase9_2_4_treasury.sql | الف | — |
| 170 | 20260726200000_214_fix_payment_terms_encoding.sql | ب | UPDATE public.payment_terms؛ INSERT INTO public.payment_terms |
| 171 | 20260728190000_215_fix_price_notify_app_role_cast.sql | الف | — |
| 172 | 20260728190500_216_fix_notification_queue_type_check.sql | الف | — |
| 173 | 20260728191000_217_product_images_storage_select.sql | الف | — |
| 174 | 20260728191500_218_product_image_primary.sql | الف | — |
| 175 | 20260728192000_219_purchase_requests_requester_update.sql | الف | — |
| 176 | 20260728200000_220_repair_corrupted_persian_function_texts.sql | الف | — |
| 177 | 20260728201000_221_quote_reject_reason.sql | الف | — |
| 178 | 20260728202000_222_quote_below_list_ack_and_credit_deposit.sql | الف | — |
| 179 | 20260728203000_223_visitors.sql | الف | — |
| 180 | 20260729120000_ai_usage_routes.sql | ج | INSERT INTO public.ai_usage_routes |
| 181 | 20260729143000_224_quote_rejection_notification.sql | الف | — |
| 182 | 20260729170000_212_quote_credit_commitment_and_stock_guard.sql | الف | — |
| 183 | 20260729190000_213_refresh_dynamic_capital_after_score_change.sql | الف | — |
| 184 | 20260729193000_218_mobile_bank_screenshot_receipt.sql | الف | — |
| 185 | 20260729200000_215_allow_quote_creation_without_stock.sql | الف | — |
| 186 | 20260730150500_211_fix_quote_rejection_notification_reference_uuid.sql | الف | — |
| 187 | 20260730154500_211_fix_my_rejected_quotes_rpc.sql | الف | — |
| 188 | 20260730172000_212_fix_quote_exception_null_bypass.sql | الف | — |
| 189 | 20260730190000_213_fix_dynamic_score_validation_rls.sql | الف | — |
| 190 | 20260730193000_213_fix_dynamic_capital_recompute_safeupdate.sql | الف | — |
| 191 | 20260730202000_214_align_purchase_advisor_chat_provider_capability.sql | ب | UPDATE public.ai_providers |
| 192 | 20260731080000_225_set_messenger_group_member_role.sql | الف | — |
| 193 | 20260731210000_226_person_create_infrastructure.sql | الف | — |
| 194 | 20260731211500_227_person_create_full_revoke_anon.sql | الف | — |
| 195 | 20260731220000_228_phase2_person_aliases.sql | الف | — |
| 196 | 20260731230000_229_phase3_inline_person_creation.sql | الف | — |
| 197 | 20260801090000_230_phase4_unified_import_backfill.sql | الف | — |
| 198 | 20260801160000_231_phase5_person_fk_transition.sql | ج | UPDATE public.sales_quotes؛ UPDATE public.purchases؛ UPDATE public.payment_vouchers |
| 199 | 20260801180000_232_person_create_inline_legacy_fields.sql | الف | — |
| 200 | 20260801190000_233_person_id_not_null.sql | ج | INSERT INTO public.persons؛ INSERT INTO public.person_identifiers؛ INSERT INTO public.person_context_links؛ UPDATE public.suppliers؛ UPDATE public.customers |
| 201 | 20260801200000_234_person_merge_candidates.sql | ج | INSERT INTO public.person_merge_candidates |
| 202 | 20260801210000_235_groupA_product_supplier_person_fks.sql | ج | UPDATE public.product_suppliers؛ UPDATE public.purchase_prices |
| 203 | 20260801220000_236_groupB_receipt_person_fks.sql | ج | INSERT INTO public.persons؛ INSERT INTO public.person_identifiers؛ INSERT INTO public.person_context_links؛ UPDATE public.external_parties؛ UPDATE public.payment_receipts؛ UPDATE public.delivery_receipts؛ UPDATE public.payment_vouchers |
| 204 | 20260801230000_237_groupC_credit_person_fks.sql | الف | — |
| 205 | 20260802000000_238_groupD_remaining_person_fks.sql | ج | UPDATE public.invoices؛ UPDATE public.didar_activities |
| 206 | 20260802010000_239_person_merge.sql | الف | — |
| 207 | 20260802011000_239b_person_merge_overview.sql | الف | — |
| 208 | 20260802020000_240_person_customer_cardinality.sql | الف | — |
| 209 | 20260802030000_241_global_contact_uniqueness.sql | الف | — |
| 210 | 20260802040000_242_external_parties_person.sql | ج | INSERT INTO public.persons؛ INSERT INTO public.person_identifiers؛ UPDATE public.external_parties؛ INSERT INTO public.person_context_links |
| 211 | 20260802050000_243_credit_person_based.sql | الف | — |
| 212 | 20260802060000_244_legacy_identity_documentation.sql | الف | — |
| 213 | 20260802070000_245_landline_shared_again.sql | الف | — |
| 214 | 20260802080000_246_purchase_fulfillment_core.sql | الف | — |
| 215 | 20260802081000_247_purchase_idempotency.sql | الف | — |
| 216 | 20260802082000_248_purchase_request_partial_status.sql | ج | UPDATE public.purchase_requests |
| 217 | 20260802083000_249_purchase_fulfillment_views.sql | الف | — |
| 218 | 20260802084000_250_purchase_fulfillment_acl_hardening.sql | الف | — |
| 219 | 20260802090000_251_create_purchase_rpc.sql | الف | — |
| 220 | 20260802100000_252_create_purchase_request_link.sql | الف | — |
| 221 | 20260802101000_253_get_purchase_requests_summary.sql | الف | — |
| 222 | 20260802120000_254_purchase_request_assignment.sql | ج | INSERT INTO public.shop_settings |
| 223 | 20260802121000_255_assign_purchase_request.sql | الف | — |
| 224 | 20260802130000_256_c4_function_acl_fix.sql | الف | — |
| 225 | 20260802140000_257_purchase_permission_alignment.sql | ج | UPDATE public.role_permissions؛ INSERT INTO public.audit_logs |
| 226 | 20260802141000_258_derived_status_guard.sql | الف | — |
| 227 | 20260802142000_259_purchase_table_acl_hardening.sql | الف | — |
| 228 | 20260802150000_260_purchase_actor_guards.sql | الف | — |
| 229 | 20260802151000_261_actor_trigger_field_fix.sql | الف | — |
| 230 | 20260802152000_262_withdraw_actor_activity_guard.sql | الف | — |
| 231 | 20260803090000_263_delivery_receipts_video_support.sql | ب | INSERT INTO storage.buckets |
| 232 | 20260803140000_264_persons_ownership_rls.sql | الف | — |
| 233 | 20260803163000_265_can_read_person_inflight_fix.sql | الف | — |
| 234 | 20260803174500_266_weight_change_never_rewrites_history.sql | الف | — |
| 235 | 20260803183000_267_payment_receipt_documents_bucket_limits.sql | ب | UPDATE storage.buckets |
| 236 | 20260803193000_268_capital_ceiling_not_overridable.sql | الف | — |
| 237 | 20260803210000_269_one_person_one_external_party.sql | الف | — |
| 238 | 20260803223000_270_profiles_person_link.sql | ج | INSERT INTO public.persons؛ INSERT INTO public.person_identifiers؛ UPDATE public.profiles؛ INSERT INTO public.person_context_links |
| 239 | 20260803233000_271_merge_registry_profiles_person.sql | الف | — |
| 240 | 20260804090000_272_versioned_score_level_thresholds.sql | ج | INSERT INTO public.score_level_thresholds |
| 241 | 20260804120000_273_manual_score_duration_and_preview.sql | ج | UPDATE public.employee_score_events |
| 242 | 20260804140000_274_line_level_warehouse.sql | ج | UPDATE public.sales_quote_items؛ UPDATE public.purchase_items |
| 243 | 20260804160000_275_quote_item_warehouse_payload.sql | الف | — |
| 244 | 20260804190000_276_mandatory_category_services.sql | ج | INSERT INTO public.product_service_types؛ INSERT INTO public.category_required_services؛ INSERT INTO public.sales_quote_item_services |
| 245 | 20260804210000_277_recurring_marketing_tasks.sql | الف | — |
| 246 | 20260804223000_278_marketing_task_double_tick.sql | الف | — |
| 247 | 20260804233000_279_repair_corrupted_persian_labels.sql | ب | UPDATE public.achievements؛ UPDATE public.customer_credit_ledger؛ UPDATE public.daily_mood_hafez_poems؛ UPDATE public.daily_mood_questions؛ UPDATE public.daily_mood_scenarios؛ UPDATE public.dynamic_table_columns؛ UPDATE public.dynamic_tables؛ UPDATE public.gamification_kpi_rules؛ UPDATE public.gamification_kpis؛ UPDATE public.invoice_workflow_stages؛ UPDATE public.journal_lines؛ UPDATE public.knowledge_documents_backup_20260722؛ UPDATE public.league_settings؛ UPDATE public.market_indicators؛ UPDATE public.market_rate_source_mappings؛ UPDATE public.market_rate_sources؛ UPDATE public.missions؛ UPDATE public.price_change_reasons؛ UPDATE public.pricing_rules؛ UPDATE public.product_suppliers؛ UPDATE public.profile_field_definitions؛ UPDATE public.dynamic_table_cells |
| 248 | 20260805003000_280_remove_legacy_capital_path.sql | الف | — |
| 249 | 20260805013000_281_restrict_viewer_role.sql | ج | INSERT INTO public.role_permissions؛ UPDATE public.role_permissions |
| 250 | 20260805023000_282_restore_emergency_admin.sql | ب | UPDATE public.profiles |
| 251 | 20260805033000_283_asan_code_fields.sql | ج | INSERT INTO public.person_identifiers؛ UPDATE public.products |
| 252 | 20260805043000_284_phone_normalization.sql | ج | UPDATE public.customers؛ UPDATE public.suppliers؛ UPDATE public.external_parties؛ UPDATE public.profiles؛ UPDATE public.visitors؛ UPDATE public.sales_quotes؛ UPDATE public.payment_receipts |
| 253 | 20260805053000_285_asan_person_import.sql | ج | INSERT INTO public.role_permissions |
| 254 | 20260805063000_286_asan_product_import.sql | الف | — |
| 255 | 20260805073000_287_merge_registry_asan_import_rows.sql | الف | — |
| 256 | 20260805083000_288_bank_mellat_asan_code.sql | ب | UPDATE public.bank_accounts |
| 257 | 20260805093000_289_products_accounting_code_normalize.sql | الف | — |
| 258 | 20260805103000_290_asan_export_numbers.sql | الف | — |
| 259 | 20260805113000_291_asan_export_module.sql | ج | INSERT INTO public.role_permissions |
| 260 | 20260805123000_292_asan_sales_export_source.sql | الف | — |
| 261 | 20260805133000_293_asan_purchase_export_source.sql | الف | — |
| 262 | 20260805143000_294_asan_journal_export_source.sql | الف | — |
| 263 | 20260805153000_295_asan_bank_deposit_export_source.sql | الف | — |
| 264 | 20260805163000_296_product_video_chain.sql | ج | INSERT INTO public.product_service_types؛ INSERT INTO public.category_required_services؛ INSERT INTO public.role_permissions |
| 265 | 20260805173000_297_invoice_ar_asan_code.sql | ج | INSERT INTO public.asan_control_accounts |
| 266 | 20260805183000_298_search_visible_persons.sql | الف | — |
| 267 | 20260805193000_299_search_visible_persons_filters.sql | الف | — |
| 268 | 20260805203000_300_person_aliases_write_harden.sql | الف | — |
| 269 | 20260805213000_301_products_torob_url.sql | الف | — |
| 270 | 20260806010000_302_platform_releases.sql | ج | INSERT INTO public.role_permissions؛ INSERT INTO public.platform_releases |
| 271 | 20260807010000_303_p0_1_delete_test_persons.sql | ج | INSERT INTO _p01_targets؛ DELETE FROM public.person_merge_candidates؛ DELETE FROM public.person_field_values؛ DELETE FROM public.person_aliases؛ DELETE FROM public.person_identifiers؛ DELETE FROM public.person_context_links؛ DELETE FROM public.suppliers؛ DELETE FROM public.persons |
| 272 | 20260807030000_304_p0_3_delete_e2e_purchase_residue.sql | ج | INSERT INTO _p03_targets؛ DELETE FROM public.stock_movements؛ DELETE FROM public.purchase_request_fulfillments؛ DELETE FROM public.purchase_idempotency؛ DELETE FROM public.purchase_items؛ DELETE FROM public.purchases |
| 273 | 20260807040000_305_fix_detect_phone_collisions.sql | ج | UPDATE public.phone_collisions |
| 274 | 20260807050000_306_p0_3b_delete_orphaned_e2e_requests.sql | ج | INSERT INTO _p03b_targets؛ DELETE FROM public.purchase_request_fulfillments؛ DELETE FROM public.purchase_receipts؛ DELETE FROM public.purchase_request_status_history؛ DELETE FROM public.purchase_requests |
| 275 | 20260807060000_307_auto_publish_release.sql | الف | — |
| 276 | 20260807070000_308_p2_1_supplier_accounting_code.sql | ج | UPDATE public.suppliers |
| 277 | 20260807080000_309_p2_1b_mirror_pull_asan_code.sql | الف | — |
| 278 | 20260807090000_310_p2_1c_propagation_safety.sql | ج | UPDATE public.suppliers؛ UPDATE public.customers |
| 279 | 20260807100000_311_auto_publish_validate_items.sql | الف | — |
| 280 | 20260808010000_312_supplier_payable_account_kind.sql | الف | — |
| 281 | 20260808020000_313_purchase_payment_payee_and_journal.sql | الف | — |
| 282 | 20260808050000_314_p1_1_context_link_mirror_trigger.sql | ج | INSERT INTO public.suppliers؛ UPDATE public.person_context_links؛ INSERT INTO public.customers |
| 283 | 20260808060000_315_seed_role_permissions_missing_modules.sql | ب | INSERT INTO public.role_permissions |
| 284 | 20260808065000_316_set_messenger_group_member_role.sql | الف | — |
| 285 | 20260808070000_317_polymorphic_ref_integrity.sql | الف | — |
| 286 | 20260808080000_318_delete_duplicate_person_271d7c44.sql | ب | DELETE FROM public.person_context_links؛ DELETE FROM public.customers؛ DELETE FROM public.persons |
| 287 | 20260808090000_319_mutual_settlement.sql | الف | — |
| 288 | 20260808100000_320_journal_export_rich_description.sql | الف | — |
| 289 | 20260808110000_321_p1_4_one_asan_code_per_person.sql | الف | — |
| 290 | 20260808120000_322_p1_5_unlink_fix_and_supplier_edit.sql | الف | — |
| 291 | 20260808130000_323_drop_dead_invoice_items_and_waybills.sql | الف | — |
| 292 | 20260808170000_327_decouple_post_receipt_accounting_from_invoices.sql | الف | — |
| 293 | 20260808180000_328_person_fk_registry_gate.sql | الف | — |
| 294 | 20260808190000_329_drop_invoice_fks_and_dead_functions.sql | الف | — |
| 295 | 20260808200000_330_receipt_triggers_drop_invoice_branches.sql | الف | — |
| 296 | 20260808210000_331_rewrite_invoice_readers.sql | الف | — |
| 297 | 20260808220000_332_drop_invoices_table.sql | الف | — |
| 298 | 20260808230000_333_drop_waybill_custom_fields.sql | الف | — |
| 299 | 20260810120000_334_internal_products_pricing_api.sql | الف | — |

### بررسی دقیق ب و ج

هدف جدول‌ها در ستون آخر فهرست کامل آمده است. بیشتر موارد seed/backfill عمومی‌اند، اما این‌ها محیط‌خاص‌اند:

- 282، 20260805023000_282_restore_emergency_admin.sql: حساب‌های test.admin@afrakala.local و afra-admin@local.test را فعال/غیرفعال می‌کند (lines 18-28).
- 288: bank account با UUID ثابت 32a4c282-... را تغییر می‌دهد و code=8 را assert می‌کند (lines 22-47).
- 303: دو person با UUID ثابت را حذف می‌کند؛ متن فایل census دیتابیس زنده 2026-08-07 را ذکر می‌کند (lines 47-117).
- 304: دقیقاً 322 purchase با notes LIKE E2E% را می‌خواهد و پس از حذف، 12 purchase و 10 stock movement را assert می‌کند (lines 42-117).
- 306: orphan requestهای نشان‌دار E2E را حذف می‌کند و ادامه داده محیطی 304 است (lines 43-111).
- 318: UUIDهای ثابت person/customer/context و یک specimen ثابت را مبنا می‌گیرد (lines 52-154).
- 143، 144 و 279 repair داده/backup حادثه 20260722 هستند.
- backfill/repairهای دیگر نیز داده واقعی را لمس می‌کنند و باید جداگانه با counts و rollback plan بررسی شوند.

## ۳ — تولید در برابر انتظار migrationها

همه queryها با SET transaction_read_only=on اجرا شدند؛ مقدار مشاهده‌شده on بود.

### تاریخچه

to_regclass('supabase_migrations.schema_migrations') برابر NULL است. جدول تاریخچه migration وجود ندارد؛ بنابراین تشخیص قطعی applied/not-applied از ledger ممکن نیست و فقط fingerprint می‌توان داد.

### شواهد SELECT زنده

- automation_driver_outputs وجود دارد (فایل افزوده شماره 2) و صفر ردیف دارد.
- از 78 جدول CREATE TABLE قابل استخراج از migrationهای جدید، فقط همین یک جدول وجود داشت. 77 مورد مانند messenger_groups، purchase_requests، delivery_receipts، warehouses، payment_vouchers، person_aliases، platform_releases و mutual_settlements نبودند.
- persons وجود دارد ولی صفر ردیف؛ profiles دارای 35 ردیف است.
- invoices، invoice_items، waybills، waybill_items و waybill_custom_fields موجود و هر پنج صفر ردیف‌اند.
- payment_receipt_links با invoice_id غیرتهی: صفر.
- 17 routine هنوز به invoices ارجاع دارند.
- 3 FK به invoices وجود دارد: invoice_items_invoice_id_fkey، payment_receipt_links_invoice_id_fkey و waybills_invoice_id_fkey.

نتیجه: تولید زنجیره feature را کامل نگرفته و migration 2 تنها مورد جدیدی است که از fingerprint جدول با اطمینان نسبی دیده شد. وجود یک object اثبات اجرای کامل فایل نیست.

### ریسک شکست

- اجرای انتخابی migrationهای دیرهنگام پیش از پیش‌نیازها با missing table/function/column می‌شکند.
- زنجیره حذف invoice باید 323→327→328→329→330→331→332→333 باشد. داده فعلی صفر است، ولی dependencies هنوز کاملاً زنده‌اند.
- 332 به تعریف مشخص person_merge و registry دقیق 30→29 وابسته است (supabase/migrations/20260808220000_332_drop_invoices_table.sql:61 و :546).
- persons 233 و backfillهای پیرامون آن به 226–232 وابسته‌اند؛ 35 profile و صفر person نیازمند reconciliation است.
- 304 به دلیل counts ثابت محیط دیگر نباید روی این تولید اجرا شود.
- بدون ledger، baseline و checksum دستی لازم است.

## ۴ — ریسک‌های خاص

### invoices

گزارش feature حذف را کامل اعلام می‌کند (docs/execution/nav-invoices-cleanup-mission-COMPLETE.md:1)، و بخش معلق پایین فایل تاریخچه strike-through است. اما روی این production حذف اعمال نشده: پنج جدول موجود، 17 routine reference و 3 FK. counts صفر شرط داده‌ای را مساعد می‌کند، نه اینکه rollout را کم‌خطر کند.

مانده گزارش: invoice_workflow_stages یتیم؛ calculate_salesperson_collected_sales نقص از قبل موجود؛ تست مرورگری انسانی باقی است.

### COMPLETE reportها

- new-clusters-frontend-mission-COMPLETE.md:35: expire_pending_documents مشکل دارد و رفعش خارج از دامنه اعلام شده.
- p1-dual-role-mission-COMPLETE.md:282: ناسازگاری status=pending و cleanup تست ثبت شده.
- db-hygiene: سه تصمیم انسانی درباره accounting_code، UI roles و currency workbench.
- pricing-and-stock-warning: regression test دائمی ندارد.
- internal-products-pricing-api: migration 334 افزودنی است ولی rollout مستقل می‌خواهد.

### dependency و env

package.json افزوده‌ها: @lovable.dev/mcp-js، html2canvas، moment-jalaali، nitro beta؛ dev: Playwright و types moment-jalaali. vite-tanstack-config از ^1.4.0 به 2.7.6 pin شده است.

envهای تازه شامل APP_، DATABASE_URL، SUPABASE_*، credentialهای E2E، flags پیام‌رسان واقعی، MARKETING_TASKS_WORKER_TOKEN، OLLAMA_*، WORKER_MODE و bannerهای VITE است. هیچ secret value خوانده یا گزارش نشد. Ollama self-hostable است؛ messaging/bot واقعی باید تا provision امن server-side خاموش بماند.

### محیط و compose

production containerهای afrakala-lan-* دارد: PostgreSQL 15.6.1.139، Auth v2.158.1 و PostgREST v12.2.0. storage هنگام مشاهده در restart loop بود. /api/version روی port 3000 پاسخ 404 داد؛ تطبیق SHA از endpoint ممکن نشد.

فایل‌های production/staging/e2e env example و deploy/lan/docker-compose.yml تغییر کرده‌اند. فرض‌های گزارش‌های LAN روی 192.168.170.8 نباید به 192.168.170.10 تعمیم داده شوند.

## ۵ — توصیه

انتقال یک‌جا آماده نیست. حجم 2,332 commit/299 migration، نبود ledger، 64 migration دارای DML زمان اجرا، cleanupهای محیط‌خاص و تغییرات مالی/persons/invoice ریسک را بالا می‌برد.

مرحله‌بندی پیشنهادی:

1. backup کامل DB و Storage و restore rehearsal روی clone؛ نه روی production.
2. schema baseline و checksum؛ وجود table به تنهایی applied محسوب نشود.
3. خارج‌کردن یا بازنویسی 282، 288، 303، 304، 306، 318 و repairهای محیط‌خاص.
4. روی clone: additive schema/RLS، سپس backfill با counts، سپس constraint، سپس code.
5. persons 226–302 یک release مستقل با reconciliation 35 profile.
6. invoice retirement 323 و 327–333 یک release مستقل با snapshot، transaction dry-run و تست مالی.
7. API 334 و UI پس از تثبیت schema، flags، secrets و storage.
8. هر count mismatch، constraint/RLS/audit failure یا storage unhealthy یعنی توقف و rollback.

## محدودیت‌ها و انطباق فقط‌خواندنی

- هیچ fetch انجام نشد؛ refs موجود بررسی شدند.
- هیچ build/lint/typecheck/test، migration، deploy، checkout/merge/pull/reset یا write دیتابیس انجام نشد.
- queryها SELECT-only و transaction_read_only بودند.
- تنها فایل نوشته‌شده همین گزارش است.

## خلاصه برای مالک

کار واقعی بزرگ‌تر از برآورد اولیه است: ۲٬۳۳۲ commit و ۲۹۹ migration. تولید تاریخچه migration ندارد و چند migration صریحاً داده تست یا UUIDهای سرور دیگری را حذف/تغییر می‌دهند؛ پس انتقال یک‌باره برای داده واقعی پرریسک است. پیشنهاد اصلی: اول clone بازیابی‌شده تولید، جداسازی migrationهای تستی، سپس چند release کوچک—به‌خصوص persons و حذف invoices.

## گزارش تحویل الزامی AGENTS.md

- Files inspected: اسناد الزامی، مأموریت، هر 299 migration feature، package/env/compose diff و هشت COMPLETE report.
- Files changed: فقط docs/execution/production-gap-analysis-REPORT.md برای همین گزارش.
- Migration impact: هیچ migration اجرا یا تغییر نکرد؛ 299 مورد تحلیل شد.
- RLS/RBAC impact: هیچ.
- Audit log impact: هیچ.
- Build/lint/typecheck/test: عمداً اجرا نشد؛ مأموریت ممنوع کرده است.
- Manual test path: ندارد؛ گام بعدی clone/restore staging است.
- Self-Host Acceptance Check: وابستگی‌ها و feature flags بررسی شد؛ secret/CDN/API اجباری ساخته نشد.
- Remaining risks: نبود ledger، migrationهای محیط‌خاص، storage restart loop و فاصله بزرگ schema/code.

