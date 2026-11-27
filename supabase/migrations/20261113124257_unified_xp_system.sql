/*
# Unified XP system

## Plain-English summary
All XP now flows through one server-side ledger. Every award is recorded once per
source activity, so the same quiz, scenario or match can never pay out twice. Levels
are calculated in the database from total XP. Users can no longer insert profile rows
with their own XP, level or role.

## New tables
- `xp_events`: one row per XP award (user, source, source key, amount, timestamp).
  UNIQUE(user_id, source, source_key) is the duplicate guard.

## New functions
- `level_for_xp(integer)`: level = floor(xp / 450) + 1. Internal only.
- `grant_xp(uuid, text, text, integer)`: SECURITY DEFINER. Inserts the ledger row
  (ON CONFLICT DO NOTHING), then updates profiles.xp and profiles.level. Callable only
  by other database functions, never by clients.

## Changed functions
- `award_scenario_xp(uuid)`: now uses grant_xp, pins search_path to empty, validates
  the caller is signed in, requires the scenario to be completed AND to have reached a
  real ending node, and only pays the scenario's xp_reward.

## Security
- RLS enabled on xp_events; authenticated users can SELECT their own rows only. No
  INSERT/UPDATE/DELETE grant exists for clients.
- Table-level INSERT on profiles removed from authenticated, so users cannot create
  profile rows with arbitrary xp, level, streak or role. The signup trigger still
  creates profiles (it runs as the function owner).
- grant_xp and level_for_xp: EXECUTE revoked from PUBLIC, anon and authenticated.

## Notes
1. The scenario completion flag is still written by the client; the server only checks
   that the progress row has a real ending recorded. Residual risk is accepted for a
   non-monetary reward and is documented in the report.
2. Quiz and multiplayer XP must call grant_xp from server-side functions once their
   results are stored and validated on the server (Phases 4 and 7).
*/

CREATE OR REPLACE FUNCTION public.level_for_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT floor(greatest(p_xp, 0) / 450)::integer + 1
$$;

REVOKE EXECUTE ON FUNCTION public.level_for_xp(integer) FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('quiz', 'scenario', 'multiplayer', 'achievement')),
  source_key text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_key)
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user ON public.xp_events(user_id);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.xp_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xp_events TO service_role;

DROP POLICY IF EXISTS "xp_events_select_own" ON public.xp_events;
CREATE POLICY "xp_events_select_own"
  ON public.xp_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.grant_xp(
  p_user_id uuid,
  p_source text,
  p_source_key text,
  p_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.xp_events (user_id, source, source_key, amount)
  VALUES (p_user_id, p_source, p_source_key, p_amount)
  ON CONFLICT (user_id, source, source_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.profiles
  SET xp = xp + p_amount,
      level = public.level_for_xp(xp + p_amount),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN p_amount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_xp(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.award_scenario_xp(p_scenario_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_progress public.scenario_progress%ROWTYPE;
  v_scenario public.scenarios%ROWTYPE;
  v_has_ending boolean;
  v_awarded integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_progress
  FROM public.scenario_progress
  WHERE user_id = v_uid AND scenario_id = p_scenario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No progress found for this scenario.';
  END IF;

  IF NOT v_progress.completed THEN
    RAISE EXCEPTION 'Scenario not yet completed.';
  END IF;

  IF v_progress.xp_awarded THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_scenario FROM public.scenarios WHERE id = p_scenario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scenario not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_scenario.nodes) AS n
    WHERE (n ->> 'id') = ANY (v_progress.endings_discovered)
      AND (n ->> 'isEnding')::boolean IS TRUE
  ) INTO v_has_ending;

  IF NOT v_has_ending THEN
    RAISE EXCEPTION 'No recorded ending for this scenario.';
  END IF;

  v_awarded := public.grant_xp(v_uid, 'scenario', p_scenario_id::text, v_scenario.xp_reward);

  UPDATE public.scenario_progress
  SET xp_awarded = true, updated_at = now()
  WHERE id = v_progress.id;

  RETURN v_awarded;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_scenario_xp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_scenario_xp(uuid) TO authenticated;

REVOKE INSERT ON public.profiles FROM authenticated;
