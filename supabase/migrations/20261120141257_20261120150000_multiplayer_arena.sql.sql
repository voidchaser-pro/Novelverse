/*
# Multiplayer Arena (rooms, invitations, matches, server-side scoring)

## Plain-English summary
Adds real-time multiplayer quiz battles. A player creates a room (public or private,
with a short join code), others join by code or accept an invitation, and the host
starts a match. The server picks random questions from the chosen quiz, opens each
question for a fixed window, validates every answer server-side the moment it is
submitted, and awards points for correctness plus a speed bonus. When the last question
closes, the server computes final rankings and pays XP once per player per match through
the existing XP ledger. Clients can never write scores, answers or room state directly.

## New tables
- `mp_rooms`: id, code (unique 6-char), host_id, quiz_id, status
  ('lobby' | 'question' | 'finished' | 'ended'), is_private, max_players,
  question_count, per_question_seconds, match_number, current_question_index,
  question_started_at, question_ends_at, timestamps.
- `mp_participants`: room_id, user_id, score, joined_at, left_at, last_seen_at.
  PK (room_id, user_id).
- `mp_invitations`: id, room_id, inviter_id, invitee_id, status ('pending' | 'accepted'
  | 'declined'), created_at. UNIQUE (room_id, invitee_id).
- `mp_match_questions`: id, room_id, match_number, position, question_id. No answer data.
- `mp_answers`: room_id, match_number, position, user_id, selected_index, is_correct,
  points, answered_at. PK (room_id, match_number, position, user_id).
- `mp_results`: room_id, match_number, user_id, rank, score, xp_awarded, is_winner.
  PK (room_id, match_number, user_id). Permanent match history.

## New functions (all SECURITY DEFINER, search_path pinned, EXECUTE for authenticated only)
- create_mp_room, join_mp_room, leave_mp_room, heartbeat_mp
- invite_to_mp_room, respond_mp_invitation
- start_mp_match (host only): samples random questions, opens question 1
- submit_mp_answer: validates the window, scores server-side, updates score
- advance_mp_question: closes the window (anyone may trigger once time expired, host
  may trigger early once everyone answered — survives host disconnection), opens the
  next question or finishes the match and pays XP once
- end_mp_match (host): force-finish; reset_mp_room (host): rematch, bumps match_number
- get_mp_room_state: full snapshot incl. server clock, current question (no correct
  answer), revealed answers for closed questions, final results
- get_my_mp_history: signed-in player's match history
- mp_can_see_room: internal visibility helper for RLS policies

## Security
- RLS on every table. Clients get SELECT only, scoped by room visibility (public rooms,
  or private rooms where the caller is host, participant, or invited). Invitations are
  readable by inviter and invitee only. No client INSERT/UPDATE/DELETE grants anywhere —
  every mutation goes through the functions above.
- Correct answers live only in quiz_questions, which clients cannot read
  (column-restricted in the Quiz Arena migration). Scoring joins it server-side.
- XP is paid by grant_xp with source 'multiplayer' and source_key
  '<room_id>:<match_number>': the unique constraint on xp_events makes duplicate
  payouts impossible. XP derives only from server-verified answers, so disconnecting
  cannot fake rewards.
- Realtime replication enabled for the new tables via the supabase_realtime publication.
*/

-- ============================================================
-- TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mp_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','question','finished','ended')),
  is_private boolean NOT NULL DEFAULT false,
  max_players integer NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 8),
  question_count integer NOT NULL DEFAULT 5 CHECK (question_count BETWEEN 3 AND 10),
  per_question_seconds integer NOT NULL DEFAULT 20 CHECK (per_question_seconds BETWEEN 10 AND 60),
  match_number integer NOT NULL DEFAULT 0,
  current_question_index integer NOT NULL DEFAULT -1,
  question_started_at timestamptz,
  question_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mp_participants (
  room_id uuid NOT NULL REFERENCES public.mp_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.mp_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.mp_rooms(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, invitee_id)
);

