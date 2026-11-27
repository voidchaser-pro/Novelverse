import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Loader2, Inbox, Clock, CheckCircle2, XCircle, Globe, BookOpen, AlertCircle, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageHeader, EmptyState } from '@/components/UI';
import { SubmissionReviewModal } from '@/components/admin/SubmissionReviewModal';
import { fetchAllSubmissions, fetchLiveNovelIds } from '@/lib/submissions';
import { fetchPendingScenarioSubmissions, fetchAllScenariosForAdmin, approveScenarioSubmission, rejectScenarioSubmission } from '@/lib/scenarios';
import type { NovelSubmission, SubmissionStatus, ScenarioSubmission, Scenario } from '@/types';

type AdminTab = 'novels' | 'scenarios';

type Filter = 'all' | SubmissionStatus | 'live';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'live', label: 'Live' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

const STATUS_STYLE: Record<SubmissionStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400', icon: Clock },
  approved: { label: 'Approved', cls: 'bg-success-50 text-success-600 dark:bg-success-950/30 dark:text-success-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-error-50 text-error-600 dark:bg-error-950/30 dark:text-error-400', icon: XCircle },
};

export function AdminPage() {
  const { authUser, isAdmin, authLoading, navigate } = useApp();
  const [adminTab, setAdminTab] = useState<AdminTab>('novels');
  const [submissions, setSubmissions] = useState<NovelSubmission[]>([]);
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenarioSubs, setScenarioSubs] = useState<ScenarioSubmission[]>([]);
  const [scenarioMap, setScenarioMap] = useState<Map<string, Scenario>>(new Map());
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [reviewingSub, setReviewingSub] = useState<ScenarioSubmission | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [subs, live] = await Promise.all([fetchAllSubmissions(), fetchLiveNovelIds()]);
      setSubmissions(subs);
      setLiveIds(live);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load submissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScenarios = useCallback(async () => {
    setScenarioLoading(true);
    setScenarioError(null);
    try {
      const [subs, allScenarios] = await Promise.all([fetchPendingScenarioSubmissions(), fetchAllScenariosForAdmin()]);
      setScenarioSubs(subs);
      setScenarioMap(new Map(allScenarios.map((s) => [s.id, s])));
    } catch (err) {
      setScenarioError(err instanceof Error ? err.message : 'Could not load scenario submissions.');
    } finally {
      setScenarioLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      load();
      loadScenarios();
    }
  }, [isAdmin, load, loadScenarios]);

  const isLive = (s: NovelSubmission) => Boolean(s.novel_id && liveIds.has(s.novel_id));

  const counts: Record<Filter, number> = {
    all: submissions.length,
    pending: submissions.filter((s) => s.status === 'pending').length,
    approved: submissions.filter((s) => s.status === 'approved').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
    live: submissions.filter(isLive).length,
  };

  const visible =
    filter === 'all'
      ? submissions
      : filter === 'live'
        ? submissions.filter(isLive)
        : submissions.filter((s) => s.status === filter);

  const selected = submissions.find((s) => s.id === selectedId) ?? null;

  if (authLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-16">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking your access…
      </div>
    );
  }

  if (!isAdmin || !authUser) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin" subtitle="Approval dashboard" icon={<ShieldCheck className="w-6 h-6" />} />
        <EmptyState
          icon={<ShieldCheck className="w-7 h-7" />}
          title="Admins only"
          description="This area is reserved for NOVELVERSE administrators."
          action={
            <button onClick={() => navigate('dashboard')} className="btn-outline">
              Back to Home
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Dashboard"
        subtitle="Review submissions, publish content and manage scenarios"
        icon={<ShieldCheck className="w-6 h-6" />}
      />

      {/* Tab switcher: Novels vs Scenarios */}
      <div className="flex gap-2">
        <button
          onClick={() => setAdminTab('novels')}
          className={`chip transition-all ${adminTab === 'novels' ? 'bg-primary-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Novel Submissions
        </button>
        <button
          onClick={() => setAdminTab('scenarios')}
          className={`chip transition-all ${adminTab === 'scenarios' ? 'bg-primary-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Scenario Submissions
          {scenarioSubs.filter((s) => s.status === 'pending').length > 0 && (
            <span className="px-1.5 rounded-full text-[10px] bg-white/20">{scenarioSubs.filter((s) => s.status === 'pending').length}</span>
          )}
        </button>
      </div>

      {adminTab === 'scenarios' ? (
        <ScenarioAdminSection
          subs={scenarioSubs}
          scenarioMap={scenarioMap}
          loading={scenarioLoading}
          error={scenarioError}
          reviewerId={authUser.id}
          onReload={loadScenarios}
          reviewingSub={reviewingSub}
          setReviewingSub={setReviewingSub}
          reviewFeedback={reviewFeedback}
          setReviewFeedback={setReviewFeedback}
          reviewAction={reviewAction}
          setReviewAction={setReviewAction}
          navigate={navigate}
        />
      ) : (
        <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Awaiting review', value: counts.pending, icon: Clock, cls: 'text-amber-500' },
          { label: 'Approved', value: counts.approved, icon: CheckCircle2, cls: 'text-success-500' },
          { label: 'Live', value: counts.live, icon: Globe, cls: 'text-primary-500' },
          { label: 'Rejected', value: counts.rejected, icon: XCircle, cls: 'text-error-500' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-4">
            <stat.icon className={`w-5 h-5 ${stat.cls}`} />
            <p className="font-display font-bold text-2xl text-slate-800 dark:text-slate-100 mt-2">{stat.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`chip flex-shrink-0 transition-all duration-200 ${
              filter === f.id
                ? 'bg-primary-700 text-white shadow-md shadow-primary-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {f.label}
            <span className="px-1.5 rounded-full text-[10px] bg-white/20">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading submissions…
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
          <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-error-700 dark:text-error-400">{loadError}</p>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Inbox className="w-7 h-7" />} title="Nothing here" description="No submissions match this filter yet." />
      ) : (
        <ul className="space-y-3">
          {visible.map((sub) => {
            const style = STATUS_STYLE[sub.status];
            const StatusIcon = style.icon;
            return (
              <li key={sub.id}>
                <button
                  onClick={() => setSelectedId(sub.id)}
                  className="glass-card w-full p-4 flex items-center gap-4 text-left card-hover"
                >
                  {sub.cover_url ? (
                    <img src={sub.cover_url} alt="" loading="lazy" className="w-12 h-16 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${sub.cover_color} flex items-center justify-center flex-shrink-0`}>
                      <BookOpen className="w-5 h-5 text-white/60" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{sub.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {sub.author} · {sub.submitter_username ?? 'Unknown reader'} · {new Date(sub.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`chip ${style.cls}`}>
                      <StatusIcon className="w-3 h-3" />
                      {style.label}
                    </span>
                    {isLive(sub) && (
                      <span className="chip bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                        <Globe className="w-3 h-3" />
                        Live
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && authUser && (
        <SubmissionReviewModal
          key={selected.id}
          submission={selected}
          reviewerId={authUser.id}
          isLive={isLive(selected)}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
        </>
      )}
    </div>
  );
}

function ScenarioAdminSection({
  subs,
  scenarioMap,
  loading,
  error,
  reviewerId,
  onReload,
  reviewingSub,
  setReviewingSub,
  reviewFeedback,
  setReviewFeedback,
  reviewAction,
  setReviewAction,
  navigate,
}: {
  subs: ScenarioSubmission[];
  scenarioMap: Map<string, Scenario>;
  loading: boolean;
  error: string | null;
  reviewerId: string;
  onReload: () => Promise<void>;
  reviewingSub: ScenarioSubmission | null;
  setReviewingSub: (s: ScenarioSubmission | null) => void;
  reviewFeedback: string;
  setReviewFeedback: (s: string) => void;
  reviewAction: 'approve' | 'reject' | null;
  setReviewAction: (a: 'approve' | 'reject' | null) => void;
  navigate: (page: import('@/types').PageId, params?: Record<string, string>) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleReview() {
    if (!reviewingSub || !reviewAction) return;
    setBusy(true);
    try {
      if (reviewAction === 'approve') {
        await approveScenarioSubmission(reviewingSub.id, reviewingSub.scenario_id, reviewerId, reviewFeedback || null);
      } else {
        await rejectScenarioSubmission(reviewingSub.id, reviewingSub.scenario_id, reviewerId, reviewFeedback || 'Rejected');
      }
      setReviewingSub(null);
      setReviewAction(null);
      setReviewFeedback('');
      await onReload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not review scenario.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading scenario submissions…</div>;
  }
  if (error) {
    return <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50"><AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" /><p className="text-sm text-error-700 dark:text-error-400">{error}</p></div>;
  }
  if (subs.length === 0) {
    return <EmptyState icon={<Sparkles className="w-7 h-7" />} title="No scenario submissions" description="Reader-created scenarios will appear here for review." />;
  }

  return (
    <>
      <ul className="space-y-3">
        {subs.map((sub) => {
          const sc = scenarioMap.get(sub.scenario_id);
          const style = STATUS_STYLE[sub.status];
          const StatusIcon = style.icon;
          return (
            <li key={sub.id}>
              <div className="glass-card w-full p-4 flex items-center gap-4 text-left">
                <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${sc?.cover_color ?? 'from-primary-700 to-secondary-800'} flex items-center justify-center flex-shrink-0`}>
                  <Sparkles className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{sc?.title ?? 'Unknown scenario'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {sc?.novel_title && `Based on ${sc.novel_title} · `}
                    {sub.submitter_username ?? 'Unknown reader'} · {new Date(sub.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`chip ${style.cls}`}><StatusIcon className="w-3 h-3" />{style.label}</span>
                  {sub.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setReviewingSub(sub); setReviewAction('approve'); setReviewFeedback(''); }}
                        className="chip bg-success-50 text-success-600 dark:bg-success-950/30 dark:text-success-400 hover:scale-105 transition-transform"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={() => { setReviewingSub(sub); setReviewAction('reject'); setReviewFeedback(''); }}
                        className="chip bg-error-50 text-error-600 dark:bg-error-950/30 dark:text-error-400 hover:scale-105 transition-transform"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  )}
                  {sc && (
                    <button onClick={() => navigate('scenario-play', { scenarioId: sc.id })} className="text-xs text-primary-500 hover:underline">
                      Preview
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Review modal */}
      {reviewingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in" onClick={() => { setReviewingSub(null); setReviewAction(null); }}>
          <div className="glass-card max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">
                {reviewAction === 'approve' ? 'Approve Scenario' : 'Reject Scenario'}
              </h3>
              <button onClick={() => { setReviewingSub(null); setReviewAction(null); }} className="btn-ghost !px-2 !py-2"><XCircle className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {reviewAction === 'approve'
                ? 'This scenario will be published and visible to all readers.'
                : 'Provide a reason for rejection. The creator will see this feedback.'}
            </p>
            <textarea
              value={reviewFeedback}
              onChange={(e) => setReviewFeedback(e.target.value)}
              placeholder={reviewAction === 'approve' ? 'Optional feedback for the creator…' : 'Reason for rejection…'}
              rows={3}
              className="input-field resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => { setReviewingSub(null); setReviewAction(null); }} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={handleReview}
                disabled={busy || (reviewAction === 'reject' && !reviewFeedback.trim())}
                className={`btn-primary flex-1 ${reviewAction === 'reject' ? '!bg-error-600 !from-error-600 !to-error-700' : ''}`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : reviewAction === 'approve' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {reviewAction === 'approve' ? 'Approve & Publish' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
