/*
# Leaderboard rankings + secure profile editing

## Plain-English summary
Adds two server-side functions:

1. `get_leaderboard(p_period text, p_limit int)` — returns ranked players by XP.
   - 'all': ranks by `profiles.xp` descending (all-time total XP).
   - 'weekly': ranks by XP earned in the last 7 days, computed from `xp_events`.
   - Returns: rank, user_id, username, avatar_url, xp, level, and is_current_user.
   - Only includes users with xp > 0 (all-time) or who earned XP this week (weekly).
   - The caller's own row is always included even if outside the top N, so the
     "Your Position" card always has real data.

2. `update_my_profile(p_username text, p_bio text)` — lets a signed-in user update
   their own username and bio only. Cannot touch xp, level, role, streak, or id.
   Validates username length (2–40 chars) and bio length (≤200 chars).
   Returns the updated profile row.

## Security
- `get_leaderboard`: SECURITY DEFINER (needs to read all profiles, not just own).
  EXECUTE granted to authenticated. Reads profiles (public SELECT) and xp_events
  (own-rows-only RLS, so the SECURITY DEFINER bypasses RLS to aggregate all users).
- `update_my_profile`: SECURITY DEFINER (profiles UPDATE is column-restricted).
  EXECUTE granted to authenticated. Only updates `username` and `bio` columns;
  the WITH CHECK on the existing `profiles_update_own` policy ensures auth.uid() = id.

## Important notes
1. The leaderboard reads `profiles` which already has a public SELECT policy
   (`profiles_select_all`), so no additional grants are needed on profiles.
2. `xp_events` has own-rows-only RLS; the SECURITY DEFINER function bypasses RLS
   to aggregate weekly XP across all users. This is safe because the function only
   returns aggregate rank + profile fields (no individual xp_events rows).
3. Profile editing was previously a no-op (the UI said "In a real app this would
   save to Supabase"). This RPC makes it real, with server-side validation.
4. The existing `profiles_update_own` RLS policy (USING/WITH CHECK auth.uid() = id)
   still applies; the SECURITY DEFINER function runs as the owner but the UPDATE
   is scoped to `WHERE id = auth.uid()` explicitly.
*/

-- ============================================================
-- LEADERBOARD FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_period text DEFAULT 'all', p_limit int DEFAULT 50)
RETURNS TABLE (
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  xp bigint,
  level integer,
  is_current_user boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(p_limit, 1), 100);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_period = 'weekly' THEN
    RETURN QUERY
    WITH weekly_xp AS (
      SELECT
        e.user_id,
        COALESCE(SUM(e.amount), 0)::bigint AS xp
      FROM public.xp_events e
      WHERE e.created_at >= now() - interval '7 days'
      GROUP BY e.user_id
    ),
    ranked AS (
      SELECT
        p.id AS user_id,
        p.username,
        p.avatar_url,
        COALESCE(wx.xp, 0)::bigint AS xp,
        p.level,
        ROW_NUMBER() OVER (ORDER BY COALESCE(wx.xp, 0) DESC, p.username ASC) AS rn
      FROM public.profiles p
      LEFT JOIN weekly_xp wx ON wx.user_id = p.id
      WHERE COALESCE(wx.xp, 0) > 0
    )
    SELECT
      r.rn::integer AS rank,
      r.user_id,
      r.username,
      r.avatar_url,
      r.xp,
      r.level,
      (r.user_id = v_uid) AS is_current_user
    FROM ranked r
    WHERE r.rn <= v_limit OR r.user_id = v_uid
    ORDER BY r.rn;

  ELSE
    RETURN QUERY
    WITH ranked AS (
      SELECT
        p.id AS user_id,
        p.username,
        p.avatar_url,
        p.xp::bigint,
        p.level,
        ROW_NUMBER() OVER (ORDER BY p.xp DESC, p.username ASC) AS rn
      FROM public.profiles p
      WHERE p.xp > 0
    )
    SELECT
      r.rn::integer AS rank,
      r.user_id,
      r.username,
      r.avatar_url,
      r.xp,
      r.level,
      (r.user_id = v_uid) AS is_current_user
    FROM ranked r
    WHERE r.rn <= v_limit OR r.user_id = v_uid
    ORDER BY r.rn;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, int) TO authenticated;

-- ============================================================
-- PROFILE UPDATE FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_my_profile(p_username text DEFAULT NULL, p_bio text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  username text,
  bio text,
  avatar_url text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_username text;
  v_bio text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  -- Validate username if provided
  IF p_username IS NOT NULL THEN
    v_username := btrim(p_username);
    IF char_length(v_username) < 2 OR char_length(v_username) > 40 THEN
      RAISE EXCEPTION 'Username must be between 2 and 40 characters.';
    END IF;
  END IF;

  -- Validate bio if provided
  IF p_bio IS NOT NULL THEN
    v_bio := btrim(p_bio);
    IF char_length(v_bio) > 200 THEN
      RAISE EXCEPTION 'Bio must be 200 characters or fewer.';
    END IF;
  END IF;

  -- Update only the permitted columns, scoped to the caller
  UPDATE public.profiles
  SET
    username = COALESCE(v_username, username),
    bio = COALESCE(v_bio, bio),
    updated_at = now()
  WHERE id = v_uid
  RETURNING
    profiles.id,
    profiles.username,
    profiles.bio,
    profiles.avatar_url,
    profiles.updated_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated;
