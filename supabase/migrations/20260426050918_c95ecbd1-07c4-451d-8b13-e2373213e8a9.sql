-- Create sales_quote_send_queue table
CREATE TABLE public.sales_quote_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_log_id uuid REFERENCES public.sales_quote_share_logs(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  channel text NOT NULL,
  recipient text NOT NULL,
  message_text text,
  pdf_attached boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sqsq_channel_check
    CHECK (channel IN ('whatsapp','telegram','sms','eitaa','bale','rubika','manual_link')),
  CONSTRAINT sqsq_status_check
    CHECK (status IN ('pending','processing','sent','failed','canceled'))
);

-- Indexes
CREATE INDEX idx_sqsq_status ON public.sales_quote_send_queue(status);
CREATE INDEX idx_sqsq_channel ON public.sales_quote_send_queue(channel);
CREATE INDEX idx_sqsq_quote_id ON public.sales_quote_send_queue(quote_id);
CREATE INDEX idx_sqsq_share_log_id ON public.sales_quote_send_queue(share_log_id);
CREATE INDEX idx_sqsq_scheduled_at ON public.sales_quote_send_queue(scheduled_at);
CREATE INDEX idx_sqsq_created_at_desc ON public.sales_quote_send_queue(created_at DESC);

-- Enable RLS
ALTER TABLE public.sales_quote_send_queue ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/manager/accountant see all; sales see own quotes' queue
CREATE POLICY sqsq_select ON public.sales_quote_send_queue
  FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
    OR (
      public.has_role(auth.uid(), 'sales'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.sales_quotes q
        WHERE q.id = sales_quote_send_queue.quote_id
          AND q.salesperson_id = auth.uid()
      )
    )
  );

-- INSERT: admin/manager/sales for quotes they can access; created_by must be self
CREATE POLICY sqsq_insert ON public.sales_quote_send_queue
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
      OR (
        public.has_role(auth.uid(), 'sales'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.sales_quotes q
          WHERE q.id = sales_quote_send_queue.quote_id
            AND q.salesperson_id = auth.uid()
        )
      )
    )
  );

-- UPDATE: admin/manager full update
CREATE POLICY sqsq_update_privileged ON public.sales_quote_send_queue
  FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- UPDATE: sales can only cancel own pending records
CREATE POLICY sqsq_update_sales_cancel ON public.sales_quote_send_queue
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'sales'::app_role)
    AND created_by = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.sales_quotes q
      WHERE q.id = sales_quote_send_queue.quote_id
        AND q.salesperson_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'sales'::app_role)
    AND created_by = auth.uid()
    AND status = 'canceled'
  );

-- updated_at trigger
CREATE TRIGGER trg_sqsq_updated_at
BEFORE UPDATE ON public.sales_quote_send_queue
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_sales_quote_send_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_created',
      jsonb_build_object(
        'quote_id', new.quote_id,
        'share_log_id', new.share_log_id,
        'channel', new.channel,
        'recipient', new.recipient,
        'status', new.status,
        'pdf_attached', new.pdf_attached,
        'created_by', new.created_by
      ));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.status IS DISTINCT FROM new.status) THEN
      IF (new.status = 'canceled') THEN
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_canceled',
          jsonb_build_object('quote_id', new.quote_id, 'old_status', old.status));
      ELSIF (new.status = 'failed') THEN
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_failed',
          jsonb_build_object(
            'quote_id', new.quote_id,
            'attempts', new.attempts,
            'max_attempts', new.max_attempts,
            'last_error', new.last_error
          ));
      ELSE
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_status_changed',
          jsonb_build_object(
            'quote_id', new.quote_id,
            'old_status', old.status,
            'new_status', new.status,
            'attempts', new.attempts
          ));
      END IF;
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END;
$$;

CREATE TRIGGER trg_audit_sales_quote_send_queue
AFTER INSERT OR UPDATE ON public.sales_quote_send_queue
FOR EACH ROW EXECUTE FUNCTION public.audit_sales_quote_send_queue();