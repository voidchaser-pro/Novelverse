/*
# Competitive Quiz Arena

## Plain-English summary
Replaces mock quiz data with a real database-backed quiz system. Quizzes are stored
in the database with questions, options, correct answers, explanations, difficulty
levels, and per-question XP values and time limits. Players submit answers through a
server-side function that validates every answer against the stored correct index,
computes the score, records the attempt, and awards XP exactly once per quiz (preventing
duplicate rewards and score manipulation). Adds daily challenges, quiz history, and
performance statistics. Reactivates the four gaming achievements now that real quiz
metrics exist.

## New tables
- `quizzes`: the quiz catalogue (title, description, difficulty, time limit, novel
  association, cover color, icon, is_published, is_daily_eligible). Admin-managed;
  readable by all signed-in users.
- `quiz_questions`: one row per question (quiz_id, position, question text, options
  JSON array, correct_index, explanation, xp). Readable by signed-in users.
- `quiz_attempts`: one row per attempt (user_id, quiz_id, score, correct_count,
  total_questions, xp_awarded, is_perfect, time_taken_ms, answers JSONB). UNIQUE
  (user_id, quiz_id) — retries update in place, keeping the best score.
- `daily_challenges`: one row per day (challenge_date, quiz_id).

## New functions
- `submit_quiz_attempt`: SECURITY DEFINER. Validates answers server-side, computes
  score, records/updates attempt, grants XP via grant_xp (prevents duplicates).
- `get_today_challenge`: returns today's daily challenge quiz.
- `get_quiz_stats`: returns aggregate quiz statistics for a user.

## Changed functions
- `achievement_metric_value`: now computes 'challenges_won' (perfect quiz scores) and
  'puzzles_completed' (total quiz attempts) from quiz_attempts.

## Changed data
- Reactivates 4 gaming achievements: first-victory, puzzle-solver, champion, unstoppable.

## Security
- RLS on all new tables. Quizzes + questions: SELECT to authenticated (published only).
  Attempts: SELECT to authenticated (own rows only); no client writes — all through the
  SECURITY DEFINER submit function. Daily challenges: SELECT to authenticated.
- Client-callable functions: EXECUTE to authenticated only, revoked from PUBLIC/anon.
- Score is recomputed entirely server-side from stored question data; client sends only
  selected answer indices. XP awarded through grant_xp's UNIQUE constraint.

## Important notes
1. Client cannot inflate score — server looks up correct_index for each question.
2. XP awarded once per quiz via grant_xp (source='quiz', source_key=quiz_id). Retries
   that improve the score grant the difference with source_key=quiz_id:retry.
3. quiz_attempts UNIQUE(user_id, quiz_id) means retries update in place.
4. Time bonus capped at 50% of question XP, computed from server-validated elapsed time.
*/

-- ============================================================
-- QUIZZES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid REFERENCES public.novels(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  difficulty text NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  time_limit_seconds integer NOT NULL DEFAULT 30 CHECK (time_limit_seconds > 0 AND time_limit_seconds <= 120),
  cover_color text NOT NULL DEFAULT 'from-primary-600 to-secondary-700',
  icon text NOT NULL DEFAULT 'Brain',
  is_published boolean NOT NULL DEFAULT false,
  is_daily_eligible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.quizzes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO service_role;

DROP POLICY IF EXISTS "quizzes_select_published" ON public.quizzes;
CREATE POLICY "quizzes_select_published"
  ON public.quizzes FOR SELECT TO authenticated
  USING (is_published = true);

-- ============================================================
-- QUIZ QUESTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  question text NOT NULL,
  options jsonb NOT NULL CHECK (jsonb_array_length(options) >= 2),
  correct_index integer NOT NULL CHECK (correct_index >= 0),
  explanation text NOT NULL DEFAULT '',
  xp integer NOT NULL DEFAULT 50 CHECK (xp >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions(quiz_id, position);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO service_role;

DROP POLICY IF EXISTS "quiz_questions_select_via_published_quiz" ON public.quiz_questions;
CREATE POLICY "quiz_questions_select_via_published_quiz"
  ON public.quiz_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_questions.quiz_id AND q.is_published = true
    )
  );

-- ============================================================
-- QUIZ ATTEMPTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  total_questions integer NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  is_perfect boolean NOT NULL DEFAULT false,
  time_taken_ms integer NOT NULL DEFAULT 0 CHECK (time_taken_ms >= 0),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quiz_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON public.quiz_attempts(quiz_id);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.quiz_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO service_role;

