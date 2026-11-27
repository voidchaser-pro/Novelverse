import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Edit3, Send, Trash2, Clock, CheckCircle2, XCircle, Globe, Loader2, AlertCircle, Star } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageHeader, EmptyState } from '@/components/UI';
import { fetchMyScenarios, submitScenarioForReview, deleteScenario } from '@/lib/scenarios';
import type { Scenario } from '@/types';

const STATUS_STYLE: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', icon: Edit3 },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400', icon: Clock },
  approved: { label: 'Approved', cls: 'bg-success-50 text-success-600 dark:bg-success-950/30 dark:text-success-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-error-50 text-error-600 dark:bg-error-950/30 dark:text-error-400', icon: XCircle },
};

export function MyScenariosPage() {
  const { navigate, authUser } = useApp();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setError(null);
    try {
      setScenarios(await fetchMyScenarios(authUser.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your scenarios.');
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(scenarioId: string) {
    setActionId(scenarioId);
    try {
      await submitScenarioForReview(scenarioId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit scenario.');
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(scenarioId: string) {
    if (!confirm('Delete this scenario? This cannot be undone.')) return;
    setActionId(scenarioId);
    try {
      await deleteScenario(scenarioId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete scenario.');
    } finally {
      setActionId(null);
    }
  }

  if (!authUser) {
    return (
      <EmptyState
        icon={<BookOpen className="w-7 h-7" />}
        title="Sign in required"
        description="Sign in to manage your interactive scenarios."
        action={<button onClick={() => navigate('auth')} className="btn-primary">Sign in</button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Scenarios"
        subtitle="Manage your drafts, submissions and published scenarios"
        icon={<BookOpen className="w-6 h-6" />}
        action={
          <button onClick={() => navigate('scenario-create')} className="btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Scenario</span>
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your scenarios…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
          <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
        </div>
      ) : scenarios.length === 0 ? (
        <EmptyState
          icon={<Plus className="w-7 h-7" />}
          title="No scenarios yet"
          description="Create your first interactive scenario from a novel."
          action={
            <button onClick={() => navigate('scenario-create')} className="btn-primary">
              <Plus className="w-4 h-4" />
              Create a Scenario
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {scenarios.map((sc) => {
            const style = STATUS_STYLE[sc.status] ?? STATUS_STYLE.draft;
            const StatusIcon = style.icon;
            return (
              <li key={sc.id} className="glass-card p-4 flex items-center gap-4">
                <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${sc.cover_color} flex items-center justify-center flex-shrink-0`}>
                  <BookOpen className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{sc.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {sc.novel_title && `Based on ${sc.novel_title} · `}
                    {sc.nodes.length} passages · {sc.endings_count || sc.nodes.filter((n) => n.isEnding).length} endings
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`chip ${style.cls}`}>
                      <StatusIcon className="w-3 h-3" />
                      {style.label}
                    </span>
                    {sc.is_published && (
                      <span className="chip bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                        <Globe className="w-3 h-3" />
                        Live
                      </span>
                    )}
                    {sc.status === 'rejected' && sc.admin_feedback && (
                      <span className="text-xs text-error-500 truncate max-w-[200px]">
                        "{sc.admin_feedback}"
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {sc.status === 'draft' && (
                    <button
                      onClick={() => handleSubmit(sc.id)}
                      disabled={actionId === sc.id}
                      className="btn-ghost !px-2.5 !py-2"
                      title="Submit for review"
                    >
                      {actionId === sc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => navigate('scenario-create', { scenarioId: sc.id })}
                    className="btn-ghost !px-2.5 !py-2"
                    title="Edit"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {(sc.status === 'draft' || sc.status === 'rejected') && (
                    <button
                      onClick={() => handleDelete(sc.id)}
                      disabled={actionId === sc.id}
                      className="btn-ghost !px-2.5 !py-2 text-slate-400 hover:text-error-500"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {sc.is_published && (
                    <button
                      onClick={() => navigate('scenario-play', { scenarioId: sc.id })}
                      className="btn-ghost !px-2.5 !py-2 text-primary-500"
                      title="Play"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
