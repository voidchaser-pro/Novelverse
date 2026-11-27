/*
# Reading history touch (no chapter completion)

Plain English: opening a novel now updates the "recently read" history only. It does not mark any chapter as read, does not change the saved chapter or progress percentage, and does not affect the daily reading streak.

## New function
- `touch_reading_history(p_novel_id uuid)`: sets `last_read_at` to now for the signed-in reader's progress row. If the reader has never opened the novel, it creates a row at chapter 1 with 0% progress.

## Security
- Requires a signed-in user (`auth.uid()`), and the novel must be published.
- Runs as SECURITY DEFINER with an empty search_path.
- EXECUTE revoked from PUBLIC and anon; granted to authenticated only.

## Notes
- Existing chapter position and progress are never overwritten.
*/

CREATE OR REPLACE FUNCTION public.touch_reading_history(p_novel_id uuid)
RETURNS public.reading_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.reading_progress;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.novels n WHERE n.id = p_novel_id AND n.is_published = true
  ) THEN
    RAISE EXCEPTION 'Novel not found.';
  END IF;

  INSERT INTO public.reading_progress (user_id, novel_id, chapter_index, progress, last_read_at)
  VALUES (v_uid, p_novel_id, 0, 0, now())
  ON CONFLICT (user_id, novel_id) DO UPDATE
    SET last_read_at = excluded.last_read_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.touch_reading_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_reading_history(uuid) TO authenticated;