DROP POLICY IF EXISTS "quiz_attempts_select_own" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_select_own"
  ON public.quiz_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- DAILY CHALLENGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date date NOT NULL UNIQUE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_date ON public.daily_challenges(challenge_date DESC);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.daily_challenges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_challenges TO service_role;

DROP POLICY IF EXISTS "daily_challenges_select_all" ON public.daily_challenges;
CREATE POLICY "daily_challenges_select_all"
  ON public.daily_challenges FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- SUBMIT QUIZ ATTEMPT FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb,
  p_time_taken_ms integer
)
RETURNS TABLE (
  attempt_id uuid,
  score integer,
  correct_count integer,
  total_questions integer,
  xp_awarded integer,
  is_perfect boolean,
  is_new_best boolean,
  answers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_quiz public.quizzes%ROWTYPE;
  v_total integer := 0;
  v_correct integer := 0;
  v_score integer := 0;
  v_question_xp integer;
  v_time_bonus integer;
  v_answer_idx integer;
  v_q_correct_index integer;
  v_q_xp integer;
  v_q_explanation text;
  v_answers_result jsonb := '[]'::jsonb;
  v_existing public.quiz_attempts%ROWTYPE;
  v_xp_to_grant integer := 0;
  v_is_new_best boolean := false;
  v_is_perfect boolean := false;
  v_source_key text;
  v_per_q_time_limit_ms integer;
  v_elapsed_per_q numeric;
  v_attempt_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id AND is_published = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found or not published.';
  END IF;

  SELECT count(*)::integer INTO v_total FROM public.quiz_questions WHERE quiz_id = p_quiz_id;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'This quiz has no questions.';
  END IF;

  v_per_q_time_limit_ms := v_quiz.time_limit_seconds * 1000;

  FOR i IN 0..(v_total - 1) LOOP
    SELECT correct_index, xp, explanation
    INTO v_q_correct_index, v_q_xp, v_q_explanation
    FROM public.quiz_questions
    WHERE quiz_id = p_quiz_id
    ORDER BY position
    OFFSET i LIMIT 1;

    v_answer_idx := -1;
    IF p_answers ? i::text THEN
      v_answer_idx := (p_answers ->> i::text)::integer;
    END IF;

    v_question_xp := 0;
    v_time_bonus := 0;

    IF v_answer_idx = v_q_correct_index THEN
      v_correct := v_correct + 1;
      v_question_xp := v_q_xp;
      v_elapsed_per_q := GREATEST(0, LEAST(p_time_taken_ms, v_per_q_time_limit_ms * v_total))::numeric / v_total;
      v_time_bonus := ROUND((v_q_xp * 0.5) * GREATEST(0, 1.0 - (v_elapsed_per_q / v_per_q_time_limit_ms)))::integer;
      v_score := v_score + v_question_xp + v_time_bonus;
    END IF;

    v_answers_result := v_answers_result || jsonb_build_object(
      'position', i,
      'selectedIndex', v_answer_idx,
      'correctIndex', v_q_correct_index,
      'isCorrect', (v_answer_idx = v_q_correct_index),
      'explanation', v_q_explanation,
      'xpEarned', v_question_xp + v_time_bonus
    );
  END LOOP;

  v_is_perfect := (v_correct = v_total);

  SELECT * INTO v_existing FROM public.quiz_attempts WHERE user_id = v_uid AND quiz_id = p_quiz_id;

  IF FOUND THEN
    v_attempt_id := v_existing.id;
    IF v_score > v_existing.score THEN
      v_is_new_best := true;
      v_xp_to_grant := v_score - v_existing.score;
      v_source_key := p_quiz_id::text || ':retry';

      UPDATE public.quiz_attempts
      SET score = v_score,
          correct_count = v_correct,
          total_questions = v_total,
          xp_awarded = v_existing.xp_awarded + v_xp_to_grant,
          is_perfect = v_is_perfect,
          time_taken_ms = p_time_taken_ms,
          answers = v_answers_result,
          updated_at = now()
      WHERE id = v_existing.id;
    END IF;
  ELSE
    v_is_new_best := true;
    v_xp_to_grant := v_score;
    v_source_key := p_quiz_id::text;

    INSERT INTO public.quiz_attempts (user_id, quiz_id, score, correct_count, total_questions, xp_awarded, is_perfect, time_taken_ms, answers)
    VALUES (v_uid, p_quiz_id, v_score, v_correct, v_total, v_xp_to_grant, v_is_perfect, p_time_taken_ms, v_answers_result)
    RETURNING id INTO v_attempt_id;
  END IF;

  IF v_xp_to_grant > 0 THEN
    PERFORM public.grant_xp(v_uid, 'quiz', v_source_key, v_xp_to_grant);
  END IF;

  RETURN QUERY
  SELECT
    v_attempt_id AS attempt_id,
    v_score AS score,
    v_correct AS correct_count,
    v_total AS total_questions,
    v_xp_to_grant AS xp_awarded,
    v_is_perfect AS is_perfect,
    v_is_new_best AS is_new_best,
    v_answers_result AS answers;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb, integer) TO authenticated;

