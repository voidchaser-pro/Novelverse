import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { PageId, ReadingProgress, UserProfile, AuthUser, Novel, AchievementView, ChapterBookmark } from '@/types';
import type { QueueOp } from '@/lib/offline/db';
import { levelFromXp } from '@/lib/xp';
import { supabase } from '@/lib/supabase';
import { fetchPublishedNovels } from '@/lib/novels';
import { fetchBookmarks, addBookmark, removeBookmark, saveReadingPosition } from '@/lib/reading';
import {
  fetchAchievementState,
  evaluateAchievements,
  setAchievementShowcase,
} from '@/lib/achievements';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { loadOfflineCatalog, markInterruptedDownloads } from '@/lib/offline/downloads';
import { countPendingChanges, enqueueChange, syncPendingChanges } from '@/lib/offline/sync';
import { clearUserState, loadUserState, updateUserState } from '@/lib/offline/userState';

type Theme = 'light' | 'dark';
export type CatalogSource = 'live' | 'offline';
export type PositionSaveResult = 'saved' | 'queued';

interface ProfileRow {
  id: string;
  username: string;
  role: string;
  avatar_url: string | null;
  bio: string | null;
  xp: number;
  level: number;
  streak: number;
  created_at: string;
}

interface ReadingProgressRow {
  novel_id: string;
  chapter_index: number;
  progress: number | string;
  scroll_ratio: number | string;
  last_read_at: string;
}

function toReadingProgress(row: ReadingProgressRow): ReadingProgress {
  return {
    novelId: row.novel_id,
    chapterIndex: row.chapter_index,
    progress: Number(row.progress),
    scrollRatio: Number(row.scroll_ratio),
    lastRead: row.last_read_at.slice(0, 10),
    lastReadAt: row.last_read_at,
  };
}

const PROFILE_COLUMNS = 'id, username, role, avatar_url, bio, xp, level, streak, created_at';

function toAuthUser(profile: ProfileRow, email: string): AuthUser {
  return {
    id: profile.id,
    email,
    username: profile.username,
    role: profile.role as 'admin' | 'reader',
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    xp: profile.xp,
    level: profile.level,
    streak: profile.streak,
    createdAt: profile.created_at,
  };
}

async function resolveAuthUser(userId: string, email: string): Promise<AuthUser | null> {
  if (supabase && navigator.onLine) {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) {
      const authUser = toAuthUser(data as ProfileRow, email);
      await updateUserState(userId, { profile: authUser }).catch(() => undefined);
      return authUser;
    }
  }
  const cached = await loadUserState(userId).catch(() => null);
  return cached?.profile ?? null;
}

