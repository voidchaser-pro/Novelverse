import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, Users, Award, RotateCcw, Home, Star } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { EmptyState } from '@/components/UI';
import { fetchScenarioById, fetchScenarioProgress, upsertProgress, awardScenarioXp } from '@/lib/scenarios';
import type { Scenario, ScenarioNode } from '@/types';

export function ScenarioPlayPage() {
  const { pageParams, navigate, refreshAuthUser, checkAchievements, authUser } = useApp();
  const scenarioId = pageParams.scenarioId;

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [currentNode, setCurrentNode] = useState<ScenarioNode | null>(null);
  const [endingsDiscovered, setEndingsDiscovered] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [xpAwarded, setXpAwarded] = useState(0);
  const [showXpToast, setShowXpToast] = useState(false);

  const load = useCallback(async () => {
    if (!scenarioId) return;
    setLoading(true);
    setError(null);
    try {
      const sc = await fetchScenarioById(scenarioId);
      if (!sc) {
        setError('Scenario not found.');
        return;
      }
      setScenario(sc);
      const progress = await fetchScenarioProgress(scenarioId);
      const startNode = sc.nodes.find((n) => n.id === sc.start_node_id) ?? null;
      if (progress && !progress.completed) {
        const resumed = sc.nodes.find((n) => n.id === progress.current_node_id) ?? startNode;
        setCurrentNode(resumed);
        setEndingsDiscovered(progress.endings_discovered ?? []);
      } else {
        setCurrentNode(startNode);
        setEndingsDiscovered(progress?.endings_discovered ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load scenario.');
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    load();
  }, [load]);

  const makeChoice = useCallback(
    async (nextNodeId: string) => {
      if (!scenario || !currentNode) return;
      const next = scenario.nodes.find((n) => n.id === nextNodeId);
      if (!next) return;
      setCurrentNode(next);
      const newEndings = [...endingsDiscovered];
      if (next.isEnding && !newEndings.includes(next.id)) {
        newEndings.push(next.id);
        setEndingsDiscovered(newEndings);
      }
      const completed = next.isEnding;
      try {
        await upsertProgress(scenario.id, next.id, completed, newEndings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your progress.');
      }
      if (completed && authUser) {
        try {
          const awarded = await awardScenarioXp(scenario.id);
          if (awarded > 0) {
            setXpAwarded(awarded);
            setShowXpToast(true);
            await refreshAuthUser();
            await checkAchievements();
          }
        } catch {
          // XP award failed silently — progress is still saved
        }
      }
    },
    [scenario, currentNode, endingsDiscovered, authUser, refreshAuthUser, checkAchievements]
  );

  const restart = useCallback(() => {
    if (!scenario) return;
    const start = scenario.nodes.find((n) => n.id === scenario.start_node_id) ?? null;
    setCurrentNode(start);
    upsertProgress(scenario.id, scenario.start_node_id, false, endingsDiscovered);
  }, [scenario, endingsDiscovered]);

  const progressPct = useMemo(() => {
    if (!scenario || !currentNode) return 0;
    if (currentNode.isEnding) return 100;
    const totalNodes = scenario.nodes.length;
    const visited = endingsDiscovered.length + 1;
    return Math.min(95, (visited / totalNodes) * 100);
  }, [scenario, currentNode, endingsDiscovered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !scenario || !currentNode) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<BookOpen className="w-7 h-7" />}
          title="Could not load scenario"
          description={error ?? 'The scenario may have been removed.'}
          action={
            <button onClick={() => navigate('scenarios')} className="btn-outline">
              Back to Scenarios
            </button>
          }
        />
      </div>
    );
  }

  const relevantCharacters = scenario.characters.filter(
    (c) => currentNode.text.includes(c.name) || currentNode.title.includes(c.name)
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* XP toast */}
      {showXpToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
          <div className="glass-card px-5 py-3 flex items-center gap-2 border-2 border-accent-400 shadow-lg shadow-accent-500/20">
            <Award className="w-5 h-5 text-accent-500" />
            <span className="font-bold text-accent-700 dark:text-accent-300">+{xpAwarded} XP earned!</span>
            <button onClick={() => setShowXpToast(false)} className="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <span className="sr-only">Dismiss</span>×
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('scenarios')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Scenarios
        </button>
        <div>
          <h1 className="font-display font-extrabold text-xl sm:text-2xl text-slate-800 dark:text-slate-100">
            {scenario.title}
          </h1>
          {scenario.novel_title && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Based on <span className="font-semibold">{scenario.novel_title}</span>
            </p>
          )}
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex-shrink-0">
            {Math.round(progressPct)}%
          </span>
        </div>
      </div>

      {/* Story passage */}
      <div key={currentNode.id} className="glass-card p-6 animate-fade-in-up">
        <h2 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100 mb-3">
          {currentNode.title}
        </h2>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-serif text-base">
            {currentNode.text}
          </p>
        </div>

        {/* Characters */}
        {relevantCharacters.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-200/50 dark:border-slate-800/50">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
              <Users className="w-3.5 h-3.5" />
              Characters in this scene
            </div>
            <div className="space-y-2">
              {relevantCharacters.map((char) => (
                <div key={char.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-secondary-600 flex items-center justify-center text-lg flex-shrink-0">
                    {char.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{char.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{char.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ending banner */}
        {currentNode.isEnding && (
          <div className="mt-6 p-5 rounded-xl bg-gradient-to-br from-accent-50 to-primary-50 dark:from-accent-950/30 dark:to-primary-950/30 border border-accent-300/40 dark:border-accent-800/40 animate-scale-in">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-accent-500" />
              <h3 className="font-display font-bold text-base text-accent-700 dark:text-accent-300">
                {currentNode.endingLabel ?? 'The End'}
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You have reached one of {scenario.endings_count || scenario.nodes.filter((n) => n.isEnding).length} possible endings.
            </p>
            {endingsDiscovered.length > 1 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                You have discovered {endingsDiscovered.length} ending{endingsDiscovered.length !== 1 ? 's' : ''} so far.
              </p>
            )}
          </div>
        )}

        {/* Choices */}
        {!currentNode.isEnding && (
          <div className="mt-6 space-y-3">
            {currentNode.choices.map((choice, idx) => (
              <button
                key={choice.id}
                onClick={() => makeChoice(choice.nextNodeId)}
                className="w-full text-left p-4 rounded-xl border-2 border-slate-200 dark:border-slate-800 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-all duration-200 group animate-fade-in-up"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-primary-500 group-hover:text-white text-slate-500 dark:text-slate-400 text-sm font-bold flex items-center justify-center flex-shrink-0 transition-colors">
                    {idx + 1}
                  </span>
                  <span className="text-sm sm:text-base text-slate-700 dark:text-slate-200 font-medium">
                    {choice.text}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Post-ending actions */}
        {currentNode.isEnding && (
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button onClick={restart} className="btn-outline flex-1">
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
            <button onClick={() => navigate('scenarios')} className="btn-primary flex-1">
              <Home className="w-4 h-4" />
              Back to Scenarios
            </button>
          </div>
        )}
      </div>

      {/* Endings tracker */}
      {!currentNode.isEnding && scenario.nodes.filter((n) => n.isEnding).length > 1 && (
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>
            {endingsDiscovered.length} of {scenario.nodes.filter((n) => n.isEnding).length} endings discovered
          </span>
        </div>
      )}
    </div>
  );
}
