-- MKT: session id + sales_text_copied event type + session dedup index
-- (applied manually via PowerShell on self-hosted Supabase)

-- 1) ستون شناسهٔ نشستِ جست‌وجو برای dedup نشستی
ALTER TABLE public.product_interaction_events
  ADD COLUMN IF NOT EXISTS search_session_id uuid;

-- 2) گسترش CHECK نوع رویداد: افزودن 'sales_text_copied'
ALTER TABLE public.product_interaction_events
  DROP CONSTRAINT IF EXISTS product_interaction_events_event_type_check;
ALTER TABLE public.product_interaction_events
  ADD CONSTRAINT product_interaction_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'search_result_viewed',
    'price_checked',
    'chart_opened',
    'product_details_opened',
    'board_price_viewed',
    'sales_text_copied'
  ]::text[]));

-- 3) یونیک‌ایندکسِ partial: هر رویداد یک‌بار per (کاربر، محصول، نشست، نوع)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pie_session_dedup
  ON public.product_interaction_events (user_id, product_id, search_session_id, event_type)
  WHERE search_session_id IS NOT NULL;
