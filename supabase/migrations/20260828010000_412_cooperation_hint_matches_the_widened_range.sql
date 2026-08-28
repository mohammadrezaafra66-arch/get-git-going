-- 412: the cooperation-history hint must say what the range now allows.
--
-- WHY
--   411 widened customer_cooperation_months from 240 to 360 months, but the hint
--   rendered under the input still read "1 to 240 months". DynamicScoringSection
--   prints input_hint verbatim when it is set and only falls back to the computed
--   min/max when it is NULL, so the accountant would still have believed 240 was
--   the cap -- which defeats the point of widening it.
--
--   The six money parameters need no change: their hints name no numbers.
--
-- This file contains Persian text and is therefore delivered over stdin with an
-- md5 check on both sides, per CLAUDE.md rule 1. Saved UTF-8 without BOM.

SET client_encoding='UTF8';

UPDATE public.dynamic_scoring_parameters
   SET input_hint = 'بین ۱ تا ۳۶۰ ماه'
 WHERE entity_type = 'customer'
   AND code = 'customer_cooperation_months';

DO $verify$
DECLARE
  v_hint text;
BEGIN
  SELECT input_hint INTO v_hint
    FROM public.dynamic_scoring_parameters
   WHERE entity_type = 'customer' AND code = 'customer_cooperation_months';

  IF v_hint IS NULL OR position('۳۶۰' in v_hint) = 0 THEN
    RAISE EXCEPTION '412: cooperation hint does not name the new ceiling: %', v_hint;
  END IF;

  IF position('۲۴۰' in v_hint) > 0 THEN
    RAISE EXCEPTION '412: cooperation hint still names the old ceiling: %', v_hint;
  END IF;

  RAISE NOTICE '412: cooperation hint now matches the widened range';
END
$verify$;
