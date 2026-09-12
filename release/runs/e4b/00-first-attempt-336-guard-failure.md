
## Replay batch 1-8 of 22

ledger rows BEFORE this batch: 681
delivered supabase/migrations/20260818150000_336_drop_dead_receipt_posting_path.sql -> afrakala-lan-db:/tmp/mig_20260818150000.sql (md5 998b93752f7f92cf47f472a1ee3a5b83, identical both sides)
=== apply 20260818150000_336_drop_dead_receipt_posting_path.sql (version 20260818150000) ===
SET
psql:/tmp/mig_20260818150000.sql:35: ERROR:  wrong database: prod_rehearsal_e4b (expected afrakala)
CONTEXT:  PL/pgSQL function inline_code_block line 4 at RAISE
*** APPLY FAILED: 20260818150000_336_drop_dead_receipt_posting_path.sql (exit 3) -- transaction rolled back, ledger NOT written ***
STOPPING at first failure: 20260818150000 (APPLY) at plan index 1

## Shape-mismatch findings (replay-time, see release/lib/shape-tolerance.sh)

none — every replayed migration either applied cleanly or was not attempted.

ledger rows AFTER  this batch : 681
ledger DELTA       this batch : 0
plan progress                 : 0 of 22
## VERDICT: FAIL (replay stopped early)
