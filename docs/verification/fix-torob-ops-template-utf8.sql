SET client_encoding TO 'UTF8';

-- Fix mojibake/question-mark corruption of default Path A report template.
UPDATE public.torob_ops_report_templates
SET
  name = 'قالب پیش‌فرض طعمه',
  body = E'سلام\nاین فروشنده با قیمت غیرواقعی/طعمه در ترب دیده می‌شود. لطفاً بررسی فرمایید.\nلینک کالا: {{torob_url}}\nنام کالا: {{product_name}}\nقیمت ما: {{our_price}}\nقیمت اعلام‌شده: {{their_price}}\nسیگنال‌ها: {{bait_signals}}',
  updated_at = now()
WHERE is_default = true
   OR name LIKE '%?%'
   OR body LIKE '%?%?%?%';
