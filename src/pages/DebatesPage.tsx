import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Scale, Plus, Search, Loader2, AlertCircle, Users, Clock, MessageSquare,
  Radio, CalendarClock, DoorOpen, Trophy, Mail, Check, X, ChevronRight,
  Megaphone, History,
} from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import {
  DEBATE_CATEGORIES, getDebateList, getMyDebates, respondDebateInvitation,
  joinDebate, type DebateListItem, type MyDebates,
} from '@/lib/debates';

type Section = 'all' | 'live' | 'upcoming' | 'open' | 'completed';

const SECTIONS: { id: Section; label: string; icon: typeof Radio }[] = [
  { id: 'all', label: 'All', icon: Megaphone },
  { id: 'live', label: 'Live', icon: Radio },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarClock },
  { id: 'open', label: 'Open', icon: DoorOpen },
  { id: 'completed', label: 'Completed', icon: Trophy },
];

function statusChip(status: DebateListItem['status']) {
  const map: Record<DebateListItem['status'], { cls: string; label: string }> = {
    upcoming: { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', label: 'Upcoming' },
    live: { cls: 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400', label: 'Live' },
    voting: { cls: 'bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400', label: 'Voting' },
    completed: { cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300', label: 'Completed' },
    cancelled: { cls: 'bg-error-100 text-error-700 dark:bg-error-900/40 dark:text-error-400', label: 'Cancelled' },
  };
  const s = map[status];
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

export function DebatesPage() {
  const { navigate, authUser, authLoading, checkAchievements } = useApp();
  const [section, setSection] = useState<Section>('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debates, setDebates] = useState<DebateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myData, setMyData] = useState<MyDebates | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshMine = useCallback(async () => {
    if (!authUser) return;
    try {
      setMyData(await getMyDebates());
    } catch {
      // keep previous
    }
  }, [authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDebates(await getDebateList(section, category, search));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load debates.');
    } finally {
      setLoading(false);
    }
  }, [section, category, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!authUser) return;
    refreshMine();
  }, [authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLists = useCallback(async () => {
    await Promise.all([load(), refreshMine()]);
  }, [load, refreshMine]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!authUser) {
    return (
      <EmptyState
        icon={<Scale className="w-7 h-7" />}
        title="Sign in to enter the arena"
        description="The Debate Arena is for signed-in readers. Create an account to argue, vote, and earn XP."
        action={<button onClick={() => navigate('auth')} className="btn-primary">Sign in</button>}
      />
    );
  }

  async function handleRespond(invitationId: string, accept: boolean, side: string) {
    setBusy(true);
    setError(null);
    try {
      await respondDebateInvitation(invitationId, accept);
      if (accept && side === 'affirmative' || side === 'opposing') {
        // The invitation's debate is joined on accept via its side
      }
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not respond to the invitation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debate Arena"
        subtitle="Structured intellectual battles — argue, rebut, and win the audience"
        icon={<Scale className="w-6 h-6" />}
      />

      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 text-sm text-error-700 dark:text-error-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
        </div>
      )}

      {/* Pending invitations */}
      {myData && myData.invitations.length > 0 && (
        <section className="glass-card p-5 animate-fade-in-up">
          <div className="flex items-center gap-2.5 mb-4">
            <Mail className="w-5 h-5 text-primary-500" />
            <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">
              Debate Invitations ({myData.invitations.length})
            </h3>
          </div>
          <div className="space-y-2">
            {myData.invitations.map((inv) => (
              <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-primary-50/50 dark:bg-primary-950/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{inv.debate_title}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {inv.inviter_username} wants you on the {inv.side === 'affirmative' ? 'affirmative' : 'opposing'} side
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await respondDebateInvitation(inv.id, true);
                        await joinDebate(inv.debate_id, inv.side as 'affirmative' | 'opposing');
                        await refreshLists();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Could not join.');
                      } also { setBusy(false); }
                    }}
                    disabled={busy}
                    className="btn-primary !py-2 !px-4 text-xs"
                  >
                    Accept & Join
                  </button>
                  <button onClick={() => handleRespond(inv.id, false, inv.side)} disabled={busy} className="btn-ghost !py-2 !px-4 text-xs text-error-500">
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section tabs + create */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                section === s.id
                  ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={() => navigate('debate-create')} className="btn-primary flex-shrink-0">
          <Plus className="w-4 h-4" /> Create Debate
        </button>
      </div>

      {/* Search + category */}
      <div className="grid sm:grid-cols-2 gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="relative"
        >
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search debates…"
            className="input-field pl-10"
          />
        </form>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
          <option value="">All categories</option>
          {DEBATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Debate list */}
      {loading ? (
        <div className="glass-card p-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : debates.length === 0 ? (
        <EmptyState
          icon={<Scale className="w-6 h-6" />}
          title="No debates here yet"
          description="Be the first to stage a debate — pick a motion, set the rules, and invite worthy opponents."
          action={<button onClick={() => navigate('debate-create')} className="btn-primary"><Plus className="w-4 h-4" /> Create Debate</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {debates.map((d) => {
            const hasVacancy = d.affirmative_count < d.max_per_side || d.opposing_count < d.max_per_side;
            return (
              <button
                key={d.id}
                onClick={() => navigate('debate-room', { debateId: d.id })}
                className="glass-card p-5 text-left hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 animate-fade-in-up"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="chip bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300">{d.category}</span>
                  {statusChip(d.status)}
                </div>
                <h3 className="font-display font-bold text-slate-800 dark:text-slate-100 leading-snug">{d.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{d.motion}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{d.affirmative_count + d.opposing_count} debaters</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />{d.argument_count} arguments</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{Math.round(d.speaking_seconds / 60)}min/side</span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-400 dark:text-slate-500">by {d.creator_username}</span>
                  {hasVacancy && d.status === 'upcoming' && (
                    <span className="text-xs font-bold text-success-600 dark:text-success-400">Open for debaters</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* My debates */}
      {myData && (myData.mine.length > 0 || myData.moderating.length > 0) && (
        <section>
          <div className="flex items-center gap-2.5 mb-3">
            <History className="w-4 h-4 text-primary-500" />
            <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">My Debates</h3>
          </div>
          <div className="glass-card overflow-hidden">
            <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {[...myData.mine, ...myData.moderating].slice(0, 8).map((d, i) => (
                <button
                  key={`${d.id}-${i}`}
                  onClick={() => navigate('debate-room', { debateId: d.id })}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{d.title}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {d.status === 'live' ? `Round ${d.current_round} in progress` :
                       d.status === 'voting' ? 'Audience voting open' :
                       d.status === 'completed' ? 'Completed' : 'Waiting to start'}
                    </p>
                  </div>
                  {statusChip(d.status as DebateListItem['status'])}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
