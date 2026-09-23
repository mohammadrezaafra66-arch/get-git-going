# F5 checkpoint
updated: 2026-09-22T15:16:00+05:00
state: PASS
item: F5 A2/A5
deadline_at: 2026-09-22T18:30:00+05:00
budget_min: 75
killable: false

## Result
- A2 PASS — close→done+completed_at; UI «تاریخ بسته شدن»+«بازگشایی»; reopen clears completed_at; sections ایجادکننده/مسئول/تاریخ‌ثبت; events≥2
- A5 PASS — «+ تأمین‌کنندهٔ جدید» → supplier+purchase; purchase.supplier_id=new; notes marked; no SUPPLIER_REQUIRED
- Cleanup: work_items=0 suppliers=0 purchases=0 persons=0 customers=0

## Evidence
- f5-run.txt EXIT_CODE=0 (2 passed, 12.1s)
- f5-a2.txt / f5-a5.txt / f5-cleanup.txt
- APP_GIT_SHA=e2d67d0e HEAD(worktree)=ffb9e2bf…

## E4 failability (prior)
- Earlier A5 run failed: purchase_count=0 (fragile form fill before c1-pattern harden) — see conversation f5-run first attempt
- Mid A2 run failed: body still «در حال بررسی جلسه» after goto without wait — fixed by same-page assert after بستن

## Commit
- HEAD after F5 test commit: 073e9e3e
