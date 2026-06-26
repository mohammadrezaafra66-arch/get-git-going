-- M1: rank columns
ALTER TABLE public.employee_scores
  ADD COLUMN IF NOT EXISTS rank INTEGER,
  ADD COLUMN IF NOT EXISTS previous_rank INTEGER;

-- M2: ticker events table
CREATE TABLE IF NOT EXISTS public.dashboard_ticker_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  message_fa    TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dashboard_ticker_events TO authenticated;
GRANT ALL ON public.dashboard_ticker_events TO service_role;
CREATE INDEX IF NOT EXISTS idx_ticker_created ON public.dashboard_ticker_events(created_at DESC);
ALTER TABLE public.dashboard_ticker_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticker_select_auth" ON public.dashboard_ticker_events;
CREATE POLICY "ticker_select_auth" ON public.dashboard_ticker_events
  FOR SELECT TO authenticated USING (true);

-- M3: trigger on invoice approval
CREATE OR REPLACE FUNCTION public.trg_ticker_invoice_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.dashboard_ticker_events (event_type, message_fa, actor_user_id)
    VALUES (
      'invoice_approved',
      'فاکتور شماره ' || COALESCE(NEW.number::TEXT, NEW.id::TEXT) || ' تأیید شد',
      auth.uid()
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ticker_invoice_approved ON public.invoices;
CREATE TRIGGER trg_ticker_invoice_approved
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_ticker_invoice_approved();