-- V-2 steps 3 and 4, measured without writing anything.
--
-- Every statement below runs inside BEGIN ... ROLLBACK. The two formula entry points are
-- driven in SEPARATE transactions on purpose: recompute_dynamic_capital_setting creates its
-- temp tables ON COMMIT DROP, and run_daily_capital_allocation then re-CREATEs the same
-- names without IF NOT EXISTS, so the two cannot share one transaction.
--
-- Customer A = 869e7514 "حانیه ماهرو"  -- responsible = test.sales2, IS in the allocation set
-- Customer B = ce69632d "مشتری آزمایشی 16" -- responsible = test.sales, NOT in it (that
--              salesperson's allocated_capital is 0, so the recompute loop skips them)
SET client_encoding = 'UTF8';

\echo '=== SETTING 2026-08-31 c977b3f9 : BASELINE ==='
SELECT c.name, a.raw_allocation, a.final_limit, a.binding_constraint, c.manual_credit_floor
  FROM customers c
  LEFT JOIN customer_capital_allocations_dynamic a
    ON a.customer_id = c.id AND a.capital_setting_id = 'c977b3f9-6313-4f9a-bc6c-bbf51734c331'
 WHERE c.id IN ('869e7514-033f-4fe7-a8a3-6ac6caf89861','ce69632d-5426-4eee-9b46-0b2651e4005d');

-- ==========================================================================================
-- TRANSACTION 1 -- the caller that migration 506 taught about the floor.
-- ==========================================================================================
BEGIN;

SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
INSERT INTO credit_requests (id, customer_id, requested_by, requested_amount, status, notes)
VALUES ('00000000-0000-4000-8000-000000002a01'::uuid,
        '869e7514-033f-4fe7-a8a3-6ac6caf89861',
        '00ebe9d3-b467-453c-89d6-08bab46335c2',
        2000000000, 'pending', 'V-2 rolled-back probe');

SET LOCAL "request.jwt.claims" = '{"sub":"a0a4afe5-c6a1-4ed5-a1e6-a41cc45a046b","role":"authenticated"}';
\echo '=== T1: review_credit_request as MANAGER ==='
SELECT public.review_credit_request('00000000-0000-4000-8000-000000002a01'::uuid, 'approved', 'V-2 probe');

\echo '=== T1: customers.manual_credit_floor after approval ==='
SELECT id, name, manual_credit_floor FROM customers
 WHERE id IN ('869e7514-033f-4fe7-a8a3-6ac6caf89861','ce69632d-5426-4eee-9b46-0b2651e4005d');

SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
\echo '=== T1: recompute_dynamic_capital_setting(2026-08-31) ==='
SELECT public.recompute_dynamic_capital_setting('c977b3f9-6313-4f9a-bc6c-bbf51734c331'::uuid, 'V-2 probe');

\echo '=== T1 RESULT: does final_limit carry the override? ==='
SELECT c.name, a.raw_allocation, a.final_limit, a.binding_constraint
  FROM customers c
  LEFT JOIN customer_capital_allocations_dynamic a
    ON a.customer_id = c.id AND a.capital_setting_id = 'c977b3f9-6313-4f9a-bc6c-bbf51734c331'
 WHERE c.id IN ('869e7514-033f-4fe7-a8a3-6ac6caf89861','ce69632d-5426-4eee-9b46-0b2651e4005d');

ROLLBACK;

-- ==========================================================================================
-- TRANSACTION 2 -- the caller the UI actually reaches:
-- /accounting/dynamic-capital -> useDynamicCapital.ts:101 -> run_daily_capital_allocation
-- ==========================================================================================
BEGIN;

SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
INSERT INTO credit_requests (id, customer_id, requested_by, requested_amount, status, notes)
VALUES ('00000000-0000-4000-8000-000000002b01'::uuid,
        '869e7514-033f-4fe7-a8a3-6ac6caf89861',
        '00ebe9d3-b467-453c-89d6-08bab46335c2',
        2000000000, 'pending', 'V-2 rolled-back probe');

SET LOCAL "request.jwt.claims" = '{"sub":"a0a4afe5-c6a1-4ed5-a1e6-a41cc45a046b","role":"authenticated"}';
SELECT public.review_credit_request('00000000-0000-4000-8000-000000002b01'::uuid, 'approved', 'V-2 probe');

\echo '=== T2: manual_credit_floor is in place before the formula runs ==='
SELECT id, name, manual_credit_floor FROM customers
 WHERE id = '869e7514-033f-4fe7-a8a3-6ac6caf89861';

SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
\echo '=== T2: run_daily_capital_allocation(CURRENT_DATE, 3500000000) ==='
SELECT public.run_daily_capital_allocation(CURRENT_DATE, 3500000000, 'V-2 probe');

\echo '=== T2 RESULT: does the NEW snapshot carry the override? ==='
SELECT c.name, a.raw_allocation, a.final_limit, a.binding_constraint
  FROM customers c
  LEFT JOIN customer_capital_allocations_dynamic a
    ON a.customer_id = c.id
   AND a.capital_setting_id = (SELECT id FROM daily_capital_settings WHERE capital_date = CURRENT_DATE)
 WHERE c.id IN ('869e7514-033f-4fe7-a8a3-6ac6caf89861','ce69632d-5426-4eee-9b46-0b2651e4005d');

ROLLBACK;

\echo '=== AFTER ROLLBACK: nothing was written ==='
SELECT (SELECT count(*) FROM daily_capital_settings WHERE capital_date = CURRENT_DATE) AS settings_today,
       (SELECT count(*) FROM customers WHERE manual_credit_floor IS NOT NULL) AS floors,
       (SELECT count(*) FROM credit_requests) AS credit_requests;
