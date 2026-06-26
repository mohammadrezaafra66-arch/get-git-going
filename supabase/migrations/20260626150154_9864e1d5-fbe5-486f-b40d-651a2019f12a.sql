CREATE TABLE IF NOT EXISTS public.didar_import_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('contact','activity','preinvoice')),
  didar_id      TEXT NOT NULL,
  action        TEXT CHECK (action IN ('created','updated','skipped','error')),
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT,
  raw_data      JSONB,
  UNIQUE(entity_type, didar_id)
);
GRANT SELECT, INSERT, UPDATE ON public.didar_import_log TO authenticated;
GRANT ALL ON public.didar_import_log TO service_role;
ALTER TABLE public.didar_import_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "didar_log_admin" ON public.didar_import_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS didar_contact_id TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_didar_id
  ON public.customers(didar_contact_id)
  WHERE didar_contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.didar_activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  didar_id          TEXT NOT NULL UNIQUE,
  customer_id       UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  activity_type     TEXT,
  subject           TEXT,
  description       TEXT,
  occurred_at       TIMESTAMPTZ,
  created_by_name   TEXT,
  raw_data          JSONB,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.didar_activities TO authenticated;
GRANT ALL ON public.didar_activities TO service_role;
ALTER TABLE public.didar_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "didar_activities_read" ON public.didar_activities
  FOR SELECT TO authenticated USING (true);