SET client_encoding='UTF8';

-- 306 - P0.3b. Finish the cleanup migration 304 left half-done.
--
-- WHAT WENT WRONG IN 304. Migration 304 deleted 322 e2e purchases, their items,
-- idempotency keys, stock movements, and 158 purchase_request_fulfillments -
-- but it did NOT delete the purchase_requests those fulfillments belonged to.
-- purchase_requests carries a DERIVED status: 'purchased' / 'partially_purchased'
-- are supposed to be backed by fulfillment rows recording what was supplied.
-- Removing the fulfillments while keeping the parents left 121 requests
-- asserting a status with no evidence behind it:
--
--     purchased            98 of 104
--     partially_purchased  23 of  24
--
-- 304 asserted that no CHILD row outlived its parent, and that held. It never
-- asked the inverse question - whether deleting children invalidates a PARENT's
-- derived state. Referential integrity held; semantic integrity did not.
--
-- e2e/purchase/c5-permissions.spec.ts:277 (E2E-8) catches exactly this, as a
-- whole-table invariant. It is correct and must not be weakened.
--
-- WHY DELETE RATHER THAN RESTORE. All 121 orphaned requests are e2e residue -
-- verified live: 121 of 121 carry an 'E2E%' notes marker, and zero were created
-- before 2026-08-01. Deleting them completes 304's intent. Restoring 322
-- purchases from the P0.3 backup would also work but re-introduces everything
-- P0.3 set out to remove.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. purchase_requests.legacy_no_fulfillment
-- exists and would silence E2E-8 if set on these rows. It is not used here.
-- Exactly 1 row in the table legitimately carries that flag; marking 121 recent
-- e2e rows as "legacy" would be falsifying data to pass a test.
--
-- Dependent census (live, 2026-08-07):
--   purchase_request_fulfillments  0 for these rows (that is why they orphaned)
--                                  FK is ON DELETE RESTRICT, so a stale one aborts
--   purchase_receipts              ON DELETE CASCADE
--   purchase_request_status_history ON DELETE CASCADE
--
-- Down script: docs/verification/306-down.sql

-- Transaction control belongs to the caller (psql --single-transaction).
CREATE TEMP TABLE _p03b_targets(request_id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _p03b_targets(request_id)
  SELECT r.id
    FROM public.purchase_requests r
   WHERE r.status IN ('purchased','partially_purchased')
     AND NOT r.legacy_no_fulfillment
     AND coalesce((SELECT sum(f.allocated_quantity)
                     FROM public.purchase_request_fulfillments f
                    WHERE f.purchase_request_id = r.id), 0) <= 0;

-- Guard 1: every target must be e2e residue. A request without the marker is a
-- real one and must never be deleted by this migration.
DO $$
DECLARE _bad int;
BEGIN
  SELECT count(*) INTO _bad
    FROM _p03b_targets t
    JOIN public.purchase_requests r ON r.id = t.request_id
   WHERE r.notes IS NULL OR r.notes NOT LIKE 'E2E%';
  IF _bad > 0 THEN
    RAISE EXCEPTION
      'P0.3b aborted: % target request(s) carry no E2E marker - not residue.', _bad;
  END IF;
END $$;

-- Guard 2: none may have acquired supply since the census. If one has, it is no
-- longer orphaned and must not be deleted.
DO $$
DECLARE _bad int;
BEGIN
  SELECT count(*) INTO _bad
    FROM _p03b_targets t
   WHERE coalesce((SELECT sum(f.allocated_quantity)
                     FROM public.purchase_request_fulfillments f
                    WHERE f.purchase_request_id = t.request_id), 0) > 0;
  IF _bad > 0 THEN
    RAISE EXCEPTION 'P0.3b aborted: % target(s) now have fulfillment rows.', _bad;
  END IF;
END $$;

-- purchase_request_fulfillments is ON DELETE RESTRICT, so clear any stale row
-- explicitly rather than letting the parent delete abort.
DELETE FROM public.purchase_request_fulfillments
 WHERE purchase_request_id IN (SELECT request_id FROM _p03b_targets);

-- purchase_receipts and purchase_request_status_history are ON DELETE CASCADE,
-- but naming them keeps the row counts visible in psql output.
DELETE FROM public.purchase_receipts
 WHERE request_id IN (SELECT request_id FROM _p03b_targets);

DELETE FROM public.purchase_request_status_history
 WHERE request_id IN (SELECT request_id FROM _p03b_targets);

DELETE FROM public.purchase_requests
 WHERE id IN (SELECT request_id FROM _p03b_targets);

-- Assert the invariant E2E-8 checks is restored.
DO $$
DECLARE _left int;
BEGIN
  SELECT count(*) INTO _left
    FROM public.purchase_requests r
   WHERE r.status IN ('purchased','partially_purchased')
     AND NOT r.legacy_no_fulfillment
     AND coalesce((SELECT sum(f.allocated_quantity)
                     FROM public.purchase_request_fulfillments f
                    WHERE f.purchase_request_id = r.id), 0) <= 0;
  IF _left <> 0 THEN
    RAISE EXCEPTION
      'P0.3b failed: % request(s) still claim a derived status with no supply.', _left;
  END IF;
END $$;
