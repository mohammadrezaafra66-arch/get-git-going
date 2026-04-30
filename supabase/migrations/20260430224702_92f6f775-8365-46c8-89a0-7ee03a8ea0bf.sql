
-- 1. Add new columns first (so we can populate as needed)
ALTER TABLE public.gamification_rewards
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS trigger_ref_id uuid,
  ADD COLUMN IF NOT EXISTS reward_unit text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS requires_manual_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.gamification_rewards SET is_active = enabled WHERE is_active IS DISTINCT FROM enabled;
UPDATE public.gamification_rewards SET sort_order = display_order WHERE sort_order IS DISTINCT FROM display_order;

-- 2. Drop old constraints BEFORE remapping legacy values
ALTER TABLE public.gamification_rewards DROP CONSTRAINT IF EXISTS gamification_rewards_reward_type_check;
ALTER TABLE public.gamification_rewards DROP CONSTRAINT IF EXISTS gamification_rewards_trigger_type_check;

-- 3. Remap legacy values to the new sets
UPDATE public.gamification_rewards SET reward_type = 'custom'      WHERE reward_type = 'xp_bonus';
UPDATE public.gamification_rewards SET reward_type = 'badge_reward' WHERE reward_type = 'badge';
UPDATE public.gamification_rewards SET reward_type = 'gift_card'   WHERE reward_type = 'gift';

UPDATE public.gamification_rewards SET trigger_type = 'level_reached'   WHERE trigger_type = 'level';
UPDATE public.gamification_rewards SET trigger_type = 'league_reached'  WHERE trigger_type = 'league';
UPDATE public.gamification_rewards SET trigger_type = 'mission_completed' WHERE trigger_type = 'streak';
UPDATE public.gamification_rewards SET trigger_type = 'level_reached'   WHERE trigger_type = 'manual';

ALTER TABLE public.gamification_rewards ALTER COLUMN trigger_value DROP NOT NULL;

-- 4. New value-set constraints
ALTER TABLE public.gamification_rewards
  ADD CONSTRAINT gamification_rewards_reward_type_chk
  CHECK (reward_type IN ('gift_card','cash_bonus','commission_bonus','paid_leave','badge_reward','custom'));

ALTER TABLE public.gamification_rewards
  ADD CONSTRAINT gamification_rewards_trigger_type_chk
  CHECK (trigger_type IN ('level_reached','achievement_unlocked','mission_completed','league_reached','season_top_rank'));

ALTER TABLE public.gamification_rewards
  ADD CONSTRAINT gamification_rewards_reward_unit_chk
  CHECK (reward_unit IN ('toman','day','percent','point','item','custom'));

-- 5. Validation trigger
CREATE OR REPLACE FUNCTION public.validate_gamification_reward()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.reward_value IS NOT NULL AND NEW.reward_value < 0 THEN
    RAISE EXCEPTION 'مقدار پاداش نمی‌تواند منفی باشد';
  END IF;
  IF NEW.sort_order < 0 THEN
    RAISE EXCEPTION 'ترتیب نمی‌تواند منفی باشد';
  END IF;

  IF NEW.trigger_type IN ('level_reached','season_top_rank') THEN
    IF NEW.trigger_value IS NULL OR NEW.trigger_value <= 0 THEN
      RAISE EXCEPTION 'برای این نوع محرک، مقدار عددی الزامی است';
    END IF;
  END IF;

  IF NEW.trigger_type IN ('achievement_unlocked','mission_completed','league_reached') THEN
    IF NEW.trigger_ref_id IS NULL THEN
      RAISE EXCEPTION 'برای این نوع محرک، انتخاب مرجع الزامی است';
    END IF;
  END IF;

  IF NEW.trigger_value IS NULL THEN NEW.trigger_value := 0; END IF;
  NEW.enabled := NEW.is_active;
  NEW.display_order := NEW.sort_order;
  IF NEW.key IS NULL OR length(btrim(NEW.key)) = 0 THEN
    NEW.key := 'rwd_' || NEW.trigger_type || '_' || COALESCE(NEW.trigger_ref_id::text,'') || '_' || COALESCE(NEW.trigger_value::text,'') || '_' || NEW.reward_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gamification_rewards r
     WHERE r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND r.trigger_type = NEW.trigger_type
       AND r.reward_type = NEW.reward_type
       AND COALESCE(r.trigger_ref_id::text,'') = COALESCE(NEW.trigger_ref_id::text,'')
       AND COALESCE(r.trigger_value, 0) = COALESCE(NEW.trigger_value, 0)
  ) THEN
    RAISE EXCEPTION 'این پاداش قبلاً تعریف شده است';
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_validate_gamification_reward ON public.gamification_rewards;
CREATE TRIGGER trg_validate_gamification_reward
  BEFORE INSERT OR UPDATE ON public.gamification_rewards
  FOR EACH ROW EXECUTE FUNCTION public.validate_gamification_reward();

-- 6. RLS hardening
DROP POLICY IF EXISTS rewards_read ON public.gamification_rewards;
DROP POLICY IF EXISTS rewards_admin_all ON public.gamification_rewards;

CREATE POLICY rewards_admin_select ON public.gamification_rewards
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY rewards_admin_insert ON public.gamification_rewards
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY rewards_admin_update ON public.gamification_rewards
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS idx_rewards_trigger ON public.gamification_rewards (trigger_type, trigger_ref_id);
CREATE INDEX IF NOT EXISTS idx_rewards_active ON public.gamification_rewards (is_active, sort_order);
