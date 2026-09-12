# تغییرات نشسته روی پروداکشن — ۲۰۲۶-۰۹-۱۲

**Range:** `469fe0a9..d60232f5` on `staging` · 142 commits · 92 migration files in the window
`20260827120000 < ts <= 20260912150000`.

> **Note on method.** `d60232f5` was not in this clone's object store. It was **not fetched**;
> instead it was resolved read-only through the GitHub API and confirmed to be the squash-merge
> of PR #438 with tree `f5979b3f9a7c1d650dab950c8482d0717ac9f781` and parent `63ec097e` — byte
> for byte the same tree as the local commit `3b9ee7dc`, which has the same parent. Every
> figure below is computed against `3b9ee7dc` and is therefore exact for the requested range.
> No git writes, no database writes.

> **The git range is not the same as what landed.** Of the 92 migrations in the window, **12
> were already on production before tonight** (the schema top was 424) and **5 were
> deliberately skipped**. See §B.2.

---

## (الف) خلاصه برای کارکنان

> فقط چیزهایی که می‌بینید یا باید متفاوت انجام دهید. جزئیات فنی در بخش‌های بعدی است.

1. **صفحهٔ تازه — «پخش حساب»** (مسیر `/accounting/allocation-workbench`): میز کاری برای
   تخصیص روزانهٔ حساب‌ها؛ ثبت ردیف بدهکار/بستانکار، اولویت، وضعیت پیگیری و شمارهٔ حساب.

2. **صفحهٔ تازه — «درخواست‌های اعتبار»** (`/credit-requests`): درخواست افزایش اعتبار مشتری
   حالا یک گردش کار واقعی دارد و **فقط مدیر، سرپرست یا حسابدار** می‌تواند آن را تأیید کند.

3. **سه صفحهٔ تازهٔ تلفن و اشخاص:** «داخلی‌های تلفن» (`/admin/call-extensions`) برای نسبت دادن
   هر داخلی به یک کارمند، «گزارش فعالیت تلفنی» (`/operations/call-activity`)، و «تکمیل و
   پاک‌سازی اشخاص» (`/admin/persons-cleanup`).

4. **گزارش دریافتنی‌ها و پرداختنی‌ها اصلاح شد:** دریافتنی‌ها حالا **نام فروشنده و سقف اعتبار**
   را نشان می‌دهد؛ پرداختنی‌ها **بدهی واقعی** را نشان می‌دهد نه قیمت نقدی؛ و سررسید نامعلوم
   دیگر **ساخته نمی‌شود** — صریح «نامعلوم» نوشته می‌شود و از گزارش حذف نمی‌شود.

5. **صفحهٔ «مشتریان اعتباری» دیگر «۰» نمی‌نویسد** برای عددی که هرگز محاسبه نشده؛ جای آن خالی
   می‌ماند. «۰» یعنی واقعاً صفر.

6. **سقف اعتبار دستی قفل شد:** پیام
   `تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است`.
   کارشناس فروش دیگر نمی‌تواند سقف اعتبار مشتری را جابه‌جا کند.

7. **زمان تسویه برای هر خرید اجباری شد** و **هر ردیف پیش‌فاکتور باید کالای موجود در سیستم را
   نام ببرد**. اگر کالا تعریف نشده باشد، پیام می‌گیرید و باید ابتدا حسابداری آن را بسازد.

8. **ورود اشخاص از آسان سخت‌گیرتر شد:** هر شخص باید **کد آسان و شمارهٔ موبایل** داشته باشد.
   در عوض، یک دستهٔ واردشده حالا **قابل بازگردانی** است.

9. **اعلان روزانهٔ حسابداری:** هر روز پیام `امروز N سند تعهدی ثبت شد` برای حسابداران ارسال
   می‌شود.

10. **چند صفحهٔ قدیمی حذف شدند** و دیگر در منو نیستند: «رسیدها» (`/operations/receipts`)،
    «لیست قیمت‌ها» (`/price-lists`)، و دو مسیر قدیمی ورود مشتری/اشخاص. کار آن‌ها به صفحات
    تازه منتقل شده است.

