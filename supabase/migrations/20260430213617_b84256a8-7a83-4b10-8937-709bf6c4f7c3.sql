
CREATE TABLE public.gamification_kpi_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title_fa text NOT NULL,
  title_en text,
  description text,
  event_key text NOT NULL UNIQUE,
  xp_amount numeric NOT NULL DEFAULT 0 CHECK (xp_amount >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_gamification_kpi_rules_active ON public.gamification_kpi_rules (is_active) WHERE is_active = true;
CREATE INDEX idx_gamification_kpi_rules_sort ON public.gamification_kpi_rules (sort_order);

ALTER TABLE public.gamification_kpi_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view kpi rules"
  ON public.gamification_kpi_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/manager can insert kpi rules"
  ON public.gamification_kpi_rules FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin/manager can update kpi rules"
  ON public.gamification_kpi_rules FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin/manager can delete kpi rules"
  ON public.gamification_kpi_rules FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_gamification_kpi_rules_updated_at
  BEFORE UPDATE ON public.gamification_kpi_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.gamification_kpi_rules (title_fa, title_en, event_key, xp_amount, sort_order, description) VALUES
  ('تماس خروجی', 'Outbound call', 'outbound_call', 5, 10, 'برای هر تماس خروجی موفق'),
  ('تماس ورودی', 'Inbound call', 'inbound_call', 3, 20, 'برای پاسخگویی به تماس ورودی'),
  ('ثبت مشتری جدید', 'New customer created', 'new_customer_created', 20, 30, 'برای ایجاد مشتری جدید در CRM'),
  ('ثبت یادداشت در CRM', 'CRM note created', 'crm_note_created', 2, 40, 'برای هر یادداشت ثبت‌شده'),
  ('بستن فروش', 'Sale closed', 'sale_closed', 100, 50, 'برای هر فروش نهایی‌شده'),
  ('پیگیری انجام‌شده', 'Followup completed', 'followup_completed', 10, 60, 'برای انجام پیگیری برنامه‌ریزی‌شده'),
  ('انجام تسک', 'Task completed', 'task_completed', 8, 70, 'برای تکمیل وظیفه‌ها')
ON CONFLICT (event_key) DO NOTHING;
