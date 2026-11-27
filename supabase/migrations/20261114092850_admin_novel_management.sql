/*
# Admin novel management: tags column and dashboard stats function

## Plain-English summary
Adds a `tags` column to the existing `novels` table so administrators can tag novels
beyond their genres. Also creates a SECURITY DEFINER function `admin_dashboard_stats()`
that returns aggregate counts for the admin dashboard: total novels, published novels,
draft novels, total chapters across all novels, total registered readers, and pending
novel submissions. The function verifies the caller is an admin before returning data.

## Changes
1. novels table
   - New column: `tags` (text[], default '{}') — admin-defined tags for novels.
   - No other columns changed; no data lost.
2. New function: `admin_dashboard_stats()`
   - Returns a single row with: total_novels, published_novels, draft_novels,
     total_chapters, total_readers, pending_submissions.
   - SECURITY DEFINER, search_path pinned to empty.
   - Verifies auth.uid() has role = 'admin' in profiles; raises exception otherwise.
   - EXECUTE revoked from PUBLIC and anon; granted to authenticated only.

## Security
- The tags column is covered by the existing admin-only INSERT/UPDATE/DELETE policies
  on novels. Readers get SELECT on published novels only (existing policy), so they
  can read tags but cannot set them.
- The stats function checks the admin role server-side. A non-admin calling it gets
  an exception, not the data.
- No new tables. No new RLS policies needed — the novels table already has full
  admin CRUD policies and reader SELECT-published policy.
*/

-- Add tags column to novels if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'novels' AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.novels ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS TABLE (
  total_novels integer,
  published_novels integer,
  draft_novels integer,
  total_chapters integer,
  total_readers integer,
  pending_submissions integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: admin role required.';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::integer FROM public.novels),
    (SELECT count(*)::integer FROM public.novels WHERE is_published = true),
    (SELECT count(*)::integer FROM public.novels WHERE is_published = false),
    (SELECT coalesce(sum(jsonb_array_length(chapters)), 0)::integer FROM public.novels WHERE jsonb_typeof(chapters) = 'array'),
    (SELECT count(*)::integer FROM public.profiles),
    (SELECT count(*)::integer FROM public.novel_submissions WHERE status = 'pending');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;
