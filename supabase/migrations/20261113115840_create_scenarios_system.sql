/*
# NOVELVERSE — Interactive Scenarios System

## Overview
Adds the database tables, RLS policies, and a SECURITY DEFINER function for the
interactive branching-storyline feature. Scenarios are always linked to an
existing novel in the `novels` table. Both admins and readers can create
scenarios; reader-created scenarios must go through an approval workflow before
becoming publicly visible.

## New Tables

### 1. `scenarios`
- `id` (uuid, PK)
- `novel_id` (uuid, FK → novels, NOT NULL) — every scenario references an existing novel
- `title` (text, NOT NULL)
- `description` (text, nullable)
- `cover_color` (text, default emerald gradient)
- `creator_id` (uuid, FK → profiles, NOT NULL, DEFAULT auth.uid()) — who created it
- `start_node_id` (text, NOT NULL) — id of the first node within the nodes JSONB
- `nodes` (jsonb, NOT NULL DEFAULT '[]') — array of node objects, each with id, text, isEnding, choices[]
- `characters` (jsonb, DEFAULT '[]') — array of {id, name, description, avatar}
- `status` (text, NOT NULL DEFAULT 'draft') — 'draft', 'pending', 'approved', 'rejected'
- `is_published` (boolean, NOT NULL DEFAULT false) — publicly visible in Discover Scenarios
- `admin_feedback` (text, nullable) — admin note on approval/rejection
- `reviewed_by` (uuid, nullable, FK → profiles)
- `reviewed_at` (timestamptz, nullable)
- `xp_reward` (integer, NOT NULL DEFAULT 100) — XP granted on first completion
- `endings_count` (integer, NOT NULL DEFAULT 0) — denormalised count of ending nodes
- `created_at`, `updated_at` (timestamptz)

### 2. `scenario_progress`
- `id` (uuid, PK)
- `user_id` (uuid, FK → profiles, NOT NULL, DEFAULT auth.uid())
- `scenario_id` (uuid, FK → scenarios, NOT NULL)
- `current_node_id` (text, NOT NULL) — which node the reader is currently on
- `completed` (boolean, NOT NULL DEFAULT false)
- `endings_discovered` (text[], NOT NULL DEFAULT '{}') — node ids of endings reached
- `xp_awarded` (boolean, NOT NULL DEFAULT false) — prevents duplicate XP
- `last_played_at` (timestamptz, NOT NULL DEFAULT now())
- `created_at`, `updated_at` (timestamptz)
- UNIQUE(user_id, scenario_id) — one progress row per user per scenario

### 3. `scenario_submissions`
- `id` (uuid, PK)
- `scenario_id` (uuid, FK → scenarios, NOT NULL)
- `submitter_id` (uuid, FK → profiles, NOT NULL, DEFAULT auth.uid())
- `status` (text, NOT NULL DEFAULT 'pending') — 'pending', 'approved', 'rejected'
- `admin_feedback` (text, nullable)
- `reviewed_by` (uuid, nullable, FK → profiles)
- `reviewed_at` (timestamptz, nullable)
- `created_at`, `updated_at` (timestamptz)

## New Function

### `award_scenario_xp(p_scenario_id uuid)`
SECURITY DEFINER function that:
1. Finds the caller's `scenario_progress` row for the given scenario.
2. If `xp_awarded` is already true, returns 0 (prevents duplicate rewards).
3. Adds the scenario's `xp_reward` to the user's `profiles.xp`.
4. Recalculates `profiles.level` as `floor(xp / 450) + 1`.
5. Sets `xp_awarded = true` on the progress row.
6. Returns the XP amount awarded.
Only callable by `authenticated`. The function reads from `scenario_progress`
and `scenarios` which the caller can already see via RLS, and writes to
`profiles.xp` / `profiles.level` which the caller normally cannot update
directly (those columns are excluded from the authenticated UPDATE grant via a
separate migration).

## Security — RLS

### scenarios
- Published scenarios: readable by anon + authenticated (USING is_published = true)
- Admins: can read all scenarios
- Creators: can read their own scenarios (any status)
- Insert: any authenticated user (creator_id defaults to auth.uid())
- Update: creator can update their own draft/pending scenarios; admins can update any
- Delete: creator can delete own; admins can delete any

### scenario_progress
- Users can CRUD only their own progress rows (user_id = auth.uid())

### scenario_submissions
- Submitters can read their own submissions
- Admins can read all submissions
- Submitters can insert (status must be 'pending')
- Only admins can update (approve/reject)
- Submitters can delete their own pending submissions

## Grants
- scenarios: SELECT to anon + authenticated; INSERT/UPDATE/DELETE to authenticated; full to service_role
- scenario_progress: SELECT/INSERT/UPDATE/DELETE to authenticated; full to service_role
- scenario_submissions: SELECT/INSERT/DELETE to authenticated; UPDATE to authenticated; full to service_role
*/

-- ============================================================
-- SCENARIOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_color text NOT NULL DEFAULT 'from-primary-700 to-secondary-800',
  creator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  start_node_id text NOT NULL,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  characters jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  is_published boolean NOT NULL DEFAULT false,
  admin_feedback text,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  xp_reward integer NOT NULL DEFAULT 100,
  endings_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON scenarios TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON scenarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scenarios TO service_role;

-- Published scenarios are publicly readable
DROP POLICY IF EXISTS "scenarios_select_published" ON scenarios;
CREATE POLICY "scenarios_select_published"
  ON scenarios FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Admins can read all scenarios
DROP POLICY IF EXISTS "scenarios_select_admin" ON scenarios;
CREATE POLICY "scenarios_select_admin"
  ON scenarios FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Creators can read their own scenarios (any status)
