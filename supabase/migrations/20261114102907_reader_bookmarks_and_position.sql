/*
# Reader bookmarks and saved reading position

1. Modified Tables
- `reading_progress`: new column `scroll_ratio` (0 to 1) storing how far down the current chapter the reader scrolled. Existing rows default to 0.

2. New Tables
- `chapter_bookmarks`: one row per bookmarked chapter for a signed-in reader.
  - `user_id` (defaults to the signed-in user), `novel_id`, `chapter_index`, `created_at`.
  - Primary key (user_id, novel_id, chapter_index) prevents duplicate bookmarks.

3. New Functions
- `save_reading_position(novel, chapter, ratio)`: updates the scroll position of the caller's own progress row. It only applies when the saved chapter matches the chapter the reader is on, so stale saves are ignored.

4. Security
- RLS enabled on `chapter_bookmarks` with four separate policies (select, insert, delete for own rows; no update).
- Inserts require the novel to be published.
- Grants: `authenticated` only (SELECT, INSERT, DELETE). No anonymous access.
- `save_reading_position` is executable by `authenticated` only.

5. Notes
- Reading history reuses the existing `reading_progress` rows (last_read_at), so no history table is added.
- No existing data is removed or altered.
*/

ALTER TABLE public.reading_progress
  ADD COLUMN IF NOT EXISTS scroll_ratio numeric NOT NULL DEFAULT 0;

ALTER TABLE public.reading_progress
  DROP CONSTRAINT IF EXISTS reading_progress_scroll_ratio_range;
ALTER TABLE public.reading_progress
  ADD CONSTRAINT reading_progress_scroll_ratio_range CHECK (scroll_ratio >= 0 AND scroll_ratio <= 1);

CREATE TABLE IF NOT EXISTS public.chapter_bookmarks (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id uuid NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL CHECK (chapter_index >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, novel_id, chapter_index)
);

ALTER TABLE public.chapter_bookmarks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chapter_bookmarks FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.chapter_bookmarks TO authenticated;

DROP POLICY IF EXISTS "chapter_bookmarks_select_own" ON public.chapter_bookmarks;
CREATE POLICY "chapter_bookmarks_select_own"
ON public.chapter_bookmarks FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "chapter_bookmarks_insert_own_published" ON public.chapter_bookmarks;
CREATE POLICY "chapter_bookmarks_insert_own_published"
ON public.chapter_bookmarks FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.novels n
    WHERE n.id = chapter_bookmarks.novel_id AND n.is_published = true
  )
);

DROP POLICY IF EXISTS "chapter_bookmarks_delete_own" ON public.chapter_bookmarks;
CREATE POLICY "chapter_bookmarks_delete_own"
ON public.chapter_bookmarks FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.save_reading_position(
  p_novel_id uuid,
  p_chapter_index integer,
  p_scroll_ratio numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  UPDATE public.reading_progress
  SET scroll_ratio = least(1, greatest(0, coalesce(p_scroll_ratio, 0)))
  WHERE user_id = v_uid
    AND novel_id = p_novel_id
    AND chapter_index = p_chapter_index;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_reading_position(uuid, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_reading_position(uuid, integer, numeric) TO authenticated;
