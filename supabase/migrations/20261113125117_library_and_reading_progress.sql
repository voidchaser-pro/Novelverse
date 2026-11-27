/*
# Library and reading progress

## Plain-English summary
Users can add novels to a personal library. Reading a chapter is recorded on the server:
the chapter is marked as read once, the reader's progress percentage and current chapter
are saved, and the daily reading streak is updated. Progress is restored on return.

## New tables
- library_items: which novels a user has added (user_id, novel_id). Primary key stops duplicates.
- chapter_completions: one row per user, novel and chapter index that has been read.
  The row count drives progress, completed novels and chapter achievements.
- reading_progress: per user and novel, the furthest chapter index read, progress percent
  and last-read timestamp.

## New functions
- record_chapter_read(p_novel_id uuid, p_chapter_index integer): SECURITY DEFINER.
  Validates the novel is published and the chapter index exists, records the completion
  once, recalculates progress from the server-side completion count, records reading
  activity for the streak and returns the new progress row.

## Security
- RLS enabled on all three tables. Users can read and modify only their own rows.
- Clients may insert and delete library items directly, but only for published novels.
- chapter_completions and reading_progress have no client write grants; they are written
  only through record_chapter_read.
- record_chapter_read: EXECUTE granted to authenticated only; search_path pinned.
*/

CREATE TABLE IF NOT EXISTS public.library_items (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  novel_id uuid NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, novel_id)
);

CREATE TABLE IF NOT EXISTS public.chapter_completions (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  novel_id uuid NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL CHECK (chapter_index >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, novel_id, chapter_index)
);

CREATE TABLE IF NOT EXISTS public.reading_progress (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  novel_id uuid NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL DEFAULT 0 CHECK (chapter_index >= 0),
  progress numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, novel_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_completions_novel ON public.chapter_completions(novel_id);

ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.library_items TO authenticated;
GRANT SELECT ON public.chapter_completions TO authenticated;
GRANT SELECT ON public.reading_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapter_completions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_progress TO service_role;

DROP POLICY IF EXISTS "library_select_own" ON public.library_items;
CREATE POLICY "library_select_own" ON public.library_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "library_insert_own_published" ON public.library_items;
CREATE POLICY "library_insert_own_published" ON public.library_items FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.novels n WHERE n.id = novel_id AND n.is_published = true)
  );

DROP POLICY IF EXISTS "library_delete_own" ON public.library_items;
CREATE POLICY "library_delete_own" ON public.library_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "chapter_completions_select_own" ON public.chapter_completions;
CREATE POLICY "chapter_completions_select_own" ON public.chapter_completions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_progress_select_own" ON public.reading_progress;
CREATE POLICY "reading_progress_select_own" ON public.reading_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_chapter_read(p_novel_id uuid, p_chapter_index integer)
RETURNS public.reading_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chapter_count integer;
  v_done integer;
  v_row public.reading_progress;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT jsonb_array_length(n.chapters) INTO v_chapter_count
  FROM public.novels n
  WHERE n.id = p_novel_id AND n.is_published = true;

  IF v_chapter_count IS NULL THEN
    RAISE EXCEPTION 'Novel not found.';
  END IF;

  IF p_chapter_index IS NULL OR p_chapter_index < 0 OR p_chapter_index >= v_chapter_count THEN
    RAISE EXCEPTION 'Chapter index out of range.';
  END IF;

  INSERT INTO public.chapter_completions (user_id, novel_id, chapter_index)
  VALUES (v_uid, p_novel_id, p_chapter_index)
  ON CONFLICT (user_id, novel_id, chapter_index) DO NOTHING;

  SELECT count(*) INTO v_done
  FROM public.chapter_completions
  WHERE user_id = v_uid AND novel_id = p_novel_id;

  INSERT INTO public.reading_progress (user_id, novel_id, chapter_index, progress, last_read_at)
  VALUES (
    v_uid, p_novel_id, p_chapter_index,
    round(least(100, v_done * 100.0 / v_chapter_count), 2), now()
  )
  ON CONFLICT (user_id, novel_id) DO UPDATE
  SET chapter_index = excluded.chapter_index,
      progress = excluded.progress,
      last_read_at = excluded.last_read_at
  RETURNING * INTO v_row;

  PERFORM public.record_reading_activity();

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_chapter_read(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_chapter_read(uuid, integer) TO authenticated;
