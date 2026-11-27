import { AppProvider, useApp } from '@/context/AppContext';
import { Sidebar, Topbar, MobileBottomNav } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { DiscoverPage } from '@/pages/DiscoverPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { ReaderPage } from '@/pages/ReaderPage';
import { QuizzesPage } from '@/pages/QuizzesPage';
import { QuizPlayPage } from '@/pages/QuizPlayPage';
import { MultiplayerPage } from '@/pages/MultiplayerPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { AuthPage } from '@/pages/AuthPage';
import { SubmissionCentrePage } from '@/pages/SubmissionCentrePage';
import { AdminPage } from '@/pages/AdminPage';
import { AdminNovelsPage } from '@/pages/AdminNovelsPage';
import { AdminNovelEditorPage } from '@/pages/AdminNovelEditorPage';
import { ScenariosPage } from '@/pages/ScenariosPage';
import { ScenarioPlayPage } from '@/pages/ScenarioPlayPage';
import { ScenarioCreatePage } from '@/pages/ScenarioCreatePage';
import { MyScenariosPage } from '@/pages/MyScenariosPage';
import { AchievementsPage } from '@/pages/AchievementsPage';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { AchievementUnlockToast } from '@/components/achievements/AchievementUnlockToast';

function PageRouter() {
  const { page, pageParams } = useApp();

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <DashboardPage />;
      case 'discover':
        return <DiscoverPage />;
      case 'library':
        return <LibraryPage />;
      case 'reader':
        return <ReaderPage />;
      case 'quizzes':
        return <QuizzesPage />;
      case 'quiz-play':
        return <QuizPlayPage />;
      case 'multiplayer':
        return <MultiplayerPage />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'profile':
        return <ProfilePage />;
      case 'auth':
        return <AuthPage />;
      case 'submit':
        return <SubmissionCentrePage />;
      case 'admin':
        return <AdminPage />;
      case 'admin-novels':
        return <AdminNovelsPage />;
      case 'admin-novel-editor':
        return <AdminNovelEditorPage />;
      case 'scenarios':
        return <ScenariosPage />;
      case 'scenario-play':
        return <ScenarioPlayPage />;
      case 'scenario-create':
        return <ScenarioCreatePage />;
      case 'my-scenarios':
        return <MyScenariosPage />;
      case 'achievements':
        return <AchievementsPage />;
      case 'downloads':
        return <DownloadsPage />;
      default:
        return <DashboardPage />;
    }
  };

  // Key by page + params so navigating between the same page type with different
  // params (e.g. different novels in the reader) also re-triggers the transition.
  const transitionKey = `${page}:${pageParams.novelId ?? pageParams.quizId ?? pageParams.scenarioId ?? ''}`;

  return (
    <div key={transitionKey} className="page-enter">
      {renderPage()}
    </div>
  );
}

function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto w-full pb-24 lg:pb-8">
          <PageRouter />
        </main>
        <footer className="hidden lg:block px-6 py-4 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200/50 dark:border-slate-800/50">
          NOVELVERSE — Read · Play · Conquer
        </footer>
      </div>
      <MobileBottomNav />
      <AchievementUnlockToast />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
