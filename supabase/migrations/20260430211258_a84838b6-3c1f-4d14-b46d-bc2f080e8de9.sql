-- Seed starter achievements catalog
INSERT INTO public.achievements (key, title_fa, description, icon, xp_reward, display_order) VALUES
  ('first_steps', 'اولین قدم', 'به سامانه خوش آمدید', 'sparkles', 50, 1),
  ('first_sale', 'اولین فروش', 'اولین فاکتور خود را ثبت کردید', 'shopping-cart', 100, 2),
  ('streak_3', 'سه روز پیاپی', 'سه روز پیاپی وارد شدید', 'flame', 75, 3),
  ('streak_7', 'هفته‌ی پر تلاش', 'هفت روز پیاپی فعالیت', 'flame', 200, 4),
  ('streak_30', 'یک ماه طلایی', 'سی روز پیاپی فعالیت', 'crown', 1000, 5),
  ('level_5', 'سطح ۵', 'به سطح ۵ رسیدید', 'zap', 150, 6),
  ('level_10', 'سطح ۱۰', 'به سطح ۱۰ رسیدید', 'zap', 400, 7),
  ('top_10_monthly', 'برترین ۱۰ ماه', 'در رتبه‌های برتر ماه قرار گرفتید', 'trophy', 500, 8),
  ('league_gold', 'لیگ طلا', 'به لیگ طلا ارتقا یافتید', 'crown', 750, 9),
  ('mission_master', 'استاد مأموریت', 'ده مأموریت روزانه را کامل کردید', 'target', 300, 10)
ON CONFLICT (key) DO NOTHING;

-- Seed starter daily missions
INSERT INTO public.missions (key, title_fa, description, target_value, xp_reward, frequency, display_order) VALUES
  ('daily_login', 'ورود روزانه', 'امروز وارد سامانه شوید', 1, 20, 'daily', 1),
  ('daily_sale', 'یک فروش امروز', 'حداقل یک فاکتور ثبت کنید', 1, 50, 'daily', 2),
  ('daily_quote', 'سه پیش‌فاکتور', 'سه پیش‌فاکتور بسازید', 3, 60, 'daily', 3),
  ('weekly_revenue', 'هدف فروش هفته', 'به سقف فروش هفتگی برسید', 1, 200, 'weekly', 4)
ON CONFLICT (key) DO NOTHING;