> ⚠️ **یک نکته که باید بدانید:** خواندن خودکار رسید (OCR) حالا فقط روی سرور داخلی انجام
> می‌شود و عمداً به سرویس بیرونی وصل نیست. **ممکن است رسید خوانده نشود و مجبور شوید دستی وارد
> کنید.** این یک خرابی نیست؛ تصمیم است تا تصویر رسید از شبکه بیرون نرود.

---

## (ب) پیوست فنی

### B.1 · Commits grouped by PR

142 commits. Squash-merged PRs carry `(#N)` in the subject; the rest arrived through
`Merge pull request #N` commits.

| PR | Subject | Nature |
|---|---|---|
| **#437** | 523 and 524: migration 477 re-issued for production's ACTUAL table shape | tonight's hotfix |
| **#436** | prodprep — Phase 4 written out, and the gap recounted to 77 | runbook |
| **#435** | prodprep Stage 0 — migration 522 replaces 460, Phase 3 block was closing half the hole | runbook + 522 |
| **#434** | Close-out Group C — Issabel CDR importer, schedule, per-extension report | feature |
| **#432** | Close-out Group H — hotfixes, two security findings, and the regression they surfaced | security |
| **#431** | Wave 6 follow-up · the two cron writers are not callable by every authenticated user (og61) | security |
| **#430** | Wave 6 · integration — capital_allocation_ledger rename, og103 coverage | integration |
| **#429** | Wave 6 · Group B — login recording, streaks, credit override floor, custom-field UI | feature |
| **#428** | Wave 6 · Group C — the phone: batch score recompute, CDR columns, extension mapping | feature |
| **#427** | Wave 6 · Group L — accrual ledger: chart of accounts, posting, cancel paths | feature |
| **#426** | Wave 6 · Group X — audit the direct allocation write path, retire capital_allocation_ledger | foundations |
| **#425** | Wave 5 — the allocation workbench page (پخش حساب) | feature |
| **#424 / #423 / #422 / #421** | Wave 5 allocation, partial payment, anon table grants (477), proacl sweep (476) | feature + security |
| **#403 / #405 / #406** | ship script removal, payables unknown due date, e2e style | small |
| **#385–#420** | waves 1–4: Asan import/export, person delete & complete, navigation, security waves 2–4 | mixed |

`3b9ee7dc` (525) is the tip and is unmerged-to-main at time of writing; it reached `staging`
as #438 = `d60232f5`.

### B.2 · What actually landed, against what is in the range

