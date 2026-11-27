import {
  Compass,
  BookMarked,
  Brain,
  Swords,
  Trophy,
  User,
  BookOpen,
  Moon,
  Sun,
  Menu,
  X,
  Flame,
  Home,
  Upload,
  ShieldCheck,
  LogIn,
  LogOut,
  Sparkles,
  Award,
  Library,
  Download,
  WifiOff,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { PageId } from '@/types';
import { NOVELVERSE_LOGO } from '@/components/Logo';

// Primary destinations: mobile bottom bar and top of the sidebar
const PRIMARY_NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'scenarios', label: 'Scenarios', icon: Sparkles },
  { id: 'library', label: 'Library', icon: BookMarked },
  { id: 'profile', label: 'Profile', icon: User },
];

// Secondary destinations: sidebar only
const PLAY_NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'quizzes', label: 'Quizzes', icon: Brain },
  { id: 'multiplayer', label: 'Multiplayer', icon: Swords },
  { id: 'scenarios', label: 'Interactive Scenarios', icon: Sparkles },
  { id: 'my-scenarios', label: 'My Scenarios', icon: BookOpen },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'leaderboard', label: 'Rankings', icon: Trophy },
  { id: 'submit', label: 'Submit a Novel', icon: Upload },
];

// Pages that belong under a primary destination for highlighting
const PAGE_PARENT: Partial<Record<PageId, PageId>> = {
  reader: 'library',
  'quiz-play': 'quizzes',
  'scenario-play': 'scenarios',
  'scenario-create': 'scenarios',
  'my-scenarios': 'scenarios',
  'admin-novels': 'admin',
  'admin-novel-editor': 'admin',
};

function isActive(current: PageId, item: PageId) {
  return current === item || PAGE_PARENT[current] === item;
}

