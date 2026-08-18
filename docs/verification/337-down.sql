-- 337-down.sql -- rollback for migration 337
-- Safe only while nothing references it. assign_document_number (338) does, so roll 338 back first.
SET client_encoding='UTF8';
DROP FUNCTION IF EXISTS public.jalali_year(date);
