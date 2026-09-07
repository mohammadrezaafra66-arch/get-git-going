-- V-2 step 4, ISOLATED. Transaction 2 of the first probe was confounded: run on CURRENT_DATE
-- it produced customers_count = 0, because dynamic_entity_scores holds nothing for 2026-09 and
-- every score is therefore zero. That is a separate finding, not a measurement of the floor.
--
-- This runs the SAME function on 2026-08-30 -- a date with no setting yet, but inside the
-- month whose scores exist -- so the population is non-empty and the only question left is
-- whether the approved floor is applied. Rolled back; nothing is written.
SET client_encoding = 'UTF8';
BEGIN;

SET LOCAL "request.jwt.claims" = '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}';
INSERT INTO credit_requests (id, customer_id, requested_by, requested_amount, status, notes)
VALUES ('00000000-0000-4000-8000-000000002c01'::uuid,
        '869e7514-033f-4fe7-a8a3-6ac6caf89861',
        '00ebe9d3-b467-453c-89d6-08bab46335c2',
        2000000000, 'pending', 'V-2 rolled-back probe');

SET LOCAL "request.jwt.claims" = '{"sub":"a0a4afe5-c6a1-4ed5-a1e6-a41cc45a046b","role":"authenticated"}';
SELECT public.review_credit_request('00000000-0000-4000-8000-000000002c01'::uuid, 'approved', 'V-2 probe');

\echo '=== T3: floor is recorded BEFORE the formula runs ==='
SELECT name, manual_credit_floor FROM customers WHERE id = '869e7514-033f-4fe7-a8a3-6ac6caf89861';

SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
\echo '=== T3: run_daily_capital_allocation(2026-08-30, 3500000000) ==='
SELECT public.run_daily_capital_allocation(DATE '2026-08-30', 3500000000, 'V-2 probe');

\echo '=== T3 RESULT: the new snapshot, floor = 2000000000 was in place ==='
SELECT c.name, c.manual_credit_floor, a.raw_allocation, a.final_limit, a.binding_constraint
  FROM customers c
  LEFT JOIN customer_capital_allocations_dynamic a
    ON a.customer_id = c.id
   AND a.capital_setting_id = (SELECT id FROM daily_capital_settings WHERE capital_date = DATE '2026-08-30')
 WHERE c.id IN ('869e7514-033f-4fe7-a8a3-6ac6caf89861','ce69632d-5426-4eee-9b46-0b2651e4005d');

ROLLBACK;
\echo '=== AFTER ROLLBACK ==='
SELECT count(*) AS settings_2026_08_30 FROM daily_capital_settings WHERE capital_date = DATE '2026-08-30';
SELECT count(*) AS floors FROM customers WHERE manual_credit_floor IS NOT NULL;