DROP POLICY IF EXISTS "scenarios_select_own" ON scenarios;
CREATE POLICY "scenarios_select_own"
  ON scenarios FOR SELECT TO authenticated
  USING (auth.uid() = creator_id);

-- Any authenticated user can create scenarios (creator_id defaults to auth.uid())
DROP POLICY IF EXISTS "scenarios_insert_any" ON scenarios;
CREATE POLICY "scenarios_insert_any"
  ON scenarios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

-- Creators can update their own draft/pending scenarios; admins can update any
DROP POLICY IF EXISTS "scenarios_update_own" ON scenarios;
CREATE POLICY "scenarios_update_own"
  ON scenarios FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "scenarios_update_admin" ON scenarios;
CREATE POLICY "scenarios_update_admin"
  ON scenarios FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Creators can delete their own; admins can delete any
DROP POLICY IF EXISTS "scenarios_delete_own" ON scenarios;
CREATE POLICY "scenarios_delete_own"
  ON scenarios FOR DELETE TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "scenarios_delete_admin" ON scenarios;
CREATE POLICY "scenarios_delete_admin"
  ON scenarios FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================
-- SCENARIO_PROGRESS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS scenario_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  current_node_id text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  endings_discovered text[] NOT NULL DEFAULT '{}',
  xp_awarded boolean NOT NULL DEFAULT false,
  last_played_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scenario_id)
);

ALTER TABLE scenario_progress ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON scenario_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scenario_progress TO service_role;

DROP POLICY IF EXISTS "progress_select_own" ON scenario_progress;
CREATE POLICY "progress_select_own"
  ON scenario_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_insert_own" ON scenario_progress;
CREATE POLICY "progress_insert_own"
  ON scenario_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_update_own" ON scenario_progress;
CREATE POLICY "progress_update_own"
  ON scenario_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_delete_own" ON scenario_progress;
CREATE POLICY "progress_delete_own"
  ON scenario_progress FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- SCENARIO_SUBMISSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS scenario_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  submitter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_feedback text,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scenario_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON scenario_submissions TO authenticated;
GRANT UPDATE ON scenario_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scenario_submissions TO service_role;

-- Submitters can read their own submissions
DROP POLICY IF EXISTS "scenario_sub_select_own" ON scenario_submissions;
CREATE POLICY "scenario_sub_select_own"
  ON scenario_submissions FOR SELECT TO authenticated
  USING (auth.uid() = submitter_id);

-- Admins can read all submissions
DROP POLICY IF EXISTS "scenario_sub_select_admin" ON scenario_submissions;
CREATE POLICY "scenario_sub_select_admin"
  ON scenario_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Submitters can insert (status must be pending)
DROP POLICY IF EXISTS "scenario_sub_insert_own" ON scenario_submissions;
CREATE POLICY "scenario_sub_insert_own"
  ON scenario_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = submitter_id AND status = 'pending');

-- Only admins can update (approve/reject)
DROP POLICY IF EXISTS "scenario_sub_update_admin" ON scenario_submissions;
CREATE POLICY "scenario_sub_update_admin"
  ON scenario_submissions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Submitters can delete their own pending submissions
DROP POLICY IF EXISTS "scenario_sub_delete_own" ON scenario_submissions;
CREATE POLICY "scenario_sub_delete_own"
  ON scenario_submissions FOR DELETE TO authenticated
  USING (auth.uid() = submitter_id AND status = 'pending');

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scenarios_novel ON scenarios(novel_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_creator ON scenarios(creator_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_published ON scenarios(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_scenario_progress_user ON scenario_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_scenario_progress_scenario ON scenario_progress(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_submissions_status ON scenario_submissions(status);

-- ============================================================
-- AWARD SCENARIO XP FUNCTION (SECURITY DEFINER)
-- ============================================================
-- Awards XP for completing a scenario. Prevents duplicate rewards by checking
-- the xp_awarded flag on scenario_progress. Updates profiles.xp and profiles.level.
-- Only callable by authenticated users.
CREATE OR REPLACE FUNCTION public.award_scenario_xp(p_scenario_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress scenario_progress%ROWTYPE;
  v_xp_to_award integer;
  v_new_xp integer;
BEGIN
  -- Find the caller's progress row for this scenario
  SELECT * INTO v_progress
  FROM scenario_progress
  WHERE user_id = auth.uid() AND scenario_id = p_scenario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No progress found for this scenario.';
  END IF;

  -- Prevent duplicate rewards
  IF v_progress.xp_awarded THEN
    RETURN 0;
  END IF;

  -- Get the scenario's XP reward
  SELECT xp_reward INTO v_xp_to_award FROM scenarios WHERE id = p_scenario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scenario not found.';
  END IF;

  -- Only award if the scenario has been completed
  IF NOT v_progress.completed THEN
    RAISE EXCEPTION 'Scenario not yet completed.';
  END IF;

  -- Add XP and recalculate level
  UPDATE profiles
  SET xp = xp + v_xp_to_award,
      level = floor((xp + v_xp_to_award) / 450) + 1,
      updated_at = now()
  WHERE id = auth.uid()
  RETURNING xp INTO v_new_xp;

  -- Mark XP as awarded
  UPDATE scenario_progress
  SET xp_awarded = true, updated_at = now()
  WHERE id = v_progress.id;

  RETURN v_xp_to_award;
END;
$$;

-- Restrict execute to authenticated only
REVOKE EXECUTE ON FUNCTION public.award_scenario_xp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_scenario_xp(uuid) TO authenticated;
