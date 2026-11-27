import { useMemo, useState, type ReactNode } from 'react';
import { Trophy, Search, Zap, Percent, Sparkles, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/UI';
import { AchievementCard } from '@/components/achievements/AchievementCard';
import { AchievementBadge } from '@/components/achievements/AchievementBadge';
import { useApp } from '@/context/AppContext';
import type { AchievementCategory, AchievementView } from '@/types';

const CATEGORIES: { id: AchievementCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Reading' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'xp', label: 'XP' },
  { id: 'social', label: 'Social' },
  { id: 'secret', label: 'Secret' },
];

const MAX_SHOWCASE = 3;

export function AchievementsPage() {
  const { achievements, achievementsLoading, achievementsError, showcaseAchievement, authUser, navigate } = useApp();
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const total = achievements.length;
  const percent = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;
  const xpEarned = achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.xpReward, 0);
  const showcasedCount = achievements.filter((a) => a.isShowcased).length;

  const recent = useMemo(
    () =>
      achievements
        .filter((a) => a.unlocked && a.unlockedAt)
        .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
        .slice(0, 4),
    [achievements]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return achievements.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (status === 'unlocked' && !a.unlocked) return false;
      if (status === 'locked' && a.unlocked) return false;
      if (!q) return true;
      const label = a.isSecret && !a.unlocked ? 'secret' : `${a.name} ${a.description}`.toLowerCase();
      return label.includes(q);
    });
  }, [achievements, category, query, status]);

  async function handleShowcase(achievementId: string, showcased: boolean) {
    setBusyId(achievementId);
    setActionError(null);
    try {
      await showcaseAchievement(achievementId, showcased);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update your showcase.');
    } finally {
      setBusyId(null);
    }
  }

  if (!authUser) {
    return (
      <div className="space-y-6">
        <PageHeader title="Achievements" subtitle="Sign in to start unlocking badges" icon={<Trophy className="w-6 h-6" />} />
        <div className="glass-card p-8 text-center">
          <p className="text-slate-600 dark:text-slate-300 mb-4">Achievements are saved to your account.</p>
          <button onClick={() => navigate('auth')} className="btn-primary">Sign in</button>
        </div>
      </div>
    );
  }

  const showcaseFull = showcasedCount >= MAX_SHOWCASE;

  return (
    <div className="space-y-8">
      <PageHeader title="Achievements" subtitle="Every badge you earn is saved to your account" icon={<Trophy className="w-6 h-6" />} />

      {achievementsError && (
        <div className="glass-card p-4 text-sm text-error-600 dark:text-error-400">{achievementsError}</div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<Trophy className="w-5 h-5" />} label="Unlocked" value={`${unlockedCount} / ${total}`} tone="amber" />
        <StatTile icon={<Percent className="w-5 h-5" />} label="Completion" value={`${percent}%`} tone="emerald" />
        <StatTile icon={<Zap className="w-5 h-5" />} label="XP from badges" value={xpEarned.toLocaleString()} tone="sky" />
        <StatTile icon={<Sparkles className="w-5 h-5" />} label="Showcased" value={`${showcasedCount} / ${MAX_SHOWCASE}`} tone="rose" />
      </section>

      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Overall progress</span>
          <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{percent}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 via-emerald-400 to-amber-400 transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {recent.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100 mb-4">Recently unlocked</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {recent.map((a) => (
              <RecentTile key={a.id} achievement={a} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search achievements"
              className="input-field pl-10"
              aria-label="Search achievements"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {(['all', 'unlocked', 'locked'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`chip whitespace-nowrap capitalize transition-colors ${
                  status === s ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`chip whitespace-nowrap transition-all ${
                category === c.id
                  ? 'bg-gradient-to-r from-primary-500 to-accent-600 text-white shadow-md shadow-primary-500/30'
                  : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {actionError && <p className="text-sm text-error-600 dark:text-error-400">{actionError}</p>}
      </section>

      {achievementsLoading && achievements.length === 0 ? (
        <div className="glass-card p-10 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading achievements
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card p-10 text-center text-slate-500 dark:text-slate-400">No achievements match your filters.</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((a) => (
            <AchievementCard
              key={a.id}
              achievement={a}
              showcaseFull={showcaseFull}
              busy={busyId === a.id}
              onToggleShowcase={handleShowcase}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TONES = {
  amber: 'from-amber-400 to-orange-500',
  emerald: 'from-emerald-400 to-teal-600',
  sky: 'from-sky-400 to-blue-600',
  rose: 'from-rose-400 to-rose-600',
} as const;

function StatTile({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: keyof typeof TONES }) {
  return (
    <div className="glass-card p-4 sm:p-5 card-hover">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${TONES[tone]} flex items-center justify-center text-white shadow-lg mb-3`}>
        {icon}
      </div>
      <p className="text-xl sm:text-2xl font-display font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function RecentTile({ achievement }: { achievement: AchievementView }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3 card-hover group">
      <AchievementBadge icon={achievement.icon} rarity={achievement.rarity} unlocked size="sm" />
      <div className="min-w-0">
        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{achievement.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">+{achievement.xpReward} XP</p>
      </div>
    </div>
  );
}
