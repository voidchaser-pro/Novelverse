import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Brain,
  Search,
  X,
  Zap,
  ChevronRight,
  Trophy,
  CheckCircle2,
  Clock,
  CalendarDays,
  Flame,
  Loader2,
  AlertCircle,
  History,
  Sparkles,
} from 'lucide-react';
import type { Quiz, DailyChallenge, QuizStats, QuizAttemptHistory } from '@/types';
import { PageHeader, EmptyState } from '@/components/UI';
import { NovelCover } from '@/components/NovelCard';
import { useApp } from '@/context/AppContext';
import {
  fetchQuizzesWithMeta,
  fetchDailyChallenge,
  fetchQuizStats,
  fetchQuizHistory,
  type QuizWithMeta,
} from '@/lib/quizzes';

type Difficulty = 'All' | 'Easy' | 'Medium' | 'Hard';

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400',
  Medium: 'bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400',
  Hard: 'bg-error-100 text-error-700 dark:bg-error-900/40 dark:text-error-400',
};

export function QuizzesPage() {
  const { navigate, authUser, catalog, authLoading } = useApp();
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('All');

  const [quizzes, setQuizzes] = useState<QuizWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [dailyLoading, setDailyLoading] = useState(true);

  const [stats, setStats] = useState<QuizStats | null>(null);
  const [history, setHistory] = useState<QuizAttemptHistory[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);

  const loadShared = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQuizzes(await fetchQuizzesWithMeta());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load quizzes.');
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPersonal = useCallback(async () => {
    if (!authUser) {
      setStats(null);
      setHistory([]);
      setDaily(null);
      setDailyLoading(false);
      setPersonalLoading(false);
      return;
    }
    setPersonalLoading(true);
    setDailyLoading(true);
    try {
      const [challenge, myStats, myHistory] = await Promise.all([
        fetchDailyChallenge().catch(() => null),
        fetchQuizStats(authUser.id).catch(() => null),
        fetchQuizHistory().catch(() => []),
      ]);
      setDaily(challenge);
      if (myStats) setStats(myStats);
      setHistory(myHistory);
    } finally {
      setDailyLoading(false);
      setPersonalLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    loadShared();
  }, [loadShared]);

  useEffect(() => {
    loadPersonal();
  }, [loadPersonal]);

  const filtered = useMemo(() => {
    let result = [...quizzes];
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (quiz) => quiz.title.toLowerCase().includes(q) || quiz.novelTitle.toLowerCase().includes(q)
      );
    }
    if (difficulty !== 'All') {
      result = result.filter((quiz) => quiz.difficulty === difficulty);
    }
    return result;
  }, [quizzes, query, difficulty]);

  return (
    <div className="space-y-6">
      <PageHeader title="Quiz Arena" subtitle="Test your knowledge, earn XP, climb the ranks" icon={<Brain className="w-6 h-6" />} />

      {/* Daily challenge banner */}
      {authUser && (dailyLoading ? (
        <div className="glass-card p-5 flex items-center gap-3 text-slate-500 dark:text-slate-400 animate-fade-in">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading today's challenge…
        </div>
      ) : daily ? (
        <button
          onClick={() => navigate('quiz-play', { quizId: daily.quizId })}
          className="block w-full text-left relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 sm:p-8 animate-fade-in-up card-hover group"
        >
          <div className="absolute inset-0 bg-grid-pattern opacity-20" />
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl animate-float" />
          <div className="relative flex items-center gap-4 sm:gap-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white flex-shrink-0 shadow-lg">
              <CalendarDays className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="chip bg-white/25 text-white backdrop-blur-sm text-[10px] uppercase tracking-wider font-bold">Daily Challenge</span>
                {daily.hasAttempted && (
                  <span className="chip bg-white text-amber-700 text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Done
                  </span>
                )}
              </div>
              <h2 className="font-display font-extrabold text-lg sm:text-2xl text-white mt-2 truncate">{daily.quizTitle}</h2>
              <p className="text-white/80 text-sm mt-1 line-clamp-1">{daily.quizDescription}</p>
              <div className="flex items-center gap-3 mt-3 text-xs text-white/90 font-medium">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{daily.questionCount} questions</span>
                <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" />{daily.bestScore > 0 ? `Best: ${daily.bestScore} XP` : 'Fresh attempt'}</span>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-white/80 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      ) : null)}

      {/* Stats strip */}
      {authUser && stats && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4 animate-fade-in-up">
          <div className="glass-card p-4 text-center">
            <Trophy className="w-5 h-5 text-amber-500 mx-auto mb-1.5" />
            <p className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">{stats.perfectScores}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Perfect Scores</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Flame className="w-5 h-5 text-orange-500 mx-auto mb-1.5" />
            <p className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">{stats.totalAttempts}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Attempts</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Zap className="w-5 h-5 text-primary-500 mx-auto mb-1.5" />
            <p className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">{stats.totalXpEarned.toLocaleString()}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quiz XP Earned</p>
          </div>
        </div>
      )}

      {/* Sign-in prompt for personal section */}
      {!authUser && !authLoading && (
        <div className="glass-card p-5 flex flex-col sm:flex-row items-center gap-4 animate-fade-in">
          <Sparkles className="w-8 h-8 text-primary-500 flex-shrink-0" />
          <div className="flex-1 text-center sm:text-left">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Play and earn real XP</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Sign in to track attempts, perfect scores and daily challenges.</p>
          </div>
          <button onClick={() => navigate('auth')} className="btn-primary flex-shrink-0">Sign in</button>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 animate-fade-in">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search quizzes by title or novel…"
            className="input-field !pl-12 !pr-10"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['All', 'Easy', 'Medium', 'Hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`chip flex-shrink-0 transition-all ${
                difficulty === d
                  ? 'bg-primary-700 text-white shadow-md shadow-primary-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card p-4 flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadShared} className="btn-ghost ml-auto text-sm flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card overflow-hidden animate-pulse">
              <div className="h-28 bg-slate-200 dark:bg-slate-800" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} onClick={() => navigate('quiz-play', { quizId: quiz.id })} />
          ))}
        </div>
      ) : !error ? (
        <EmptyState
          icon={<Search className="w-7 h-7" />}
          title="No quizzes found"
          description="Try a different search or difficulty filter."
        />
      ) : null}

      {/* Quiz history */}
      {authUser && history.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/30 flex items-center justify-center text-primary-500">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-slate-800 dark:text-slate-100">Recent Attempts</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Your last {history.length} quiz results</p>
            </div>
          </div>
          <div className="glass-card overflow-hidden">
            <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {history.map((h) => {
                const accuracy = h.totalQuestions > 0 ? Math.round((h.correctCount / h.totalQuestions) * 100) : 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => navigate('quiz-play', { quizId: h.quizId })}
                    className="w-full flex items-center gap-3 sm:gap-4 p-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30 text-left"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      h.isPerfect ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {h.isPerfect ? <Trophy className="w-5 h-5" /> : <Brain className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{h.quizTitle}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`chip !px-2 !py-0.5 text-[10px] ${DIFFICULTY_COLORS[h.quizDifficulty] ?? ''}`}>{h.quizDifficulty}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{h.correctCount}/{h.totalQuestions} · {accuracy}%</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-display font-bold text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" />{h.score}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(h.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function QuizCard({ quiz, onClick }: { quiz: QuizWithMeta; onClick: () => void }) {
  const { catalog } = useApp();
  const novel = quiz.novelId ? catalog.find((n) => n.id === quiz.novelId) : undefined;

  return (
    <div onClick={onClick} className="glass-card overflow-hidden card-hover cursor-pointer group animate-fade-in-up">
      {/* Header with gradient */}
      <div className={`bg-gradient-to-br ${quiz.color} p-5 relative overflow-hidden`}>
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-xl" />
        <div className="relative flex items-start justify-between">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
            <Brain className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2">
            {quiz.isPerfect && (
              <span className="chip bg-amber-400/90 text-amber-950 backdrop-blur-sm flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Perfect
              </span>
            )}
            <span className={`chip ${DIFFICULTY_COLORS[quiz.difficulty]} backdrop-blur-sm`}>
              {quiz.difficulty}
            </span>
          </div>
        </div>
        <h3 className="relative font-display font-bold text-white text-base mt-4 line-clamp-2 drop-shadow-sm">
          {quiz.title}
        </h3>
      </div>

      {/* Body */}
      <div className="p-5">
        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">{quiz.description}</p>

        {novel && (
          <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
            <NovelCover novel={novel} className="w-8 h-11 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-400 dark:text-slate-500">Based on</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">{novel.title}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {quiz.questionCount} Qs · {quiz.timeLimitSeconds}s
            </span>
            <span className="flex items-center gap-1 text-primary-500 font-bold">
              <Zap className="w-3.5 h-3.5" />
              up to {quiz.totalXp} XP
            </span>
          </div>
          {quiz.bestScore !== null ? (
            <span className="text-xs font-bold text-success-600 dark:text-success-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {quiz.bestScore} XP
            </span>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-primary-500/10 text-primary-500 group-hover:bg-primary-500 group-hover:text-white transition-all flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
