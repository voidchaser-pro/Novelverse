import {
  Award,
  BookOpen,
  BookMarked,
  Library,
  Crown,
  Gem,
  Flame,
  Swords,
  Puzzle,
  Trophy,
  Zap,
  Sprout,
  Star,
  Medal,
  Sparkles,
  Users,
  HeartHandshake,
  ThumbsUp,
  Moon,
  Sunrise,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import type { AchievementRarity } from '@/types';

const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  BookMarked,
  Library,
  Crown,
  Gem,
  Flame,
  Swords,
  Puzzle,
  Trophy,
  Zap,
  Sprout,
  Star,
  Medal,
  Sparkles,
  Users,
  HeartHandshake,
  ThumbsUp,
  Moon,
  Sunrise,
};

export function getAchievementIcon(name: string): LucideIcon {
  return ICONS[name] ?? Award;
}

export const RARITY_STYLES: Record<
  AchievementRarity,
  { label: string; gradient: string; glow: string; ring: string; chip: string; text: string }
> = {
  common: {
    label: 'Common',
    gradient: 'from-slate-400 to-slate-600',
    glow: 'shadow-slate-500/25',
    ring: 'border-slate-300 dark:border-slate-600',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    text: 'text-slate-500 dark:text-slate-400',
  },
  rare: {
    label: 'Rare',
    gradient: 'from-sky-400 to-blue-600',
    glow: 'shadow-blue-500/30',
    ring: 'border-sky-300 dark:border-sky-700',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    text: 'text-sky-600 dark:text-sky-400',
  },
  epic: {
    label: 'Epic',
    gradient: 'from-emerald-400 to-teal-600',
    glow: 'shadow-emerald-500/30',
    ring: 'border-emerald-300 dark:border-emerald-700',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  legendary: {
    label: 'Legendary',
    gradient: 'from-amber-300 to-orange-500',
    glow: 'shadow-amber-500/40',
    ring: 'border-amber-300 dark:border-amber-600',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    text: 'text-amber-600 dark:text-amber-400',
  },
  mythical: {
    label: 'Mythical',
    gradient: 'from-rose-400 via-amber-300 to-rose-600',
    glow: 'shadow-rose-500/40',
    ring: 'border-rose-300 dark:border-rose-600',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    text: 'text-rose-600 dark:text-rose-400',
  },
};

interface AchievementBadgeProps {
  icon: string;
  rarity: AchievementRarity;
  unlocked: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'w-10 h-10 rounded-xl',
  md: 'w-14 h-14 rounded-2xl',
  lg: 'w-20 h-20 rounded-3xl',
} as const;

const ICON_SIZE = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-9 h-9' } as const;

export function AchievementBadge({ icon, rarity, unlocked, size = 'md' }: AchievementBadgeProps) {
  const Icon = getAchievementIcon(icon);
  const style = RARITY_STYLES[rarity];

  if (!unlocked) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} relative flex items-center justify-center bg-slate-200 dark:bg-slate-800 border-2 border-dashed ${style.ring} text-slate-400 dark:text-slate-600 flex-shrink-0`}
      >
        <Lock className={ICON_SIZE[size]} />
      </div>
    );
  }

  return (
    <div
      className={`${SIZE_CLASSES[size]} relative flex items-center justify-center bg-gradient-to-br ${style.gradient} text-white shadow-lg ${style.glow} ring-2 ring-white/60 dark:ring-white/10 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}
    >
      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-tr from-white/0 via-white/25 to-white/0" />
      <Icon className={`${ICON_SIZE[size]} relative drop-shadow`} />
    </div>
  );
}