CREATE TABLE IF NOT EXISTS public.mp_match_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.mp_rooms(id) ON DELETE CASCADE,
  match_number integer NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  UNIQUE (room_id, match_number, position)
);

CREATE TABLE IF NOT EXISTS public.mp_answers (
  room_id uuid NOT NULL REFERENCES public.mp_rooms(id) ON DELETE CASCADE,
  match_number integer NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  selected_index integer NOT NULL CHECK (selected_index >= -1),
  is_correct boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, match_number, position, user_id)
);

CREATE TABLE IF NOT EXISTS public.mp_results (
  room_id uuid NOT NULL REFERENCES public.mp_rooms(id) ON DELETE CASCADE,
  match_number integer NOT NULL DEFAULT 1,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  is_winner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, match_number, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_rooms_status ON public.mp_rooms(status);
CREATE INDEX IF NOT EXISTS idx_mp_participants_user ON public.mp_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_invitations_invitee ON public.mp_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_mp_match_questions_room ON public.mp_match_questions(room_id, match_number, position);

ALTER TABLE public.mp_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_match_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_results ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.mp_rooms TO authenticated;
GRANT SELECT ON public.mp_participants TO authenticated;
GRANT SELECT ON public.mp_invitations TO authenticated;
GRANT SELECT (id, room_id, match_number, position, question_id) ON public.mp_match_questions TO authenticated;
GRANT SELECT ON public.mp_answers TO authenticated;
GRANT SELECT ON public.mp_results TO authenticated;

CREATE OR REPLACE FUNCTION public.mp_can_see_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mp_rooms r
    WHERE r.id = p_room_id
      AND (
        r.is_private = false
        OR r.host_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.mp_participants p WHERE p.room_id = r.id AND p.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.mp_invitations i WHERE i.room_id = r.id AND i.invitee_id = auth.uid())
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.mp_can_see_room(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "mp_rooms_select_visible" ON public.mp_rooms;
CREATE POLICY "mp_rooms_select_visible" ON public.mp_rooms FOR SELECT TO authenticated
  USING (public.mp_can_see_room(id));

DROP POLICY IF EXISTS "mp_participants_select_visible" ON public.mp_participants;
CREATE POLICY "mp_participants_select_visible" ON public.mp_participants FOR SELECT TO authenticated
  USING (public.mp_can_see_room(room_id));

DROP POLICY IF EXISTS "mp_invitations_select_own" ON public.mp_invitations;
CREATE POLICY "mp_invitations_select_own" ON public.mp_invitations FOR SELECT TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

DROP POLICY IF EXISTS "mp_match_questions_select_visible" ON public.mp_match_questions;
CREATE POLICY "mp_match_questions_select_visible" ON public.mp_match_questions FOR SELECT TO authenticated
  USING (public.mp_can_see_room(room_id));

DROP POLICY IF EXISTS "mp_answers_select_visible" ON public.mp_answers;
CREATE POLICY "mp_answers_select_visible" ON public.mp_answers FOR SELECT TO authenticated
  USING (public.mp_can_see_room(room_id));

DROP POLICY IF EXISTS "mp_results_select_visible" ON public.mp_results;
CREATE POLICY "mp_results_select_visible" ON public.mp_results FOR SELECT TO authenticated
  USING (public.mp_can_see_room(room_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mp_rooms','mp_participants','mp_invitations','mp_match_questions','mp_answers','mp_results'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- ROOM LIFECYCLE
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_mp_room(
  p_quiz_id uuid,
  p_is_private boolean,
  p_max_players integer,
  p_question_count integer,
  p_per_question_seconds integer
)
RETURNS public.mp_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE id = p_quiz_id AND is_published = true) THEN
    RAISE EXCEPTION 'Quiz not found.';
  END IF;

  LOOP
    v_code := upper(substr(replace(translate(gen_random_uuid()::text, '013456789', 'ABCDEFHIJ'), '-', ''), 1, 6));
    EXIT WHEN length(v_code) = 6 AND NOT EXISTS (SELECT 1 FROM public.mp_rooms WHERE code = v_code);
  END LOOP;

  INSERT INTO public.mp_rooms (code, host_id, quiz_id, is_private, max_players, question_count, per_question_seconds)
  VALUES (v_code, v_uid, p_quiz_id, p_is_private,
          greatest(2, least(8, coalesce(p_max_players, 4))),
          greatest(3, least(10, coalesce(p_question_count, 5))),
          greatest(10, least(60, coalesce(p_per_question_seconds, 20))))
  RETURNING * INTO v_room;

  INSERT INTO public.mp_participants (room_id, user_id) VALUES (v_room.id, v_uid);
  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_mp_room(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_room FROM public.mp_rooms WHERE code = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found. Check the code.'; END IF;
  IF v_room.status <> 'lobby' THEN RAISE EXCEPTION 'This match is already in progress.'; END IF;

  SELECT count(*) INTO v_count FROM public.mp_participants
  WHERE room_id = v_room.id AND left_at IS NULL;

  IF v_room.is_private
     AND v_room.host_id <> v_uid
     AND NOT EXISTS (
       SELECT 1 FROM public.mp_invitations
       WHERE room_id = v_room.id AND invitee_id = v_uid AND status IN ('pending','accepted')
     ) THEN
    RAISE EXCEPTION 'This room is private. You need an invitation.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.mp_participants WHERE room_id = v_room.id AND user_id = v_uid) THEN
    IF v_count >= v_room.max_players THEN RAISE EXCEPTION 'This room is full.'; END IF;
    INSERT INTO public.mp_participants (room_id, user_id) VALUES (v_room.id, v_uid);
  ELSE
    UPDATE public.mp_participants SET left_at = NULL, last_seen_at = now()
    WHERE room_id = v_room.id AND user_id = v_uid;
  END IF;

  UPDATE public.mp_invitations SET status = 'accepted'
  WHERE room_id = v_room.id AND invitee_id = v_uid AND status = 'pending';

  RETURN v_room.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_mp_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
  v_next_host uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  UPDATE public.mp_participants SET left_at = now()
  WHERE room_id = p_room_id AND user_id = v_uid AND left_at IS NULL;

  SELECT * INTO v_room FROM public.mp_rooms WHERE id = p_room_id;
  IF FOUND AND v_room.host_id = v_uid AND v_room.status = 'lobby' THEN
    SELECT user_id INTO v_next_host FROM public.mp_participants
    WHERE room_id = p_room_id AND left_at IS NULL AND user_id <> v_uid
    ORDER BY joined_at LIMIT 1;
    IF v_next_host IS NOT NULL THEN
      UPDATE public.mp_rooms SET host_id = v_next_host, updated_at = now() WHERE id = p_room_id;
    ELSE
      UPDATE public.mp_rooms SET status = 'ended', updated_at = now() WHERE id = p_room_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_mp(p_room_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.mp_participants SET last_seen_at = now()
  WHERE room_id = p_room_id AND user_id = auth.uid() AND left_at IS NULL;
$$;

-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.invite_to_mp_room(p_room_id uuid, p_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invitee uuid;
  v_invitation_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mp_rooms WHERE id = p_room_id AND host_id = v_uid) THEN
    RAISE EXCEPTION 'Only the host can invite players.';
  END IF;

  SELECT id INTO v_invitee FROM public.profiles WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND THEN RAISE EXCEPTION 'No player found with that username.'; END IF;
  IF v_invitee = v_uid THEN RAISE EXCEPTION 'You are already in this room.'; END IF;

  INSERT INTO public.mp_invitations (room_id, inviter_id, invitee_id)
  VALUES (p_room_id, v_uid, v_invitee)
  ON CONFLICT (room_id, invitee_id) DO UPDATE
    SET status = 'pending', inviter_id = v_uid
  RETURNING id INTO v_invitation_id;

  RETURN v_invitation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_mp_invitation(p_invitation_id uuid, p_accept boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.mp_invitations
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
  WHERE id = p_invitation_id AND invitee_id = auth.uid() AND status = 'pending';
$$;

-- ============================================================
-- MATCH GAMEPLAY
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_mp_match(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
  v_players integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_room FROM public.mp_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found.'; END IF;
  IF v_room.host_id <> v_uid THEN RAISE EXCEPTION 'Only the host can start the match.'; END IF;
  IF v_room.status <> 'lobby' THEN RAISE EXCEPTION 'The match already started.'; END IF;

  SELECT count(*) INTO v_players FROM public.mp_participants
  WHERE room_id = p_room_id AND left_at IS NULL;
  IF v_players < 2 THEN RAISE EXCEPTION 'You need at least 2 players to start.'; END IF;

  INSERT INTO public.mp_match_questions (room_id, match_number, position, question_id)
  SELECT p_room_id, v_room.match_number + 1, row_number() OVER (ORDER BY random()) - 1, id
  FROM public.quiz_questions
  WHERE quiz_id = v_room.quiz_id
  ORDER BY random()
  LIMIT v_room.question_count;

  UPDATE public.mp_rooms
  SET match_number = v_room.match_number + 1,
      current_question_index = 0,
      status = 'question',
      question_started_at = now(),
      question_ends_at = now() + make_interval(secs => v_room.per_question_seconds),
      updated_at = now()
  WHERE id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_mp_answer(p_room_id uuid, p_selected_index integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
  v_q record;
  v_points integer := 0;
  v_remaining numeric;
  v_ratio numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_room FROM public.mp_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found.'; END IF;
  IF v_room.status <> 'question' THEN RAISE EXCEPTION 'No question is open.'; END IF;
  IF v_room.question_ends_at IS NULL OR now() > v_room.question_ends_at + interval '2 seconds' THEN
    RAISE EXCEPTION 'Time is up for this question.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mp_participants
    WHERE room_id = p_room_id AND user_id = v_uid AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not in this room.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mp_answers
    WHERE room_id = p_room_id AND match_number = v_room.match_number
      AND position = v_room.current_question_index AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You already answered this question.';
  END IF;

  SELECT q.correct_index, q.xp, q.options INTO v_q
  FROM public.mp_match_questions mq
  JOIN public.quiz_questions q ON q.id = mq.question_id
  WHERE mq.room_id = p_room_id AND mq.match_number = v_room.match_number
    AND mq.position = v_room.current_question_index;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found.'; END IF;
  IF p_selected_index < 0 OR p_selected_index >= jsonb_array_length(v_q.options) THEN
    RAISE EXCEPTION 'Invalid answer.';
  END IF;

  IF p_selected_index = v_q.correct_index THEN
    v_remaining := greatest(0, extract(epoch FROM (v_room.question_ends_at - now())));
    v_ratio := least(1.0, v_remaining / v_room.per_question_seconds);
    v_points := round(v_q.xp * (0.5 + 0.5 * v_ratio))::integer;
  END IF;

  INSERT INTO public.mp_answers (room_id, match_number, position, user_id, selected_index, is_correct, points)
  VALUES (p_room_id, v_room.match_number, v_room.current_question_index, v_uid, p_selected_index,
          p_selected_index = v_q.correct_index, v_points);

  UPDATE public.mp_participants
  SET score = score + v_points, last_seen_at = now()
  WHERE room_id = p_room_id AND user_id = v_uid;

  RETURN v_points;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_mp_question(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
  v_active integer;
  v_answered integer;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_room FROM public.mp_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found.'; END IF;
  IF v_room.status <> 'question' THEN RETURN; END IF;

  SELECT count(*) INTO v_active FROM public.mp_participants
  WHERE room_id = p_room_id AND left_at IS NULL;
  SELECT count(*) INTO v_answered FROM public.mp_answers
  WHERE room_id = p_room_id AND match_number = v_room.match_number
    AND position = v_room.current_question_index;

  IF v_uid <> v_room.host_id AND (v_room.question_ends_at IS NULL OR now() <= v_room.question_ends_at) THEN
    IF v_answered < v_active THEN
      RETURN;
    END IF;
  END IF;

  SELECT count(*) INTO v_total FROM public.mp_match_questions
  WHERE room_id = p_room_id AND match_number = v_room.match_number;

  IF v_room.current_question_index + 1 < v_total THEN
    UPDATE public.mp_rooms
    SET current_question_index = current_question_index + 1,
        question_started_at = now(),
        question_ends_at = now() + make_interval(secs => v_room.per_question_seconds),
        updated_at = now()
    WHERE id = p_room_id;
  ELSE
    PERFORM public.finish_mp_match_internal(p_room_id, v_room.match_number);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_mp_match_internal(p_room_id uuid, p_match_number integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p record;
  v_rank integer := 0;
  v_prev_score integer := -1;
  v_xp integer;
BEGIN
  FOR v_p IN
    SELECT user_id, score FROM public.mp_participants
    WHERE room_id = p_room_id AND left_at IS NULL
    ORDER BY score DESC, joined_at ASC
  LOOP
    IF v_p.score <> v_prev_score THEN
      v_rank := v_rank + 1;
    END IF;
    v_prev_score := v_p.score;

    v_xp := v_p.score;
    IF v_xp > 0 THEN
      PERFORM public.grant_xp(v_p.user_id, 'multiplayer', p_room_id::text || ':' || p_match_number::text, v_xp);
    END IF;

    INSERT INTO public.mp_results (room_id, match_number, user_id, rank, score, xp_awarded, is_winner)
    VALUES (p_room_id, p_match_number, v_p.user_id, v_rank, v_p.score, v_xp, v_rank = 1 AND v_p.score > 0)
    ON CONFLICT (room_id, match_number, user_id) DO NOTHING;
  END LOOP;

  UPDATE public.mp_rooms SET status = 'finished', question_ends_at = NULL, updated_at = now()
  WHERE id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_mp_match(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  SELECT * INTO v_room FROM public.mp_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found.'; END IF;
  IF v_room.host_id <> v_uid THEN RAISE EXCEPTION 'Only the host can end the match.'; END IF;
  IF v_room.status <> 'question' THEN RETURN; END IF;
  PERFORM public.finish_mp_match_internal(p_room_id, v_room.match_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_mp_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  UPDATE public.mp_rooms
  SET match_number = match_number + 1,
      status = 'lobby',
      current_question_index = -1,
      question_started_at = NULL,
      question_ends_at = NULL,
      updated_at = now()
  WHERE id = p_room_id AND host_id = auth.uid() AND status = 'finished';

  UPDATE public.mp_participants SET score = 0 WHERE room_id = p_room_id;
END;
$$;

-- ============================================================
-- SNAPSHOTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_mp_room_state(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.mp_rooms;
  v_state jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_room FROM public.mp_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found.'; END IF;
  IF NOT public.mp_can_see_room(p_room_id) THEN RAISE EXCEPTION 'This room is private.'; END IF;

  SELECT jsonb_build_object(
    'server_now', now(),
    'room', to_jsonb(v_room),
    'quiz', (SELECT jsonb_build_object('id', q.id, 'title', q.title, 'difficulty', q.difficulty, 'cover_color', q.cover_color)
             FROM public.quizzes q WHERE q.id = v_room.quiz_id),
    'participants', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'username', pr.username,
        'level', pr.level,
        'score', p.score,
        'joined_at', p.joined_at,
        'left_at', p.left_at,
        'last_seen_at', p.last_seen_at
      ) ORDER BY p.score DESC, p.joined_at ASC), '[]'::jsonb)
      FROM public.mp_participants p
      JOIN public.profiles pr ON pr.id = p.user_id
      WHERE p.room_id = p_room_id
    ),
    'me_answered', EXISTS (
      SELECT 1 FROM public.mp_answers a
      WHERE a.room_id = p_room_id AND a.match_number = v_room.match_number
        AND a.position = v_room.current_question_index AND a.user_id = v_uid
    ),
    'my_points', (
      SELECT COALESCE((SELECT points FROM public.mp_answers a
        WHERE a.room_id = p_room_id AND a.match_number = v_room.match_number
          AND a.position = v_room.current_question_index AND a.user_id = v_uid), 0)
    ),
    'current_question', CASE WHEN v_room.status = 'question' THEN (
      SELECT jsonb_build_object(
        'position', mq.position,
        'question_id', mq.question_id,
        'question', q.question,
        'options', q.options,
        'xp', q.xp,
        'ends_at', v_room.question_ends_at
      )
      FROM public.mp_match_questions mq
      JOIN public.quiz_questions q ON q.id = mq.question_id
      WHERE mq.room_id = p_room_id AND mq.match_number = v_room.match_number
        AND mq.position = v_room.current_question_index
    ) ELSE NULL END,
    'revealed', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'position', mq.position,
        'question', q.question,
        'options', q.options,
        'correct_index', q.correct_index,
        'explanation', q.explanation,
        'answers', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'user_id', a.user_id,
            'selected_index', a.selected_index,
            'is_correct', a.is_correct,
            'points', a.points
          )), '[]'::jsonb)
          FROM public.mp_answers a
          WHERE a.room_id = mq.room_id AND a.match_number = mq.match_number AND a.position = mq.position
        )
      ) ORDER BY mq.position), '[]'::jsonb)
      FROM public.mp_match_questions mq
      JOIN public.quiz_questions q ON q.id = mq.question_id
      WHERE mq.room_id = p_room_id AND mq.match_number = v_room.match_number
        AND mq.position < v_room.current_question_index
    ),
    'total_questions', (
      SELECT count(*) FROM public.mp_match_questions mq
      WHERE mq.room_id = p_room_id AND mq.match_number = v_room.match_number
    ),
    'results', CASE WHEN v_room.status = 'finished' THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', r.user_id,
        'username', pr.username,
        'rank', r.rank,
        'score', r.score,
        'xp_awarded', r.xp_awarded,
        'is_winner', r.is_winner
      ) ORDER BY r.rank, r.score DESC), '[]'::jsonb)
      FROM public.mp_results r
      JOIN public.profiles pr ON pr.id = r.user_id
      WHERE r.room_id = p_room_id AND r.match_number = v_room.match_number
    ) ELSE NULL END
  ) INTO v_state;

  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_mp_history()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'room_id', r.room_id,
    'match_number', r.match_number,
    'quiz_title', q.title,
    'rank', r.rank,
    'score', r.score,
    'xp_awarded', r.xp_awarded,
    'is_winner', r.is_winner,
    'played_at', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  FROM public.mp_results r
  JOIN public.mp_rooms rm ON rm.id = r.room_id
  JOIN public.quizzes q ON q.id = rm.quiz_id
  WHERE r.user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.create_mp_room(uuid, boolean, integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_mp_room(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_mp_room(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.heartbeat_mp(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_to_mp_room(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_mp_invitation(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_mp_match(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_mp_answer(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_mp_question(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finish_mp_match_internal(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.end_mp_match(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_mp_room(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_mp_room_state(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_mp_history() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_mp_room(uuid, boolean, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_mp_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_mp_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_mp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_mp_room(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_mp_invitation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_mp_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_mp_answer(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_mp_question(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_mp_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_mp_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mp_room_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_mp_history() TO authenticated;
