-- 337 -- task 1.2 prerequisite -- Gregorian -> Jalali YEAR helper
--
-- WHY
-- decisions.md D3 fixes the document-number format as <PREFIX>-<jalali year>-<6 digits>
-- ("RCP-1405-000042"), "Jalali year because the accountant reads it". The database has no
-- Gregorian->Jalali conversion of any kind: the only date helper is tehran_today(), and the
-- `jalali_date_label` column on market_rate_ticks is caller-supplied text, not a conversion.
-- Task 1.2 therefore cannot produce its specified format without this primitive.
--
-- This is additive and reversible. Recorded in phase-1-PROGRESS.md as infrastructure the
-- checklist did not list but D3 requires.
--
-- ALGORITHM
-- The standard Khayyam/Birashk civil algorithm used by every Persian calendar library.
-- Pure integer arithmetic, IMMUTABLE, no I/O.
--
-- ROLLBACK: docs/verification/337-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.jalali_year(_d date)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  gy   int;
  gm   int;
  gd   int;
  gy2  int;
  days bigint;
  jy   int;
  gdm  int[] := ARRAY[0,31,59,90,120,151,181,212,243,273,304,334];
BEGIN
  IF _d IS NULL THEN
    RETURN NULL;
  END IF;

  gy := EXTRACT(YEAR  FROM _d)::int;
  gm := EXTRACT(MONTH FROM _d)::int;
  gd := EXTRACT(DAY   FROM _d)::int;

  IF gm > 2 THEN gy2 := gy + 1; ELSE gy2 := gy; END IF;

  days := 355666
        + (365::bigint * gy)
        + floor((gy2 + 3) / 4.0)::bigint
        - floor((gy2 + 99) / 100.0)::bigint
        + floor((gy2 + 399) / 400.0)::bigint
        + gd
        + gdm[gm];

  jy   := -1595 + (33 * floor(days / 12053.0)::int);
  days := days % 12053;

  jy   := jy + (4 * floor(days / 1461.0)::int);
  days := days % 1461;

  IF days > 365 THEN
    jy   := jy + floor((days - 1) / 365.0)::int;
    days := (days - 1) % 365;
  END IF;

  RETURN jy;
END;
$function$;

COMMENT ON FUNCTION public.jalali_year(date) IS
  'Gregorian date -> Jalali (Solar Hijri) year. Used by assign_document_number for the D3 number format.';

-- Anchor assertions: the migration refuses to apply if the conversion is wrong.
DO $verify$
BEGIN
  IF public.jalali_year(DATE '2026-08-18') <> 1405 THEN
    RAISE EXCEPTION '337: jalali_year(2026-08-18) = % expected 1405', public.jalali_year(DATE '2026-08-18');
  END IF;
  IF public.jalali_year(DATE '2026-03-20') <> 1404 THEN
    RAISE EXCEPTION '337: jalali_year(2026-03-20) = % expected 1404 (day before Nowruz 1405)', public.jalali_year(DATE '2026-03-20');
  END IF;
  IF public.jalali_year(DATE '2026-03-21') <> 1405 THEN
    RAISE EXCEPTION '337: jalali_year(2026-03-21) = % expected 1405 (Nowruz 1405)', public.jalali_year(DATE '2026-03-21');
  END IF;
  IF public.jalali_year(DATE '2021-03-21') <> 1400 THEN
    RAISE EXCEPTION '337: jalali_year(2021-03-21) = % expected 1400', public.jalali_year(DATE '2021-03-21');
  END IF;
  IF public.jalali_year(DATE '2024-03-19') <> 1402 THEN
    RAISE EXCEPTION '337: jalali_year(2024-03-19) = % expected 1402', public.jalali_year(DATE '2024-03-19');
  END IF;
  IF public.jalali_year(DATE '2024-03-20') <> 1403 THEN
    RAISE EXCEPTION '337: jalali_year(2024-03-20) = % expected 1403 (Nowruz 1403)', public.jalali_year(DATE '2024-03-20');
  END IF;
END
$verify$;
