-- HR Daily Mood module
-- Tables for daily mood entries, scenarios (data-driven), questions, and Hafez poems.

-- 1) Entries table
CREATE TABLE public.daily_mood_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mood_date date NOT NULL DEFAULT CURRENT_DATE,
  mood_key text NOT NULL,
  mood_label text NOT NULL,
  mood_score integer,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenario_key text,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  free_text text,
  wants_follow_up text NOT NULL DEFAULT 'no',
  hafez_poem_id uuid,
  hafez_saved boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'management',
  status text NOT NULL DEFAULT 'new',
  manager_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX daily_mood_entries_user_date_uniq
  ON public.daily_mood_entries(user_id, mood_date);
CREATE INDEX daily_mood_entries_user_idx ON public.daily_mood_entries(user_id);
CREATE INDEX daily_mood_entries_mood_date_idx ON public.daily_mood_entries(mood_date DESC);
CREATE INDEX daily_mood_entries_status_idx ON public.daily_mood_entries(status);
CREATE INDEX daily_mood_entries_mood_key_idx ON public.daily_mood_entries(mood_key);
CREATE INDEX daily_mood_entries_created_idx ON public.daily_mood_entries(created_at DESC);
CREATE INDEX daily_mood_entries_followup_idx ON public.daily_mood_entries(wants_follow_up);

-- length / value validation triggers (avoid CHECK with non-immutable concerns)
CREATE OR REPLACE FUNCTION public.daily_mood_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.free_text IS NOT NULL AND length(NEW.free_text) > 2000 THEN
    RAISE EXCEPTION 'free_text too long';
  END IF;
  IF NEW.manager_note IS NOT NULL AND length(NEW.manager_note) > 2000 THEN
    RAISE EXCEPTION 'manager_note too long';
  END IF;
  IF NEW.wants_follow_up NOT IN ('no','later','seen','important') THEN
    RAISE EXCEPTION 'invalid wants_follow_up';
  END IF;
  IF NEW.status NOT IN ('new','seen','follow_up_needed','in_review','resolved','archived') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER daily_mood_validate_trg
  BEFORE INSERT OR UPDATE ON public.daily_mood_entries
  FOR EACH ROW EXECUTE FUNCTION public.daily_mood_validate();

-- 2) Scenarios
CREATE TABLE public.daily_mood_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_key text NOT NULL UNIQUE,
  title text NOT NULL,
  mood_keys text[] NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Questions
CREATE TABLE public.daily_mood_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_key text NOT NULL,
  question_key text NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX daily_mood_questions_scenario_idx ON public.daily_mood_questions(scenario_key, sort_order);

-- 4) Hafez poems
CREATE TABLE public.daily_mood_hafez_poems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  poem_text text NOT NULL,
  interpretation text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helper: is_hr_manager (admin/manager only per RBAC for hr module)
CREATE OR REPLACE FUNCTION public.is_hr_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','manager')
  );
$$;

-- RLS
ALTER TABLE public.daily_mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mood_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mood_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mood_hafez_poems ENABLE ROW LEVEL SECURITY;

-- Entries policies
CREATE POLICY "user can view own entries"
  ON public.daily_mood_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "managers can view all entries"
  ON public.daily_mood_entries FOR SELECT
  USING (public.is_hr_manager(auth.uid()));

CREATE POLICY "user can insert own entry today"
  ON public.daily_mood_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id AND mood_date = CURRENT_DATE);

CREATE POLICY "user can update own entry same day"
  ON public.daily_mood_entries FOR UPDATE
  USING (auth.uid() = user_id AND mood_date = CURRENT_DATE)
  WITH CHECK (auth.uid() = user_id AND mood_date = CURRENT_DATE);

CREATE POLICY "managers can update status/notes"
  ON public.daily_mood_entries FOR UPDATE
  USING (public.is_hr_manager(auth.uid()))
  WITH CHECK (public.is_hr_manager(auth.uid()));

-- Scenarios / questions / poems: readable by any authenticated user
CREATE POLICY "scenarios readable to authenticated"
  ON public.daily_mood_scenarios FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "questions readable to authenticated"
  ON public.daily_mood_questions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "hafez readable to authenticated"
  ON public.daily_mood_hafez_poems FOR SELECT
  TO authenticated USING (true);

