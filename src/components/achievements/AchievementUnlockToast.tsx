import { useEffect } from 'react';
import { Zap, X, Trophy } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { AchievementBadge, RARITY_STYLES } from '@/components/achievements/AchievementBadge';

const AUTO_DISMISS_MS = 6000;

export function AchievementUnlockToast() {
  const { unlockQueue, dismissUnlock } = useApp();
  const current = unlockQueue[0];

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(dismissUnlock, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [current, dismissUnlock]);

  if (!current) return null;
  const style = RARITY_STYLES[current.rarity];

  return (
    <div className="fixed inset-x-4 bottom-24 lg:bottom-8 z-[60] flex justify-center pointer-events-none" role="status" aria-live="polite">
      <div
        key={current.id}
        className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl glass-panel border ${style.ring} shadow-2xl ${style.glow} p-4 animate-fade-in-up`}
      >
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br from-amber-300/30 to-transparent blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="animate-bounce">
            <AchievementBadge icon={current.icon} rarity={current.rarity} unlocked size="md" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
              <Trophy className="w-3.5 h-3.5" /> Achievement unlocked
            </p>
            <p className="font-display font-bold text-slate-800 dark:text-slate-100 truncate">{current.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-semibold ${style.text}`}>{style.label}</span>
              <span className="flex items-center gap-1 text-xs font-bold text-primary-600 dark:text-primary-400">
                <Zap className="w-3 h-3" /> +{current.xpReward} XP
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissUnlock}
            className="btn-ghost !px-2 !py-2 flex-shrink-0"
            aria-label="Dismiss achievement notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
