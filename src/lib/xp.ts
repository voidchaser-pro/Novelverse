export const XP_PER_LEVEL = 450;

export function levelFromXp(xp: number): { level: number; currentLevelXp: number; nextLevelXp: number; progress: number } {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  const currentLevelXp = safeXp % XP_PER_LEVEL;
  const progress = (currentLevelXp / XP_PER_LEVEL) * 100;
  return { level, currentLevelXp, nextLevelXp: XP_PER_LEVEL, progress };
}
