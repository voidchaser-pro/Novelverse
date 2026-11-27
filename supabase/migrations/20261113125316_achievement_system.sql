/*
# Achievement system

## Plain-English summary
Achievements are defined once in a catalogue. The server works out each user's progress
from real activity (chapters read, novels completed, streak, XP, and so on), unlocks an
achievement the first time its requirement is met, and pays its XP reward through the
unified XP ledger. Users cannot unlock achievements or set their own progress.

## New tables
- achievement_definitions: the public catalogue (id, category, name, description, icon,
  rarity, XP reward, the metric it tracks, the threshold, and whether it is secret).
  Readable by everyone; no client writes.
- user_achievements: one row per unlocked achievement per user. Primary key stops duplicate
  unlocks. Includes is_showcased for badges shown on the profile.
- achievement_progress: the latest measured value per user and achievement, used to show
  progress bars for locked achievements.
- Reward history: achievement XP is recorded in the existing xp_events table with
  source = 'achievement' (no separate reward table).

## New functions
- achievement_metric_value(user, metric): internal. Computes a metric from existing tables.
- evaluate_achievements(user): internal. Unlocks every achievement whose threshold is met,
  records progress, and grants XP once per unlock.
- refresh_achievements(): callable by the signed-in user. Evaluates only the caller and
  returns the ids of newly unlocked achievements.
- set_achievement_showcase(achievement_id, showcased): lets the caller show up to 3 unlocked
  achievements on their profile.

## Security
- RLS enabled on all three tables. Users read only their own unlocks and progress.
- Clients have no INSERT/UPDATE/DELETE grants on the achievement tables.
- Internal functions: EXECUTE revoked from PUBLIC, anon and authenticated.
- Client-callable functions: EXECUTE granted to authenticated only; search_path pinned.
- Achievement definitions are intentionally public catalogue data (no user information).

## Notes
- Gaming metrics (challenges won, puzzles completed) return 0 until quiz and multiplayer
  results are stored; they are replaced in later migrations.
- Community (social) metrics return 0 because no community tables exist yet.
*/

CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('reading', 'gaming', 'xp', 'social', 'secret')),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythical')),
  xp_reward integer NOT NULL CHECK (xp_reward >= 0),
  metric text NOT NULL,
  threshold integer NOT NULL CHECK (threshold > 0),
  is_secret boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES public.achievement_definitions(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  is_showcased boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS public.achievement_progress (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES public.achievement_definitions(id) ON DELETE CASCADE,
  current_value integer NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_progress ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.achievement_definitions TO anon, authenticated;
GRANT SELECT ON public.user_achievements TO authenticated;
GRANT SELECT ON public.achievement_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievement_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_achievements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievement_progress TO service_role;

DROP POLICY IF EXISTS "achievement_definitions_select_all" ON public.achievement_definitions;
CREATE POLICY "achievement_definitions_select_all" ON public.achievement_definitions FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "user_achievements_select_own" ON public.user_achievements;
CREATE POLICY "user_achievements_select_own" ON public.user_achievements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "achievement_progress_select_own" ON public.achievement_progress;
CREATE POLICY "achievement_progress_select_own" ON public.achievement_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

INSERT INTO public.achievement_definitions
  (id, category, name, description, icon, rarity, xp_reward, metric, threshold, is_secret, sort_order)
VALUES
  ('first-chapter', 'reading', 'First Chapter', 'Complete your first chapter.', 'BookOpen', 'common', 25, 'chapters_read', 1, false, 1),
  ('bookworm', 'reading', 'Bookworm', 'Read 10 chapters.', 'BookMarked', 'common', 75, 'chapters_read', 10, false, 2),
  ('dedicated-reader', 'reading', 'Dedicated Reader', 'Read 50 chapters.', 'Library', 'rare', 250, 'chapters_read', 50, false, 3),
  ('novel-master', 'reading', 'Novel Master', 'Complete your first novel.', 'Crown', 'rare', 150, 'novels_completed', 1, false, 4),
  ('literary-legend', 'reading', 'Literary Legend', 'Complete 10 novels.', 'Gem', 'legendary', 1000, 'novels_completed', 10, false, 5),
  ('reading-streak', 'reading', 'Reading Streak', 'Read for 7 consecutive days.', 'Flame', 'rare', 150, 'streak_days', 7, false, 6),
  ('first-victory', 'gaming', 'First Victory', 'Win your first challenge.', 'Swords', 'common', 50, 'challenges_won', 1, false, 7),
  ('puzzle-solver', 'gaming', 'Puzzle Solver', 'Complete 10 puzzles.', 'Puzzle', 'rare', 150, 'puzzles_completed', 10, false, 8),
  ('champion', 'gaming', 'Champion', 'Win 50 challenges.', 'Trophy', 'epic', 500, 'challenges_won', 50, false, 9),
  ('unstoppable', 'gaming', 'Unstoppable', 'Win 100 challenges.', 'Zap', 'mythical', 1500, 'challenges_won', 100, false, 10),
  ('xp-beginner', 'xp', 'Beginner', 'Reach 100 XP.', 'Sprout', 'common', 25, 'total_xp', 100, false, 11),
  ('xp-rising-star', 'xp', 'Rising Star', 'Reach 500 XP.', 'Star', 'rare', 75, 'total_xp', 500, false, 12),
  ('xp-expert', 'xp', 'Expert', 'Reach 1,000 XP.', 'Medal', 'epic', 150, 'total_xp', 1000, false, 13),
  ('xp-legendary', 'xp', 'Legendary', 'Reach 5,000 XP.', 'Sparkles', 'legendary', 500, 'total_xp', 5000, false, 14),
  ('xp-mythical', 'xp', 'Mythical', 'Reach 10,000 XP.', 'Crown', 'mythical', 1000, 'total_xp', 10000, false, 15),
  ('social-butterfly', 'social', 'Social Butterfly', 'Take part in community activities.', 'Users', 'rare', 100, 'community_activity', 1, false, 16),
  ('supporter', 'social', 'Supporter', 'Help another community member.', 'HeartHandshake', 'rare', 100, 'community_help', 1, false, 17),
  ('popular', 'social', 'Popular', 'Receive 50 likes on your contributions.', 'ThumbsUp', 'epic', 300, 'community_likes', 50, false, 18),
  ('night-owl', 'secret', 'Night Owl', 'Read a chapter between midnight and 4am UTC.', 'Moon', 'rare', 50, 'night_chapters', 1, true, 19),
  ('early-bird', 'secret', 'Early Bird', 'Read a chapter between 5am and 8am UTC.', 'Sunrise', 'rare', 50, 'early_chapters', 1, true, 20)
ON CONFLICT (id) DO UPDATE
SET category = excluded.category,
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    rarity = excluded.rarity,
    xp_reward = excluded.xp_reward,
    metric = excluded.metric,
    threshold = excluded.threshold,
    is_secret = excluded.is_secret,
    sort_order = excluded.sort_order;

CREATE OR REPLACE FUNCTION public.achievement_metric_value(p_user_id uuid, p_metric text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_value integer := 0;
BEGIN
  IF p_metric = 'chapters_read' THEN
    SELECT count(*)::integer INTO v_value FROM public.chapter_completions WHERE user_id = p_user_id;
  ELSIF p_metric = 'novels_completed' THEN
    SELECT count(*)::integer INTO v_value FROM public.reading_progress WHERE user_id = p_user_id AND progress >= 100;
  ELSIF p_metric = 'streak_days' THEN
    SELECT coalesce(streak, 0) INTO v_value FROM public.profiles WHERE id = p_user_id;
  ELSIF p_metric = 'total_xp' THEN
    SELECT coalesce(xp, 0) INTO v_value FROM public.profiles WHERE id = p_user_id;
  ELSIF p_metric = 'night_chapters' THEN
    SELECT count(*)::integer INTO v_value FROM public.chapter_completions
    WHERE user_id = p_user_id AND extract(hour FROM completed_at AT TIME ZONE 'UTC') < 4;
  ELSIF p_metric = 'early_chapters' THEN
    SELECT count(*)::integer INTO v_value FROM public.chapter_completions
    WHERE user_id = p_user_id AND extract(hour FROM completed_at AT TIME ZONE 'UTC') BETWEEN 5 AND 7;
  END IF;
  RETURN coalesce(v_value, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_achievements(p_user_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def record;
  v_value integer;
  v_inserted integer;
  v_unlocked text[] := '{}';
  v_pass integer;
  v_new_in_pass integer;
BEGIN
  FOR v_pass IN 1..5 LOOP
    v_new_in_pass := 0;
    FOR v_def IN
      SELECT d.id, d.metric, d.threshold, d.xp_reward
      FROM public.achievement_definitions d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_achievements ua
        WHERE ua.user_id = p_user_id AND ua.achievement_id = d.id
      )
    LOOP
      v_value := public.achievement_metric_value(p_user_id, v_def.metric);

      INSERT INTO public.achievement_progress (user_id, achievement_id, current_value, updated_at)
      VALUES (p_user_id, v_def.id, v_value, now())
      ON CONFLICT (user_id, achievement_id)
      DO UPDATE SET current_value = excluded.current_value, updated_at = excluded.updated_at;

      IF v_value >= v_def.threshold THEN
        INSERT INTO public.user_achievements (user_id, achievement_id)
        VALUES (p_user_id, v_def.id)
        ON CONFLICT (user_id, achievement_id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        IF v_inserted > 0 THEN
          PERFORM public.grant_xp(p_user_id, 'achievement', v_def.id, v_def.xp_reward);
          v_unlocked := v_unlocked || v_def.id;
          v_new_in_pass := v_new_in_pass + 1;
        END IF;
      END IF;
    END LOOP;
    EXIT WHEN v_new_in_pass = 0;
  END LOOP;

  RETURN QUERY SELECT unnest(v_unlocked);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_achievements()
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;
  RETURN QUERY SELECT * FROM public.evaluate_achievements(auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.set_achievement_showcase(p_achievement_id text, p_showcased boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_showcased_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE user_id = v_uid AND achievement_id = p_achievement_id
  ) THEN
    RAISE EXCEPTION 'Achievement not unlocked.';
  END IF;

  IF p_showcased THEN
    SELECT count(*) INTO v_showcased_count
    FROM public.user_achievements
    WHERE user_id = v_uid AND is_showcased AND achievement_id <> p_achievement_id;
    IF v_showcased_count >= 3 THEN
      RAISE EXCEPTION 'You can showcase up to 3 achievements.';
    END IF;
  END IF;

  UPDATE public.user_achievements
  SET is_showcased = p_showcased
  WHERE user_id = v_uid AND achievement_id = p_achievement_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.achievement_metric_value(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_achievements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_achievements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_achievements() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_achievement_showcase(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_achievement_showcase(text, boolean) TO authenticated;
