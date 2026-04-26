-- Create sales_quote_share_logs table
CREATE TABLE public.sales_quote_share_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  channel text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  message_text text,
  pdf_attached boolean NOT NULL DEFAULT false,
  attempted_by uuid REFERENCES public.profiles(id),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  result_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_quote_share_logs_channel_check
    CHECK (channel IN ('whatsapp','telegram','sms','eitaa','bale','rubika','manual_link')),
  CONSTRAINT sales_quote_share_logs_status_check
    CHECK (status IN ('draft','queued','sent','failed','canceled'))
);

-- Indexes
CREATE INDEX idx_sqsl_quote_id ON public.sales_quote_share_logs(quote_id);
CREATE INDEX idx_sqsl_channel ON public.sales_quote_share_logs(channel);
CREATE INDEX idx_sqsl_status ON public.sales_quote_share_logs(status);
CREATE INDEX idx_sqsl_attempted_by ON public.sales_quote_share_logs(attempted_by);
CREATE INDEX idx_sqsl_attempted_at_desc ON public.sales_quote_share_logs(attempted_at DESC);

-- Enable RLS
ALTER TABLE public.sales_quote_share_logs ENABLE ROW LEVEL SECURITY;

-- SELECT policy: admin/manager/accountant see all; sales see own quotes' logs
CREATE POLICY sqsl_select ON public.sales_quote_share_logs
  FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
    OR (
      public.has_role(auth.uid(), 'sales'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.sales_quotes q
        WHERE q.id = sales_quote_share_logs.quote_id
          AND q.salesperson_id = auth.uid()
      )
    )
  );

-- INSERT policy: admin/manager/sales for quotes they can access
CREATE POLICY sqsl_insert ON public.sales_quote_share_logs
  FOR INSERT
  WITH CHECK (
    attempted_by = auth.uid()
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
      OR (
        public.has_role(auth.uid(), 'sales'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.sales_quotes q
          WHERE q.id = sales_quote_share_logs.quote_id
            AND q.salesperson_id = auth.uid()
        )
      )
    )
  );

-- UPDATE policy: admin/manager only
CREATE POLICY sqsl_update_privileged ON public.sales_quote_share_logs
  FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_sales_quote_share_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quote_share_logs', new.id::text, 'sales_quote_share_log_created',
      jsonb_build_object(
        'quote_id', new.quote_id,
        'channel', new.channel,
        'recipient', new.recipient,
        'status', new.status,
        'pdf_attached', new.pdf_attached,
        'attempted_by', new.attempted_by
      ));
    RETURN new;
  END IF;
  RETURN null;
END;
$$;

CREATE TRIGGER trg_audit_sales_quote_share_logs
AFTER INSERT ON public.sales_quote_share_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_sales_quote_share_logs();