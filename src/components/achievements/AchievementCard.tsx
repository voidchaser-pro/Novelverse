import { Zap, Star, Check } from 'lucide-react';
import type { AchievementView } from '@/types';
import { ProgressBar } from '@/components/UI';
import { AchievementBadge, RARITY_STYLES } from '@/components/achievements/AchievementBadge';

interface AchievementCardProps {
  achievement: AchievementView;
  showcaseFull: boolean;
  busy: boolean;
  onToggleShowcase: (achievementId: string, showcased: boolean) => void;
}

export function AchievementCard({ achievement, showcaseFull, busy, onToggleShowcase }: AchievementCardProps) {
  const style = RARITY_STYLES[achievement.rarity];
  const hiddenSecret = achievement.isSecret && !achievement.unlocked;
  const title = hiddenSecret ? 'Secret achievement' : achievement.name;
  const description = hiddenSecret
    ? 'Keep reading and exploring to uncover this one.'
    : achievement.description;
  const canToggle = achievement.unlocked && (achievement.isShowcased || !showcaseFull);

  return (
    <article
      className={`group glass-card p-4 sm:p-5 flex flex-col gap-4 card-hover border ${
        achievement.unlocked ? style.ring : 'border-slate-200/60 dark:border-slate-800/60'
      } ${achievement.unlocked ? '' : 'opacity-90'}`}
    >
      <div className="flex items-start gap-4">
        <AchievementBadge icon={hiddenSecret ? 'Lock' : achievement.icon} rarity={achievement.rarity} unlocked={achievement.unlocked} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${style.chip}`}>{style.label}</span>
            {achievement.isSecret && (
              <span className="chip bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900">Secret</span>
            )}
          </div>
          <h3 className="font-display font-bold text-base text-slate-800 dark:text-slate-100 mt-2 truncate">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>

      {achievement.unlocked ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-success-600 dark:text-success-400">
            <Check className="w-4 h-4" /> Unlocked
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-sm font-bold text-primary-600 dark:text-primary-400">
              <Zap className="w-3.5 h-3.5" /> +{achievement.xpReward} XP
            </span>
            <button
              type="button"
              disabled={!canToggle || busy}
              onClick={() => onToggleShowcase(achievement.id, !achievement.isShowcased)}
              title={achievement.isShowcased ? 'Remove from profile' : showcaseFull ? 'Showcase limit reached (3)' : 'Show on profile'}
              className={`chip transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                achievement.isShowcased
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${achievement.isShowcased ? 'fill-current' : ''}`} />
              {achievement.isShowcased ? 'Showcased' : 'Showcase'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 dark:text-slate-500 font-medium">
              {hiddenSecret ? 'Hidden' : `${achievement.progress.toLocaleString()} / ${achievement.threshold.toLocaleString()}`}
            </span>
            <span className="flex items-center gap-1 text-primary-500 font-bold">
              <Zap className="w-3 h-3" /> +{achievement.xpReward} XP
            </span>
          </div>
          <ProgressBar value={hiddenSecret ? 0 : achievement.progress} max={achievement.threshold} />
        </div>
      )}
    </article>
  );
}
