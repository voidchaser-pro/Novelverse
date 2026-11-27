/*
# Reading streak tracking

## Plain-English summary
Each day a user opens a chapter is recorded once. The streak is the number of
consecutive days, ending today, with at least one recorded read. Reading several
times in one day never increases the streak.

## New tables
- `reading_activity`: one row per user per calendar day (UTC). Primary key
  (user_id, activity_date) makes same-day repeats impossible.

## New functions
- `record_reading_activity()`: SECURITY DEFINER. Records today's read for the caller,
  recalculates the consecutive-day streak, stores it in profiles.streak and returns it.
  Takes no parameters, so the client cannot choose a date or streak value.

## Security
- RLS enabled on reading_activity; signed-in users can SELECT only their own rows.
  No client INSERT/UPDATE/DELETE grant.
- EXECUTE on record_reading_activity revoked from PUBLIC and anon; granted to authenticated.
- search_path pinned to empty; all names schema-qualified.

## Notes
- The stored streak is recalculated on each recorded read. If a user skips a day and
  does not read again, the stored value stays until their next read.
*/

CREATE TABLE IF NOT EXISTS public.reading_activity (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date)
);

ALTER TABLE public.reading_activity ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.reading_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_activity TO service_role;

DROP POLICY IF EXISTS "reading_activity_select_own" ON public.reading_activity;
CREATE POLICY "reading_activity_select_own"
  ON public.reading_activity FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_reading_activity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_streak integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  INSERT INTO public.reading_activity (user_id, activity_date)
  VALUES (v_uid, v_day)
  ON CONFLICT (user_id, activity_date) DO NOTHING;

  WHILE EXISTS (
    SELECT 1 FROM public.reading_activity
    WHERE user_id = v_uid AND activity_date = v_day - v_streak
  ) LOOP
    v_streak := v_streak + 1;
  END LOOP;

  UPDATE public.profiles
  SET streak = v_streak, updated_at = now()
  WHERE id = v_uid;

  RETURN v_streak;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_reading_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_reading_activity() TO authenticated;
