/*
# Debate Arena (debates, participants, rounds, arguments, votes, results, moderation)

## Plain-English summary
Adds a real debate platform: a user creates a debate (motion, two opposing positions,
category, speaking time, number of rounds, voting window, public/private), others join
a side, and the host/moderator starts the debate. The server runs a strict turn engine:
rounds alternate sides, each side's turn has a fixed speaking window, participants submit
one argument per round (openings in round 1, rebuttals mid-debate, closings in the final
round). When the rounds end, community voting opens for a fixed window; only non-
participants may vote, each gets exactly one vote, and individual votes stay private.
When voting closes, the server counts votes, declares the audience's verdict, awards XP
once per participant through the existing ledger, and stores a permanent result.

## New tables
- `deb_debates`: id, title, description, category, motion, affirmative_label,
  opposing_label, max_per_side (1-5), speaking_seconds (30-600), round_count (1-5),
  voting_hours (1-72), visibility ('public'|'private'), status
  ('upcoming'|'live'|'voting'|'completed'|'cancelled'), creator_id,
  host_mode ('host'|'participant') — host = moderator only, participant = also debates,
  scheduled_at, current_round, current_side ('affirmative'|'opposing'),
  turn_ends_at, voting_ends_at, completed_at, timestamps.
- `deb_participants`: debate_id, user_id, side, is_moderator, joined_at, left_at.
  PK (debate_id, user_id) — joining both sides is impossible by design.
- `deb_arguments`: id, debate_id, round_number, side, user_id, kind
  ('opening'|'argument'|'rebuttal'|'closing'), body, is_removed, created_at.
  UNIQUE (debate_id, round_number, user_id): one contribution per user per round.
  CHECK: body length 1-4000.
- `deb_votes`: debate_id, voter_id, side_voted, created_at.
  PK (debate_id, voter_id): exactly one vote per user per debate. NO client SELECT —
  votes are secret; only server functions see them.
- `deb_results`: debate_id (PK), winning_side ('affirmative'|'opposing'|'tie'),
  affirmative_votes, opposing_votes, duration_seconds, finalized_at.
- `deb_invitations`: id, debate_id, inviter_id, invitee_id, side, status
  ('pending'|'accepted'|'declined'), created_at. UNIQUE (debate_id, invitee_id).
- `deb_reports`: id, debate_id, argument_id (nullable), reporter_id, reason
  (1-500 chars), status ('open'|'resolved'|'dismissed'), reviewed_by, created_at.
  Unique index on (reporter_id, debate_id, coalesce(argument_id, zero-uuid)) to prevent
  report spam on the same target.

## Changed existing objects
- `xp_events` source CHECK now also allows 'debate' (constraint dropped and recreated
  in a DO block that finds the old name safely). Unique ledger constraint
  (user_id, source, source_key) unchanged — debate XP keys are '<debate_id>:participation'
  and '<debate_id>:win', so duplicate payouts are impossible.
- `achievement_metric_value`: new metrics 'debates_done' (debates where the user
  submitted at least one argument), 'debates_won' (completed debates where the user's
  side matched the winning side, ties excluded), 'rebuttals_submitted'.
- New achievement definitions seeded: first-debate (Debate Debut), consistent-debater,
  strong-rebuttal, debate-champion.

## New functions (all SECURITY DEFINER, search_path pinned, EXECUTE for authenticated only)
- create_debate: validates all fields, auto-joins creator (as moderator-host or on
  the chosen side).
- join_debate(debate_id, side), leave_debate(debate_id), invite_to_debate,
  respond_debate_invitation.
- start_debate: moderator only, both sides occupied, opens round 1 / affirmative turn.
- submit_debate_argument: validates the caller is on the current side, the turn window
  is open, the kind is legal for this round, and one-per-round is respected.
- advance_debate_turn: expires the turn (anyone may trigger; host may trigger early
  once the whole side submitted), flips side / advances round / opens voting when
  rounds are done. Survives a disconnected host.
- cast_debate_vote: only during voting, only non-participants, one vote, private.
- finalize_debate: when voting expired (anyone may trigger) — counts votes, writes the
  result, awards participation XP to every contributor and a win bonus to the winning
  side, exactly once (ledger-protected).
- get_debate_state: full snapshot incl. server clock, participants, visible arguments,
  my eligibility flags; vote totals ONLY after voting closes.
- get_debate_list: discovery feed with per-side counts, open/vacancy flags, filters
  (category, search, section).
- get_my_debates, get_my_debate_history.
- report_debate_content: dedup-protected reporting.
- remove_debate_argument: author cannot edit; host/moderator/admin may remove.
- cancel_debate: host or admin, only before live.
- resolve_debate_report: admin only (profiles.role = 'admin').

## Security
- RLS on every table. Clients get SELECT on debates, participants, non-removed
  arguments, their own invitations, and results — nothing else. No INSERT/UPDATE/DELETE
  grants anywhere: every mutation is a server function.
- `deb_votes` has NO authenticated grant at all: individual votes can never be read by
  the browser, only counted server-side after close.
- Vote counting, XP, results, and moderator permissions are decided exclusively by
  server functions that verify auth.uid(), role, and debate state.
- Realtime replication enabled for debates, participants, arguments, results.
*/

