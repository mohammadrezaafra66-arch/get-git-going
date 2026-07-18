-- =========================================================================
-- 126 — notify accountants on every sale-price change
-- =========================================================================
-- Requirement: any sale-price change (by anyone) must raise a notification
-- for the accountant role.
--
-- Low-risk approach: reuse the existing per-recipient notification_queue
-- (already surfaced by the header NotificationBell with an unread badge and
-- the /notifications page). An AFTER INSERT trigger on
-- product_sale_price_history — the single choke point where sale prices are
-- recorded — inserts one notification per accountant. No new table, so no
-- types.ts patch is needed (notification_queue is already in types).
--
-- The function is SECURITY DEFINER so it can write notification_queue rows for
-- other users; recipients still read only their own rows via the existing
-- notification_queue RLS.
--
-- Self-host: file only. Owner applies on the server. Nothing runs here.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.notify_accountants_on_sale_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r_recipient record;
  v_product_name text;
  v_type_title text;
  v_dir text;
  v_title text;
  v_body text;
BEGIN
  -- Only when the price actually changed (initial set counts as a change).
  IF NEW.old_sale_price IS NOT DISTINCT FROM NEW.new_sale_price THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_product_name FROM public.products p WHERE p.id = NEW.product_id;
  IF NEW.sale_price_type_id IS NOT NULL THEN
    SELECT spt.title INTO v_type_title
    FROM public.sale_price_types spt WHERE spt.id = NEW.sale_price_type_id;
  END IF;

  v_dir := CASE
    WHEN NEW.old_sale_price IS NULL THEN 'ثبت اولیهٔ'
    WHEN NEW.new_sale_price > NEW.old_sale_price THEN 'افزایش'
    WHEN NEW.new_sale_price < NEW.old_sale_price THEN 'کاهش'
    ELSE 'تغییر'
  END;

  v_title := 'تغییر قیمت فروش: ' || COALESCE(v_product_name, 'محصول');
  v_body :=
    COALESCE(v_type_title || ' — ', '')
    || v_dir || ' قیمت فروش'
    || CASE WHEN NEW.old_sale_price IS NOT NULL
            THEN ' از ' || trim(to_char(NEW.old_sale_price, 'FM999,999,999,990'))
            ELSE '' END
    || ' به ' || trim(to_char(NEW.new_sale_price, 'FM999,999,999,990')) || ' تومان'
    || COALESCE(E'\n' || 'درصد تغییر: ' || round(NEW.change_percent, 2)::text || '٪', '');

  FOR r_recipient IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'accountant'::app_role
  LOOP
    INSERT INTO public.notification_queue
      (user_id, title, body, type, reference_type, reference_id)
    VALUES
      (r_recipient.user_id, v_title, v_body, 'sale_price_change', 'product', NEW.product_id);
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_accountants_on_sale_price_change() FROM public, anon;

DROP TRIGGER IF EXISTS trg_notify_accountants_sale_price_change ON public.product_sale_price_history;
CREATE TRIGGER trg_notify_accountants_sale_price_change
  AFTER INSERT ON public.product_sale_price_history
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_accountants_on_sale_price_change();

-- NOTE: after applying on the server, run: supabase gen types → regenerate types.ts.
