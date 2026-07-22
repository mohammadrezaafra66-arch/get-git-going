-- =============================================================================
-- AfraKala — SAFE DELETE PREVIEW for the QA test batch (2026-07-19)
-- =============================================================================
-- STATUS: PREVIEW ONLY. As written this script COMMITS NOTHING — it ends with
--         ROLLBACK. Nothing is deleted when you run it as-is. It prints exactly
--         what WOULD be removed. To actually delete, see the note at the bottom.
--
-- SCOPE: the QA seed batch inserted in a single transaction at
--        created_at = 2026-07-19 09:01:35.788033+00 (created_by NULL, "QA-"
--        names, Persian destroyed to '?'). That batch is:
--          products  = 20  (AFK-2026-00402 .. 00421)
--          persons   = 10
--          customers =  5
--          suppliers =  5
--        plus its dependent child rows (verified live):
--          sale_list_items       = 40  (product-linked)
--          product_suppliers     =  1  (links a QA product to a QA supplier)
--          customer_credit_balance = 1 (customer-linked)
--
-- FK ORDER: children first, then parents. The identity set is pinned by the
--           exact batch timestamp so no non-QA data can ever match.
--
-- RUN (preview, from repo root):
--   docker exec -e PGPASSWORD="$PW" -i afrakala-lan-db \
--     psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 \
--     < docs/qa/qa-batch-delete-preview.sql
-- =============================================================================

\set QATS '2026-07-19 09:01:35.788033+00'

BEGIN;

-- Resolve the QA id sets ONCE into temp tables (single source of truth).
CREATE TEMP TABLE _qa_products  ON COMMIT DROP AS SELECT id FROM products  WHERE created_at = :'QATS';
CREATE TEMP TABLE _qa_persons   ON COMMIT DROP AS SELECT id FROM persons   WHERE created_at = :'QATS';
CREATE TEMP TABLE _qa_customers ON COMMIT DROP AS SELECT id FROM customers WHERE created_at = :'QATS';
CREATE TEMP TABLE _qa_suppliers ON COMMIT DROP AS SELECT id FROM suppliers WHERE created_at = :'QATS';

-- ---- BEFORE: what the batch and its dependents look like --------------------
\echo '=== QA parent counts (expect products=20 persons=10 customers=5 suppliers=5) ==='
SELECT
  (SELECT count(*) FROM _qa_products)  AS products,
  (SELECT count(*) FROM _qa_persons)   AS persons,
  (SELECT count(*) FROM _qa_customers) AS customers,
  (SELECT count(*) FROM _qa_suppliers) AS suppliers;

\echo '=== dependent child rows that will be removed first ==='
SELECT 'sale_list_items'         AS child, count(*) FROM sale_list_items       WHERE product_id  IN (SELECT id FROM _qa_products)
UNION ALL
SELECT 'product_suppliers',      count(*) FROM product_suppliers   WHERE product_id  IN (SELECT id FROM _qa_products)
                                                                      OR supplier_id IN (SELECT id FROM _qa_suppliers)
UNION ALL
SELECT 'customer_credit_balance', count(*) FROM customer_credit_balance WHERE customer_id IN (SELECT id FROM _qa_customers);

-- ---- STEP 1: children ------------------------------------------------------
DELETE FROM sale_list_items        WHERE product_id  IN (SELECT id FROM _qa_products);
DELETE FROM product_suppliers      WHERE product_id  IN (SELECT id FROM _qa_products)
                                      OR supplier_id IN (SELECT id FROM _qa_suppliers);
DELETE FROM customer_credit_balance WHERE customer_id IN (SELECT id FROM _qa_customers);

-- ---- STEP 2: parents (now free of inbound FKs) -----------------------------
DELETE FROM products  WHERE id IN (SELECT id FROM _qa_products);
DELETE FROM customers WHERE id IN (SELECT id FROM _qa_customers);
DELETE FROM suppliers WHERE id IN (SELECT id FROM _qa_suppliers);
DELETE FROM persons   WHERE id IN (SELECT id FROM _qa_persons);

-- ---- AFTER: prove the batch is gone (all zero) inside the transaction ------
\echo '=== AFTER (inside txn, should all be 0) ==='
SELECT
  (SELECT count(*) FROM products  WHERE created_at = :'QATS') AS products_left,
  (SELECT count(*) FROM persons   WHERE created_at = :'QATS') AS persons_left,
  (SELECT count(*) FROM customers WHERE created_at = :'QATS') AS customers_left,
  (SELECT count(*) FROM suppliers WHERE created_at = :'QATS') AS suppliers_left;

-- =============================================================================
-- PREVIEW GUARD: rolls everything back. Nothing above is persisted.
ROLLBACK;
-- =============================================================================
-- TO EXECUTE FOR REAL (only after a fresh backup + explicit approval):
--   1) Take a backup:  pg_dump -U supabase_admin -d afrakala -Fc -f backup_pre_qa_delete.dump
--   2) Change the final "ROLLBACK;" above to "COMMIT;"
--   3) Re-run the same command. (Optionally also delete the 2 draft test
--      sale_lists «تست456» / «فشکی تست» — they are separate test containers,
--      NOT part of this 2026-07-19 batch, so they are intentionally left alone
--      here.)
-- =============================================================================