| Class | Count | Which |
|---|---|---|
| Migrations in the git window | **92** | 411 … 525 |
| Already applied before tonight | **12** | 411–419, 422, 423, 424 (production's schema top was 424) |
| In tonight's run | **80** | the 77-file gap + 523, 524, 525 |
| **Skipped by owner decision** | **5** | **449, 450, 452** (absolute row-count asserts wrong against production data) · **460** (superseded by 522) · **477** (superseded by 523+524) |
| Applied tonight | **75** | of which **74 confirmed**, 525 unconfirmed — see §C |

### B.3 · Migration inventory

Tags: **SEC**urity · **SCH**ema · **DAT**a · **FUN**ction · **UI**-visible.
The quoted text is the first descriptive line of each file's own header, verbatim.

| # | File | First header line (verbatim) | Tag |
|---|---|---|---|
| 411 | `…_411_customer_credit_ranges_widened_and_scores_recomputed.sql` | `411: widen the seven customer credit scoring ranges, then recompute the` | DAT · UI |
| 412 | `…_412_cooperation_hint_matches_the_widened_range.sql` | `412: the cooperation-history hint must say what the range now allows.` | UI |
| 413 | `…_413_salesperson_scoring_ranges_widened_and_scores_recomputed.sql` | `413: widen four salesperson scoring ranges, then recompute the existing scores` | DAT · UI |
| 414 | `…_414_every_person_is_a_customer.sql` | `414: every person is a customer by default, from every creation path.` | SCH · DAT |
| 415 | `…_415_quote_items_require_a_real_product.sql` | `415: a pre-invoice line must name a product that exists in the system.` | FUN · UI |
| 416 | `…_416_settlement_types_write_matches_the_page_guard.sql` | `416. The write policy on settlement_types disagreed with the page that writes it.` | SEC |
| 417 | `…_417_sales_quotes_records_when_it_was_accepted.sql` | `417. sales_quotes records WHEN a quote was accepted.` | SCH |
| 418 | `…_418_backfill_accepted_at_from_the_audit_log.sql` | `418. The nine quotes that were accepted before 417 existed get their acceptance moment back.` | DAT |
| 419 | `…_419_receivables_due_date_from_settlement_terms.sql` | `419. The receivables report shows a real settlement due date.` | FUN · UI |
| **420** | `…_420_guest_quotes_get_their_own_reason.sql` | `420 — a quote with no customer file gets its own reason, instead of borrowing` | FUN · UI |
| **421** | `…_421_guest_refusal_message_tells_the_truth.sql` | `421 — the guest branch's refusal message told the salesperson to get accounting approval.` | UI |
| 422 | `…_422_document_register_view.sql` | `422 — v_documents_unified: one register over receipts, payments and dual documents` | SCH |
| 423 | `…_423_purchase_settlement_term_is_mandatory.sql` | `423 — زمان تسویه برای هر خرید اجباری است، در هر سه لایه.` | SCH · UI |
| 424 | `…_424_bank_account_asan_code.sql` | `424. A bank account or cash box carries its Asan code.` | SCH · UI |
| 425 | `…_425_settlement_dead_predicates.sql` | `425 — the mutual-settlement readers stop testing a condition that cannot occur.` | FUN |
| 430 | `…_430_asan_import_requires_code_and_mobile.sql` | `430 — a person imported from Asan always arrives with an Asan code AND a mobile` | FUN · UI |
| 431 | `…_431_retire_person_import_batch.sql` | `431 — A-6. Retire ` + "`person_import_batch`" + `, the last database object belonging to the` | SCH |
| 432 | `…_432_asan_import_batch_provenance_and_revert.sql` | `432 — A-7. A committed import batch can be reverted, as far as it is safe to revert it.` | FUN · UI |
| 435 | `…_435_person_delete_when_there_is_no_history.sql` | `435. A person imported by mistake, with no history, can be removed.` | FUN · UI |
| 436 | `…_436_close_anon_role_grant_escalation.sql` | `436 - close the anon privilege escalation into the role-granting RPCs, and the three other` | **SEC** |
| 446 | `…_446_attach_purchase_actor_active_trigger.sql` | `437 - attach public.tg_purchase_actor_active() to the two tables it was` | SCH · FUN |
| 443 | `…_443_fix_ambiguous_outparams_and_assert_route_permissions.sql` | `443 -- unwired wave 1, agent C.` | FUN |
| 445 | `…_445_scheduled_jobs_documentation.sql` | `445: record, inside the afrakala database, which functions are on a schedule.` | SCH |
| 437 | `…_437_inline_create_registers_asan_identifier.sql` | `437 — person_create_inline turns p_accounting_code into a REAL Asan identifier.` | FUN · UI |
| 447 | `…_447_retire_capital_allocation_tombstones.sql` | `447 (B-1): retire the four capital-allocation tombstones.` | SCH |
| 448 | `…_448_retire_superseded_functions.sql` | `448 (B-3, B-4, B-5, B-5b): drop four functions whose successors are the live path.` | SCH |
| **449** | `…_449_retire_daily_capital_functions.sql` | `449 (B-6): retire the daily-capital entry trio. Owner answered "No" to daily` | **SKIPPED** |
| **450** | `…_450_retire_superseded_tables.sql` | `450 (B-7 partial, B-8, B-9, B-10): retire superseded tables.` | **SKIPPED** |
| 451 | `…_451_retire_app_role_wrappers.sql` | `451 (B-2): retire the two app_role-typed role wrappers.` | SCH |
| **452** | `…_452_retire_parameter_weight_backups_by_rename.sql` | `452 - retire the two dynamic_parameter_weights backups by RENAME, not DROP.` | **SKIPPED** |
| 453 | `…_453_credit_customers_report_uncomputed_as_null.sql` | `453 — /sales/credit-customers stops printing "۰" for numbers that were never computed.` | UI |
| 454 | `…_454_wire_overdue_gate_to_receivables.sql` | `454 — the overdue credit gate reads live receivables instead of an empty table.` | FUN · UI |
| 455 | `…_455_score_period_current_month_then_dated_fallback.sql` | `455 — D-9: the score reader takes the current month first, and falls back to the most` | FUN · UI |
| 457 | `…_457_payables_debt_is_the_purchase_total.sql` | `457. The supplier payables report shows the debt, not the cash-incentive price.` | FUN · UI |
| 458 | `…_458_receivables_summary_keeps_unknown_due_dates.sql` | `458. A receivable with no due date stops falling out of the summary.` | FUN · UI · **see §C** |
| 459 | `…_459_payables_names_an_unknown_due_date.sql` | `459. The payables view names an unknown due date instead of inventing one,` | FUN · UI |
| **460** | `…_460_pin_receipt_ocr_to_local_vision.sql` | `460 - stop receipt images leaving the network.` | **SKIPPED → 522** |
| 461 | `…_461_gate_hold_and_release_credit.sql` | `461 - gate the credit ledger: hold_credit and release_credit.` | **SEC** |
| 462 | `…_462_gate_money_tier_definers.sql` | `462 - the rest of the money tier. Follows 461 (D-16: the credit ledger closes first).` | **SEC** |
| 463 | `…_463_gate_identity_tier_definers.sql` | `463 - the identity tier: functions that can repoint WHO a record belongs to, dedupe people, or` | **SEC** |
| 464 | `…_464_gate_catalogue_tier_definers.sql` | `464 - the catalogue tier: products, SKUs, prices, price alerts, supplier links and the pricing` | **SEC** |
| 465 | `…_465_gate_housekeeping_tier_definers.sql` | `465 - the housekeeping tier: gamification engines, score snapshots, provider telemetry and the` | **SEC** |
| 466 | `…_466_receivables_carry_salesperson_and_ceiling.sql` | `466 (W-2): the receivables report carries the salesperson and the credit ceiling.` | FUN · UI |
| 467 | `…_467_scoring_tables_select_credit_audience.sql` | ``467 - the three credit-scoring tables stop handing every row to `sales`.`` | **SEC** |
| 468 | `…_468_bot_writers_require_a_valid_key.sql` | `468 - the four bot_* writers stop accepting a UUID as the whole credential.` | **SEC** |
| 469 | `…_469_market_rate_system_rpcs_test_for_service_role_positively.sql` | ``469 - the three market-rate `_system` RPCs stop testing for the ABSENCE of a user identity`` | **SEC** |
| 470 | `…_470_expire_pending_documents_loses_its_direct_authenticated_grant.sql` | ``470 - expire_pending_documents() loses its DIRECT grant to `authenticated`. Its only real`` | **SEC** |
| 471 | `…_471_ai_provider_key_and_bot_readers_require_a_caller.sql` | `471 - ai_get_provider_key stops handing plaintext AI keys to anon, and the last two` | **SEC** |
| 475 | `…_475_audit_ai_routing_changes.sql` | `475 - a change to the AI routing tables can no longer happen without a receipt.` | **SEC** · SCH |
| 476 | `…_476_close_pre393_anon_execute_grants.sql` | ``476 - the proacl sweep. 142 pre-393 functions in `public` lose the `anon` EXECUTE grant they`` | **SEC** |
| **477** | `…_477_close_anon_table_grants.sql` | ``477 - the table half of the proacl sweep. `anon` loses every WRITE privilege on 202 tables`` | **SKIPPED → 523+524** |
| 478 | `…_478_partial_purchase_payment.sql` | `478. Partial payment of a purchase.` | SCH · FUN · UI |
| 481 | `…_481_allocation_rows.sql` | `481 - allocation_rows: one row = one PLANNED transfer from a debtor to a creditor.` | SCH |
| 482 | `…_482_allocation_rpcs.sql` | `482 - the allocation workbench RPCs: three writers that audit, and one reader.` | FUN |
| 483 | `…_483_allocation_rows_audit_write_triggers.sql` | `483 · allocation_rows: audit the DIRECT write path (H-1)` | **SEC** · SCH |
| 484 | `…_484_retire_capital_allocation_ledger.sql` | `484 · retire capital_allocation_ledger, WITHOUT losing the safety lock it carries (X-1)` | SCH |
| 485 | `…_485_fill_role_permissions_gaps.sql` | `485 · fill the three role_permissions gaps before the static fallback is removed (X-3, H·d)` | **SEC** · DAT |
| 486 | `…_486_chart_of_accounts.sql` | `486 - chart_of_accounts: the six accounts the accrual ledger posts against.` | SCH · DAT |
| 487 | `…_487_ledger_accrual_columns.sql` | `487 - the ledger learns two accrual document kinds and an optional chart link.` | SCH |
| 488 | `…_488_sale_accrual_posting.sql` | `488 - a sale becomes a receivable: post an accrual when a quote is accepted.` | FUN · DAT |
| 489 | `…_489_purchase_accrual_posting.sql` | `489 - a purchase becomes a payable: post an accrual when a purchase is inserted.` | FUN · DAT |
| 490 | `…_490_quote_status_cancelled_after_accept.sql` | `490 - sales_quote_status gains 'cancelled_after_accept'.` | SCH · UI |
| 491 | `…_491_accrual_cancel_paths.sql` | `491 - the cancel paths: an accepted quote (L-5) and a purchase (L-6).` | FUN |
| 492 | `…_492_daily_accrual_notice.sql` | `492 - D-32: the daily notice. "امروز N سند تعهدی ثبت شد", to the accountants.` | FUN · **UI** |
| 493 | `…_493_notification_type_daily_accrual.sql` | `493 - notification_queue accepts the daily accrual summary type.` | SCH |
| 494 | `…_494_purchase_payment_outstanding_clamp.sql` | `494 - H-2: an implicit purchase payment pays the OUTSTANDING balance.` | FUN |
| 495 | `…_495_implicit_payment_is_outstanding.sql` | `495 - H-2, corrected: the implicit amount IS the outstanding balance.` | FUN |
| 496 | `…_496_call_logs_batch_score_recompute.sql` | `496 - call_logs: retire the PER-ROW score recompute, replace it with a BATCH one.` | FUN |
| 497 | `…_497_call_logs_cdr_columns.sql` | `497 - call_logs grows the four columns a CDR import needs, and gains the UNIQUE` | SCH |
| 498 | `…_498_call_log_extensions.sql` | `498 - call_log_extensions: which PBX extension belongs to which employee.` | SCH · UI |
| 504 | `…_504_employee_streaks_daily.sql` | `504: give public.employee_streaks a writer.` | FUN |
| 505 | `…_505_credit_request_approval.sql` | `505: make credit_requests a working approval workflow, and give approval something to do.` | FUN · **UI** |
| 506 | `…_506_capital_manual_floor.sql` | `506: teach recompute_dynamic_capital_setting to respect customers.manual_credit_floor.` | FUN |
| 507 | `…_507_cron_definer_writers_are_not_authenticated_callable.sql` | `507 · the two wave-6 cron writers stop being callable by every authenticated user` | **SEC** |
| 508 | `…_508_delete_residue_allocation_row.sql` | `508 — حذف ردیف باقی‌مانده‌ی تخصیص (residue) بر اساس تصمیم مالک D-55` | DAT |
| 509 | `…_509_allocation_tehran_today.sql` | `509 — OG-64: در دامنه‌ی تخصیص، CURRENT_DATE جای خود را به tehran_today() می‌دهد` | FUN |
| 512 | `…_512_call_logs_issabel_import_foundation.sql` | `512 · زیرساخت واردسازی CDR ایزابل (C-4 / C-5)` | SCH · FUN |
| 510 | `…_510_daily_allocation_honours_manual_floor.sql` | `510 - D-52: run_daily_capital_allocation هم باید سقف دستی اعتبار را رعایت کند` | FUN |
| 513 | `…_513_call_import_worker_recompute.sql` | `513 · بازمحاسبهٔ امتیاز برای اجرای بدون‌ناظر (C-6)` | FUN |
| 511 | `…_511_manual_credit_floor_guard.sql` | `511 - H-9: سقف اعتبار دستی فقط با اجازه‌ی بررسی‌کننده جابه‌جا می‌شود` | **SEC** · UI |
| 515 | `…_515_system_health_reports_require_admin.sql` | `515 - H-10: سه گزارشِ SECURITY DEFINER که هیچ گاردی نداشتند` | **SEC** |
| 514 | `…_514_call_extension_activity_views.sql` | `514 · گزارش فعالیت تلفنی به تفکیک داخلی (C-8)` | SCH · UI |
| 516 | `…_516_call_extension_views_least_privilege.sql` | `516 · باریک کردن دسترسی دو view گزارش تلفن به SELECT (اصلاح ۵۱۴)` | **SEC** |
| 518 | `…_518_manual_credit_floor_guard_covers_insert.sql` | `518 - F-1 تکمیل: گارد سقف دستی باید مسیر INSERT را هم بگیرد` | **SEC** |
| 517 | `…_517_derive_staff_call_metrics.sql` | `517 · استخراج آمار تماس کارکنان از call_logs (C-7)` | FUN · UI |
| 519 | `…_519_system_health_guard_targets_api_callers.sql` | `519 - H-10 رگرسیون: گارد باید بپرسد «درخواست از کجا آمده»، نه «uid خالی است یا نه»` | **SEC** |
| 520 | `…_520_staff_call_metrics_coverage_guard.sql` | `520 · گاردِ پوششِ نگاشت داخلی‌ها، و نیمهٔ ساخته‌نشدهٔ آن (C-1)` | **SEC** · FUN |
| 521 | `…_521_manual_guard_trigger_fn_least_privilege.sql` | `521 · بستنِ EXECUTEِ پیش‌فرض روی تابعِ تریگرِ ۵۲۰ (C-1)` | **SEC** |
| 522 | `…_522_pin_receipt_ocr_by_name_supersedes_460.sql` | `522 - pin receipt OCR to the LOCAL vision provider, addressing rows BY NAME.` | **SEC** · DAT |
| 523 | `…_523_close_anon_table_grants_for_production_shape.sql` | `523 - migration 477, re-issued for production's ACTUAL table shape.` | **SEC** |
| 524 | `…_524_close_anon_on_tables_477_could_not_name.sql` | `524 - close anon on the seven tables migration 477 could not name.` | **SEC** |
| 525 | `…_525_close_anon_on_definer_views.sql` | `525 - close anon on the five DEFINER views that bypass RLS and expose financial data.` | **SEC** · §C |

**Count by tag**, counted off the 92 rows above (a migration may carry more than one):
**SEC 28 · SCH 24 · FUN 34 · DAT 10 · UI 28 · SKIPPED 5.**

### B.4 · Route changes (`src/routeTree.gen.ts`)

**Added (9):**

| Path | Note |
|---|---|
| `/accounting/allocation-workbench` | پخش حساب — the Wave 5 workbench |
| `/credit-requests` | credit request approval workflow (505) |
| `/admin/call-extensions` | داخلی‌های تلفن (498) |
| `/operations/call-activity` | گزارش فعالیت تلفنی (514, 517) |
| `/admin/system-health` | سلامت داده‌ها — admin-gated (515, 519) |
| `/admin/person-fields` | person custom fields |
| `/admin/persons-cleanup` | تکمیل و پاک‌سازی اشخاص |
| `/api/admin/calls/import-issabel` | server route, Issabel CDR import |
| `/api/public/hooks/import-issabel-calls` | server route, unattended import hook |

**Removed (7):** `/operations/receipts` · `/price-lists` · `/customers/import` ·
`/persons/import` · `/api/persons/import` · `/operations/api-keys` · `/operations/gamification`

### B.5 · RPC surface — functions created or replaced in the range

**82 distinct functions**, deduplicated, from `CREATE OR REPLACE FUNCTION` on non-comment lines
across the 92 migration files.

```
_capital_alloc_used  _capital_setting_reservation_count  ai_get_provider_key
asan_classify_person_batch  asan_commit_person_batch  asan_list_journal_export
asan_person_import_rejection  asan_revert_person_batch  assign_user_role  assign_user_role_txt
audit_ai_routing_change  audit_credit_request_change  audit_customer_change  bot_create_table_row
bot_get_product_for_key  bot_list_products_for_key  bot_query_table_rows  bot_update_table_row
bot_upsert_table_row  calculate_customer_realtime_credit  calculate_dynamic_score
calculate_employee_score  call_import_match_persons  can_issue_customer_invoice  cancel_purchase
create_allocation_row  create_sales_quote_with_items  derive_staff_call_metrics
detect_phone_collisions  expire_stale_credit_holds  find_or_create_model
finish_market_rate_ingestion_run_system  get_customer_dynamic_credit  get_payables_summary
get_receivable_detail  get_receivables_list  hold_credit  increase_credit  list_allocation_rows
list_mutual_settlement_candidates  log_event  manual_daily_metrics_totals
mi_get_seller_favorite_products  notify_accountants_daily_accrual_summary
pay_purchase_with_voucher  person_create_inline  person_delete  person_delete_blockers
person_fk_drift_report  person_merge  person_settlement_position  polymorphic_ref_orphan_report
post_purchase_accrual  post_sale_accrual  recompute_dynamic_capital_setting
recompute_employee_scores_from_calls  recompute_employee_scores_from_calls_worker
record_external_market_rate_tick_system  release_credit  resolve_score_period  reverse_document
review_credit_request  revoke_user_role  revoke_user_role_txt  roll_employee_daily_streaks
run_daily_capital_allocation  sales_quotes_validate_status  set_allocation_row_status
settle_league_season  staff_call_metrics_coverage  staff_call_metrics_manual_guard
start_market_rate_ingestion_run_system  tg_allocation_rows_audit_delete
tg_allocation_rows_audit_insert  tg_allocation_rows_audit_update
tg_allocation_rows_derive_payer_person  tg_customers_guard_manual_credit_floor
tg_purchase_post_accrual  tg_sales_quote_post_accrual  update_allocation_row
update_sales_quote_status  validate_journal_entry_balance
```

> `get_receivables_summary` is **deliberately absent** from this list. It is created in 458 with
> `DROP` + `CREATE FUNCTION`, not `CREATE OR REPLACE`, so the literal grep the brief specified
> does not see it. Its signature appears in 458 only inside a comment. **It did change tonight.**

> **A transient anon grant, opened and closed within the same run.** 458 line 175 is the only
> `GRANT … TO anon` anywhere in the 92 files:
> `GRANT EXECUTE ON FUNCTION public.get_receivables_summary(date, date, uuid) TO anon;`
> Migration **476** (order 38) revokes it again, together with `get_payables_summary`, from both
> `anon` and `PUBLIC`. Net state: closed. But 458 runs at **order 23**, so the grant was live on
> production for the fifteen migrations in between. Anyone reading 458's diff alone will
> reasonably think a hole was opened; it was, and then it was shut.

### B.6 · Persian user-visible strings added

**171** added lines carry Persian in a user-visible context in `src/` and `server/` after code
comments are filtered out; **36** of those are `toast.*` calls. **246** added Persian
`RAISE` lines across the migrations. A representative, verbatim selection:

| file:line | string |
|---|---|
| `src/routes/_app.accounting.allocation-workbench.tsx:359` | `throw new Error("مشتری بدهکار انتخاب نشده است.")` |
| `src/routes/_app.accounting.allocation-workbench.tsx:360` | `throw new Error("ذی‌نفع بستانکار انتخاب نشده است.")` |
| `src/routes/_app.accounting.allocation-workbench.tsx:361` | `throw new Error("مبلغ تخصیص باید عددی بزرگ‌تر از صفر باشد.")` |
| `src/routes/_app.accounting.allocation-workbench.tsx:374` | `toast.success("ردیف تخصیص ثبت شد")` |
| `src/routes/_app.accounting.allocation-workbench.tsx:781` | `toast.success("وضعیت پیگیری ثبت شد")` |
| `src/routes/_app.accounting.allocation-workbench.tsx:794` | `toast.success("اولویت به‌روزرسانی شد")` |
| `src/routes/_app.accounting.allocation-workbench.tsx:812` | `toast.success("شمارهٔ حساب ذخیره شد")` |
| `src/routes/_app.admin.call-extensions.tsx:242` | `toast.error("شمارهٔ داخلی را وارد کنید.")` |
| `src/routes/_app.admin.call-extensions.tsx:246` | `toast.error("این داخلی از قبل ثبت شده است.")` |
| `src/routes/_app.admin.asan-import.tsx:471` | `toast.success(\`بازگردانی انجام شد — ${…} شناسه باطل شد.\`)` |
| `src/components/persons/PersonCustomFields.tsx:94` | `toast.success("مقدار ذخیره شد")` |
| `src/lib/calls/import-issabel-calls.server.ts:229` | `اتصال به مرکز تلفن پیکربندی نشده است. کلیدهای غایب: …` |
| `src/lib/calls/issabel-cdr.server.ts:135` | `throw new Error(\`زمان CDR قابل خواندن نیست: ${wallClock}\`)` |
| `src/features/ledger-wizard/lookup.ts:287` | `${person.display_name} بیش از یک پرونده دارد. سند روی کدام پرونده ثبت شود؟` |
| `src/lib/navigation/registry.ts:474` | `label: "پخش حساب"` |
| `src/lib/navigation/registry.ts:819` | `label: "داخلی‌های تلفن"` |
| `src/lib/navigation/registry.ts:846` | `label: "تکمیل و پاک‌سازی اشخاص"` |
| `src/lib/navigation/registry.ts:1125` | `label: "سلامت داده‌ها"` |
| **`…_511_manual_credit_floor_guard.sql:54`** | `RAISE EXCEPTION 'تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است'` |
| **`…_515_system_health_reports_require_admin.sql:49`** | `RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'` |
| **`…_519_system_health_guard_targets_api_callers.sql:59`** | `RAISE EXCEPTION 'دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.'` |
| **`…_492_daily_accrual_notice.sql:92`** | `_body := 'امروز ' || _count::text || ' سند تعهدی ثبت شد' || …` |
| `…_420_guest_quotes_get_their_own_reason.sql:170` | `RAISE EXCEPTION 'این کالا در سیستم تعریف نشده است. برای ثبت پیش‌فاکتور، ابتدا محصول باید توسط حسابداری ساخته شود.'` |
| `…_420_guest_quotes_get_their_own_reason.sql:234` | `RAISE EXCEPTION 'این پیش‌فاکتور به پرونده مشتری ثبت‌شده وصل نیست و بدون تأیید حسابداری قابل ثبت نیست.'` |
| `…_420_guest_quotes_get_their_own_reason.sql:244` | `RAISE EXCEPTION 'مشتری مانده معوق دارد. ثبت عادی پیش‌فاکتور مجاز نیست؛ فقط با تعهد کارشناس فروش و تعیین مهلت تسویه امکان ادامه وجود دارد.'` |

---

## (ج) UNCERTAIN — things I could not classify or confirm

1. **Whether migration 525 actually applied to production.** It is written, reviewed and merged
   to `staging` as `d60232f5`, and the Block-67.5 apply line was handed over — but **no
   production output for it has reached me**. Everything else in §B.2 is corroborated by the
   run's own reported progress (Phase 5 block 67 ran, which means Phase 4 completed including
   the 523/524 replacement). **If 525 has not run, the five DEFINER views are still readable —
   and writable — by `anon`.** This is the single most important open item in this document.

