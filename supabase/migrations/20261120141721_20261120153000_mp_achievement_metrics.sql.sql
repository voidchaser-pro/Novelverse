/*
# Connect multiplayer wins to gaming achievements

## Plain-English summary
The gaming achievements (First Victory, Puzzle Solver, Champion, Unstoppable) previously
counted only perfect solo quiz scores. Now multiplayer match wins and completed matches
also count: 'challenges_won' includes first-place multiplayer finishes (with a real
score), and 'puzzles_completed' includes finished multiplayer matches the player took
part in. This makes the achievements reachable through real multiplayer play, as
intended in the achievement catalogue.

## Changed functions
- `achievement_metric_value`: 'challenges_won' now adds COUNT of mp_results rows where
  the player ranked 1st with score > 0; 'puzzles_completed' now adds COUNT of distinct
  mp_results rows (one per completed match).

## Security
- No policy or grant changes; the function is already SECURITY DEFINER with a pinned
  search_path and is not client-callable.
*/

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
      SELECT count(*) FROM public.quiz_attempts
      WHERE user_id = p_user_id AND is_perfect = true
    ) + (
      SELECT count(*) FROM public.mp_results
      WHERE user_id = p_user_id AND rank = 1 AND score > 0
    )::integer INTO v_value;
  ELSIF p_metric = 'puzzles_completed' THEN
    SELECT (
      SELECT count(*) FROM public.quiz_attempts WHERE user_id = p_user_id
    ) + (
      SELECT count(*) FROM public.mp_results WHERE user_id = p_user_id
    )::integer INTO v_value;
  END IF;
  RETURN coalesce(v_value, 0);
END;
$$;
