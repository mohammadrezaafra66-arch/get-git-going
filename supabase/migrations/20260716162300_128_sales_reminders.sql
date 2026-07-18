-- =========================================================================
-- 128 — sales reminders (rotating 2s popup on Quick Sales Search)
-- =========================================================================
-- A small, editable list of reminder messages. Every time /sales/search opens
-- one active reminder is shown for ~2s. Everyone may read; only admin/manager
-- may manage the list.
--
-- Self-host: file only. Owner applies on the server. Nothing runs here.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.sales_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_reminders_active_order
  ON public.sales_reminders(is_active, sort_order);

ALTER TABLE public.sales_reminders ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (the seller needs the reminder text).
DROP POLICY IF EXISTS "sales_reminders_select_authed" ON public.sales_reminders;
CREATE POLICY "sales_reminders_select_authed"
  ON public.sales_reminders
  FOR SELECT TO authenticated
  USING (true);

-- Write: admin / manager only.
DROP POLICY IF EXISTS "sales_reminders_insert_admin_manager" ON public.sales_reminders;
CREATE POLICY "sales_reminders_insert_admin_manager"
  ON public.sales_reminders
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

DROP POLICY IF EXISTS "sales_reminders_update_admin_manager" ON public.sales_reminders;
CREATE POLICY "sales_reminders_update_admin_manager"
  ON public.sales_reminders
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

DROP POLICY IF EXISTS "sales_reminders_delete_admin_manager" ON public.sales_reminders;
CREATE POLICY "sales_reminders_delete_admin_manager"
  ON public.sales_reminders
  FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- Seed the five initial reminders (only when the table is empty).
INSERT INTO public.sales_reminders (text, sort_order)
SELECT v.text, v.ord
FROM (VALUES
  ('نمودار محصولی را که مشتری می‌خواهد برایش بفرست.', 1),
  ('محصولات جایگزین را به مشتری پیشنهاد بده.', 2),
  ('روی دکمهٔ مشاهدهٔ کامل بزن تا اطلاعات محصول کامل نمایش داده شود.', 3),
  ('برای این محصول تأمین‌کننده معرفی کن.', 4),
  ('محصولات جایگزین را کنار محصول مورد نظر به مشتری نمایش بده.', 5)
) AS v(text, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.sales_reminders);

-- NOTE: after applying on the server, run: supabase gen types → regenerate types.ts.
