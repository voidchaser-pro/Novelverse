import { useState, useEffect, useCallback } from 'react';
import { Trophy, Crown, Medal, Flame, Zap, Loader2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { fetchLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import type { LeaderboardEntry } from '@/types';

export function LeaderboardPage() {
  const { user, authUser } = useApp();
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: LeaderboardPeriod) => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchLeaderboard(p, 50));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) load(period);
    else {
      setLoading(false);
      setError(null);
    }
  }, [period, authUser, load]);

  const myEntry = entries.find((e) => e.isCurrentUser);
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  const periods: { id: LeaderboardPeriod; label: string }[] = [
    { id: 'weekly', label: 'This Week' },
    { id: 'all', label: 'All Time' },
  ];

  const podiumColors = [
    { bg: 'from-amber-400 to-orange-500', ring: 'ring-amber-400/50', shadow: 'shadow-amber-500/30', label: 'text-amber-600 dark:text-amber-400' },
    { bg: 'from-slate-300 to-slate-500', ring: 'ring-slate-400/50', shadow: 'shadow-slate-500/20', label: 'text-slate-600 dark:text-slate-300' },
    { bg: 'from-orange-400 to-amber-600', ring: 'ring-orange-400/50', shadow: 'shadow-orange-500/20', label: 'text-orange-600 dark:text-orange-400' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaderboard"
        subtitle="The top readers and quiz battlers in NOVELVERSE"
        icon={<Trophy className="w-6 h-6" />}
      />

      {!authUser ? (
        <div className="glass-card p-8 text-center">
          <p className="text-slate-600 dark:text-slate-300 mb-2">Sign in to see where you rank.</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">The leaderboard shows real XP earned by NOVELVERSE readers.</p>
        </div>
      ) : (
        <>
          {/* Period tabs */}
          <div className="flex gap-2 animate-fade-in">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`chip transition-all ${
                  period === p.id
                    ? 'bg-primary-700 text-white shadow-md shadow-primary-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="glass-card p-4 flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="glass-card p-10 flex items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading leaderboard
            </div>
          ) : entries.length === 0 ? (
            <div className="glass-card p-10 text-center text-slate-500 dark:text-slate-400">
              No players have earned XP {period === 'weekly' ? 'this week' : 'yet'}. Be the first!
            </div>
          ) : (
            <>
              {/* My rank card */}
              {myEntry && (
                <div className="glass-card p-4 flex items-center gap-4 bg-gradient-to-r from-primary-500/10 to-accent-500/10 border-primary-200/40 dark:border-primary-800/40 animate-fade-in-up">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-white text-xl shadow-lg shadow-primary-500/30 flex-shrink-0">
                    {user.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Your Position</p>
                    <p className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">
                      Rank #{myEntry.rank} — {user.username}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-display font-bold text-lg text-primary-600 dark:text-primary-400">
                      {myEntry.xp.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{period === 'weekly' ? 'XP this week' : 'XP earned'}</p>
                  </div>
                </div>
              )}

              {/* Podium — top 3 */}
              {top3.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:gap-4 animate-fade-in-up">
                  {[1, 0, 2].map((podiumIndex, _displayIndex) => {
                    const entry = top3[podiumIndex];
                    if (!entry) return null;
                    const colors = podiumColors[podiumIndex];
                    const isFirst = podiumIndex === 0;

                    return (
                      <div
                        key={entry.id}
                        className={`glass-card p-4 sm:p-6 text-center relative overflow-hidden ${isFirst ? 'sm:-mt-4 sm:mb-4' : ''} ${entry.isCurrentUser ? 'ring-2 ring-primary-400/50' : ''}`}
                      >
                        {isFirst && (
                          <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 mx-auto mb-2 animate-float" />
                        )}
                        <div className={`w-14 h-14 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-2xl sm:text-3xl shadow-lg ${colors.shadow} mb-3`}>
                          {entry.avatar}
                        </div>
                        <p className={`font-display font-bold text-sm sm:text-base truncate ${entry.isCurrentUser ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-100'}`}>
                          {entry.username}
                        </p>
                        <p className={`text-xs font-semibold ${colors.label} mt-0.5`}>Level {entry.level}</p>
                        <div className="flex items-center justify-center gap-1 mt-2">
                          <Zap className="w-3.5 h-3.5 text-primary-500" />
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {entry.xp.toLocaleString()}
                          </span>
                        </div>
                        <div className={`mt-2 inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          podiumIndex === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                          podiumIndex === 1 ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                          'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                        }`}>
                          #{podiumIndex + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rest of the board */}
              {rest.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {rest.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-3 sm:gap-4 p-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${entry.isCurrentUser ? 'bg-primary-50/50 dark:bg-primary-950/20' : ''}`}
                      >
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">
                          {entry.rank}
                        </div>
                        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-base sm:text-lg flex-shrink-0">
                          {entry.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm truncate ${entry.isCurrentUser ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-100'}`}>
                            {entry.username} {entry.isCurrentUser && '(You)'}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                              <Flame className="w-3 h-3" />
                              Lvl {entry.level}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-display font-bold text-sm sm:text-base text-primary-600 dark:text-primary-400">
                            {entry.xp.toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">XP</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Season reward teaser */}
              <div className="glass-card p-5 flex items-center gap-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-200/40 dark:border-amber-800/40 animate-fade-in">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 flex-shrink-0">
                  <Medal className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Season Rewards</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Top 3 players at season end earn exclusive badges and bonus XP.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
