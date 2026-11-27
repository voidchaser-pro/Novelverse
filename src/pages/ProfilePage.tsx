import { useState, useEffect } from 'react';
import {
  User,
  Flame,
  BookOpen,
  Brain,
  Swords,
  Trophy,
  Crown,
  Star,
  Pencil,
  Check,
  X,
  Calendar,
  TrendingUp,
  Award,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/UI';
import { AchievementBadge, RARITY_STYLES } from '@/components/achievements/AchievementBadge';
import { NovelCover } from '@/components/NovelCard';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { fetchQuizStats } from '@/lib/quizzes';
import type { QuizStats } from '@/types';

export function ProfilePage() {
  const { user, levelInfo, readingProgress, navigate, catalog, achievements, achievementsLoading, authUser, refreshAuthUser } = useApp();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(user.bio);
  const [username, setUsername] = useState(user.username);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [quizStats, setQuizStats] = useState<QuizStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!authUser) {
      setQuizStats(null);
      return;
    }
    fetchQuizStats(authUser.id)
      .then((s) => {
        if (!cancelled) setQuizStats(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  const showcased = unlockedAchievements.filter((a) => a.isShowcased);
  const rareCount = unlockedAchievements.filter((a) => a.rarity !== 'common').length;
  const achievementPercent = achievements.length > 0 ? Math.round((unlockedAchievements.length / achievements.length) * 100) : 0;
  const badgeXp = unlockedAchievements.reduce((s, a) => s + a.xpReward, 0);

  const completedNovels = Object.values(readingProgress).filter((rp) => rp.progress === 100);
  const completedNovelData = completedNovels.flatMap((rp) => {
    const novel = catalog.find((n) => n.id === rp.novelId);
    return novel ? [novel] : [];
  });

  const stats = [
    { icon: BookOpen, label: 'Novels Read', value: user.novelsRead, color: 'from-primary-500 to-accent-600' },
    { icon: Brain, label: 'Quizzes Done', value: quizStats?.totalAttempts ?? 0, color: 'from-accent-500 to-primary-600' },
    { icon: Trophy, label: 'Perfect Scores', value: quizStats?.perfectScores ?? 0, color: 'from-amber-400 to-orange-500' },
    { icon: Swords, label: 'MP Wins', value: user.multiplayerWins, color: 'from-secondary-500 to-primary-700' },
  ];

  async function saveProfile() {
    if (!authUser || !supabase) return;
    setSaving(true);
    setProfileError(null);
    try {
      const trimmedUsername = username.trim();
      const trimmedBio = bio.trim();
      if (trimmedUsername.length < 2 || trimmedUsername.length > 40) {
        throw new Error('Username must be between 2 and 40 characters.');
      }
      if (trimmedBio.length > 200) {
        throw new Error('Bio must be 200 characters or fewer.');
      }
      const { error } = await supabase.rpc('update_my_profile', {
        p_username: trimmedUsername,
        p_bio: trimmedBio,
      });
      if (error) throw new Error(error.message);
      setEditing(false);
      await refreshAuthUser();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your reading journey and achievements" icon={<User className="w-6 h-6" />} />

      {/* Profile card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-accent-600 to-primary-800 p-6 sm:p-8 animate-fade-in-up">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl animate-float" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-secondary-500/20 blur-3xl" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar */}
          <div className="relative">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center text-4xl sm:text-5xl shadow-xl border border-white/20">
              {user.avatar}
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg border-2 border-white/20">
              <Crown className="w-4 h-4" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field !bg-white/10 !border-white/20 !text-white !placeholder-white/50 max-w-xs"
                  placeholder="Username"
                />
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className="input-field !bg-white/10 !border-white/20 !text-white !placeholder-white/50 text-sm resize-none"
                  placeholder="Tell us about yourself…"
                />
                {(profileError || saving) && (
                  <div className="mt-2">
                    {profileError && (
                      <p className="text-xs text-red-200 bg-red-500/20 rounded-lg px-3 py-1.5">{profileError}</p>
                    )}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={saveProfile} disabled={saving} className="chip bg-white text-primary-700 font-bold disabled:opacity-50">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                  </button>
                  <button onClick={() => { setEditing(false); setBio(user.bio); setUsername(user.username); setProfileError(null); }} disabled={saving} className="chip bg-white/20 text-white disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white">{username}</h2>
                  <button onClick={() => setEditing(true)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-primary-100 text-sm mt-1.5 max-w-xl">{bio}</p>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-primary-100 font-medium">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Joined {user.joinedDate}
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-orange-300" /> {user.streak} day streak
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Level badge */}
          <div className="hidden sm:flex flex-col items-center flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center">
              <span className="text-3xl font-display font-extrabold text-white">{levelInfo.level}</span>
              <span className="text-[10px] text-primary-100 font-semibold tracking-wider">LEVEL</span>
            </div>
          </div>
        </div>

        {/* XP bar */}
        <div className="relative mt-6 max-w-2xl">
          <div className="flex items-center justify-between text-xs text-primary-100 mb-1.5 font-medium">
            <span>Level {levelInfo.level}</span>
            <span>{levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP to Level {levelInfo.level + 1}</span>
          </div>
          <div className="h-3 rounded-full bg-white/20 overflow-hidden backdrop-blur-sm">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-300 via-white to-primary-200 transition-all duration-1000 ease-out"
              style={{ width: `${levelInfo.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass-card p-5 text-center card-hover animate-fade-in-up">
              <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white shadow-lg mb-3`}>
                <Icon className="w-6 h-6" />
              </div>
              <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">{stat.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Achievements */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-slate-800 dark:text-slate-100">Achievements</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {unlockedAchievements.length} of {achievements.length} unlocked · {achievementPercent}% complete · {badgeXp.toLocaleString()} XP from badges
              </p>
            </div>
          </div>
          <button onClick={() => navigate('achievements')} className="btn-ghost self-start sm:self-auto">
            View all achievements
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass-card p-4 text-center">
            <p className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">{unlockedAchievements.length}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Unlocked</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">{rareCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Rare or better</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">{achievementPercent}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Completion</p>
          </div>
        </div>

        <h3 className="font-display font-bold text-sm text-slate-600 dark:text-slate-300 mb-3">Showcased badges</h3>
        {achievementsLoading && achievements.length === 0 ? (
          <div className="glass-card p-6 text-sm text-slate-500 dark:text-slate-400">Loading achievements...</div>
        ) : showcased.length === 0 ? (
          <div className="glass-card p-6 text-sm text-slate-500 dark:text-slate-400 text-center">
            Choose up to 3 unlocked badges to showcase on your profile from the achievements page.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {showcased.map((ach) => {
              const style = RARITY_STYLES[ach.rarity];
              return (
                <div key={ach.id} className={`glass-card p-5 text-center card-hover border ${style.ring} animate-fade-in-up`}>
                  <div className="flex justify-center mb-3">
                    <AchievementBadge icon={ach.icon} rarity={ach.rarity} unlocked size="lg" />
                  </div>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 line-clamp-1">{ach.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{ach.description}</p>
                  <span className={`chip mt-3 ${style.chip}`}>{style.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recently completed novels */}
      {completedNovelData.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-success-50 dark:bg-success-950/30 flex items-center justify-center text-success-500">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-slate-800 dark:text-slate-100">Completed Novels</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Stories you've finished</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {completedNovelData.map((novel) => (
              <div
                key={novel.id}
                onClick={() => navigate('reader', { novelId: novel.id })}
                className="flex-shrink-0 w-32 cursor-pointer group"
              >
                <NovelCover novel={novel} className="w-32 h-44 group-hover:scale-105 transition-transform duration-300" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-2 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {novel.title}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Reading stats summary */}
      <div className="glass-card p-6 animate-fade-in">
        <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200 mb-4">Reading Insights</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-xl bg-primary-50 dark:bg-primary-950/30 flex items-center justify-center text-primary-500 mb-2">
              <TrendingUp className="w-5 h-5" />
            </div>
            <p className="text-lg font-display font-bold text-slate-800 dark:text-slate-100">
              {user.novelsRead > 0 ? Math.round((user.quizzesCompleted / user.novelsRead) * 10) / 10 : 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quizzes per novel</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500 mb-2">
              <Star className="w-5 h-5" />
            </div>
            <p className="text-lg font-display font-bold text-slate-800 dark:text-slate-100">
              {Math.round((user.quizzesWon / Math.max(1, user.quizzesCompleted)) * 100)}%
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quiz win rate</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-xl bg-secondary-50 dark:bg-secondary-950/30 flex items-center justify-center text-secondary-500 mb-2">
              <Swords className="w-5 h-5" />
            </div>
            <p className="text-lg font-display font-bold text-slate-800 dark:text-slate-100">
              {Math.round((user.multiplayerWins / Math.max(1, user.multiplayerWins + 6)) * 100)}%
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">MP win rate</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-xl bg-accent-50 dark:bg-accent-950/30 flex items-center justify-center text-accent-500 mb-2">
              <Award className="w-5 h-5" />
            </div>
            <p className="text-lg font-display font-bold text-slate-800 dark:text-slate-100">
              {unlockedAchievements.length}/{achievements.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Achievements</p>
          </div>
        </div>
      </div>
    </div>
  );
}
