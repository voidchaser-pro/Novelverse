import { supabase } from '@/lib/supabase';
import type {
  DailyChallenge,
  Quiz,
  QuizAnswerResult,
  QuizAttemptHistory,
  QuizAttemptResult,
  QuizQuestion,
  QuizStats,
} from '@/types';

function requireClient() {
  if (!supabase) throw new Error('The database is not configured.');
  return supabase;
}

export interface QuizPlayQuestion {
  id: string;
  question: string;
  options: string[];
  xp: number;
}

interface QuizRow {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  time_limit_seconds: number;
  cover_color: string;
  icon: string;
  novel_id: string | null;
}

interface QuestionRow {
  id: string;
  position: number;
  question: string;
  options: string[];
  xp: number;
}

interface AttemptRow {
  id: string;
  quiz_id: string;
  score: number;
  correct_count: number;
  total_questions: number;
  is_perfect: boolean;
  xp_awarded: number;
  created_at: string;
  updated_at: string;
}

export interface QuizWithMeta extends Quiz {
  questionCount: number;
  totalXp: number;
  bestScore: number | null;
  isPerfect: boolean | null;
  attemptedAt: string | null;
}

interface SubmitAnswer {
  position: number;
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  xpEarned: number;
}

export async function fetchQuizzesWithMeta(): Promise<QuizWithMeta[]> {
  const client = requireClient();
  const [quizRes, attemptsRes] = await Promise.all([
    client
      .from('quizzes')
      .select('id, title, description, difficulty, time_limit_seconds, cover_color, icon, novel_id')
      .eq('is_published', true)
      .order('created_at', { ascending: true }),
    client
      .from('quiz_attempts')
      .select('id, quiz_id, score, is_perfect, updated_at')
      .order('updated_at', { ascending: false }),
  ]);
  if (quizRes.error) throw new Error(quizRes.error.message);
  if (attemptsRes.error) throw new Error(attemptsRes.error.message);

  const rows = (quizRes.data ?? []) as QuizRow[];
  const attempts = (attemptsRes.data ?? []) as { quiz_id: string; score: number; is_perfect: boolean; updated_at: string }[];
  const attemptMap = new Map(attempts.map((a) => [a.quiz_id, a]));

  if (rows.length === 0) return [];

  const { data: questionRows, error: qError } = await client
    .from('quiz_questions')
    .select('id, quiz_id, position, question, options, xp')
    .in('quiz_id', rows.map((r) => r.id))
    .order('position', { ascending: true });
  if (qError) throw new Error(qError.message);

  const novelIds = [...new Set(rows.map((r) => r.novel_id).filter((n): n is string => Boolean(n)))];
  const { data: novelRows, error: nError } = novelIds.length
    ? await client.from('novels').select('id, title').in('id', novelIds)
    : { data: [] as { id: string; title: string }[] | null, error: null as { message: string } | null };
  if (nError) throw new Error(nError.message);
  const novelTitles = new Map(((novelRows ?? []) as { id: string; title: string }[]).map((n) => [n.id, n.title]));

  return rows.map((row) => {
    const attempt = attemptMap.get(row.id);
    const questions = ((questionRows ?? []) as (QuestionRow & { quiz_id: string })[])
      .filter((q) => q.quiz_id === row.id);
    return {
      id: row.id,
      novelId: row.novel_id,
      novelTitle: row.novel_id ? novelTitles.get(row.novel_id) ?? '' : '',
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      timeLimitSeconds: row.time_limit_seconds,
      icon: row.icon,
      color: row.cover_color,
      questions: questions.map<QuizQuestion>((q) => ({
        id: q.id,
        question: q.question,
        options: Array.isArray(q.options) ? q.options : [],
        correctIndex: -1,
        explanation: '',
        xp: q.xp,
      })),
      questionCount: questions.length,
      totalXp: questions.reduce((sum, q) => sum + q.xp, 0),
      bestScore: attempt?.score ?? null,
      isPerfect: attempt ? attempt.is_perfect : null,
      attemptedAt: attempt?.updated_at ?? null,
    };
  }).filter((quiz) => quiz.questionCount > 0 && quiz.questions.every((q) => q.options.length >= 2));
}

export async function fetchQuizPlayQuestions(quizId: string): Promise<QuizPlayQuestion[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('quiz_questions')
    .select('id, position, question, options, xp')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as QuestionRow[]).map((q) => ({
    id: q.id,
    question: q.question,
    options: Array.isArray(q.options) ? q.options : [],
    xp: q.xp,
  }));
}

export interface QuizForPlay {
  id: string;
  novelId: string | null;
  novelTitle: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  timeLimitSeconds: number;
  icon: string;
  color: string;
  totalXp: number;
  questions: QuizPlayQuestion[];
}