-- Only admins can manage seed catalog (via dashboard / migrations).
CREATE POLICY "admin manage scenarios" ON public.daily_mood_scenarios
  FOR ALL USING (public.is_hr_manager(auth.uid())) WITH CHECK (public.is_hr_manager(auth.uid()));
CREATE POLICY "admin manage questions" ON public.daily_mood_questions
  FOR ALL USING (public.is_hr_manager(auth.uid())) WITH CHECK (public.is_hr_manager(auth.uid()));
CREATE POLICY "admin manage hafez" ON public.daily_mood_hafez_poems
  FOR ALL USING (public.is_hr_manager(auth.uid())) WITH CHECK (public.is_hr_manager(auth.uid()));

-- Audit trigger for entries: log create/update + manager actions
CREATE OR REPLACE FUNCTION public.daily_mood_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action text;
  v_diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'daily_mood_created';
    v_diff := jsonb_build_object(
      'mood_key', NEW.mood_key,
      'wants_follow_up', NEW.wants_follow_up,
      'mood_date', NEW.mood_date
    );
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_actor, 'daily_mood_entries', NEW.id::text, v_action, v_diff);
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor, 'daily_mood_entries', NEW.id::text,
      CASE WHEN NEW.status = 'archived' THEN 'daily_mood_archived' ELSE 'daily_mood_status_changed' END,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'previous_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;

  IF NEW.manager_note IS DISTINCT FROM OLD.manager_note THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor, 'daily_mood_entries', NEW.id::text, 'daily_mood_manager_note_updated',
      jsonb_build_object('target_user_id', NEW.user_id, 'changed_fields', ARRAY['manager_note'])
    );
  END IF;

  IF v_actor = NEW.user_id AND (
    NEW.mood_key IS DISTINCT FROM OLD.mood_key OR
    NEW.reasons IS DISTINCT FROM OLD.reasons OR
    NEW.answers IS DISTINCT FROM OLD.answers OR
    NEW.free_text IS DISTINCT FROM OLD.free_text OR
    NEW.wants_follow_up IS DISTINCT FROM OLD.wants_follow_up
  ) THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor, 'daily_mood_entries', NEW.id::text, 'daily_mood_updated',
      jsonb_build_object('mood_key', NEW.mood_key)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER daily_mood_audit_trg
  AFTER INSERT OR UPDATE ON public.daily_mood_entries
  FOR EACH ROW EXECUTE FUNCTION public.daily_mood_audit();

-- =========================
-- SEED: scenarios (10)
-- =========================
INSERT INTO public.daily_mood_scenarios (scenario_key, title, mood_keys, sort_order) VALUES
  ('great',     'حال خوب',          ARRAY['great','good','hopeful'], 10),
  ('ok',        'حال معمولی',       ARRAY['ok'], 20),
  ('tired',     'خستگی',            ARRAY['tired','low_energy'], 30),
  ('sad',       'ناراحتی',          ARRAY['sad','upset'], 40),
  ('angry',     'عصبانیت',          ARRAY['angry'], 50),
  ('anxious',   'اضطراب',           ARRAY['anxious'], 60),
  ('motivated', 'انگیزه',           ARRAY['hopeful','great'], 70),
  ('lonely',    'دلتنگی',           ARRAY['sad','upset','low_energy'], 80),
  ('proud',     'افتخار و پیشرفت',  ARRAY['great','good','hopeful'], 90),
  ('confused',  'سردرگمی',          ARRAY['anxious','tired','ok'], 100);