2. **Most of the 246 Persian `RAISE` lines are not new wording.** Migrations like 420 and 421
   replace a whole function body, so every pre-existing message inside it shows in the diff as
   an addition. Separating genuinely new text from re-emitted text would require diffing each
   function's previous definition, which was out of scope here. The four migrations whose
   headers state the message itself changed — **421** (guest refusal), **492** (daily notice),
   **511** and **515/519** (the guard refusals) — are the ones I would treat as genuinely new;
   the rest of the 420 block should be assumed pre-existing until checked.

3. **The tag column is my judgement, not the authors'.** No migration carries a machine-readable
   classification. Files touching several areas got several tags; the `SEC` tag was applied
   where the header itself frames the change as closing an access path.

4. **User-visible effect of the five skipped migrations is unverified.** 449, 450 and 452 were
   retirement/cleanup work, so the old tables and functions simply remain in place; I expect no
   UI effect, but nothing measured that. 460 and 477 were superseded by 522 and 523/524 and are
   covered.

5. **Removed routes: I did not verify which were reachable before.** `/operations/receipts` is
   recorded as reading a table that never existed, and `/price-lists` as a self-declared shell,
   so those two were probably already dead to users. The other five are listed as removals from
   the generated route tree and may or may not have appeared in anyone's menu.

6. **Seven of the eight new server/admin routes were not checked for a guard** in this pass. The
   route tree records their existence, not their authorization. `/admin/system-health` is
   covered by 515/519 at the database level; the rest rely on client and server guards that were
   not read here.

7. **`manual_daily_metrics_totals`, `staff_call_metrics_coverage` and `call_import_match_persons`**
   are new functions whose UI exposure I did not trace. They may be internal helpers or may back
   a visible screen.

8. **The 12 already-applied migrations (411–424) are included in the tables above** because they
   fall inside the requested git range, but they did not change production tonight. Their
   user-visible effects — the widened credit ranges in 411/413 especially — landed earlier.