export async function fetchQuizForPlay(quizId: string): Promise<QuizForPlay | null> {
  const client = requireClient();
  const { data: quiz, error } = await client
    .from('quizzes')
    .select('id, title, description, difficulty, time_limit_seconds, cover_color, icon, novel_id')
    .eq('id', quizId)
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!quiz) return null;
  const row = quiz as QuizRow;

  const questions = await fetchQuizPlayQuestions(quizId);

  let novelTitle = '';
  if (row.novel_id) {
    const { data: novel } = await client.from('novels').select('title').eq('id', row.novel_id).maybeSingle();
    if (novel) novelTitle = (novel as { title: string }).title;
  }

  return {
    id: row.id,
    novelId: row.novel_id,
    novelTitle,
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    timeLimitSeconds: row.time_limit_seconds,
    icon: row.icon,
    color: row.cover_color,
    totalXp: questions.reduce((sum, q) => sum + q.xp, 0),
    questions,
  };
}

export async function submitQuizAttempt(
  quizId: string,
  answers: number[],
  timeTakenMs: number
): Promise<QuizAttemptResult> {
  const client = requireClient();
  const payload: Record<string, number> = {};
  answers.forEach((answer, index) => {
    payload[String(index)] = answer;
  });
  const { data, error } = await client.rpc('submit_quiz_attempt', {
    p_quiz_id: quizId,
    p_answers: payload,
    p_time_taken_ms: Math.max(0, Math.round(timeTakenMs)),
  });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as {
    attempt_id: string;
    score: number;
    correct_count: number;
    total_questions: number;
    xp_awarded: number;
    is_perfect: boolean;
    is_new_best: boolean;
    answers: SubmitAnswer[];
  } | undefined;
  if (!row) throw new Error('The server did not return a result for this attempt.');

  const resultAnswers: QuizAnswerResult[] = ((row.answers ?? []) as SubmitAnswer[])
    .map((a) => ({
      position: a.position,
      selectedIndex: a.selectedIndex,
      correctIndex: a.correctIndex,
      isCorrect: a.isCorrect,
      explanation: a.explanation,
      xpEarned: a.xpEarned,
    }))
    .sort((a, b) => a.position - b.position);

  return {
    attemptId: row.attempt_id,
    score: row.score,
    correctCount: row.correct_count,
    totalQuestions: row.total_questions,
    xpAwarded: row.xp_awarded,
    isPerfect: row.is_perfect,
    isNewBest: row.is_new_best,
    answers: resultAnswers,
  };
}

export async function fetchDailyChallenge(): Promise<DailyChallenge | null> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_today_challenge');
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as {
    challenge_id: string;
    challenge_date: string;
    quiz_id: string;
    quiz_title: string;
    quiz_description: string;
    quiz_difficulty: 'Easy' | 'Medium' | 'Hard';
    quiz_time_limit_seconds: number;
    quiz_cover_color: string;
    quiz_icon: string;
    question_count: number;
    has_attempted: boolean;
    best_score: number;
  } | undefined;
  if (!row) return null;
  return {
    challengeId: row.challenge_id,
    challengeDate: row.challenge_date,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title,
    quizDescription: row.quiz_description,
    quizDifficulty: row.quiz_difficulty,
    quizTimeLimitSeconds: row.quiz_time_limit_seconds,
    quizCoverColor: row.quiz_cover_color,
    quizIcon: row.quiz_icon,
    questionCount: Number(row.question_count),
    hasAttempted: row.has_attempted,
    bestScore: row.best_score ?? 0,
  };
}

export async function fetchQuizStats(userId: string): Promise<QuizStats> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_quiz_stats', { p_user_id: userId });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as {
    total_attempts: number;
    perfect_scores: number;
    total_xp_earned: number;
    avg_accuracy: string | number;
    best_score: number;
  } | undefined;
  return {
    totalAttempts: row?.total_attempts ?? 0,
    perfectScores: row?.perfect_scores ?? 0,
    totalXpEarned: row?.total_xp_earned ?? 0,
    avgAccuracy: Number(row?.avg_accuracy ?? 0),
    bestScore: row?.best_score ?? 0,
  };
}

export async function fetchQuizHistory(): Promise<QuizAttemptHistory[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('quiz_attempts')
    .select('id, quiz_id, score, correct_count, total_questions, is_perfect, xp_awarded, created_at, quizzes(title, difficulty)')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as (AttemptRow & { quizzes: { title: string; difficulty: string } | null })[]).map((row) => ({
    id: row.id,
    quizId: row.quiz_id,
    quizTitle: row.quizzes?.title ?? 'Quiz',
    quizDifficulty: row.quizzes?.difficulty ?? '',
    score: row.score,
    correctCount: row.correct_count,
    totalQuestions: row.total_questions,
    isPerfect: row.is_perfect,
    xpAwarded: row.xp_awarded,
    createdAt: row.created_at,
  }));
}
