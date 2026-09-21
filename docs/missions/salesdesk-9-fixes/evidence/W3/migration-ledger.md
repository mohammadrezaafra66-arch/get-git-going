# W3 Migration Ledger (atomic [B-4]) — locked 2026-09-22 before dispatch
| NNN | Timestamp prefix | Concern | Row |
|-----|------------------|---------|-----|
| 565 | 20260922040000 | responsible_required + YES_BACKFILL salesperson_id NULL→author_id | C2 |
| 566 | 20260922040100 | won_at / lost_at columns + maintain triggers | C7 |
| 567 | 20260922040200 | deal_lost_reasons + lost_reason_* + LOST_REASON_REQUIRED | C8 |
| 568 | 20260922040300 | sales_interaction_items | C6 |
| 569 | 20260922040400 | sales_quotes.interaction_id | C9 |
| 570 | 20260922040500 | notify_sales_interaction_assigned title → من مسئول شدم | C4 |
