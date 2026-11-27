import { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Check,
  X,
  ChevronLeft,
  Zap,
  Trophy,
  Clock,
  RotateCcw,
  Sparkles,
  PartyPopper,
  Loader2,
  AlertCircle,
  Crown,
} from 'lucide-react';
import { fetchQuizForPlay, submitQuizAttempt, type QuizForPlay } from '@/lib/quizzes';
import type { QuizAttemptResult } from '@/types';
import { useApp } from '@/context/AppContext';
import { EmptyState } from '@/components/UI';

type Phase = 'answering' | 'revealed' | 'finished';

const DIFFICULTY_LABEL: Record<string, string> = {
  Easy: 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400',
  Medium: 'bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400',
  Hard: 'bg-error-100 text-error-700 dark:bg-error-900/40 dark:text-error-400',
};

export function QuizPlayPage() {
  const { pageParams, navigate, authUser, checkAchievements } = useApp();
  const quizId = pageParams.quizId;

  const [quiz, setQuiz] = useState<QuizForPlay | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('answering');
  const [timeLeft, setTimeLeft] = useState(30);
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchQuizForPlay(quizId)
      .then((q) => {
        if (cancelled) return;
        if (!q) {
          setLoadError('Quiz not found.');
        } else {
          setQuiz(q);
          setTimeLeft(q.timeLimitSeconds);
          startedAt.current = Date.now();
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load this quiz.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const totalQuestions = quiz?.questions.length ?? 0;
  const question = quiz?.questions[currentIndex] ?? null;
  const answerResult = result?.answers[currentIndex] ?? null;
  const scoringComplete = result !== null;

  // Per-question countdown while answering
  useEffect(() => {
    if (phase !== 'answering' || !quiz) return;
    setTimeLeft(quiz.timeLimitSeconds);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, phase, quiz?.id, quiz?.timeLimitSeconds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  if (loadError || !quiz) {
    return (
      <EmptyState
        icon={<AlertCircle className="w-7 h-7" />}
        title={loadError ?? 'Quiz not found.'}
        description="This quiz may have been unpublished or removed."
        action={<button onClick={() => navigate('quizzes')} className="btn-primary">Back to Quizzes</button>}
      />
    );
  }

  if (!authUser) {
    return (
      <EmptyState
        icon={<Brain className="w-7 h-7" />}
        title="Sign in required"
        description="Sign in to play quizzes, earn XP and track your stats."
        action={<button onClick={() => navigate('auth')} className="btn-primary">Sign in</button>}
      />
    );
  }

  if (totalQuestions === 0) {
    return (
      <EmptyState
        icon={<Brain className="w-7 h-7" />}
        title="No questions yet"
        description="This quiz has no questions configured."
        action={<button onClick={() => navigate('quizzes')} className="btn-primary">Back to Quizzes</button>}
      />
    );
  }

  function recordAnswer(index: number | null) {
    if (phase !== 'answering' || !quiz) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const nextAnswers = [...answers];
    nextAnswers[currentIndex] = index ?? -1;
    setAnswers(nextAnswers);
    setSelectedIndex(index);
    setPhase('revealed');
  }

  function handleTimeout() {
    recordAnswer(null);
  }

  async function handleSubmitAll(finalAnswers: number[]) {
    if (!quiz) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const elapsed = Date.now() - startedAt.current;
      const res = await submitQuizAttempt(quiz.id, finalAnswers, elapsed);
      setResult(res);
      setPhase('finished');
      checkAchievements().catch(() => undefined);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit your attempt.');
      // Resume the question so the player can retry the submission
      setPhase('revealed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!quiz) return;
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedIndex(null);
      setPhase('answering');
      return;
    }
    // Last question: submit everything to the server for validation
    if (!result) {
      handleSubmitAll(answers);
    } else {
      setPhase('finished');
    }
  }

  function handleRestart() {
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedIndex(null);
    setPhase('answering');
    setResult(null);
    setSubmitError(null);
    setTimeLeft(quiz?.timeLimitSeconds ?? 30);
    startedAt.current = Date.now();
  }

  // Results screen
  if (phase === 'finished' && result) {
    const accuracy = Math.round((result.correctCount / result.totalQuestions) * 100);
    const isPerfect = result.isPerfect;

    return (
      <div className="max-w-2xl mx-auto animate-fade-in-up">
        <div className="glass-card p-8 sm:p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-10" />
          {isPerfect && (
            <div className="absolute top-4 right-4">
              <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
          )}

          <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 ${isPerfect ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30 animate-bounce-in' : 'bg-gradient-to-br from-primary-500 to-accent-600 shadow-lg shadow-primary-500/30'}`}>
            {isPerfect ? <Trophy className="w-10 h-10 text-white" /> : <Brain className="w-10 h-10 text-white" />}
          </div>

          <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-800 dark:text-slate-100">
            {isPerfect ? 'Perfect Score!' : 'Quiz Complete!'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {isPerfect
              ? 'You answered every question correctly. Outstanding!'
              : result.isNewBest
                ? 'New personal best on this quiz!'
                : 'Great effort! Here\'s how you did.'}
          </p>

          <div className="grid grid-cols-3 gap-3 my-8">
            <div className="p-4 rounded-2xl bg-success-50 dark:bg-success-950/30">
              <Check className="w-5 h-5 text-success-500 mx-auto mb-1.5" />
              <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">{result.correctCount}/{result.totalQuestions}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Correct</p>
            </div>
            <div className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-950/30">
              <Zap className="w-5 h-5 text-primary-500 mx-auto mb-1.5" />
              <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">+{result.xpAwarded}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">XP Earned</p>
            </div>
            <div className="p-4 rounded-2xl bg-accent-50 dark:bg-accent-950/30">
              <Trophy className="w-5 h-5 text-accent-500 mx-auto mb-1.5" />
              <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">{accuracy}%</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Accuracy</p>
            </div>
          </div>

          {!result.isNewBest && result.xpAwarded === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
              Your previous best score stood — XP is awarded for improvements only.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={handleRestart} className="btn-outline">
              <RotateCcw className="w-4 h-4" />
              Try Again
            </button>
            <button onClick={() => navigate('quizzes')} className="btn-primary">
              <Brain className="w-4 h-4" />
              More Quizzes
            </button>
          </div>
        </div>

        {/* Answer review */}
        <div className="glass-card p-5 mt-6 space-y-3">
          <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">Review your answers</h3>
          {result.answers.map((a, i) => (
            <div key={a.position} className={`p-4 rounded-xl border ${a.isCorrect ? 'border-success-300/50 bg-success-50/50 dark:bg-success-950/20' : 'border-error-300/50 bg-error-50/50 dark:bg-error-950/20'}`}>
              <div className="flex items-start gap-2.5">
                {a.isCorrect ? <Check className="w-4 h-4 text-success-500 mt-0.5 flex-shrink-0" /> : <X className="w-4 h-4 text-error-500 mt-0.5 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{i + 1}. {quiz.questions[a.position]?.question}</p>
                  {!a.isCorrect && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Your answer: {a.selectedIndex >= 0 ? quiz.questions[a.position]?.options[a.selectedIndex] : 'No answer'} · Correct: {quiz.questions[a.position]?.options[a.correctIndex]}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{a.explanation}</p>
                </div>
                {a.xpEarned > 0 && (
                  <span className="ml-auto flex-shrink-0 text-xs font-bold text-primary-600 dark:text-primary-400 flex items-center gap-1">
                    <Zap className="w-3 h-3" />+{a.xpEarned}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const showReveal = phase === 'revealed';
  const progressPct = ((currentIndex + (showReveal ? 1 : 0)) / totalQuestions) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 animate-fade-in">
        <button onClick={() => navigate('quizzes')} className="btn-ghost text-sm">
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Exit</span>
        </button>
        <div className="flex items-center gap-2">
          <span className={`chip ${DIFFICULTY_LABEL[quiz.difficulty]} hidden sm:inline-block`}>{quiz.difficulty}</span>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold ${
            timeLeft <= 10
              ? 'bg-error-50 dark:bg-error-950/40 text-error-600 dark:text-error-400 animate-pulse'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}>
            <Clock className="w-4 h-4" />
            {timeLeft}s
          </div>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 font-medium mb-1.5">
          <span>Question {currentIndex + 1} of {totalQuestions}</span>
          <span>{quiz.difficulty} · {quiz.totalXp} XP total</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div key={currentIndex} className="glass-card p-6 sm:p-8 animate-scale-in">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r ${quiz.color} text-white text-xs font-bold mb-4`}>
          <Brain className="w-3.5 h-3.5" />
          {quiz.novelTitle || quiz.title}
        </div>

        <h2 className="font-display font-bold text-lg sm:text-xl text-slate-800 dark:text-slate-100 leading-snug text-balance">
          {question?.question}
        </h2>

        {/* Options */}
        <div className="grid gap-3 mt-6">
          {question?.options.map((option, index) => {
            const isSelected = selectedIndex === index;
            const isCorrect = answerResult ? index === answerResult.correctIndex : false;

            let stateClass = 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-950/20';
            if (showReveal && isCorrect) {
              stateClass = 'border-success-400 bg-success-50 dark:bg-success-950/30 dark:border-success-700';
            } else if (showReveal && isSelected && !isCorrect) {
              stateClass = 'border-error-400 bg-error-50 dark:bg-error-950/30 dark:border-error-700 animate-shake';
            } else if (showReveal) {
              stateClass = 'border-slate-200 dark:border-slate-800 opacity-50';
            }

            return (
              <button
                key={index}
                onClick={() => recordAnswer(index)}
                disabled={showReveal || submitting}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 ${stateClass} ${
                  !showReveal ? 'active:scale-[0.99]' : ''
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                  showReveal && isCorrect ? 'bg-success-500 text-white' :
                  showReveal && isSelected && !isCorrect ? 'bg-error-500 text-white' :
                  'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {showReveal && isCorrect ? <Check className="w-4 h-4" /> :
                   showReveal && isSelected && !isCorrect ? <X className="w-4 h-4" /> :
                   String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1">
                  {option}
                </span>
              </button>
            );
          })}
        </div>

        {/* During play: neutral lock-in (no answer leakage — scoring happens on the server) */}
        {showReveal && !answerResult && (
          <div className="mt-5 p-4 rounded-xl bg-primary-50 dark:bg-primary-950/30 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary-500 text-white">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-sm text-primary-700 dark:text-primary-400">Answer locked in</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Correct answers and explanations are revealed with your full results at the end.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Post-scoring reveal: correct answer + explanation come from the server result */}
        {showReveal && answerResult && (
          <div className={`mt-5 p-4 rounded-xl animate-fade-in-up ${
            answerResult.isCorrect ? 'bg-success-50 dark:bg-success-950/30' : 'bg-error-50 dark:bg-error-950/30'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                answerResult.isCorrect ? 'bg-success-500 text-white' : 'bg-error-500 text-white'
              }`}>
                {answerResult.isCorrect ? <PartyPopper className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </div>
              <div>
                <p className={`font-bold text-sm ${answerResult.isCorrect ? 'text-success-700 dark:text-success-400' : 'text-error-700 dark:text-error-400'}`}>
                  {answerResult.isCorrect ? `Correct! +${answerResult.xpEarned} XP` : 'Not quite!'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{answerResult.explanation}</p>
              </div>
            </div>
          </div>
        )}

        {submitError && (
          <div className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
            <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error-700 dark:text-error-400">{submitError}</p>
          </div>
        )}
      </div>

      {/* Next / submit button */}
      {showReveal && (
        <button onClick={handleNext} disabled={submitting} className="btn-primary w-full animate-fade-in-up">
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scoring your answers…</>
          ) : currentIndex === totalQuestions - 1 ? (
            <><Crown className="w-4 h-4" /> See Results</>
          ) : (
            'Next Question'
          )}
        </button>
      )}
    </div>
  );
}