-- =========================
-- SEED: questions (>=30)
-- =========================
INSERT INTO public.daily_mood_questions (scenario_key, question_key, question_text, question_type, options, sort_order) VALUES
  -- great
  ('great','what_made_good','چه چیزی امروز حالت رو بهتر کرد؟','single_choice',
    '["فروش خوب","همکاری خوب","حل شدن یک مشکل","تعریف شنیدن","حس پیشرفت","چیز دیگر"]'::jsonb, 10),
  ('great','share_more','دوست داری بیشتر درباره‌اش بنویسی؟','single_choice',
    '["بله، کوتاه می‌نویسم","نه، همین کافی است"]'::jsonb, 20),
  ('great','gratitude','اگر بخوای یک تشکر کوتاه بگی، از چه کسی؟','single_choice',
    '["همکار","مدیر","مشتری","خودم","ترجیح می‌دهم نگویم"]'::jsonb, 30),

  -- ok
  ('ok','what_changes','اگر یک چیز کوچک عوض می‌شد، حالت بهتر می‌شد؟','single_choice',
    '["استراحت بیشتر","ارتباط بهتر تیمی","شفافیت در کار","کمتر شدن فشار","نمی‌دانم"]'::jsonb, 10),
  ('ok','energy_level','الان سطح انرژی‌ات چقدر است؟','scale',
    '[{"value":1,"label":"خیلی کم"},{"value":2,"label":"کم"},{"value":3,"label":"متوسط"},{"value":4,"label":"خوب"},{"value":5,"label":"عالی"}]'::jsonb, 20),
  ('ok','want_chat','دوست داری مدیریت پیگیری کند؟','single_choice',
    '["نه، فقط ثبت شود","شاید بعداً","بله، خوب است"]'::jsonb, 30),

  -- tired
  ('tired','tired_kind','خستگی امروز بیشتر از چه جنسی بود؟','single_choice',
    '["جسمی","ذهنی","فشار کاری","تکرار کارها","برخوردهای روزانه","نمی‌دانم"]'::jsonb, 10),
  ('tired','what_helps','چه چیزی می‌توانست امروز را کمی سبک‌تر کند؟','multi_choice',
    '["کمک همکار","توضیح بهتر کارها","زمان استراحت","تقسیم بهتر کار","کمتر شدن فشار","چیز دیگر"]'::jsonb, 20),
  ('tired','sleep','دیشب خوب استراحت کردی؟','single_choice',
    '["بله","نه","کمی","ترجیح می‌دهم نگویم"]'::jsonb, 30),

  -- sad
  ('sad','sad_about','ناراحتی امروز بیشتر مربوط به کدام بخش بود؟','single_choice',
    '["کار","همکار","مشتری","مدیریت","موضوع شخصی","ترجیح می‌دهم نگویم"]'::jsonb, 10),
  ('sad','want_review','دوست داری مدیریت این موضوع را بداند؟','single_choice',
    '["بله، لطفاً بررسی شود","فقط می‌خواستم ثبت کنم","فعلاً نه"]'::jsonb, 20),
  ('sad','support','چه نوع همراهی الان حالت را بهتر می‌کند؟','single_choice',
    '["شنیده شدن","کمی فضا","صحبت با مدیر","فعلاً هیچ"]'::jsonb, 30),

  -- angry
  ('angry','intensity','شدت عصبانیتت چقدر بود؟','single_choice',
    '["کم","متوسط","زیاد"]'::jsonb, 10),
  ('angry','what_now','الان دوست داری چه کاری انجام شود؟','single_choice',
    '["فقط شنیده شود","بعداً با من صحبت شود","مدیریت بررسی کند","فعلاً کاری لازم نیست"]'::jsonb, 20),
  ('angry','trigger','چه چیزی محرک اصلی بود؟','single_choice',
    '["برخورد ناعادلانه","ابهام","فشار وقت","رفتار همکار","مسئله شخصی","ترجیح می‌دهم نگویم"]'::jsonb, 30),

  -- anxious
  ('anxious','about','اضطرابت بیشتر بابت چه چیزی بود؟','single_choice',
    '["حجم کار","ابهام در وظیفه","نتیجه کار","برخورد با دیگران","موضوع شخصی","نمی‌دانم"]'::jsonb, 10),
  ('anxious','need','چه چیزی الان آرامت می‌کند؟','single_choice',
    '["شفافیت بیشتر","کمک یک نفر","کمی استراحت","صحبت کوتاه با مدیر","نمی‌دانم"]'::jsonb, 20),
  ('anxious','severity','چقدر روی کارت اثر گذاشت؟','scale',
    '[{"value":1,"label":"اصلاً"},{"value":2,"label":"کم"},{"value":3,"label":"متوسط"},{"value":4,"label":"زیاد"},{"value":5,"label":"خیلی زیاد"}]'::jsonb, 30),

  -- motivated
  ('motivated','what_motivates','امروز چه چیزی بهت انگیزه داد؟','single_choice',
    '["نتیجه گرفتن","یادگیری","همراهی تیم","هدف شخصی","تشویق شدن","چیز دیگر"]'::jsonb, 10),
  ('motivated','goal_today','هدف کوچک فردا چیست؟','single_choice',
    '["ادامه همین مسیر","یاد گرفتن چیز جدید","کمک به یک همکار","سازماندهی کارها","نمی‌دانم"]'::jsonb, 20),

  -- lonely
  ('lonely','what_feels','بیشتر چه احساسی داری؟','single_choice',
    '["دلتنگی","تنهایی در کار","کم‌توجهی","نمی‌دانم"]'::jsonb, 10),
  ('lonely','support','دوست داری بعداً صحبتی شود؟','single_choice',
    '["بله","فعلاً نه","شاید بعداً"]'::jsonb, 20),

  -- proud
  ('proud','about','بابت چه چیزی احساس افتخار کردی؟','single_choice',
    '["نتیجه کار","یادگیری","همکاری","حل یک مشکل","چیز دیگر"]'::jsonb, 10),
  ('proud','share','دوست داری مدیریت بداند؟','single_choice',
    '["بله","فقط ثبت شود"]'::jsonb, 20),
  ('proud','next_step','قدم بعدی چیست؟','single_choice',
    '["ادامه مسیر","یاد دادن به دیگران","شروع چیز جدید","نمی‌دانم"]'::jsonb, 30),

  -- confused
  ('confused','where','بیشتر در کدام بخش گیج هستی؟','single_choice',
    '["اولویت کارها","انتظارات مدیر","نقش خودم","ابزار کار","چیز دیگر"]'::jsonb, 10),
  ('confused','need_help','به چه کمکی نیاز داری؟','single_choice',
    '["جلسه کوتاه","چک‌لیست","راهنمای واضح‌تر","نمی‌دانم"]'::jsonb, 20),
  ('confused','urgency','چقدر فوری است؟','single_choice',
    '["خیلی","متوسط","کم"]'::jsonb, 30),

  -- common closing for all (text optional handled in UI separately, but provide reflection)
  ('great','one_word','اگر امروز را در یک کلمه خلاصه کنی؟','text_optional','[]'::jsonb, 90),
  ('tired','one_word','اگر امروز را در یک کلمه خلاصه کنی؟','text_optional','[]'::jsonb, 90),
  ('sad','one_word','اگر امروز را در یک کلمه خلاصه کنی؟','text_optional','[]'::jsonb, 90);

