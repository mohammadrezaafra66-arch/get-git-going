# The 74 migrations production is missing — apply order

Generated 2026-09-07T20:42:13Z from `staging` @ `9c113aac` by the orchestrator.

## The audit says 62. The real number is 74.

The audit's list was correct **as of migration 507**. Migrations **508–519** landed on
2026-09-07 (close-out mission, PRs #432 and #434) after it was written.

Running only the 62 leaves production without **511** (credit-floor guard), **515/519**
(system-health `SECURITY DEFINER` guards) and **518** (that guard extended to INSERT) — all
produced by an independent security review that day.

**Set definition:** the audit's 62, plus every migration numbered above 507.
**422, 423 and 424 are deliberately excluded** — production's schema ceiling is 424, so it
already has them. (The audit lists 420 and 421 as still missing even though they sort below
424; that is the schema/ledger drift, and it is why the set is taken from the audit rather
than from a number range.)

**Apply order is filename-timestamp order, not number order** — the numbers interleave
(`446` sorts before `443`, `518` before `517`). Run this table top to bottom.

| order | # | file | source |
|---|---|---|---|
| 1 | 420 | `20260903100000_420_guest_quotes_get_their_own_reason.sql` | audit |
| 2 | 421 | `20260903140000_421_guest_refusal_message_tells_the_truth.sql` | audit |
| 3 | 425 | `20260904160000_425_settlement_dead_predicates.sql` | audit |
| 4 | 430 | `20260904190000_430_asan_import_requires_code_and_mobile.sql` | audit |
| 5 | 431 | `20260904193000_431_retire_person_import_batch.sql` | audit |
| 6 | 432 | `20260904200000_432_asan_import_batch_provenance_and_revert.sql` | audit |
| 7 | 435 | `20260904210000_435_person_delete_when_there_is_no_history.sql` | audit |
| 8 | 436 | `20260905100000_436_close_anon_role_grant_escalation.sql` | audit |
| 9 | 446 | `20260905110000_446_attach_purchase_actor_active_trigger.sql` | audit |
| 10 | 443 | `20260905130000_443_fix_ambiguous_outparams_and_assert_route_permissions.sql` | audit |
| 11 | 445 | `20260905140000_445_scheduled_jobs_documentation.sql` | audit |
| 12 | 437 | `20260905163000_437_inline_create_registers_asan_identifier.sql` | audit |
| 13 | 447 | `20260905170000_447_retire_capital_allocation_tombstones.sql` | audit |
| 14 | 448 | `20260905170500_448_retire_superseded_functions.sql` | audit |
| 15 | 449 | `20260905171000_449_retire_daily_capital_functions.sql` | audit |
| 16 | 450 | `20260905171500_450_retire_superseded_tables.sql` | audit |
| 17 | 451 | `20260905172000_451_retire_app_role_wrappers.sql` | audit |
| 18 | 452 | `20260905180000_452_retire_parameter_weight_backups_by_rename.sql` | audit |
| 19 | 453 | `20260905183000_453_credit_customers_report_uncomputed_as_null.sql` | audit |
| 20 | 454 | `20260905220000_454_wire_overdue_gate_to_receivables.sql` | audit |
| 21 | 455 | `20260905221500_455_score_period_current_month_then_dated_fallback.sql` | audit |
| 22 | 457 | `20260905224500_457_payables_debt_is_the_purchase_total.sql` | audit |
| 23 | 458 | `20260905230000_458_receivables_summary_keeps_unknown_due_dates.sql` | audit |
| 24 | 459 | `20260905231500_459_payables_names_an_unknown_due_date.sql` | audit |
| 25 | 460 | `20260906090000_460_pin_receipt_ocr_to_local_vision.sql` | audit |
| 26 | 461 | `20260906091500_461_gate_hold_and_release_credit.sql` | audit |
| 27 | 462 | `20260906093000_462_gate_money_tier_definers.sql` | audit |
| 28 | 463 | `20260906094500_463_gate_identity_tier_definers.sql` | audit |
| 29 | 464 | `20260906100000_464_gate_catalogue_tier_definers.sql` | audit |
| 30 | 465 | `20260906101500_465_gate_housekeeping_tier_definers.sql` | audit |
| 31 | 466 | `20260906103000_466_receivables_carry_salesperson_and_ceiling.sql` | audit |
| 32 | 467 | `20260906110000_467_scoring_tables_select_credit_audience.sql` | audit |
| 33 | 468 | `20260906111500_468_bot_writers_require_a_valid_key.sql` | audit |
| 34 | 469 | `20260906113000_469_market_rate_system_rpcs_test_for_service_role_positively.sql` | audit |
| 35 | 470 | `20260906114500_470_expire_pending_documents_loses_its_direct_authenticated_grant.sql` | audit |
| 36 | 471 | `20260906120000_471_ai_provider_key_and_bot_readers_require_a_caller.sql` | audit |
| 37 | 475 | `20260906130000_475_audit_ai_routing_changes.sql` | audit |
| 38 | 476 | `20260906140000_476_close_pre393_anon_execute_grants.sql` | audit |
| 39 | 477 | `20260906150000_477_close_anon_table_grants.sql` | audit |
| 40 | 478 | `20260906160000_478_partial_purchase_payment.sql` | audit |
| 41 | 481 | `20260906170000_481_allocation_rows.sql` | audit |
| 42 | 482 | `20260906171500_482_allocation_rpcs.sql` | audit |
| 43 | 483 | `20260906180000_483_allocation_rows_audit_write_triggers.sql` | audit |
| 44 | 484 | `20260906181000_484_retire_capital_allocation_ledger.sql` | audit |
| 45 | 485 | `20260906182000_485_fill_role_permissions_gaps.sql` | audit |
| 46 | 486 | `20260906190000_486_chart_of_accounts.sql` | audit |
| 47 | 487 | `20260906190500_487_ledger_accrual_columns.sql` | audit |
| 48 | 488 | `20260906191000_488_sale_accrual_posting.sql` | audit |
| 49 | 489 | `20260906191500_489_purchase_accrual_posting.sql` | audit |
| 50 | 490 | `20260906192000_490_quote_status_cancelled_after_accept.sql` | audit |
| 51 | 491 | `20260906192500_491_accrual_cancel_paths.sql` | audit |
| 52 | 492 | `20260906193000_492_daily_accrual_notice.sql` | audit |
| 53 | 493 | `20260906193500_493_notification_type_daily_accrual.sql` | audit |
| 54 | 494 | `20260906194000_494_purchase_payment_outstanding_clamp.sql` | audit |
| 55 | 495 | `20260906194500_495_implicit_payment_is_outstanding.sql` | audit |
| 56 | 496 | `20260906200000_496_call_logs_batch_score_recompute.sql` | audit |
| 57 | 497 | `20260906201000_497_call_logs_cdr_columns.sql` | audit |
| 58 | 498 | `20260906202000_498_call_log_extensions.sql` | audit |
| 59 | 504 | `20260906210000_504_employee_streaks_daily.sql` | audit |
| 60 | 505 | `20260906211000_505_credit_request_approval.sql` | audit |
| 61 | 506 | `20260906212000_506_capital_manual_floor.sql` | audit |
| 62 | 507 | `20260907060000_507_cron_definer_writers_are_not_authenticated_callable.sql` | audit |
| 63 | 508 | `20260907090000_508_delete_residue_allocation_row.sql` | **NEW — post-audit** |
| 64 | 509 | `20260907093000_509_allocation_tehran_today.sql` | **NEW — post-audit** |
| 65 | 512 | `20260907100000_512_call_logs_issabel_import_foundation.sql` | **NEW — post-audit** |
| 66 | 510 | `20260907103000_510_daily_allocation_honours_manual_floor.sql` | **NEW — post-audit** |
| 67 | 513 | `20260907110000_513_call_import_worker_recompute.sql` | **NEW — post-audit** |
| 68 | 511 | `20260907113000_511_manual_credit_floor_guard.sql` | **NEW — post-audit** |
| 69 | 515 | `20260907123000_515_system_health_reports_require_admin.sql` | **NEW — post-audit** |
| 70 | 514 | `20260907130000_514_call_extension_activity_views.sql` | **NEW — post-audit** |
| 71 | 516 | `20260907140000_516_call_extension_views_least_privilege.sql` | **NEW — post-audit** |
| 72 | 518 | `20260907150000_518_manual_credit_floor_guard_covers_insert.sql` | **NEW — post-audit** |
| 73 | 517 | `20260907154500_517_derive_staff_call_metrics.sql` | **NEW — post-audit** |
| 74 | 519 | `20260907170000_519_system_health_guard_targets_api_callers.sql` | **NEW — post-audit** |
