/*
# NOVELVERSE — Core Schema for EPUB Submissions & Moderation

## Overview
Creates the database tables needed for the NOVELVERSE reading and gaming platform's EPUB upload, moderation, and publishing workflow. This is the initial schema — the database was empty before this migration.

## New Tables

### 1. `profiles`
- `id` (uuid, PK, references auth.users) — one row per registered user
- `username` (text, unique) — display name
- `full_name` (text, nullable) — optional real name
- `bio` (text, nullable) — user biography
- `avatar_url` (text, nullable) — avatar image URL
- `role` (text, default 'reader') — 'admin' or 'reader'
- `xp` (integer, default 0) — experience points
- `level` (integer, default 1) — current level
- `streak` (integer, default 0) — daily reading streak
- `created_at` (timestamptz) — registration date
- `updated_at` (timestamptz) — last profile update

### 2. `novels`
- `id` (uuid, PK) — unique novel identifier
- `title` (text, not null) — book title
- `author` (text, not null) — author name
- `description` (text, nullable) — synopsis/description
- `cover_url` (text, nullable) — cover image URL (from Supabase Storage or data URL)
- `cover_color` (text, default gradient) — fallback gradient for placeholder covers
- `genres` (text[], default '{}') — genre tags
- `rating` (numeric, default 0) — community rating
- `rating_count` (integer, default 0) — number of ratings
- `chapters` (jsonb, default '[]') — chapter data (id, title, content, wordCount)
- `epub_storage_path` (text, nullable) — path to EPUB in Supabase Storage
- `submitted_by` (uuid, references profiles) — who submitted this novel
- `is_published` (boolean, default false) — whether it appears in the public library
- `year` (integer, nullable) — publication year
- `created_at` (timestamptz) — creation date
- `updated_at` (timestamptz) — last update

### 3. `novel_submissions`
- `id` (uuid, PK) — submission identifier
- `submitter_id` (uuid, references profiles) — the reader who submitted
- `novel_id` (uuid, nullable, references novels) — linked novel once created
- `title` (text, not null) — submitted title
- `author` (text, not null) — submitted author
- `description` (text, nullable) — submitted description
- `cover_url` (text, nullable) — extracted cover image URL
- `cover_color` (text, default gradient) — fallback gradient
- `chapters` (jsonb, default '[]') — extracted chapter data
- `epub_storage_path` (text, nullable) — path to uploaded EPUB in Storage
- `epub_file_name` (text, nullable) — original file name
- `status` (text, default 'pending') — 'pending', 'approved', 'rejected'
- `admin_feedback` (text, nullable) — admin's note on approval/rejection
- `rights_confirmed` (boolean, default false) — submitter confirmed they have rights
- `reviewed_by` (uuid, nullable, references profiles) — admin who reviewed
- `reviewed_at` (timestamptz, nullable) — when reviewed
- `created_at` (timestamptz) — submission date
- `updated_at` (timestamptz) — last update

## Security — Row Level Security

### profiles
- Users can read all profiles (needed for leaderboards, etc.)
- Users can update only their own profile
- Only admins can change the `role` column (enforced via column-level UPDATE grant excluding `role`)

### novels
- Anyone (anon + authenticated) can read published novels
- Only admins can insert, update, or delete novels
- Admins can read unpublished novels; non-admins cannot

### novel_submissions
- Readers can read only their own submissions
- Admins can read all submissions
- Readers can insert their own submissions (status defaults to 'pending')
- Only admins can update submissions (approve/reject, add feedback)
- Readers can delete their own pending submissions
- Readers CANNOT approve their own submissions (admin-only UPDATE policy)

## Grants
- profiles: SELECT to anon + authenticated; UPDATE (excluding role) to authenticated
- novels: SELECT to anon + authenticated
- novel_submissions: SELECT + INSERT to authenticated; DELETE to authenticated
- service_role gets full access on all tables for edge functions

## Storage Buckets
- `epubs` — private bucket for raw EPUB files
- `covers` — public bucket for extracted cover images
(Storage buckets are created separately via Supabase Storage API)
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text,
  bio text,
  avatar_url text,
  role text NOT NULL DEFAULT 'reader' CHECK (role IN ('admin', 'reader')),
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  streak integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO anon, authenticated;
-- Only allow updating non-role columns to non-admins (role is managed via admin path)
GRANT UPDATE (username, full_name, bio, avatar_url, xp, level, streak, updated_at) ON profiles TO authenticated;
GRANT INSERT ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO service_role;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- NOVELS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS novels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text NOT NULL,
  description text,
  cover_url text,
  cover_color text NOT NULL DEFAULT 'from-purple-600 to-indigo-800',
  genres text[] NOT NULL DEFAULT '{}',
  rating numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  epub_storage_path text,
  submitted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT false,
  year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE novels ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON novels TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON novels TO service_role;

-- Anyone can read published novels
DROP POLICY IF EXISTS "novels_select_published" ON novels;
CREATE POLICY "novels_select_published"
  ON novels FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Admins can read all novels (including unpublished)
DROP POLICY IF EXISTS "novels_select_admin" ON novels;
CREATE POLICY "novels_select_admin"
  ON novels FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can insert novels
DROP POLICY IF EXISTS "novels_insert_admin" ON novels;
CREATE POLICY "novels_insert_admin"
  ON novels FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can update novels
DROP POLICY IF EXISTS "novels_update_admin" ON novels;
CREATE POLICY "novels_update_admin"
  ON novels FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can delete novels
DROP POLICY IF EXISTS "novels_delete_admin" ON novels;
CREATE POLICY "novels_delete_admin"
  ON novels FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================
-- NOVEL_SUBMISSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS novel_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  novel_id uuid REFERENCES novels(id) ON DELETE SET NULL,
  title text NOT NULL,
  author text NOT NULL,
  description text,
  cover_url text,
  cover_color text NOT NULL DEFAULT 'from-purple-600 to-indigo-800',
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  epub_storage_path text,
  epub_file_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_feedback text,
  rights_confirmed boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE novel_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON novel_submissions TO authenticated;
GRANT UPDATE ON novel_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON novel_submissions TO service_role;

-- Readers can see their own submissions
DROP POLICY IF EXISTS "submissions_select_own" ON novel_submissions;
CREATE POLICY "submissions_select_own"
  ON novel_submissions FOR SELECT TO authenticated
  USING (auth.uid() = submitter_id);

-- Admins can see all submissions
DROP POLICY IF EXISTS "submissions_select_admin" ON novel_submissions;
CREATE POLICY "submissions_select_admin"
  ON novel_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Readers can insert their own submissions (status must be pending)
DROP POLICY IF EXISTS "submissions_insert_own" ON novel_submissions;
CREATE POLICY "submissions_insert_own"
  ON novel_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = submitter_id AND status = 'pending');

-- Only admins can update submissions (approve/reject)
DROP POLICY IF EXISTS "submissions_update_admin" ON novel_submissions;
CREATE POLICY "submissions_update_admin"
  ON novel_submissions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Readers can delete their own pending submissions
DROP POLICY IF EXISTS "submissions_delete_own" ON novel_submissions;
CREATE POLICY "submissions_delete_own"
  ON novel_submissions FOR DELETE TO authenticated
  USING (auth.uid() = submitter_id AND status = 'pending');

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_novels_published ON novels(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_novels_submitted_by ON novels(submitted_by);
CREATE INDEX IF NOT EXISTS idx_submissions_submitter ON novel_submissions(submitter_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON novel_submissions(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role = 'admin';

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
-- This function creates a profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant execute on the trigger function
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
