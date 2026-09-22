# F3 checkpoint — post-deploy rerun
updated: 2026-09-22T14:00:00+05:00
state: FAIL
item: F3 C9/C5 rerun after APP_GIT_SHA=e2241aed (product_price prefill d81abfcd)
APP_GIT_SHA: e2241aed
HEAD: e2241aed
C9: FAIL — attempt 2 PRODUCT_FIX_NEEDED
  - attempt-1 fixed: deal prefill now uses product_price (unit price disabled, value>0; no longer source=manual reject)
  - attempt-2 NEW: quote save rejected with `permission denied for table sales_quotes`
  - asserts not reached: draft status / salesperson_id=responsible / interaction_id=deal / tab «پیش‌فاکتورها» / KPI-before==after
C5: PASS — UI+SQL +1; markers 0 after cleanup
PRODUCT_FIX_NEEDED: yes (attempt 2) — sales role cannot INSERT/RPC into sales_quotes (`permission denied for table sales_quotes`); not a test assertion defect
spec_stability: price fill only when enabled; rejection dialog wait; stale attempt-1 PRODUCT_BUG text removed from fail dump
evidence: f3-rerun.txt, f3-c9.txt, f3-c5.txt, f3-rerun-cleanup.txt, e2e/missions/salesdesk-9-fixes-fix-f3.spec.ts
cleanup: sales_quotes=0, sales_interaction_items=0, sales_interactions=0, persons=0, customers=0
