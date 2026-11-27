import { supabase } from '@/lib/supabase';
import type { LeaderboardEntry } from '@/types';

export type LeaderboardPeriod = 'all' | 'weekly';

interface LeaderboardRow {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  xp: number;
  level: number;
  is_current_user: boolean;
}

export async function fetchLeaderboard(period: LeaderboardPeriod, limit = 50): Promise<LeaderboardEntry[]> {
  if (!supabase) throw new Error('The database is not configured.');
  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_period: period,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LeaderboardRow[]).map((row) => ({
    id: row.user_id,
    username: row.username,
    avatar: row.avatar_url ?? row.username.charAt(0).toUpperCase(),
    xp: Number(row.xp),
    level: row.level,
    rank: row.rank,
    quizzesWon: 0,
    novelsRead: 0,
    isCurrentUser: row.is_current_user,
  }));
}
