/*
# Debate Arena fixes + achievement metrics

1. Fixes
- Drops the accidental stub `submit_debate_argument(text, text)` left by the previous
  migration (the real function takes a debate id: `submit_debate_argument(uuid, text, text)`).
- Rewrites `get_debate_list` with correct parentheses: previously the section/category/
  search filters bound only to creator-owned debates because AND binds tighter than OR,
  so public debates would have ignored the filters.

2. Achievement metrics
- `achievement_metric_value` gains three debate metrics:
  - 'debates_done': debates where the user submitted at least one argument.
  - 'debates_won': completed debates where the user's side won (ties excluded).
  - 'rebuttals_submitted': rebuttal contributions the user made (non-removed).

3. New achievement definitions
- debate-debut (First Debate, 1 debate, social, common, 50 XP)
- consistent-debater (Consistent Debater, 5 debates, social, rare, 100 XP)
- strong-rebuttal (Strong Rebuttal, 10 rebuttals, social, rare, 100 XP)
- debate-champion (Debate Champion, 10 wins, social, epic, 200 XP)
Seeded with ON CONFLICT DO UPDATE so re-runs are safe.
*/

DROP FUNCTION IF EXISTS public.submit_debate_argument(text, text);

CREATE OR REPLACE FUNCTION public.get_debate_list(
  p_section text, p_category text, p_search text, p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(50, coalesce(p_limit, 30)));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  RETURN jsonb_build_object(
    'debates', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'category', d.category, 'motion', d.motion,
        'status', d.status, 'visibility', d.visibility,
        'affirmative_label', d.affirmative_label, 'opposing_label', d.opposing_label,
        'max_per_side', d.max_per_side, 'round_count', d.round_count,
        'speaking_seconds', d.speaking_seconds, 'voting_hours', d.voting_hours,
        'scheduled_at', d.scheduled_at, 'creator_id', d.creator_id,
        'creator_username', pr.username,
        'current_round', d.current_round, 'voting_ends_at', d.voting_ends_at,
        'completed_at', d.completed_at, 'created_at', d.created_at,
        'affirmative_count', (SELECT count(*) FROM public.deb_participants dp
            WHERE dp.debate_id = d.id AND dp.side = 'affirmative' AND dp.left_at IS NULL AND dp.is_moderator = false),
        'opposing_count', (SELECT count(*) FROM public.deb_participants dp
            WHERE dp.debate_id = d.id AND dp.side = 'opposing' AND dp.left_at IS NULL AND dp.is_moderator = false),
        'argument_count', (SELECT count(*) FROM public.deb_arguments a
            WHERE a.debate_id = d.id AND a.is_removed = false)
      ) ORDER BY d.created_at DESC), '[]'::jsonb)
      FROM public.deb_debates d
      JOIN public.profiles pr ON pr.id = d.creator_id
      WHERE (d.visibility = 'public' OR d.creator_id = v_uid)
        AND (
          (p_section = 'live' AND d.status = 'live')
          OR (p_section = 'upcoming' AND d.status = 'upcoming' AND d.scheduled_at IS NOT NULL)
          OR (p_section = 'open' AND d.status = 'upcoming'
              AND ((SELECT count(*) FROM public.deb_participants dp2
                    WHERE dp2.debate_id = d.id AND dp2.side = 'affirmative' AND dp2.left_at IS NULL AND dp2.is_moderator = false) < d.max_per_side
                OR (SELECT count(*) FROM public.deb_participants dp3
                    WHERE dp3.debate_id = d.id AND dp3.side = 'opposing' AND dp3.left_at IS NULL AND dp3.is_moderator = false) < d.max_per_side))
          OR (p_section = 'completed' AND d.status = 'completed')
          OR (p_section = 'all')
        )
        AND (p_category IS NULL OR p_category = '' OR d.category = p_category)
        AND (p_search IS NULL OR p_search = ''
             OR d.title ILIKE '%' || p_search || '%'
             OR d.motion ILIKE '%' || p_search || '%')
      LIMIT v_limit
    )
  );
END;
$$;

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
  ELSIF p_metric = 'challenges_won' THEN
    SELECT (
      SELECT count(*) FROM public.quiz_attempts WHERE user_id = p_user_id AND is_perfect = true
    ) + (
      SELECT count(*) FROM public.mp_results WHERE user_id = p_user_id AND rank = 1 AND score > 0
    )::integer INTO v_value;
  ELSIF p_metric = 'puzzles_completed' THEN
    SELECT (
      SELECT count(*) FROM public.quiz_attempts WHERE user_id = p_user_id
    ) + (
      SELECT count(*) FROM public.mp_results WHERE user_id = p_user_id
    )::integer INTO v_value;
  ELSIF p_metric = 'debates_done' THEN
    SELECT count(DISTINCT a.debate_id)::integer INTO v_value
    FROM public.deb_arguments a
    WHERE a.user_id = p_user_id AND a.is_removed = false;
  ELSIF p_metric = 'debates_won' THEN
    SELECT count(*)::integer INTO v_value
    FROM public.deb_results r
    JOIN public.deb_participants dp ON dp.debate_id = r.debate_id AND dp.user_id = p_user_id
    WHERE dp.left_at IS NULL AND dp.is_moderator = false
      AND r.winning_side = dp.side::text;
  ELSIF p_metric = 'rebuttals_submitted' THEN
    SELECT count(*)::integer INTO v_value
    FROM public.deb_arguments
    WHERE user_id = p_user_id AND kind = 'rebuttal' AND is_removed = false;
  END IF;
  RETURN coalesce(v_value, 0);
END;
$$;

INSERT INTO public.achievement_definitions (id, category, name, description, icon, rarity, xp_reward, metric, threshold, sort_order)
VALUES
  ('debate-debut', 'social', 'Debate Debut', 'Submit your first argument in a Debate Arena match.', 'MessageSquare', 'common', 50, 'debates_done', 1, 60),
  ('consistent-debater', 'social', 'Consistent Debater', 'Argue in 5 different debates.', 'MessagesSquare', 'rare', 100, 'debates_done', 5, 61),
  ('strong-rebuttal', 'social', 'Strong Rebuttal', 'Submit 10 rebuttals across your debates.', 'Shield', 'rare', 100, 'rebuttals_submitted', 10, 62),
  ('debate-champion', 'social', 'Debate Champion', 'Win 10 debates by the audience''s verdict.', 'Scale', 'epic', 200, 'debates_won', 10, 63)
ON CONFLICT (id) DO UPDATE
  SET category = EXCLUDED.category,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      rarity = EXCLUDED.rarity,
      xp_reward = EXCLUDED.xp_reward,
      metric = EXCLUDED.metric,
      threshold = EXCLUDED.threshold,
      sort_order = EXCLUDED.sort_order,
      is_active = true;
