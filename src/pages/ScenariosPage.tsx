import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Users, Star, Play, RotateCcw, Clock, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageHeader, EmptyState } from '@/components/UI';
import { fetchPublishedScenarios, fetchContinuePlaying } from '@/lib/scenarios';
import type { Scenario, ScenarioProgress } from '@/types';

type Tab = 'discover' | 'continue' | 'create';

const COVER_GRADIENTS = [
  'from-primary-700 to-secondary-800',
  'from-secondary-700 to-primary-900',
  'from-primary-600 to-secondary-700',
  'from-accent-600 to-primary-800',
  'from-secondary-600 to-accent-800',
];

export function ScenariosPage() {
  const { navigate, authUser } = useApp();
  const [tab, setTab] = useState<Tab>('discover');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [continueList, setContinueList] = useState<{ scenario: Scenario; progress: ScenarioProgress }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [published, continuing] = await Promise.all([fetchPublishedScenarios(), fetchContinuePlaying()]);
      setScenarios(published);
      setContinueList(continuing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load scenarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: 'discover', label: 'Discover', icon: Sparkles },
    { id: 'continue', label: 'Continue Playing', icon: Play },
    { id: 'create', label: 'My Scenarios', icon: Plus },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interactive Scenarios"
        subtitle="Branching storylines based on your favourite novels"
        icon={<BookOpen className="w-6 h-6" />}
      />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`chip flex-shrink-0 transition-all duration-200 ${
                tab === t.id
                  ? 'bg-primary-700 text-white shadow-md shadow-primary-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.id === 'continue' && continueList.length > 0 && (
                <span className="px-1.5 rounded-full text-[10px] bg-white/20">{continueList.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading scenarios…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
          <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
        </div>
      ) : tab === 'discover' ? (
        scenarios.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="w-7 h-7" />}
            title="No scenarios yet"
            description="Be the first to create an interactive scenario from a novel."
            action={
              <button onClick={() => navigate('scenario-create')} className="btn-primary">
                <Plus className="w-4 h-4" />
                Create a Scenario
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map((sc, idx) => {
              const grad = sc.cover_color || COVER_GRADIENTS[idx % COVER_GRADIENTS.length];
              const endingCount = sc.endings_count || sc.nodes.filter((n) => n.isEnding).length;
              return (
                <button
                  key={sc.id}
                  onClick={() => navigate('scenario-play', { scenarioId: sc.id })}
                  className="glass-card overflow-hidden text-left card-hover group"
                >
                  <div className={`h-32 bg-gradient-to-br ${grad} relative flex items-center justify-center`}>
                    <BookOpen className="w-10 h-10 text-white/40" />
                    <div className="absolute top-2 right-2 chip bg-white/20 text-white backdrop-blur-sm">
                      <Star className="w-3 h-3" />
                      {endingCount} endings
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display font-bold text-sm text-slate-800 dark:text-slate-100 line-clamp-1">
                      {sc.title}
                    </h3>
                    {sc.novel_title && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        Based on {sc.novel_title}
                      </p>
                    )}
                    {sc.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">
                        {sc.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-400 dark:text-slate-500">
                      {sc.characters.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {sc.characters.length}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {sc.xp_reward} XP
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : tab === 'continue' ? (
        continueList.length === 0 ? (
          <EmptyState
            icon={<Play className="w-7 h-7" />}
            title="Nothing to continue"
            description="Start playing a scenario and your progress will appear here."
            action={
              <button onClick={() => setTab('discover')} className="btn-outline">
                Browse Scenarios
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {continueList.map(({ scenario: sc, progress }) => {
              const isEnding = sc.nodes.find((n) => n.id === progress.current_node_id)?.isEnding ?? false;
              return (
                <button
                  key={sc.id}
                  onClick={() => navigate('scenario-play', { scenarioId: sc.id })}
                  className="glass-card w-full p-4 flex items-center gap-4 text-left card-hover"
                >
                  <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${sc.cover_color} flex items-center justify-center flex-shrink-0`}>
                    <BookOpen className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{sc.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {sc.novel_title && `Based on ${sc.novel_title} · `}
                      {progress.endings_discovered.length} ending{progress.endings_discovered.length !== 1 ? 's' : ''} found
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {progress.completed ? (
                        <span className="chip bg-success-50 text-success-600 dark:bg-success-950/30 dark:text-success-400">
                          <Star className="w-3 h-3" />
                          Completed
                        </span>
                      ) : (
                        <span className="chip bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-400">
                          <Clock className="w-3 h-3" />
                          In progress
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {progress.completed ? (
                      <RotateCcw className="w-5 h-5 text-slate-400" />
                    ) : (
                      <Play className="w-5 h-5 text-primary-500" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        /* My Scenarios tab */
        <EmptyState
          icon={<Plus className="w-7 h-7" />}
          title="Create your scenario"
          description="Select a novel and build an interactive branching storyline with multiple endings."
          action={
            authUser ? (
              <button onClick={() => navigate('scenario-create')} className="btn-primary">
                <Plus className="w-4 h-4" />
                Start Creating
              </button>
            ) : (
              <button onClick={() => navigate('auth')} className="btn-primary">
                Sign in to create
              </button>
            )
          }
        />
      )}
    </div>
  );
}
