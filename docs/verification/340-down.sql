-- 340-down.sql -- rollback for migration 340 (task 1.3)
-- Safe while no RPC calls it (i.e. before phase 2 wires it in).
SET client_encoding='UTF8';
DROP FUNCTION IF EXISTS public.require_asan_code(uuid);