function toUserProfile(authUser: AuthUser | null): UserProfile {
  if (!authUser) {
    return {
      id: '',
      username: 'Guest',
      email: '',
      avatar: 'G',
      bio: '',
      xp: 0,
      level: 1,
      streak: 0,
      joinedDate: '',
      novelsRead: 0,
      quizzesCompleted: 0,
      quizzesWon: 0,
      multiplayerWins: 0,
    };
  }
  return {
    id: authUser.id,
    username: authUser.username,
    email: authUser.email,
    avatar: authUser.username.charAt(0).toUpperCase(),
    bio: authUser.bio ?? '',
    xp: authUser.xp,
    level: authUser.level,
    streak: authUser.streak,
    joinedDate: new Date(authUser.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    novelsRead: 0,
    quizzesCompleted: 0,
    quizzesWon: 0,
    multiplayerWins: 0,
  };
}

interface AppContextValue {
  theme: Theme;
  toggleTheme: () => void;

  user: UserProfile;
  xp: number;
  levelInfo: ReturnType<typeof levelFromXp>;

  library: string[];
  toggleLibrary: (novelId: string) => void;
  isInLibrary: (novelId: string) => boolean;

  readingProgress: Record<string, ReadingProgress>;
  updateReadingProgress: (novelId: string, chapterIndex: number) => Promise<void>;
  touchReadingHistory: (novelId: string) => Promise<void>;
  savePosition: (novelId: string, chapterIndex: number, ratio: number) => Promise<PositionSaveResult>;

  bookmarks: ChapterBookmark[];
  toggleBookmark: (novelId: string, chapterIndex: number) => Promise<void>;

  achievements: AchievementView[];
  achievementsLoading: boolean;
  achievementsError: string | null;
  unlockQueue: AchievementView[];
  dismissUnlock: () => void;
  checkAchievements: () => Promise<void>;
  showcaseAchievement: (achievementId: string, showcased: boolean) => Promise<void>;

  page: PageId;
  navigate: (page: PageId, params?: Record<string, string>) => void;
  pageParams: Record<string, string>;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  catalog: Novel[];
  catalogLoading: boolean;
  catalogError: string | null;
  catalogSource: CatalogSource;
  refreshCatalog: () => Promise<void>;

  isOnline: boolean;
  pendingChanges: number;

  // Auth
  authUser: AuthUser | null;
  authLoading: boolean;
  isAdmin: boolean;
  refreshAuthUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nv-theme') as Theme | null;
      if (stored) return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  const isOnline = useOnlineStatus();

  const [library, setLibrary] = useState<string[]>([]);
  const [readingProgress, setReadingProgress] = useState<Record<string, ReadingProgress>>({});
  const [bookmarks, setBookmarks] = useState<ChapterBookmark[]>([]);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [achievements, setAchievements] = useState<AchievementView[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [achievementsError, setAchievementsError] = useState<string | null>(null);
  const [unlockQueue, setUnlockQueue] = useState<AchievementView[]>([]);

  const [page, setPage] = useState<PageId>('dashboard');
  const [pageParams, setPageParams] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [catalog, setCatalog] = useState<Novel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogSource, setCatalogSource] = useState<CatalogSource>('live');

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true);
    let liveError: string | null = null;
    if (navigator.onLine) {
      try {
        setCatalog(await fetchPublishedNovels());
        setCatalogSource('live');
        setCatalogError(null);
        setCatalogLoading(false);
        return;
      } catch (err) {
        liveError = err instanceof Error ? err.message : 'Could not load novels.';
      }
    }
    try {
      const offline = await loadOfflineCatalog();
      setCatalog(offline);
      setCatalogSource('offline');
      setCatalogError(offline.length === 0 ? liveError ?? 'No novels are downloaded for offline reading yet.' : null);
    } catch {
      setCatalog([]);
      setCatalogSource('offline');
      setCatalogError(liveError ?? 'Could not load novels.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    markInterruptedDownloads().catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog, isOnline]);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const fetchAuthUser = useCallback(async () => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setAuthUser(null);
      setAuthLoading(false);
      return;
    }
    const resolved = await resolveAuthUser(session.user.id, session.user.email || '');
    if (resolved) setAuthUser(resolved);
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    fetchAuthUser();

    if (!supabase) return;
    const client = supabase;

    // Safe onAuthStateChange: wrap async work in IIFE
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (!session?.user) {
          setAuthUser(null);
          return;
        }
        const resolved = await resolveAuthUser(session.user.id, session.user.email || '');
        if (resolved) setAuthUser(resolved);
      })();
    });

    return () => subscription.unsubscribe();
  }, [fetchAuthUser]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('nv-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const isInLibrary = useCallback((novelId: string) => library.includes(novelId), [library]);

  const navigate = useCallback((newPage: PageId, params: Record<string, string> = {}) => {
    setPage(newPage);
    setPageParams(params);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleLibrary = useCallback(async (novelId: string) => {
    if (!supabase || !authUser) {
      navigate('auth');
      return;
    }
    if (!navigator.onLine) return;
    const client = supabase;
    const userId = authUser.id;
    const wasInLibrary = library.includes(novelId);
    const next = wasInLibrary ? library.filter((id) => id !== novelId) : [...library, novelId];
    setLibrary(next);
    const { error } = wasInLibrary
      ? await client.from('library_items').delete().eq('user_id', userId).eq('novel_id', novelId)
      : await client.from('library_items').insert({ novel_id: novelId });
    if (error) {
      setLibrary(library);
      return;
    }
    await updateUserState(userId, { library: next }).catch(() => undefined);
  }, [authUser, library, navigate]);

  const loadAchievements = useCallback(async (userId: string) => {
    setAchievementsLoading(true);
    try {
      const state = await fetchAchievementState(userId);
      setAchievements(state.achievements);
      setAchievementsError(null);
    } catch (err) {
      setAchievementsError(err instanceof Error ? err.message : 'Could not load achievements.');
    } finally {
      setAchievementsLoading(false);
    }
  }, []);

  const checkAchievements = useCallback(async () => {
    if (!authUser || !navigator.onLine) return;
    const userId = authUser.id;
    try {
      const newIds = await evaluateAchievements();
      if (newIds.length === 0) return;
      await fetchAuthUser();
      const state = await fetchAchievementState(userId);
      setAchievements(state.achievements);
      setUnlockQueue((queue) => [
        ...queue,
        ...state.achievements.filter((a) => newIds.includes(a.id)),
      ]);
    } catch (err) {
      setAchievementsError(err instanceof Error ? err.message : 'Could not update achievements.');
    }
  }, [authUser, fetchAuthUser]);

  const dismissUnlock = useCallback(() => {
    setUnlockQueue((queue) => queue.slice(1));
  }, []);

  const showcaseAchievement = useCallback(
    async (achievementId: string, showcased: boolean) => {
      if (!authUser) return;
      await setAchievementShowcase(achievementId, showcased);
      await loadAchievements(authUser.id);
    },
    [authUser, loadAchievements]
  );

  const queueChange = useCallback(async (userId: string, op: QueueOp) => {
    await enqueueChange(userId, op);
    setPendingChanges(await countPendingChanges(userId));
  }, []);

  const storeProgress = useCallback(
    (userId: string, row: ReadingProgress) => {
      const next = { ...readingProgress, [row.novelId]: row };
      setReadingProgress(next);
      updateUserState(userId, { progress: Object.values(next) }).catch(() => undefined);
    },
    [readingProgress]
  );

  const updateReadingProgress = useCallback(
    async (novelId: string, chapterIndex: number) => {
      if (!authUser) return;
      const userId = authUser.id;
      const recordOffline = async () => {
        const now = new Date().toISOString();
        const prev = readingProgress[novelId];
        storeProgress(userId, {
          novelId,
          chapterIndex,
          progress: prev?.progress ?? 0,
          scrollRatio: prev?.chapterIndex === chapterIndex ? prev.scrollRatio : 0,
          lastRead: now.slice(0, 10),
          lastReadAt: now,
        });
        await queueChange(userId, { kind: 'chapter-read', novelId, chapterIndex });
      };
      if (!supabase || !navigator.onLine) {
        await recordOffline();
        return;
      }
      const { data, error } = await supabase.rpc('record_chapter_read', {
        p_novel_id: novelId,
        p_chapter_index: chapterIndex,
      });
      if (error || !data) {
        await recordOffline();
        return;
      }
      storeProgress(userId, toReadingProgress(data as ReadingProgressRow));
      await checkAchievements();
    },
    [authUser, checkAchievements, queueChange, readingProgress, storeProgress]
  );

  const touchReadingHistory = useCallback(
    async (novelId: string) => {
      if (!supabase || !authUser || !navigator.onLine) return;
      const { data, error } = await supabase.rpc('touch_reading_history', { p_novel_id: novelId });
      if (error || !data) return;
      storeProgress(authUser.id, toReadingProgress(data as ReadingProgressRow));
    },
    [authUser, storeProgress]
  );

  const savePosition = useCallback(
    async (novelId: string, chapterIndex: number, ratio: number): Promise<PositionSaveResult> => {
      if (!authUser) throw new Error('Sign in to save your place.');
      try {
        await saveReadingPosition(novelId, chapterIndex, ratio);
        return 'saved';
      } catch {
        const userId = authUser.id;
        const prev = readingProgress[novelId];
        if (prev && prev.chapterIndex === chapterIndex) {
          storeProgress(userId, { ...prev, scrollRatio: ratio });
        }
        await queueChange(userId, { kind: 'position', novelId, chapterIndex, scrollRatio: ratio });
        return 'queued';
      }
    },
    [authUser, queueChange, readingProgress, storeProgress]
  );

  const toggleBookmark = useCallback(
    async (novelId: string, chapterIndex: number) => {
      if (!authUser) {
        navigate('auth');
        return;
      }
      const userId = authUser.id;
      const exists = bookmarks.some((b) => b.novelId === novelId && b.chapterIndex === chapterIndex);
      const next = exists
        ? bookmarks.filter((b) => !(b.novelId === novelId && b.chapterIndex === chapterIndex))
        : [{ novelId, chapterIndex, createdAt: new Date().toISOString() }, ...bookmarks];

      if (!navigator.onLine) {
        const op: QueueOp = exists
          ? { kind: 'bookmark-remove', novelId, chapterIndex }
          : { kind: 'bookmark-add', novelId, chapterIndex };
        setBookmarks(next);
        updateUserState(userId, { bookmarks: next }).catch(() => undefined);
        await queueChange(userId, op);
        return;
      }

      if (exists) {
        await removeBookmark(userId, novelId, chapterIndex);
      } else {
        await addBookmark(novelId, chapterIndex);
      }
      setBookmarks(next);
      updateUserState(userId, { bookmarks: next }).catch(() => undefined);
    },
    [authUser, bookmarks, navigate, queueChange]
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const userId = authUser?.id;
    if (userId && navigator.onLine) await syncPendingChanges(userId).catch(() => undefined);
    if (userId) await clearUserState(userId).catch(() => undefined);
    await supabase.auth.signOut();
    await fetchAuthUser();
  }, [authUser, fetchAuthUser]);

  const syncNow = useCallback(
    async (userId: string) => {
      const result = await syncPendingChanges(userId).catch(() => null);
      if (!result) return;
      setPendingChanges(result.pending);
      if (result.synced > 0) await checkAchievements();
    },
    [checkAchievements]
  );

  const loadUserData = useCallback(async (userId: string) => {
    const cached = await loadUserState(userId).catch(() => null);
    let nextLibrary: string[] | null = null;
    let nextProgress: ReadingProgress[] | null = null;
    let nextBookmarks: ChapterBookmark[] | null = null;

    if (supabase && navigator.onLine) {
      const client = supabase;
      const [libRes, progRes, bookmarkList] = await Promise.all([
        client.from('library_items').select('novel_id').eq('user_id', userId),
        client
          .from('reading_progress')
          .select('novel_id, chapter_index, progress, scroll_ratio, last_read_at')
          .eq('user_id', userId),
        fetchBookmarks(userId).catch(() => null),
      ]);
      if (!libRes.error) nextLibrary = (libRes.data ?? []).map((r) => r.novel_id as string);
      if (!progRes.error) {
        nextProgress = ((progRes.data ?? []) as ReadingProgressRow[]).map(toReadingProgress);
      }
      nextBookmarks = bookmarkList;
    }

    const libraryIds = nextLibrary ?? cached?.library ?? [];
    const progressRows = nextProgress ?? cached?.progress ?? [];
    const marks = nextBookmarks ?? cached?.bookmarks ?? [];
    setLibrary(libraryIds);
    setReadingProgress(Object.fromEntries(progressRows.map((p) => [p.novelId, p])));
    setBookmarks(marks);
    await updateUserState(userId, { library: libraryIds, progress: progressRows, bookmarks: marks }).catch(
      () => undefined
    );
    setPendingChanges(await countPendingChanges(userId).catch(() => 0));
  }, []);

  useEffect(() => {
    if (!authUser) {
      setAchievements([]);
      setUnlockQueue([]);
      return;
    }
    const userId = authUser.id;
    (async () => {
      await checkAchievements();
      await loadAchievements(userId);
    })();
  }, [authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authUser) {
      setLibrary([]);
      setReadingProgress({});
      setBookmarks([]);
      setPendingChanges(0);
      return;
    }
    const userId = authUser.id;
    (async () => {
      if (isOnline) await syncNow(userId);
      await loadUserData(userId);
    })();
  }, [authUser?.id, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  const user = useMemo(() => toUserProfile(authUser), [authUser]);
  const xp = authUser?.xp ?? 0;
  const levelInfo = useMemo(() => levelFromXp(xp), [xp]);

  const value: AppContextValue = {
    theme,
    toggleTheme,
    user,
    xp,
    levelInfo,
    library,
    toggleLibrary,
    isInLibrary,
    readingProgress,
    updateReadingProgress,
    touchReadingHistory,
    savePosition,
    bookmarks,
    toggleBookmark,
    achievements,
    achievementsLoading,
    achievementsError,
    unlockQueue,
    dismissUnlock,
    checkAchievements,
    showcaseAchievement,
    page,
    navigate,
    pageParams,
    sidebarOpen,
    setSidebarOpen,
    catalog,
    catalogLoading,
    catalogError,
    catalogSource,
    refreshCatalog,
    isOnline,
    pendingChanges,
    authUser,
    authLoading,
    isAdmin: authUser?.role === 'admin',
    refreshAuthUser: fetchAuthUser,
    signOut,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