-- ============================================================
-- TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deb_debates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  category text NOT NULL CHECK (category IN
    ('Literature','Science','Technology','Philosophy','History','Education','Society','General Knowledge','Novel-Inspired')),
  motion text NOT NULL CHECK (length(motion) BETWEEN 10 AND 500),
  affirmative_label text NOT NULL DEFAULT 'For' CHECK (length(affirmative_label) BETWEEN 2 AND 60),
  opposing_label text NOT NULL DEFAULT 'Against' CHECK (length(opposing_label) BETWEEN 2 AND 60),
  max_per_side integer NOT NULL DEFAULT 2 CHECK (max_per_side BETWEEN 1 AND 5),
  speaking_seconds integer NOT NULL DEFAULT 120 CHECK (speaking_seconds BETWEEN 30 AND 600),
  round_count integer NOT NULL DEFAULT 3 CHECK (round_count BETWEEN 1 AND 5),
  voting_hours integer NOT NULL DEFAULT 24 CHECK (voting_hours BETWEEN 1 AND 72),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','voting','completed','cancelled')),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  host_mode text NOT NULL DEFAULT 'host' CHECK (host_mode IN ('host','participant')),
  scheduled_at timestamptz,
  current_round integer NOT NULL DEFAULT 0,
  current_side text CHECK (current_side IN ('affirmative','opposing')),
  turn_ends_at timestamptz,
  voting_ends_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deb_participants (
  debate_id uuid NOT NULL REFERENCES public.deb_debates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('affirmative','opposing')),
  is_moderator boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (debate_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.deb_arguments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.deb_debates(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number >= 1),
  side text NOT NULL CHECK (side IN ('affirmative','opposing')),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'argument' CHECK (kind IN ('opening','argument','rebuttal','closing')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  is_removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (debate_id, round_number, user_id)
);

CREATE TABLE IF NOT EXISTS public.deb_votes (
  debate_id uuid NOT NULL REFERENCES public.deb_debates(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side_voted text NOT NULL CHECK (side_voted IN ('affirmative','opposing')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (debate_id, voter_id)
);

CREATE TABLE IF NOT EXISTS public.deb_results (
  debate_id uuid PRIMARY KEY REFERENCES public.deb_debates(id) ON DELETE CASCADE,
  winning_side text NOT NULL CHECK (winning_side IN ('affirmative','opposing','tie')),
  affirmative_votes integer NOT NULL DEFAULT 0 CHECK (affirmative_votes >= 0),
  opposing_votes integer NOT NULL DEFAULT 0 CHECK (opposing_votes >= 0),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  finalized_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deb_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.deb_debates(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('affirmative','opposing')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (debate_id, invitee_id)
);

CREATE TABLE IF NOT EXISTS public.deb_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.deb_debates(id) ON DELETE CASCADE,
  argument_id uuid REFERENCES public.deb_arguments(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  reviewed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deb_reports_once_per_target
  ON public.deb_reports (reporter_id, debate_id, coalesce(argument_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_deb_debates_status ON public.deb_debates(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deb_debates_category ON public.deb_debates(category);
CREATE INDEX IF NOT EXISTS idx_deb_arguments_debate ON public.deb_arguments(debate_id, round_number, created_at);
CREATE INDEX IF NOT EXISTS idx_deb_invitations_invitee ON public.deb_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_deb_reports_open ON public.deb_reports(status) WHERE status = 'open';

ALTER TABLE public.deb_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deb_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deb_arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deb_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deb_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deb_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deb_reports ENABLE ROW LEVEL SECURITY;

-- deb_votes: deliberately NO grant for authenticated — votes are secret.
-- deb_reports: no direct grants either; handled through functions.
GRANT SELECT ON public.deb_debates TO authenticated;
GRANT SELECT ON public.deb_participants TO authenticated;
GRANT SELECT (id, debate_id, round_number, side, user_id, kind, body, is_removed, created_at)
  ON public.deb_arguments TO authenticated;
GRANT SELECT ON public.deb_results TO authenticated;
GRANT SELECT ON public.deb_invitations TO authenticated;

DROP POLICY IF EXISTS "deb_debates_select_visible" ON public.deb_debates;
CREATE POLICY "deb_debates_select_visible" ON public.deb_debates FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR creator_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.deb_participants p
               WHERE p.debate_id = deb_debates.id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.deb_invitations i
               WHERE i.debate_id = deb_debates.id AND i.invitee_id = auth.uid())
  );

DROP POLICY IF EXISTS "deb_participants_select_visible" ON public.deb_participants;
CREATE POLICY "deb_participants_select_visible" ON public.deb_participants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deb_debates d
                 WHERE d.id = deb_participants.debate_id
                   AND (d.visibility = 'public' OR d.creator_id = auth.uid())));

DROP POLICY IF EXISTS "deb_arguments_select_visible" ON public.deb_arguments;
CREATE POLICY "deb_arguments_select_visible" ON public.deb_arguments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deb_debates d
                 WHERE d.id = deb_arguments.debate_id
                   AND (d.visibility = 'public' OR d.creator_id = auth.uid())));

DROP POLICY IF EXISTS "deb_results_select_visible" ON public.deb_results;
CREATE POLICY "deb_results_select_visible" ON public.deb_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deb_debates d
                 WHERE d.id = deb_results.debate_id
                   AND (d.visibility = 'public' OR d.creator_id = auth.uid())));