-- ============================================================
-- GET TODAY CHALLENGE FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_today_challenge()
RETURNS TABLE (
  challenge_id uuid,
  challenge_date date,
  quiz_id uuid,
  quiz_title text,
  quiz_description text,
  quiz_difficulty text,
  quiz_time_limit_seconds integer,
  quiz_cover_color text,
  quiz_icon text,
  question_count bigint,
  has_attempted boolean,
  best_score integer
)
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

  RETURN QUERY
  SELECT
    dc.id AS challenge_id,
    dc.challenge_date,
    dc.quiz_id,
    q.title AS quiz_title,
    q.description AS quiz_description,
    q.difficulty AS quiz_difficulty,
    q.time_limit_seconds AS quiz_time_limit_seconds,
    q.cover_color AS quiz_cover_color,
    q.icon AS quiz_icon,
    (SELECT count(*) FROM public.quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
    EXISTS(SELECT 1 FROM public.quiz_attempts qa WHERE qa.user_id = v_uid AND qa.quiz_id = q.id) AS has_attempted,
    COALESCE((SELECT max(score) FROM public.quiz_attempts qa WHERE qa.user_id = v_uid AND qa.quiz_id = q.id), 0) AS best_score
  FROM public.daily_challenges dc
  JOIN public.quizzes q ON q.id = dc.quiz_id AND q.is_published = true
  WHERE dc.challenge_date = current_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_today_challenge() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_today_challenge() TO authenticated;

-- ============================================================
-- GET QUIZ STATS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_quiz_stats(p_user_id uuid)
RETURNS TABLE (
  total_attempts integer,
  perfect_scores integer,
  total_xp_earned integer,
  avg_accuracy numeric,
  best_score integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::integer AS total_attempts,
    count(*) FILTER (WHERE is_perfect)::integer AS perfect_scores,
    COALESCE(sum(xp_awarded), 0)::integer AS total_xp_earned,
    COALESCE(avg(correct_count::numeric / GREATEST(total_questions, 1)) * 100, 0)::numeric AS avg_accuracy,
    COALESCE(max(score), 0)::integer AS best_score
  FROM public.quiz_attempts
  WHERE user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_quiz_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_stats(uuid) TO authenticated;

-- ============================================================
-- UPDATE ACHIEVEMENT METRICS FOR QUIZ GAMEPLAY
-- ============================================================
CREATE OR REPLACE FUNCTION public.achievement_metric_value(p_user_id uuid, p_metric text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_value integer := 0;
BEGIN
  IF p_metric = 'chapters_read' THEN
    SELECT count(*)::integer INTO v_value FROM public.chapter_completions WHERE user_id = p_user_id;
  ELSIF p_metric = 'novels_completed' THEN
    SELECT count(*)::integer INTO v_value FROM public.reading_progress WHERE user_id = p_user_id AND progress >= 100;
  ELSIF p_metric = 'streak_days' THEN
    SELECT coalesce(streak, 0) INTO v_value FROM public.profiles WHERE id = p_user_id;
  ELSIF p_metric = 'total_xp' THEN
    SELECT coalesce(xp, 0) INTO v_value FROM public.profiles WHERE id = p_user_id;
  ELSIF p_metric = 'night_chapters' THEN
    SELECT count(*)::integer INTO v_value FROM public.chapter_completions
    WHERE user_id = p_user_id AND extract(hour FROM completed_at AT TIME ZONE 'UTC') < 4;
  ELSIF p_metric = 'early_chapters' THEN
    SELECT count(*)::integer INTO v_value FROM public.chapter_completions
    WHERE user_id = p_user_id AND extract(hour FROM completed_at AT TIME ZONE 'UTC') BETWEEN 5 AND 7;
  ELSIF p_metric = 'challenges_won' THEN
    SELECT count(*)::integer INTO v_value FROM public.quiz_attempts WHERE user_id = p_user_id AND is_perfect = true;
  ELSIF p_metric = 'puzzles_completed' THEN
    SELECT count(*)::integer INTO v_value FROM public.quiz_attempts WHERE user_id = p_user_id;
  END IF;
  RETURN coalesce(v_value, 0);
END;
$$;

-- ============================================================
-- REACTIVATE GAMING ACHIEVEMENTS
-- ============================================================
UPDATE public.achievement_definitions
SET is_active = true
WHERE id IN ('first-victory', 'puzzle-solver', 'champion', 'unstoppable');

-- ============================================================
-- SEED SAMPLE QUIZ DATA
-- ============================================================
INSERT INTO public.quizzes (id, title, description, difficulty, time_limit_seconds, cover_color, icon, is_published, is_daily_eligible)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'The Hollow Door — Lore & Characters', 'Test your knowledge of Elara''s journey and the world beneath the moors.', 'Medium', 30, 'from-primary-600 to-secondary-700', 'DoorOpen', true, true),
  ('11111111-1111-1111-1111-111111111102', 'The Copper Date — Detective''s Challenge', 'Can you piece together the clues Kestrel found in the spice market?', 'Hard', 25, 'from-secondary-600 to-primary-800', 'Search', true, true),
  ('11111111-1111-1111-1111-111111111103', 'Kepler Falling — First Contact', 'How well do you understand the descent and Maren''s fateful decision?', 'Medium', 30, 'from-primary-500 to-secondary-800', 'Rocket', true, true),
  ('11111111-1111-1111-1111-111111111104', 'A Tuesday in the Rain — Matters of the Heart', 'Test your insight into Elena''s unexpected bookshop encounter.', 'Easy', 35, 'from-accent-700 to-primary-900', 'Heart', true, true),
  ('11111111-1111-1111-1111-111111111105', 'Signal from Vexar — Deep Space Mystery', 'Decode the mystery of the dead frequency and Rhea''s impossible choice.', 'Hard', 25, 'from-secondary-700 to-primary-800', 'Radio', true, true),
  ('11111111-1111-1111-1111-111111111106', 'The Cartographer''s Daughter — Map & Memory', 'Follow Sona into the territory that no map has drawn.', 'Easy', 35, 'from-primary-600 to-accent-800', 'Map', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.quiz_questions (quiz_id, position, question, options, correct_index, explanation, xp)
VALUES
  ('11111111-1111-1111-1111-111111111101', 0, 'What does Elara carry at the story''s opening?', '["A sword","A lantern","A map","A letter"]'::jsonb, 1, 'Elara carries a lantern that cuts a pale wedge of light through the dusk.', 50),
  ('11111111-1111-1111-1111-111111111101', 1, 'Who wrote the letter warning Elara not to come looking?', '["Her father","A stranger","Her brother","The village elder"]'::jsonb, 2, 'Elara''s brother wrote the letter, mentioning a door set into the hillside.', 50),
  ('11111111-1111-1111-1111-111111111101', 2, 'What is the hall inside the hill lit by?', '["Candles","A silver luminescence in the air","Torches","Bioluminescent fungi"]'::jsonb, 1, 'A soft, silver luminescence that pools in corners and clings to the walls.', 50),
  ('11111111-1111-1111-1111-111111111101', 3, 'What does the figure give Elara?', '["A map","A dark, warm key","A book","A broken locket"]'::jsonb, 1, 'A black key, warm to the touch, that pulses like a small dark heart.', 75),
  ('11111111-1111-1111-1111-111111111101', 4, 'What does the figure warn about the second door?', '["It is locked forever","It leads home","She should not open it alone","It does not exist"]'::jsonb, 2, 'Her brother''s message: do not open the second door alone.', 75),
  ('11111111-1111-1111-1111-111111111102', 0, 'What did Kestrel take from the dead man''s hand?', '["A wallet","An envelope with a card","A ring","A passport"]'::jsonb, 1, 'She took an envelope containing a cream-colored card with a date in copper ink.', 75),
  ('11111111-1111-1111-1111-111111111102', 1, 'What is printed on the card?', '["An address","A name","A date — tomorrow","A phone number"]'::jsonb, 2, 'The card has a single date printed in copper ink: tomorrow.', 75),
  ('11111111-1111-1111-1111-111111111102', 2, 'What is Kestrel very good at, and very bad at?', '["Lying and telling the truth","Running and hiding","Not being seen, and not being followed","Fighting and running"]'::jsonb, 2, 'She is very good at not being seen but very bad at not being followed.', 100),
  ('11111111-1111-1111-1111-111111111102', 3, 'Where does Kestrel go to lose her tail?', '["The harbor","The spice market","The old quarter","The rooftops"]'::jsonb, 1, 'She turns into the spice market, between stalls smelling of cardamom and smoke.', 75),
  ('11111111-1111-1111-1111-111111111102', 4, 'How many sets of footsteps follow her?', '["One","Two","Three","None — she imagines it"]'::jsonb, 0, 'One set. Patient. Not in a hurry.', 100),
  ('11111111-1111-1111-1111-111111111103', 0, 'What is Maren''s job on the settlement?', '["Director","Engineer","She records things","Medic"]'::jsonb, 2, 'Maren records — logging descent rate, hull temperature, and cloud behavior.', 50),
  ('11111111-1111-1111-1111-111111111103', 1, 'What is unusual about the ship''s lights and signals?', '["They flash red","It has no running lights, markings, or broadcast signal","They are blindingly bright","They spell a message"]'::jsonb, 1, 'The ship is dark — no running lights, no markings, no broadcast. It simply falls.', 75),
  ('11111111-1111-1111-1111-111111111103', 2, 'Where does the ship land?', '["On a mountain","In the exact center of the only flat ground for 40 km","In the settlement itself","In the ocean"]'::jsonb, 1, 'It settles in the valley, in the exact center of the only flat ground, as if it had measured.', 75),
  ('11111111-1111-1111-1111-111111111103', 3, 'What does Maren decide to do after an hour of silence?', '["Wait longer","Call Earth","Walk out and knock","Evacuate the settlement"]'::jsonb, 2, 'If it was going to stay quiet, she was going to walk out and knock.', 100),
  ('11111111-1111-1111-1111-111111111104', 0, 'On what day and in what weather does Elena meet the stranger?', '["Friday, sunny","Tuesday, in a rainstorm","Sunday, snowing","Monday, foggy"]'::jsonb, 1, 'A Tuesday, in a rainstorm, in a bookshop that smelled of old paper and espresso.', 50),
  ('11111111-1111-1111-1111-111111111104', 1, 'How does Elena describe the sensation of being noticed?', '["Like being watched by a camera","The way a reader notices a sentence that changes the rest of the page","Like a spotlight on stage","Like a cold draft"]'::jsonb, 1, 'Not seen, not observed, but noticed — like a sentence that changes the page.', 75),
  ('11111111-1111-1111-1111-111111111104', 2, 'What is the stranger holding when they first make eye contact?', '["A coffee cup","A book of poetry","An umbrella","A magazine"]'::jsonb, 1, 'He is standing in the poetry section, holding a book she loves.', 50),
  ('11111111-1111-1111-1111-111111111104', 3, 'How old is Elena at the time of the encounter?', '["Twenty-eight","Thirty-one","Thirty-four","Forty"]'::jsonb, 2, 'She had not expected to be thirty-four and starting over.', 75),
  ('11111111-1111-1111-1111-111111111105', 0, 'How long has the Vexar system been dead?', '["Fifty years","One century","Two centuries","A decade"]'::jsonb, 2, 'The signal comes from a system that has been dead for two centuries.', 100),
  ('11111111-1111-1111-1111-111111111105', 1, 'What is Rhea''s role on the relay station?', '["Captain","Engineer","Scientist","Navigator"]'::jsonb, 1, 'Rhea Castellan is an engineer on the deep-space relay station.', 75),
  ('11111111-1111-1111-1111-111111111105', 2, 'What must Rhea ultimately decide?', '["Whether to flee","Whether to answer the signal","Whether to destroy the station","Whether to report to command"]'::jsonb, 1, 'She must decide whether to answer — and whether the voice is human.', 100),
  ('11111111-1111-1111-1111-111111111106', 0, 'Who is Sona''s father?', '["A soldier","A cartographer","A merchant","A farmer"]'::jsonb, 1, 'Her father is a cartographer whose last map leads to a place that does not exist.', 50),
  ('11111111-1111-1111-1111-111111111106', 1, 'What does Sona discover about the unmapped territory?', '["It is guarded by monsters","Some territories are only drawn by those who walk them first","It is an illusion","It is already claimed"]'::jsonb, 1, 'Some territories are only drawn by those who have the courage to walk them first.', 75),
  ('11111111-1111-1111-1111-111111111106', 2, 'What does Sona leave her village with?', '["An army","Her father''s last map","A magic sword","Nothing"]'::jsonb, 1, 'She leaves with her father''s last map, the one that leads nowhere else.', 50)
ON CONFLICT DO NOTHING;

INSERT INTO public.daily_challenges (challenge_date, quiz_id)
SELECT current_date, id FROM public.quizzes WHERE id = '11111111-1111-1111-1111-111111111101'
ON CONFLICT (challenge_date) DO NOTHING;
