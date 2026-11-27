import { supabase } from '@/lib/supabase';
import type { AchievementCategory, AchievementRarity, AchievementView } from '@/types';

interface DefinitionRow {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  xp_reward: number;
  threshold: number;
  is_secret: boolean;
  is_active: boolean;
  sort_order: number;
}

interface UnlockRow {
  achievement_id: string;
  unlocked_at: string;
  is_showcased: boolean;
}

interface ProgressRow {
  achievement_id: string;
  current_value: number;
}

export interface AchievementState {
  achievements: AchievementView[];
}

export async function fetchAchievementState(userId: string): Promise<AchievementState> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;
  const [defsRes, unlocksRes, progressRes] = await Promise.all([
    client.from('achievement_definitions').select('id, category, name, description, icon, rarity, xp_reward, threshold, is_secret, is_active, sort_order').order('sort_order'),
    client.from('user_achievements').select('achievement_id, unlocked_at, is_showcased').eq('user_id', userId),
    client.from('achievement_progress').select('achievement_id, current_value').eq('user_id', userId),
  ]);
  if (defsRes.error) throw new Error(defsRes.error.message);
  if (unlocksRes.error) throw new Error(unlocksRes.error.message);
  if (progressRes.error) throw new Error(progressRes.error.message);

  const unlocks = new Map((unlocksRes.data as UnlockRow[]).map((u) => [u.achievement_id, u]));
  const progress = new Map((progressRes.data as ProgressRow[]).map((p) => [p.achievement_id, p.current_value]));

  const achievements = (defsRes.data as DefinitionRow[])
    .filter((d) => d.is_active)
    .map<AchievementView>((d) => {
    const unlock = unlocks.get(d.id);
    return {
      id: d.id,
      category: d.category,
      name: d.name,
      description: d.description,
      icon: d.icon,
      rarity: d.rarity,
      xpReward: d.xp_reward,
      threshold: d.threshold,
      isSecret: d.is_secret,
      unlocked: Boolean(unlock),
      unlockedAt: unlock?.unlocked_at ?? null,
      isShowcased: unlock?.is_showcased ?? false,
      progress: Math.min(progress.get(d.id) ?? 0, d.threshold),
    };
  });
  return { achievements };
}

export async function evaluateAchievements(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('refresh_achievements');
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}

export async function setAchievementShowcase(achievementId: string, showcased: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('set_achievement_showcase', {
    p_achievement_id: achievementId,
    p_showcased: showcased,
  });
  if (error) throw new Error(error.message);
}
