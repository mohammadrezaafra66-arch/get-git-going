-- r526-export-check.sql -- READ ONLY, ROLLED BACK. Calls the bank-deposit export exactly as the
-- app does (an authenticated accountant or admin JWT, role authenticated) and prints COUNTS ONLY:
-- no names, no codes, no amounts per row. Runbook: docs/runbooks/526-repair-20260914.md,
-- Blocks 3 and 7. ASCII only.
--
-- expected_payment_rows is computed independently from payment_vouchers with the filter 404/526
-- define (approved, not reversed, channel not cash/cheque, date in range), so payments_match is a
-- self-check: false before 526 whenever any such voucher exists, true after it.
BEGIN;
SET TRANSACTION READ ONLY;
\pset format unaligned
\pset tuples_only on
\set r526_from '2026-08-01'
\set r526_to   '2026-12-31'
SELECT set_config('request.jwt.claims',
         json_build_object('sub', (SELECT ur.user_id FROM public.user_roles ur
                                    WHERE ur.role::text IN ('accountant','admin')
                                    ORDER BY (ur.role::text = 'accountant') DESC, ur.user_id LIMIT 1),
                           'role', 'authenticated')::text, true) IS NOT NULL AS claims_set \gset
SELECT set_config('request.jwt.claim.sub',
         (SELECT ur.user_id::text FROM public.user_roles ur
           WHERE ur.role::text IN ('accountant','admin')
           ORDER BY (ur.role::text = 'accountant') DESC, ur.user_id LIMIT 1), true) IS NOT NULL AS sub_set \gset
SET LOCAL ROLE authenticated;
WITH t AS (
  SELECT to_jsonb(x) AS j
    FROM public.asan_list_bank_deposit_export(:'r526_from'::date, :'r526_to'::date) x
), expected AS (
  SELECT count(*) AS n FROM public.payment_vouchers pv
   WHERE pv.status = 'approved' AND pv.reversed_at IS NULL
     AND pv.document_channel NOT IN ('cash','cheque')
     AND pv.payment_date BETWEEN :'r526_from'::date AND :'r526_to'::date
)
SELECT 'r526_export'
    || '|uid_resolved=' || (auth.uid() IS NOT NULL)
    || '|out_columns=' || (SELECT count(*) FROM pg_proc p, unnest(p.proargmodes) m
                            WHERE p.oid = 'public.asan_list_bank_deposit_export(date,date)'::regprocedure AND m = 't')
    || '|total_rows=' || (SELECT count(*) FROM t)
    || '|receipt_rows=' || (SELECT count(*) FROM t WHERE j->>'direction' = 'receipt')
    || '|payment_rows=' || (SELECT count(*) FROM t WHERE j->>'direction' = 'payment')
    || '|rows_without_direction=' || (SELECT count(*) FROM t WHERE NOT (j ? 'direction'))
    || '|voucher_ids_in_output=' || (SELECT count(*) FROM t WHERE (j->>'doc_id')::uuid IN (SELECT id FROM public.payment_vouchers))
    || '|expected_payment_rows=' || (SELECT n FROM expected)
    || '|payments_match=' || ((SELECT count(*) FROM t WHERE (j->>'doc_id')::uuid IN (SELECT id FROM public.payment_vouchers)) = (SELECT n FROM expected))
    || '|blocked_rows=' || (SELECT count(*) FROM t WHERE j->>'blocked_reason' IS NOT NULL);
ROLLBACK;
