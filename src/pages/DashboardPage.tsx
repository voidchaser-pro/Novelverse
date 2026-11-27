import {
  BookOpen,
  Brain,
  Swords,
  Flame,
  TrendingUp,
  ArrowRight,
  Trophy,
  Target,
  Clock,
  Play,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { AchievementBadge } from '@/components/achievements/AchievementBadge';
import { NovelCard, NovelCover } from '@/components/NovelCard';
import { SectionHeader, StatCard, ProgressBar } from '@/components/UI';
import { fetchLeaderboard } from '@/lib/leaderboard';
import type { LeaderboardEntry } from '@/types';

export function DashboardPage() {
  const { user, xp, levelInfo, navigate, library, readingProgress, catalog, achievements, authUser } = useApp();
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (!authUser) return;
    fetchLeaderboard('all', 5)
      .then(setTopPlayers)
      .catch(() => setTopPlayers([]));
  }, [authUser]);

  const continueReading = Object.values(readingProgress)
    .filter((rp) => rp.progress < 100)
    .flatMap((rp) => {
      const novel = catalog.find((n) => n.id === rp.novelId);
      return novel ? [{ novel, ...rp }] : [];
    })
    .sort((a, b) => b.lastRead.localeCompare(a.lastRead));

  const trendingNovels = catalog.slice(0, 6);
  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  const recentAchievements = [...unlockedAchievements]
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
    .slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Hero greeting */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-accent-600 to-primary-800 p-6 sm:p-8 animate-fade-in-up">
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl animate-float" />
        <div className="absolute -bottom-12 -left-8 w-40 h-40 rounded-full bg-secondary-500/20 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-5 h-5 text-orange-300" />
              <span className="text-sm font-semibold text-primary-100">
                {user.streak} day reading streak — keep it going!
              </span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl lg:text-4xl text-white leading-tight">
              Welcome back, {user.username}!
            </h1>
            <p className="text-primary-100 mt-2 text-sm sm:text-base max-w-lg">
              You're on Level {levelInfo.level} with {xp.toLocaleString()} XP. Read a chapter or ace a quiz to climb the ranks.
            </p>

            {/* XP bar */}
            <div className="mt-5 max-w-md">
              <div className="flex items-center justify-between text-xs text-primary-100 mb-1.5 font-medium">
                <span>Level {levelInfo.level}</span>
                <span>{levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP</span>
                <span>Level {levelInfo.level + 1}</span>
              </div>
              <div className="h-3 rounded-full bg-white/20 overflow-hidden backdrop-blur-sm">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-300 via-white to-primary-200 transition-all duration-1000 ease-out shadow-lg"
                  style={{ width: `${levelInfo.progress}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <button onClick={() => navigate('discover')} className="btn-primary !bg-white !text-primary-700 !shadow-xl hover:!shadow-2xl">
                <BookOpen className="w-4 h-4" />
                Discover Novels
              </button>
              <button onClick={() => navigate('quizzes')} className="btn-ghost !text-white hover:!bg-white/10">
                <Brain className="w-4 h-4" />
                Take a Quiz
              </button>
            </div>
          </div>

          {/* Level ring */}
          <div className="hidden lg:flex flex-shrink-0 items-center justify-center">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="52" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - levelInfo.progress / 100)}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-display font-extrabold text-white">{levelInfo.level}</span>
                <span className="text-xs text-primary-100 font-semibold tracking-wider">LEVEL</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<BookOpen className="w-5 h-5" />} label="Novels Read" value={user.novelsRead} color="primary" trend="+2 this week" />
        <StatCard icon={<Brain className="w-5 h-5" />} label="Quizzes Done" value={user.quizzesCompleted} color="accent" trend="+5 this week" />
        <StatCard icon={<Swords className="w-5 h-5" />} label="MP Wins" value={user.multiplayerWins} color="secondary" trend="+3 this week" />
        <StatCard icon={<Flame className="w-5 h-5" />} label="Day Streak" value={user.streak} color="warning" />
      </div>

      {/* Continue reading */}
      {continueReading.length > 0 && (
        <section>
          <SectionHeader
            title="Continue Reading"
            subtitle="Pick up where you left off"
            icon={<BookOpen className="w-5 h-5" />}
            action={
              <button onClick={() => navigate('library')} className="btn-ghost text-sm">
                View Library <ArrowRight className="w-4 h-4" />
              </button>
            }
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {continueReading.map(({ novel, chapterIndex, progress }) => (
              <div
                key={novel.id}
                onClick={() => navigate('reader', { novelId: novel.id })}
                className="glass-card p-4 flex gap-4 card-hover cursor-pointer group animate-fade-in-up"
              >
                <NovelCover novel={novel} className="w-16 h-20 flex-shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {novel.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    Chapter {chapterIndex + 1}: {novel.chapters[chapterIndex]?.title}
                  </p>
                  <div className="mt-auto pt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400 dark:text-slate-500 font-medium">{progress}% complete</span>
                      <Clock className="w-3 h-3 text-slate-400" />
                    </div>
                    <ProgressBar value={progress} max={100} />
                  </div>
                </div>
                <div className="flex items-center self-center w-9 h-9 rounded-xl bg-primary-500/10 text-primary-500 group-hover:bg-primary-500 group-hover:text-white transition-all flex-shrink-0">
                  <Play className="w-4 h-4 ml-0.5" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Trending */}
      <section>
        <SectionHeader
          title="Trending Now"
          subtitle="What the community is reading"
          icon={<TrendingUp className="w-5 h-5" />}
          action={
            <button onClick={() => navigate('discover')} className="btn-ghost text-sm">
              See All <ArrowRight className="w-4 h-4" />
            </button>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {trendingNovels.map((novel) => (
            <NovelCard key={novel.id} novel={novel} />
          ))}
        </div>
      </section>

      {/* Achievements preview + Mini leaderboard */}
      <div className="grid lg:grid-cols-2 gap-8">
        <section>
          <SectionHeader
            title="Your Achievements"
            subtitle={`${unlockedAchievements.length} of ${achievements.length} unlocked`}
            icon={<Trophy className="w-5 h-5" />}
            action={
              <button onClick={() => navigate('achievements')} className="btn-ghost text-sm">
                View All <ArrowRight className="w-4 h-4" />
              </button>
            }
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recentAchievements.map((ach) => (
              <div key={ach.id} className="glass-card p-4 text-center card-hover animate-fade-in-up">
                <div className="flex justify-center mb-2">
                  <AchievementBadge icon={ach.icon} rarity={ach.rarity} unlocked size="sm" />
                </div>
                <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 line-clamp-1">{ach.name}</p>
                <p className="text-xs text-primary-500 font-bold mt-1">+{ach.xpReward} XP</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader
            title="Leaderboard"
            subtitle="Top readers this season"
            icon={<Target className="w-5 h-5" />}
            action={
              <button onClick={() => navigate('leaderboard')} className="btn-ghost text-sm">
                Full Board <ArrowRight className="w-4 h-4" />
              </button>
            }
          />
          <div className="glass-card divide-y divide-slate-200/60 dark:divide-slate-800/60">
            {topPlayers.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No players have earned XP yet. Be the first!
              </div>
            ) : topPlayers.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-3.5 ${entry.isCurrentUser ? 'bg-primary-50/50 dark:bg-primary-950/20' : ''}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                  entry.rank === 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                  entry.rank === 2 ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                  entry.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {entry.rank}
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-base flex-shrink-0">
                  {entry.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${entry.isCurrentUser ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {entry.username}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Level {entry.level}</p>
                </div>
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">
                  {entry.xp.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Library count footer */}
      <div className="glass-card p-5 flex items-center justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/40 flex items-center justify-center text-primary-500">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
              {library.length} novels in your library
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Keep building your collection</p>
          </div>
        </div>
        <button onClick={() => navigate('library')} className="btn-outline text-sm">
          Open Library
        </button>
      </div>
    </div>
  );
}