export function Sidebar() {
  const {
    page,
    navigate,
    sidebarOpen,
    setSidebarOpen,
    user,
    xp,
    levelInfo,
    theme,
    toggleTheme,
    authUser,
    isAdmin,
    signOut,
  } = useApp();

  async function handleSignOut() {
    await signOut();
    navigate('dashboard');
  }

  const displayName = authUser?.username ?? 'Guest reader';

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-50 lg:z-30
          h-screen w-72 flex-shrink-0
          glass-panel border-r border-slate-200/50 dark:border-slate-800/50
          transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          safe-top
        `}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <button onClick={() => navigate('dashboard')} className="flex items-center gap-2.5 group">
              <NOVELVERSE_LOGO className="w-9 h-9 transition-transform group-hover:scale-110" />
              <div className="text-left">
                <h1 className="font-display font-extrabold text-lg tracking-tight gradient-text leading-none">
                  NOVELVERSE
                </h1>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wider mt-0.5">
                  READ · PLAY · CONQUER
                </p>
              </div>
            </button>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden btn-ghost !px-2 !py-2" aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-2 space-y-1">
            {PRIMARY_NAV.map((item) => (
              <NavButton key={item.id} item={item} active={isActive(page, item.id)} onClick={() => navigate(item.id)} />
            ))}
            <NavButton
              item={{ label: 'Downloads', icon: Download }}
              active={page === 'downloads'}
              onClick={() => navigate('downloads')}
            />

            <p className="px-3 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Play & Create
            </p>
            {PLAY_NAV.map((item) => (
              <NavButton key={item.id} item={item} active={isActive(page, item.id)} onClick={() => navigate(item.id)} />
            ))}
            {isAdmin && (
              <>
                <p className="px-3 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Admin
                </p>
                <NavButton
                  item={{ label: 'Novel Management', icon: Library }}
                  active={page === 'admin-novels' || page === 'admin-novel-editor'}
                  onClick={() => navigate('admin-novels')}
                />
                <NavButton
                  item={{ label: 'Approvals', icon: ShieldCheck }}
                  active={page === 'admin'}
                  onClick={() => navigate('admin')}
                />
              </>
            )}
          </nav>

          <div className="px-3 py-2 space-y-1">
            <button onClick={toggleTheme} className="nav-link w-full text-left" aria-label="Toggle light and dark mode">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            {authUser ? (
              <button onClick={handleSignOut} className="nav-link w-full text-left">
                <LogOut className="w-5 h-5" />
                <span>Sign out</span>
              </button>
            ) : (
              <button onClick={() => navigate('auth')} className="nav-link w-full text-left">
                <LogIn className="w-5 h-5" />
                <span>Sign in</span>
              </button>
            )}
          </div>

          <button
            onClick={() => navigate('profile')}
            className="m-3 p-4 rounded-2xl bg-gradient-to-br from-primary-500/10 to-accent-500/10 border border-primary-200/40 dark:border-primary-800/40 hover:from-primary-500/15 hover:to-accent-500/15 transition-all duration-200"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-xl shadow-lg shadow-primary-500/30">
                {user.avatar}
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="font-semibold text-sm truncate text-slate-800 dark:text-slate-100">{displayName}</p>
                <div className="flex items-center gap-1 text-xs text-orange-500 dark:text-orange-400 font-semibold">
                  <Flame className="w-3 h-3" />
                  <span>{user.streak} day streak</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-primary-600 dark:text-primary-400">Lvl {levelInfo.level}</span>
              <span className="text-slate-400 dark:text-slate-500 font-medium">{xp.toLocaleString()} XP</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-700 ease-out"
                style={{ width: `${levelInfo.progress}%` }}
              />
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { label: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={`nav-link w-full text-left ${active ? 'nav-link-active' : ''}`}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span>{item.label}</span>
      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />}
    </button>
  );
}

export function Topbar() {
  const { setSidebarOpen, navigate, user, levelInfo, isOnline, pendingChanges } = useApp();

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-200/50 dark:border-slate-800/50 safe-top">
      <div className="flex items-center justify-between px-4 lg:px-8 h-16">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden btn-ghost !px-2.5 !py-2.5 flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate('discover')}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 text-sm font-medium w-64 lg:w-72 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <Compass className="w-4 h-4" />
            <span className="truncate">Search novels, authors, genres…</span>
          </button>
          <span className="sm:hidden font-display font-extrabold text-sm gradient-text flex-shrink-0">NOVELVERSE</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {!isOnline && (
            <div
              role="status"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/50 border border-amber-300/60 dark:border-amber-800/50"
            >
              <WifiOff className="w-4 h-4 text-amber-700 dark:text-amber-300" />
              <span className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-200">Offline</span>
            </div>
          )}
          {pendingChanges > 0 && (
            <div
              role="status"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-100 dark:bg-sky-950/50 border border-sky-300/60 dark:border-sky-800/50"
            >
              <RefreshCw className="w-4 h-4 text-sky-700 dark:text-sky-300" />
              <span className="text-xs sm:text-sm font-semibold text-sky-800 dark:text-sky-200">
                {pendingChanges} to sync
              </span>
            </div>
          )}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-200/40 dark:border-primary-800/40">
            <Flame className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-bold text-primary-600 dark:text-primary-300">{user.streak}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">day streak</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-accent-50 dark:bg-accent-950/40 border border-accent-200/40 dark:border-accent-800/40">
            <Trophy className="w-4 h-4 text-accent-500" />
            <span className="text-sm font-bold text-accent-600 dark:text-accent-300">Lvl {levelInfo.level}</span>
          </div>
          <button
            onClick={() => navigate('profile')}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-lg shadow-lg shadow-primary-500/30 hover:scale-105 transition-transform"
            aria-label="Your profile"
          >
            {user.avatar}
          </button>
        </div>
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  const { page, navigate } = useApp();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 glass-panel border-t border-slate-200/50 dark:border-slate-800/50 safe-bottom">
      <div className="flex items-center justify-around px-1 py-1.5">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(page, item.id);
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
                active ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
