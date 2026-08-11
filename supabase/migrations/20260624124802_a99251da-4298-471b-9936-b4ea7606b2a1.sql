-- Phase 7: Messenger Inquiries (price quotation cards)

-- 1) Extend role check on messenger_group_members
ALTER TABLE public.messenger_group_members 
  DROP CONSTRAINT IF EXISTS messenger_group_members_role_check;
ALTER TABLE public.messenger_group_members 
  ADD CONSTRAINT messenger_group_members_role_check 
  CHECK (role IN ('admin','member','viewer','purchaser'));

-- 2) Extend type check on messenger_messages
ALTER TABLE public.messenger_messages 
  DROP CONSTRAINT IF EXISTS messenger_messages_type_check;
ALTER TABLE public.messenger_messages
  ADD CONSTRAINT messenger_messages_type_check
  CHECK (type IN ('text','image','video','audio','file','system','inquiry'));

-- 3) Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inquiry_status') THEN
    CREATE TYPE public.inquiry_status AS ENUM (
      'draft','pending','warning_5min','danger_8min','critical_10min',
      'transfer_available','transferred','answered',
      'completed_on_time','completed_late','expired','cancelled','rejected'
    );
  END IF;
END $$;

-- 4) inquiries
CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  group_id uuid NOT NULL REFERENCES public.messenger_groups(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid NOT NULL REFERENCES auth.users(id),
  status public.inquiry_status NOT NULL DEFAULT 'pending',
  message_id uuid REFERENCES public.messenger_messages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_inquiries_group_status ON public.inquiries(group_id, status);
CREATE INDEX IF NOT EXISTS idx_inquiries_product_open ON public.inquiries(product_id) 
  WHERE status IN ('pending','warning_5min','danger_8min','critical_10min','transfer_available','transferred');

GRANT SELECT, INSERT, UPDATE ON public.inquiries TO authenticated;
GRANT ALL ON public.inquiries TO service_role;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inquiry_select" ON public.inquiries FOR SELECT TO authenticated
  USING (public.is_messenger_group_member(group_id, auth.uid()));
CREATE POLICY "inquiry_insert_rpc" ON public.inquiries FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "inquiry_update_rpc" ON public.inquiries FOR UPDATE TO service_role USING (true);

-- 5) inquiry_replies
CREATE TABLE IF NOT EXISTS public.inquiry_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  price bigint NOT NULL,
  is_valid boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inquiry_replies TO authenticated;
GRANT ALL ON public.inquiry_replies TO service_role;
ALTER TABLE public.inquiry_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiry_replies_select" ON public.inquiry_replies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inquiries i 
    WHERE i.id = inquiry_id AND public.is_messenger_group_member(i.group_id, auth.uid())));

-- 6) inquiry_status_history
CREATE TABLE IF NOT EXISTS public.inquiry_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  from_status public.inquiry_status,
  to_status public.inquiry_status NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE INDEX IF NOT EXISTS idx_inquiry_status_history ON public.inquiry_status_history(inquiry_id, changed_at);
GRANT SELECT ON public.inquiry_status_history TO authenticated;
GRANT ALL ON public.inquiry_status_history TO service_role;
ALTER TABLE public.inquiry_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiry_history_select" ON public.inquiry_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inquiries i 
    WHERE i.id = inquiry_id AND public.is_messenger_group_member(i.group_id, auth.uid())));

-- 7) inquiry_transfers
CREATE TABLE IF NOT EXISTS public.inquiry_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  from_user uuid NOT NULL REFERENCES auth.users(id),
  to_user uuid NOT NULL REFERENCES auth.users(id),
  transferred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inquiry_transfers TO authenticated;
GRANT ALL ON public.inquiry_transfers TO service_role;
ALTER TABLE public.inquiry_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiry_transfers_select" ON public.inquiry_transfers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inquiries i 
    WHERE i.id = inquiry_id AND public.is_messenger_group_member(i.group_id, auth.uid())));

-- 8) inquiry_price_cache
CREATE TABLE IF NOT EXISTS public.inquiry_price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  price bigint NOT NULL,
  valid_until timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inquiry_price_cache ON public.inquiry_price_cache(product_id, valid_until);
GRANT SELECT ON public.inquiry_price_cache TO authenticated;
GRANT ALL ON public.inquiry_price_cache TO service_role;
ALTER TABLE public.inquiry_price_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiry_price_cache_select" ON public.inquiry_price_cache FOR SELECT TO authenticated
  USING (true);

