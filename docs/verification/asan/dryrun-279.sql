SET client_encoding='UTF8';
BEGIN;
\i /tmp/mig279.sql
SELECT 'remaining_corrupt_after_dryrun' AS check, count(*) AS n
  FROM (
    SELECT 1 FROM public.gamification_kpis WHERE label_fa ~ '[?]{2,}' OR description ~ '[?]{2,}'
    UNION ALL SELECT 1 FROM public.achievements WHERE title_fa ~ '[?]{2,}' OR description ~ '[?]{2,}'
    UNION ALL SELECT 1 FROM public.daily_mood_hafez_poems WHERE title ~ '[?]{2,}' OR poem_text ~ '[?]{2,}' OR interpretation ~ '[?]{2,}'
    UNION ALL SELECT 1 FROM public.daily_mood_questions WHERE question_text ~ '[?]{2,}'
    UNION ALL SELECT 1 FROM public.price_change_reasons WHERE title ~ '[?]{2,}'
    UNION ALL SELECT 1 FROM public.market_indicators WHERE title_fa ~ '[?]{2,}'
    UNION ALL SELECT 1 FROM public.league_settings WHERE title_fa ~ '[?]{2,}'
  ) s;
ROLLBACK;
