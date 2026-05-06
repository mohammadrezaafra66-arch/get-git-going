-- اجازه نوشتن روی product_label_links برای حسابدار (علاوه بر admin/manager).
-- درخواست کاربر: دکمه برچسب در کارگاه قیمت برای admin + accountant.
-- idempotent.

DROP POLICY IF EXISTS "manager admin write product_label_links" ON public.product_label_links;
DROP POLICY IF EXISTS "elevated write product_label_links" ON public.product_label_links;

CREATE POLICY "elevated write product_label_links"
  ON public.product_label_links
  FOR ALL
  USING (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));