-- 9) RPC: create_inquiry
CREATE OR REPLACE FUNCTION public.create_inquiry(
  p_group_id uuid, p_product_id uuid, p_assigned_to uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_msg_id uuid;
BEGIN
  IF NOT public.is_messenger_group_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'شما عضو این گروه نیستید.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND COALESCE(is_active,true) = true) THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده در کاتالوگ وجود ندارد یا غیرفعال است.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inquiries 
    WHERE product_id = p_product_id AND group_id = p_group_id
    AND status IN ('pending','warning_5min','danger_8min','critical_10min','transfer_available','transferred')) THEN
    RAISE EXCEPTION 'برای این محصول در این گروه یک استعلام باز وجود دارد.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inquiry_price_cache 
    WHERE product_id = p_product_id AND valid_until > now()) THEN
    RAISE EXCEPTION 'این محصول قیمت معتبر دارد، لطفاً استعلام ثبت نکنید.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messenger_group_members 
    WHERE group_id = p_group_id AND user_id = p_assigned_to AND role = 'purchaser') THEN
    RAISE EXCEPTION 'مسئول خرید انتخاب‌شده در این گروه دارای نقش خریدار نیست.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.messenger_messages(group_id, sender_id, content, type)
  VALUES (p_group_id, auth.uid(), '', 'inquiry')
  RETURNING id INTO v_msg_id;

  INSERT INTO public.inquiries(product_id, group_id, requested_by, assigned_to, status, message_id)
  VALUES (p_product_id, p_group_id, auth.uid(), p_assigned_to, 'pending', v_msg_id)
  RETURNING id INTO v_id;

  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (v_id, NULL, 'pending', auth.uid());

  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_inquiry(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inquiry(uuid,uuid,uuid) TO authenticated, service_role;

-- 10) RPC: update_inquiry_status
CREATE OR REPLACE FUNCTION public.update_inquiry_status(
  p_inquiry_id uuid, p_new_status public.inquiry_status
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_current public.inquiry_status; v_group_id uuid;
BEGIN
  SELECT status, group_id INTO v_current, v_group_id FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'استعلام یافت نشد.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_messenger_group_member(v_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.inquiries SET status = p_new_status WHERE id = p_inquiry_id;
  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (p_inquiry_id, v_current, p_new_status, auth.uid());
END; $$;
REVOKE EXECUTE ON FUNCTION public.update_inquiry_status(uuid,public.inquiry_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inquiry_status(uuid,public.inquiry_status) TO authenticated, service_role;

-- 11) RPC: reply_inquiry
CREATE OR REPLACE FUNCTION public.reply_inquiry(
  p_inquiry_id uuid, p_price bigint, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_inquiry public.inquiries%ROWTYPE; v_new_status public.inquiry_status; v_valid_until timestamptz;
BEGIN
  SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_inquiry.id IS NULL THEN
    RAISE EXCEPTION 'استعلام یافت نشد.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inquiry.assigned_to != auth.uid() THEN
    IF NOT EXISTS (SELECT 1 FROM public.messenger_group_members 
      WHERE group_id = v_inquiry.group_id AND user_id = auth.uid() AND role = 'purchaser') THEN
      RAISE EXCEPTION 'فقط مسئول خرید مجاز به ثبت قیمت است.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF now() - v_inquiry.created_at <= interval '10 minutes' THEN
    v_new_status := 'completed_on_time';
  ELSE
    v_new_status := 'completed_late';
  END IF;

  INSERT INTO public.inquiry_replies(inquiry_id, user_id, price, note)
  VALUES (p_inquiry_id, auth.uid(), p_price, p_note);

  v_valid_until := now() + interval '7 days';
  INSERT INTO public.inquiry_price_cache(product_id, price, valid_until, created_by)
  VALUES (v_inquiry.product_id, p_price, v_valid_until, auth.uid());

  UPDATE public.inquiries SET status = v_new_status, answered_at = now(), closed_at = now()
  WHERE id = p_inquiry_id;

  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (p_inquiry_id, v_inquiry.status, v_new_status, auth.uid());
END; $$;
REVOKE EXECUTE ON FUNCTION public.reply_inquiry(uuid,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_inquiry(uuid,bigint,text) TO authenticated, service_role;

-- 12) RPC: transfer_inquiry
CREATE OR REPLACE FUNCTION public.transfer_inquiry(
  p_inquiry_id uuid, p_to_user uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_inquiry public.inquiries%ROWTYPE;
BEGIN
  SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_inquiry.id IS NULL THEN
    RAISE EXCEPTION 'استعلام یافت نشد.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inquiry.status NOT IN ('transfer_available','critical_10min') THEN
    RAISE EXCEPTION 'انتقال در این وضعیت مجاز نیست.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_messenger_group_member(v_inquiry.group_id, auth.uid()) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.inquiry_transfers(inquiry_id, from_user, to_user)
  VALUES (p_inquiry_id, v_inquiry.assigned_to, p_to_user);
  UPDATE public.inquiries SET assigned_to = p_to_user, status = 'transferred' WHERE id = p_inquiry_id;
  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (p_inquiry_id, v_inquiry.status, 'transferred', auth.uid());
END; $$;
REVOKE EXECUTE ON FUNCTION public.transfer_inquiry(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_inquiry(uuid,uuid) TO authenticated, service_role;

-- 13) RPC: tick_inquiries (server-side timer engine)
CREATE OR REPLACE FUNCTION public.tick_inquiries()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  -- pending -> warning_5min after 5 min
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status = 'pending' AND now() - created_at > interval '5 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'warning_5min' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'warning_5min', NULL, 'auto-tick');
  END LOOP;

  -- warning_5min -> danger_8min after 8 min
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status = 'warning_5min' AND now() - created_at > interval '8 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'danger_8min' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'danger_8min', NULL, 'auto-tick');
  END LOOP;

  -- danger_8min -> critical_10min after 10 min
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status = 'danger_8min' AND now() - created_at > interval '10 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'critical_10min' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'critical_10min', NULL, 'auto-tick');
  END LOOP;

  -- critical_10min -> transfer_available (same threshold, ensures transfer ability)
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status = 'critical_10min' AND now() - created_at > interval '10 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'transfer_available' WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'transfer_available', NULL, 'auto-tick');
  END LOOP;

  -- expired after 30 min
  FOR r IN SELECT id, status FROM public.inquiries
    WHERE status NOT IN ('answered','completed_on_time','completed_late','expired','cancelled','rejected')
    AND now() - created_at > interval '30 minutes' FOR UPDATE
  LOOP
    UPDATE public.inquiries SET status = 'expired', closed_at = now() WHERE id = r.id;
    INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    VALUES (r.id, r.status, 'expired', NULL, 'auto-tick');
  END LOOP;
END; $$;
REVOKE EXECUTE ON FUNCTION public.tick_inquiries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tick_inquiries() TO service_role;

-- 14) Realtime
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='inquiries') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.inquiries';
  END IF;
END $$;