-- =========================
-- SEED: Hafez poems (>=5)
-- =========================
INSERT INTO public.daily_mood_hafez_poems (title, poem_text, interpretation) VALUES
  ('غزل امید','الا یا ایها الساقی ادر کأسا و ناولها / که عشق آسان نمود اول ولی افتاد مشکل‌ها','صبور باش؛ آنچه آغازش سخت بود، در ادامه روشن خواهد شد.'),
  ('غزل گشایش','ای صاحب کرامت شکرانه سلامت / روزی تفقدی کن درویش بی‌نوا را','گشایشی نزدیک است؛ به دیگران نیز یاری برسان.'),
  ('غزل آرامش','رسید مژده که آمد بهار و سبزه دمید / وظیفه گر برسد مصرفش گل است و نبید','خبرهای خوش در راه است؛ دل را آماده شادی کن.'),
  ('غزل صبر','صبر و ظفر هر دو دوستان قدیم‌اند / بر اثر صبر نوبت ظفر آید','صبر کن؛ پیروزی پس از پایداری می‌آید.'),
  ('غزل دوستی','یاری اندر کس نمی‌بینیم یاران را چه شد / دوستی کی آخر آمد دوستداران را چه شد','به پیوندهای انسانی اهمیت بده؛ یک گفت‌وگوی صمیمانه شفا می‌دهد.'),
  ('غزل روشنی','ای دل ار سیل فنا بنیاد هستی برکند / چون تو را نوح است کشتیبان ز طوفان غم مخور','در سختی‌ها همراه داری؛ غم را به دل راه نده.'),
  ('غزل تازگی','بیا تا گل برافشانیم و می در ساغر اندازیم / فلک را سقف بشکافیم و طرحی نو دراندازیم','وقت تغییر و شروعی تازه است.');
