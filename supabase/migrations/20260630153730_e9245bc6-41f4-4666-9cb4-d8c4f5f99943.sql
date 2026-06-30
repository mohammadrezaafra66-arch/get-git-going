-- Lock down academy_quiz_questions.correct_value at column level.
-- Even if a future row-level policy broadens SELECT to authenticated users,
-- the correct_value column itself will not be returned via PostgREST.
REVOKE SELECT ON public.academy_quiz_questions FROM anon, authenticated;
GRANT SELECT (id, quiz_id, question_text, options, order_index)
  ON public.academy_quiz_questions TO anon, authenticated;

-- Lock down currency_sources.api_key at column level.
-- The api_key is only needed server-side (via supabaseAdmin in
-- autoFetchCurrencyRate). PostgREST clients no longer see it.
REVOKE SELECT ON public.currency_sources FROM anon, authenticated;
GRANT SELECT (id, name, url, is_active, created_at, updated_at)
  ON public.currency_sources TO anon, authenticated;