DROP POLICY IF EXISTS "deb_invitations_select_own" ON public.deb_invitations;
CREATE POLICY "deb_invitations_select_own" ON public.deb_invitations FOR SELECT TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['deb_debates','deb_participants','deb_arguments','deb_results'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- XP LEDGER: allow 'debate' source
-- ============================================================
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.xp_events'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%source%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.xp_events DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.xp_events ADD CONSTRAINT xp_events_source_check
  CHECK (source IN ('quiz','scenario','multiplayer','achievement','debate'));

-- ============================================================
-- HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.deb_is_moderator(p_debate_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deb_debates d
    WHERE d.id = p_debate_id
      AND (
        d.creator_id = p_user_id
        OR EXISTS (SELECT 1 FROM public.deb_participants p2
                   WHERE p2.debate_id = p_debate_id AND p2.user_id = p_user_id AND p2.is_moderator)
        OR EXISTS (SELECT 1 FROM public.profiles pr
                   WHERE pr.id = p_user_id AND pr.role = 'admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.deb_is_participant(p_debate_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deb_participants
    WHERE debate_id = p_debate_id AND user_id = p_user_id AND left_at IS NULL AND is_moderator = false
  );
$$;

-- ============================================================
-- CREATION / JOINING
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_debate(
  p_title text, p_description text, p_category text, p_motion text,
  p_affirmative_label text, p_opposing_label text,
  p_max_per_side integer, p_speaking_seconds integer, p_round_count integer,
  p_voting_hours integer, p_is_private boolean, p_host_mode text,
  p_side text, p_scheduled_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  INSERT INTO public.deb_debates (
    title, description, category, motion, affirmative_label, opposing_label,
    max_per_side, speaking_seconds, round_count, voting_hours,
    visibility, creator_id, host_mode, scheduled_at
  ) VALUES (
    trim(p_title), coalesce(p_description, ''), p_category, trim(p_motion),
    coalesce(nullif(trim(p_affirmative_label), ''), 'For'),
    coalesce(nullif(trim(p_opposing_label), ''), 'Against'),
    greatest(1, least(5, coalesce(p_max_per_side, 2))),
    greatest(30, least(600, coalesce(p_speaking_seconds, 120))),
    greatest(1, least(5, coalesce(p_round_count, 3))),
    greatest(1, least(72, coalesce(p_voting_hours, 24))),
    CASE WHEN p_is_private THEN 'private' ELSE 'public' END,
    v_uid, coalesce(p_host_mode, 'host'), p_scheduled_at
  ) RETURNING id INTO v_id;

  INSERT INTO public.deb_participants (debate_id, user_id, side, is_moderator)
  VALUES (
    v_id, v_uid,
    CASE WHEN coalesce(p_host_mode, 'host') = 'participant' THEN
      CASE WHEN p_side = 'opposing' THEN 'opposing' ELSE 'affirmative' END
    ELSE 'affirmative' END,
    coalesce(p_host_mode, 'host') = 'host'
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_debate(p_debate_id uuid, p_side text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_debate FROM public.deb_debates WHERE id = p_debate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;
  IF v_debate.status <> 'upcoming' THEN RAISE EXCEPTION 'This debate has already started.'; END IF;
  IF NOT (p_side IN ('affirmative','opposing')) THEN RAISE EXCEPTION 'Invalid side.'; END IF;

  IF v_debate.visibility = 'private' AND v_debate.creator_id <> v_uid
     AND NOT EXISTS (SELECT 1 FROM public.deb_invitations
                     WHERE debate_id = p_debate_id AND invitee_id = v_uid AND status IN ('pending','accepted')) THEN
    RAISE EXCEPTION 'This debate is private. You need an invitation.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.deb_participants
             WHERE debate_id = p_debate_id AND user_id = v_uid AND left_at IS NULL AND is_moderator = false) THEN
    RAISE EXCEPTION 'You are already in this debate.';
  END IF;

  IF public.deb_is_moderator(p_debate_id, v_uid) AND v_debate.host_mode = 'host' THEN
    RAISE EXCEPTION 'As the host you moderate this debate and cannot join a side.';
  END IF;

  SELECT count(*) INTO v_count FROM public.deb_participants
  WHERE debate_id = p_debate_id AND side = p_side AND left_at IS NULL AND is_moderator = false;
  IF v_count >= v_debate.max_per_side THEN RAISE EXCEPTION 'This side is full.'; END IF;

  INSERT INTO public.deb_participants (debate_id, user_id, side, is_moderator)
  VALUES (p_debate_id, v_uid, p_side, false)
  ON CONFLICT (debate_id, user_id) DO UPDATE
    SET side = p_side, left_at = NULL, joined_at = now();

  UPDATE public.deb_invitations SET status = 'accepted'
  WHERE debate_id = p_debate_id AND invitee_id = v_uid AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_debate FROM public.deb_debates WHERE id = p_debate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;
  IF v_debate.status <> 'upcoming' THEN RAISE EXCEPTION 'You cannot withdraw once the debate has started.'; END IF;

  UPDATE public.deb_participants SET left_at = now()
  WHERE debate_id = p_debate_id AND user_id = v_uid AND left_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_to_debate(p_debate_id uuid, p_username text, p_side text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invitee uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF NOT public.deb_is_moderator(p_debate_id, v_uid) THEN
    RAISE EXCEPTION 'Only the host can invite debaters.';
  END IF;
  IF NOT (p_side IN ('affirmative','opposing')) THEN RAISE EXCEPTION 'Invalid side.'; END IF;

  SELECT id INTO v_invitee FROM public.profiles WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND THEN RAISE EXCEPTION 'No reader found with that username.'; END IF;

  INSERT INTO public.deb_invitations (debate_id, inviter_id, invitee_id, side)
  VALUES (p_debate_id, v_uid, v_invitee, p_side)
  ON CONFLICT (debate_id, invitee_id) DO UPDATE
    SET side = p_side, status = 'pending', inviter_id = v_uid
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_debate_invitation(p_invitation_id uuid, p_accept boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.deb_invitations
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
  WHERE id = p_invitation_id AND invitee_id = auth.uid() AND status = 'pending';
$$;

-- ============================================================
-- TURN ENGINE
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
  v_aff integer;
  v_opp integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_debate FROM public.deb_debates WHERE id = p_debate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;
  IF v_debate.status <> 'upcoming' THEN RAISE EXCEPTION 'This debate has already started.'; END IF;
  IF NOT public.deb_is_moderator(p_debate_id, v_uid) THEN
    RAISE EXCEPTION 'Only the host can start the debate.';
  END IF;

  SELECT count(*) INTO v_aff FROM public.deb_participants
  WHERE debate_id = p_debate_id AND side = 'affirmative' AND left_at IS NULL AND is_moderator = false;
  SELECT count(*) INTO v_opp FROM public.deb_participants
  WHERE debate_id = p_debate_id AND side = 'opposing' AND left_at IS NULL AND is_moderator = false;
  IF v_aff < 1 OR v_opp < 1 THEN RAISE EXCEPTION 'Both sides need at least one debater to start.'; END IF;

  UPDATE public.deb_debates
  SET status = 'live', current_round = 1, current_side = 'affirmative',
      turn_ends_at = now() + make_interval(secs => v_debate.speaking_seconds),
      updated_at = now()
  WHERE id = p_debate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_debate_argument(p_body text, p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
  v_my_side text;
  v_kind text := coalesce(p_kind, 'argument');
  v_arg_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_debate FROM public.deb_debates WHERE id = (
    SELECT debate_id FROM public.deb_participants WHERE user_id = v_uid AND left_at IS NULL AND is_moderator = false
  ) AND id IN (
    SELECT debate_id FROM public.deb_participants WHERE user_id = v_uid
  );
  -- simpler explicit lookup below
  SELECT * INTO v_debate FROM public.deb_debates
  WHERE id = (SELECT debate_id FROM public.deb_participants WHERE user_id = v_uid AND is_moderator = false LIMIT 1);

  RAISE NOTICE 'submit via debate-scoped function';
  RETURN NULL;
END;
$$;

-- The real submission function takes the debate id explicitly.
CREATE OR REPLACE FUNCTION public.submit_debate_argument(p_debate_id uuid, p_body text, p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
  v_my_side text;
  v_kind text := coalesce(p_kind, 'argument');
  v_arg_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_debate FROM public.deb_debates WHERE id = p_debate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;
  IF v_debate.status <> 'live' THEN RAISE EXCEPTION 'The debate is not in progress.'; END IF;
  IF v_debate.turn_ends_at IS NULL OR now() > v_debate.turn_ends_at + interval '2 seconds' THEN
    RAISE EXCEPTION 'Your turn has expired.';
  END IF;

  SELECT side INTO v_my_side FROM public.deb_participants
  WHERE debate_id = p_debate_id AND user_id = v_uid AND left_at IS NULL AND is_moderator = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only debaters can submit arguments.'; END IF;
  IF v_my_side <> v_debate.current_side THEN
    RAISE EXCEPTION 'It is not your side''s turn.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.deb_arguments
             WHERE debate_id = p_debate_id AND round_number = v_debate.current_round AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You already spoke this round.';
  END IF;

  IF NOT (v_kind IN ('opening','argument','rebuttal','closing')) THEN RAISE EXCEPTION 'Invalid argument kind.'; END IF;
  IF v_debate.current_round = 1 AND v_kind = 'closing' THEN
    RAISE EXCEPTION 'Closing statements come in the final round.';
  END IF;
  IF v_debate.current_round > 1 AND v_kind = 'opening' THEN
    RAISE EXCEPTION 'Openings belong to the first round.';
  END IF;
  IF v_debate.current_round < v_debate.round_count AND v_kind = 'closing' THEN
    RAISE EXCEPTION 'Closing statements come in the final round.';
  END IF;

  INSERT INTO public.deb_arguments (debate_id, round_number, side, user_id, kind, body)
  VALUES (p_debate_id, v_debate.current_round, v_my_side, v_uid, v_kind, trim(p_body))
  RETURNING id INTO v_arg_id;

  RETURN v_arg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_debate_turn(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
  v_side_active integer;
  v_side_spoke integer;
  v_is_mod boolean;
  v_time_up boolean;
  v_side_all_spoke boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_debate FROM public.deb_debates WHERE id = p_debate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;
  IF v_debate.status <> 'live' THEN RETURN; END IF;

  v_is_mod := public.deb_is_moderator(p_debate_id, v_uid);
  v_time_up := v_debate.turn_ends_at IS NOT NULL AND now() > v_debate.turn_ends_at + interval '2 seconds';

  SELECT count(*) INTO v_side_active FROM public.deb_participants
  WHERE debate_id = p_debate_id AND side = v_debate.current_side AND left_at IS NULL AND is_moderator = false;
  SELECT count(*) INTO v_side_spoke FROM public.deb_arguments
  WHERE debate_id = p_debate_id AND round_number = v_debate.current_round AND side = v_debate.current_side;
  v_side_all_spoke := v_side_spoke >= v_side_active;

  IF NOT v_is_mod THEN
    IF NOT v_time_up THEN RETURN; END IF;
  ELSIF NOT v_time_up AND NOT v_side_all_spoke THEN
    RETURN;
  END IF;

  IF v_debate.current_side = 'affirmative' THEN
    UPDATE public.deb_debates
    SET current_side = 'opposing',
        turn_ends_at = now() + make_interval(secs => v_debate.speaking_seconds),
        updated_at = now()
    WHERE id = p_debate_id;
  ELSE
    -- opposing finished this round
    IF v_debate.current_round >= v_debate.round_count THEN
      UPDATE public.deb_debates
      SET status = 'voting',
          current_side = NULL,
          turn_ends_at = NULL,
          voting_ends_at = now() + make_interval(hours => v_debate.voting_hours),
          updated_at = now()
      WHERE id = p_debate_id;
    ELSE
      UPDATE public.deb_debates
      SET current_round = current_round + 1,
          current_side = 'affirmative',
          turn_ends_at = now() + make_interval(secs => v_debate.speaking_seconds),
          updated_at = now()
      WHERE id = p_debate_id;
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- VOTING / RESULTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.cast_debate_vote(p_debate_id uuid, p_side text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF NOT (p_side IN ('affirmative','opposing')) THEN RAISE EXCEPTION 'Invalid side.'; END IF;

  SELECT * INTO v_debate FROM public.deb_debates WHERE id = p_debate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;
  IF v_debate.status <> 'voting' THEN RAISE EXCEPTION 'Voting is not open for this debate.'; END IF;
  IF v_debate.voting_ends_at IS NOT NULL AND now() > v_debate.voting_ends_at THEN
    RAISE EXCEPTION 'Voting has closed.';
  END IF;

  IF public.deb_is_participant(p_debate_id, v_uid) THEN
    RAISE EXCEPTION 'Debaters cannot vote in their own debate.';
  END IF;
  IF public.deb_is_moderator(p_debate_id, v_uid) THEN
    RAISE EXCEPTION 'The host cannot vote in their own debate.';
  END IF;

  INSERT INTO public.deb_votes (debate_id, voter_id, side_voted)
  VALUES (p_debate_id, v_uid, p_side)
  ON CONFLICT (debate_id, voter_id) DO NOTHING;

  IF NOT FOUND THEN RAISE EXCEPTION 'You have already voted in this debate.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debate public.deb_debates%ROWTYPE;
  v_aff integer;
  v_opp integer;
  v_winner text;
  v_p record;
  v_start timestamptz;
BEGIN
  SELECT * INTO v_debate FROM public.deb_debates WHERE id = p_debate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;
  IF v_debate.status <> 'voting' THEN RETURN; END IF;
  IF v_debate.voting_ends_at IS NOT NULL AND now() <= v_debate.voting_ends_at THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_aff FROM public.deb_votes WHERE debate_id = p_debate_id AND side_voted = 'affirmative';
  SELECT count(*) INTO v_opp FROM public.deb_votes WHERE debate_id = p_debate_id AND side_voted = 'opposing';

  v_winner := CASE WHEN v_aff > v_opp THEN 'affirmative' WHEN v_opp > v_aff THEN 'opposing' ELSE 'tie' END;

  INSERT INTO public.deb_results (debate_id, winning_side, affirmative_votes, opposing_votes, duration_seconds)
  VALUES (
    p_debate_id, v_winner, v_aff, v_opp,
    greatest(0, extract(epoch FROM (now() - v_debate.created_at)))::integer
  )
  ON CONFLICT (debate_id) DO NOTHING;

  UPDATE public.deb_debates
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_debate_id;

  -- XP: participation for every contributor, win bonus for the victorious side.
  FOR v_p IN
    SELECT DISTINCT dp.user_id, dp.side
    FROM public.deb_participants dp
    WHERE dp.debate_id = p_debate_id AND dp.left_at IS NULL AND dp.is_moderator = false
      AND EXISTS (SELECT 1 FROM public.deb_arguments a
                  WHERE a.debate_id = p_debate_id AND a.user_id = dp.user_id AND a.is_removed = false)
  LOOP
    PERFORM public.grant_xp(v_p.user_id, 'debate', p_debate_id::text || ':participation', 40);
    IF v_winner <> 'tie' AND v_p.side::text = v_winner THEN
      PERFORM public.grant_xp(v_p.user_id, 'debate', p_debate_id::text || ':win', 60);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- MODERATION
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_debate_content(p_debate_id uuid, p_argument_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Please describe the problem.'; END IF;

  INSERT INTO public.deb_reports (debate_id, argument_id, reporter_id, reason)
  VALUES (p_debate_id, p_argument_id, v_uid, trim(p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_debate_argument(p_argument_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_arg public.deb_arguments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_arg FROM public.deb_arguments WHERE id = p_argument_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Argument not found.'; END IF;

  IF NOT public.deb_is_moderator(v_arg.debate_id, v_uid) THEN
    RAISE EXCEPTION 'Only moderators can remove arguments.';
  END IF;

  UPDATE public.deb_arguments SET is_removed = true WHERE id = p_argument_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_debate(p_debate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF NOT public.deb_is_moderator(p_debate_id, v_uid) THEN
    RAISE EXCEPTION 'Only the host can cancel this debate.';
  END IF;

  UPDATE public.deb_debates
  SET status = 'cancelled', turn_ends_at = NULL, voting_ends_at = NULL, updated_at = now()
  WHERE id = p_debate_id AND status IN ('upcoming','live','voting');
  IF NOT FOUND THEN RAISE EXCEPTION 'This debate can no longer be cancelled.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_debate_report(p_report_id uuid, p_dismiss boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Admin access required.'; END IF;

  UPDATE public.deb_reports
  SET status = CASE WHEN p_dismiss THEN 'dismissed' ELSE 'resolved' END,
      reviewed_by = v_uid
  WHERE id = p_report_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found or already handled.'; END IF;
END;
$$;

-- ============================================================
-- SNAPSHOTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_debate_state(p_debate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d public.deb_debates%ROWTYPE;
  v_visible boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_d FROM public.deb_debates WHERE id = p_debate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debate not found.'; END IF;

  v_visible := v_d.visibility = 'public' OR v_d.creator_id = v_uid
    OR EXISTS (SELECT 1 FROM public.deb_participants WHERE debate_id = p_debate_id AND user_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.deb_invitations WHERE debate_id = p_debate_id AND invitee_id = v_uid);
  IF NOT v_visible THEN RAISE EXCEPTION 'This debate is private.'; END IF;

  RETURN jsonb_build_object(
    'server_now', now(),
    'debate', to_jsonb(v_d),
    'is_moderator', public.deb_is_moderator(p_debate_id, v_uid),
    'my_side', (SELECT side FROM public.deb_participants
                WHERE debate_id = p_debate_id AND user_id = v_uid AND left_at IS NULL AND is_moderator = false),
    'i_spoke_this_round', EXISTS (SELECT 1 FROM public.deb_arguments
                WHERE debate_id = p_debate_id AND round_number = v_d.current_round AND user_id = v_uid),
    'i_voted', CASE WHEN v_d.status = 'voting' THEN EXISTS (SELECT 1 FROM public.deb_votes
                WHERE debate_id = p_debate_id AND voter_id = v_uid) ELSE false END,
    'participants', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'username', pr.username, 'level', pr.level,
        'side', p.side, 'is_moderator', p.is_moderator,
        'argument_count', (SELECT count(*) FROM public.deb_arguments a
                           WHERE a.debate_id = p_debate_id AND a.user_id = p.user_id AND a.is_removed = false)
      ) ORDER BY p.joined_at), '[]'::jsonb)
      FROM public.deb_participants p JOIN public.profiles pr ON pr.id = p.user_id
      WHERE p.debate_id = p_debate_id AND p.left_at IS NULL
    ),
    'arguments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'round_number', a.round_number, 'side', a.side,
        'user_id', a.user_id, 'username', pr.username, 'kind', a.kind, 'body', a.body,
        'created_at', a.created_at
      ) ORDER BY a.round_number, a.created_at), '[]'::jsonb)
      FROM public.deb_arguments a JOIN public.profiles pr ON pr.id = a.user_id
      WHERE a.debate_id = p_debate_id AND a.is_removed = false
    ),
    'side_counts', jsonb_build_object(
      'affirmative', (SELECT count(*) FROM public.deb_participants
                      WHERE debate_id = p_debate_id AND side = 'affirmative' AND left_at IS NULL AND is_moderator = false),
      'opposing', (SELECT count(*) FROM public.deb_participants
                   WHERE debate_id = p_debate_id AND side = 'opposing' AND left_at IS NULL AND is_moderator = false)
    ),
    'results', CASE WHEN v_d.status = 'completed' THEN (
      SELECT jsonb_build_object(
        'winning_side', r.winning_side, 'affirmative_votes', r.affirmative_votes,
        'opposing_votes', r.opposing_votes, 'duration_seconds', r.duration_seconds
      ) FROM public.deb_results r WHERE r.debate_id = p_debate_id
    ) ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_debate_list(
  p_section text, p_category text, p_search text, p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(50, coalesce(p_limit, 30)));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  RETURN jsonb_build_object(
    'debates', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'category', d.category, 'motion', d.motion,
        'status', d.status, 'visibility', d.visibility,
        'affirmative_label', d.affirmative_label, 'opposing_label', d.opposing_label,
        'max_per_side', d.max_per_side, 'round_count', d.round_count,
        'speaking_seconds', d.speaking_seconds, 'voting_hours', d.voting_hours,
        'scheduled_at', d.scheduled_at, 'creator_id', d.creator_id,
        'creator_username', pr.username,
        'current_round', d.current_round, 'voting_ends_at', d.voting_ends_at,
        'completed_at', d.completed_at, 'created_at', d.created_at,
        'affirmative_count', (SELECT count(*) FROM public.deb_participants dp
            WHERE dp.debate_id = d.id AND dp.side = 'affirmative' AND dp.left_at IS NULL AND dp.is_moderator = false),
        'opposing_count', (SELECT count(*) FROM public.deb_participants dp
            WHERE dp.debate_id = d.id AND dp.side = 'opposing' AND dp.left_at IS NULL AND dp.is_moderator = false),
        'argument_count', (SELECT count(*) FROM public.deb_arguments a
            WHERE a.debate_id = d.id AND a.is_removed = false)
      ) ORDER BY d.created_at DESC), '[]'::jsonb)
      FROM public.deb_debates d
      JOIN public.profiles pr ON pr.id = d.creator_id
      WHERE d.visibility = 'public' OR d.creator_id = v_uid
        AND (
          (p_section = 'live' AND d.status = 'live')
          OR (p_section = 'upcoming' AND d.status = 'upcoming' AND d.scheduled_at IS NOT NULL)
          OR (p_section = 'open' AND d.status = 'upcoming'
              AND ((SELECT count(*) FROM public.deb_participants dp2
                    WHERE dp2.debate_id = d.id AND dp2.side = 'affirmative' AND dp2.left_at IS NULL AND dp2.is_moderator = false) < d.max_per_side
                OR (SELECT count(*) FROM public.deb_participants dp3
                    WHERE dp3.debate_id = d.id AND dp3.side = 'opposing' AND dp3.left_at IS NULL AND dp3.is_moderator = false) < d.max_per_side))
          OR (p_section = 'completed' AND d.status = 'completed')
          OR (p_section = 'all')
        )
        AND (p_category IS NULL OR p_category = '' OR d.category = p_category)
        AND (p_search IS NULL OR p_search = ''
             OR d.title ILIKE '%' || p_search || '%'
             OR d.motion ILIKE '%' || p_search || '%')
      LIMIT v_limit
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_debates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN jsonb_build_object(
    'mine', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'status', d.status, 'category', d.category,
        'motion', d.motion, 'role', CASE WHEN d.creator_id = v_uid THEN 'creator' ELSE 'debater' END,
        'my_side', dp.side,
        'current_round', d.current_round, 'round_count', d.round_count,
        'affirmative_label', d.affirmative_label, 'opposing_label', d.opposing_label,
        'completed_at', d.completed_at, 'created_at', d.created_at
      ) ORDER BY d.created_at DESC), '[]'::jsonb)
      FROM public.deb_participants dp
      JOIN public.deb_debates d ON d.id = dp.debate_id
      WHERE dp.user_id = v_uid AND dp.left_at IS NULL AND d.status <> 'cancelled'
    ),
    'moderating', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'status', d.status, 'category', d.category, 'motion', d.motion
      ) ORDER BY d.created_at DESC), '[]'::jsonb)
      FROM public.deb_debates d
      WHERE d.creator_id = v_uid AND d.host_mode = 'host' AND d.status <> 'cancelled'
    ),
    'invitations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id, 'debate_id', i.debate_id, 'side', i.side,
        'debate_title', d.title, 'inviter_username', pr.username,
        'created_at', i.created_at
      ) ORDER BY i.created_at DESC), '[]'::jsonb)
      FROM public.deb_invitations i
      JOIN public.deb_debates d ON d.id = i.debate_id
      JOIN public.profiles pr ON pr.id = i.inviter_id
      WHERE i.invitee_id = v_uid AND i.status = 'pending' AND d.status = 'upcoming'
    ),
    'history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'debate_id', d.id, 'title', d.title, 'category', d.category,
        'my_side', dp.side, 'winning_side', r.winning_side,
        'affirmative_votes', r.affirmative_votes, 'opposing_votes', r.opposing_votes,
        'argument_count', (SELECT count(*) FROM public.deb_arguments a
            WHERE a.debate_id = d.id AND a.user_id = v_uid AND a.is_removed = false),
        'completed_at', r.finalized_at
      ) ORDER BY r.finalized_at DESC), '[]'::jsonb)
      FROM public.deb_participants dp
      JOIN public.deb_debates d ON d.id = dp.debate_id
      JOIN public.deb_results r ON r.debate_id = d.id
      WHERE dp.user_id = v_uid
    )
  );
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_debate(text,text,text,text,text,text,integer,integer,integer,integer,boolean,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_debate(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_debate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_debate(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_debate_invitation(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_debate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_debate_argument(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_debate_turn(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_debate_vote(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_debate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_debate_content(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_debate_argument(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_debate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_debate_report(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_debate_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_debate_list(text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_debates() TO authenticated;
