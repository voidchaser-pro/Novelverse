import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Swords,
  Users,
  ChevronLeft,
  Check,
  X,
  Zap,
  Trophy,
  Crown,
  Copy,
  Play,
  DoorClosed,
  Loader2,
  AlertCircle,
  Plus,
  KeyRound,
  Lock,
  Globe,
  History,
  Mail,
  Clock,
  CircleDot,
  RotateCcw,
  Crown as CrownIcon,
} from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { fetchQuizzesWithMeta, type QuizWithMeta } from '@/lib/quizzes';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  heartbeat,
  inviteToRoom,
  respondToInvitation,
  startMatch,
  submitAnswer,
  advanceQuestion,
  endMatch,
  resetRoom,
  getRoomState,
  getMyHistory,
  fetchMyInvitations,
  fetchPublicRooms,
  subscribeToRoom,
  subscribeToInvitations,
  type MpRoomState,
  type MpHistoryEntry,
  type MpInvitation,
  type PublicRoom,
} from '@/lib/multiplayer';

type View = 'home' | 'room' | 'match' | 'results';

export function MultiplayerPage() {
  const { navigate, authUser, authLoading, checkAchievements, refreshAuthUser } = useApp();
  const [view, setView] = useState<View>('home');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [quizzes, setQuizzes] = useState<QuizWithMeta[]>([]);
  const [quizId, setQuizId] = useState<string>('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [questionCount, setQuestionCount] = useState(5);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(20);

  const [joinCode, setJoinCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [invitations, setInvitations] = useState<MpInvitation[]>([]);
  const [history, setHistory] = useState<MpHistoryEntry[]>([]);
  const [listsLoading, setListsLoading] = useState(true);

  const [roomState, setRoomState] = useState<MpRoomState | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isHost = roomState ? roomState.room.host_id === authUser?.id : false;

  const refreshLists = useCallback(async () => {
    if (!authUser) {
      setListsLoading(false);
      return;
    }
    try {
      const [rooms, invites, hist] = await Promise.all([
        fetchPublicRooms().catch(() => []),
        fetchMyInvitations().catch(() => []),
        getMyHistory().catch(() => []),
      ]);
      setPublicRooms(rooms);
      setInvitations(invites);
      setHistory(hist);
    } finally {
      setListsLoading(false);
    }
  }, [authUser]);

  const loadRoomState = useCallback(async (id: string) => {
    const state = await getRoomState(id);
    setRoomState(state);
    const serverMs = new Date(state.server_now + (state.server_now.endsWith('Z') ? '' : 'Z')).getTime();
    setServerOffset(serverMs - Date.now());
    return state;
  }, []);

  // Load home lists + quiz picker + realtime invitation subscription
  useEffect(() => {
    fetchQuizzesWithMeta()
      .then((list) => {
        setQuizzes(list);
        if (list.length > 0) setQuizId((prev) => prev || list[0].id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!authUser) return;
    refreshLists();
    const unsub = subscribeToInvitations(authUser.id, () => refreshLists());
    return unsub;
  }, [authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Room view: subscribe to realtime, heartbeat, tick clock
  useEffect(() => {
    if (!roomId || view === 'home') return;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const pull = async () => {
      try {
        await loadRoomState(roomId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Lost connection to the room.');
      }
    };
    pull();

    unsub = subscribeToRoom(roomId, pull);

    heartbeatTimer.current = setInterval(() => {
      heartbeat(roomId).catch(() => undefined);
    }, 15000);

    return () => {
      cancelled = true;
      unsub?.();
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [roomId, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock tick for the question countdown
  useEffect(() => {
    if (view !== 'match') return;
    const t = setInterval(() => setNowTick(Date.now() + serverOffset), 250);
    return () => clearInterval(t);
  }, [view, serverOffset]);

  // Auto-advance when the question window closes (any client can trigger, server decides)
  useEffect(() => {
    if (view !== 'match' || !roomId || !roomState) return;
    if (roomState.room.status !== 'question' || !roomState.room.question_ends_at) return;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    const endsMs = new Date(roomState.room.question_ends_at).getTime();
    const delay = Math.max(1500, endsMs - (Date.now() + serverOffset) + 1500);
    advanceTimer.current = setTimeout(() => {
      advanceQuestion(roomId).catch(() => undefined);
    }, delay);
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [view, roomId, roomState?.room.status, roomState?.room.current_question_index, roomState?.room.question_ends_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transition between views based on room status
  useEffect(() => {
    if (!roomState) return;
    const status = roomState.room.status;
    if (status === 'question') {
      setSelectedIndex(null);
      setView('match');
    } else if (status === 'finished') {
      setView('results');
    } else if (status === 'lobby') {
      setView('room');
    }
  }, [roomState?.room.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
        icon={<Swords className="w-7 h-7" />}
        title="Sign in to compete"
        description="Multiplayer battles are for signed-in readers. Create an account to host or join rooms."
        action={<button onClick={() => navigate('auth')} className="btn-primary">Sign in</button>}
      />
    );
  }

  async function handleCreateRoom() {
    if (!quizId) {
      setError('Pick a quiz for the match first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom({
        quizId,
        isPrivate: isPrivate,
        maxPlayers,
        questionCount,
        perQuestionSeconds,
      });
      setRoomId(room.id);
      await loadRoomState(room.id);
      setView('room');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the room.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinRoom(code: string) {
    setBusy(true);
    setError(null);
    try {
      const id = await joinRoom(code);
      setRoomId(id);
      await loadRoomState(id);
      setView('room');
      refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join this room.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLeaveRoom() {
    if (!roomId) return;
    setBusy(true);
    try {
      await leaveRoom(roomId);
    } catch {
      // room may already be gone
    }
    setRoomId(null);
    setRoomState(null);
    setView('home');
    refreshLists();
    setBusy(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId || !inviteUsername.trim()) return;
    setInviteMessage(null);
    setBusy(true);
    try {
      await inviteToRoom(roomId, inviteUsername.trim());
      setInviteMessage(`Invitation sent to ${inviteUsername.trim()}.`);
      setInviteUsername('');
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : 'Could not send the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRespondInvitation(invitationId: string, accept: boolean) {
    setBusy(true);
    try {
      await respondToInvitation(invitationId, accept);
      if (accept) {
        const invitation = invitations.find((i) => i.id === invitationId);
        if (invitation) await handleJoinRoom(invitation.room?.code ?? '');
        return;
      }
      refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not respond to the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartMatch() {
    if (!roomId) return;
    setBusy(true);
    setError(null);
    try {
      await startMatch(roomId);
      await loadRoomState(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the match.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswer(index: number) {
    if (!roomId || submitting || roomState?.me_answered) return;
    setSubmitting(true);
    setSelectedIndex(index);
    try {
      await submitAnswer(roomId, index);
      await loadRoomState(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the answer.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNextQuestion() {
    if (!roomId) return;
    setBusy(true);
    try {
      await advanceQuestion(roomId);
      await loadRoomState(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the next question.');
    } finally {
      setBusy(false);
    }
  }

  async function handleEndMatch() {
    if (!roomId) return;
    setBusy(true);
    try {
      await endMatch(roomId);
      await loadRoomState(roomId);
      checkAchievements().catch(() => undefined);
      refreshAuthUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end the match.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRematch() {
    if (!roomId) return;
    setBusy(true);
    try {
      await resetRoom(roomId);
      await loadRoomState(roomId);
      setView('room');
      checkAchievements().catch(() => undefined);
      refreshAuthUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set up the rematch.');
    } finally {
      setBusy(false);
    }
  }

  // ============================== MATCH VIEW ==============================
  if (view === 'match' && roomState) {
    const q = roomState.current_question;
    const endsMs = roomState.room.question_ends_at ? new Date(roomState.room.question_ends_at).getTime() : 0;
    const startedMs = endsMs - roomState.room.per_question_seconds * 1000;
    const remaining = Math.max(0, Math.ceil((endsMs - (Date.now() + serverOffset)) / 1000));
    const totalSecs = roomState.room.per_question_seconds;
    const revealedForCurrent = roomState.revealed.find((r) => r.position === roomState.room.current_question_index);
    const timeUp = remaining <= 0 || !!revealedForCurrent;

    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between animate-fade-in">
          <button onClick={handleLeaveRoom} className="btn-ghost text-sm">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Forfeit & Leave</span>
          </button>
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
            Question {(roomState.room.current_question_index ?? 0) + 1} / {roomState.total_questions}
          </span>
          {isHost && (
            <button onClick={handleEndMatch} disabled={busy} className="btn-ghost text-sm text-error-500">
              <DoorClosed className="w-4 h-4" />
              <span className="hidden sm:inline">End</span>
            </button>
          )}
        </div>

        {/* Live scoreboard */}
        <div className={`grid gap-3 ${roomState.participants.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {roomState.participants.filter((p) => !p.left_at).map((p) => {
            const ans = revealedForCurrent?.answers.find((a) => a.user_id === p.user_id);
            const meAnswered = p.user_id === authUser?.id ? roomState.me_answered : !!ans;
            return (
              <div key={p.user_id} className={`glass-card p-3 text-center relative overflow-hidden ${p.user_id === authUser?.id ? 'ring-2 ring-primary-400/50' : ''}`}>
                <p className="text-xs font-semibold truncate text-slate-700 dark:text-slate-200">
                  {p.username}{p.user_id === authUser?.id ? ' (You)' : ''}
                </p>
                <p className="text-sm font-bold text-primary-600 dark:text-primary-400 mt-0.5">{p.score} XP</p>
                {meAnswered && (
                  <div className="absolute top-1.5 right-1.5">
                    {revealedForCurrent && ans ? (
                      ans.is_correct ? <Check className="w-4 h-4 text-success-500" /> : <X className="w-4 h-4 text-error-500" />
                    ) : (
                      <CircleDot className="w-4 h-4 text-primary-400 animate-pulse" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Timer bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-250 ease-linear ${
                remaining <= 5 ? 'bg-error-500' : remaining <= 10 ? 'bg-warning-500' : 'bg-gradient-to-r from-primary-500 to-accent-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, ((Date.now() + serverOffset - startedMs) / (totalSecs * 1000)) * 100))}%` }}
            />
          </div>
          <span className={`text-sm font-bold flex-shrink-0 ${remaining <= 5 ? 'text-error-500' : 'text-slate-500 dark:text-slate-400'}`}>
            {remaining}s
          </span>
        </div>

        {/* Question */}
        {q && (
          <div key={q.position} className="glass-card p-6 sm:p-8 animate-scale-in">
            <h2 className="font-display font-bold text-lg sm:text-xl text-slate-800 dark:text-slate-100 leading-snug text-balance">
              {q.question}
            </h2>
            <div className="grid gap-3 mt-6">
              {q.options.map((option, index) => {
                const isSelected = selectedIndex === index;
                const reveal = revealedForCurrent;
                const myAns = reveal?.answers.find((a) => a.user_id === authUser?.id);
                const isCorrect = reveal ? index === reveal.correct_index : false;
                const iGotIt = reveal && myAns?.is_correct;

                let stateClass = 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-950/20';
                if (reveal && isCorrect) {
                  stateClass = 'border-success-400 bg-success-50 dark:bg-success-950/30 dark:border-success-700';
                } else if (reveal && isSelected && !isCorrect) {
                  stateClass = 'border-error-400 bg-error-50 dark:bg-error-950/30 dark:border-error-700 animate-shake';
                } else if (reveal) {
                  stateClass = 'border-slate-200 dark:border-slate-800 opacity-50';
                } else if (roomState.me_answered) {
                  stateClass = isSelected ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/30' : 'opacity-40';
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswer(index)}
                    disabled={roomState.me_answered || timeUp || submitting}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 ${stateClass} ${!(roomState.me_answered || timeUp) ? 'active:scale-[0.99]' : ''}`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                      reveal && isCorrect ? 'bg-success-500 text-white' :
                      reveal && isSelected && !isCorrect ? 'bg-error-500 text-white' :
                      'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {reveal && isCorrect ? <Check className="w-4 h-4" /> :
                       reveal && isSelected && !isCorrect ? <X className="w-4 h-4" /> :
                       String.fromCharCode(65 + index)}
                    </span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{option}</span>
                  </button>
                );
              })}
            </div>

            {/* Waiting / result banners */}
            {roomState.me_answered && !timeUp && (
              <div className="mt-5 flex items-center gap-2.5 p-3.5 rounded-xl bg-primary-50 dark:bg-primary-950/30">
                <Check className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <p className="text-sm text-primary-700 dark:text-primary-400">
                  Answer locked{roomState.my_points > 0 ? ` · +${roomState.my_points} points` : ''}. Waiting for the others…
                </p>
              </div>
            )}

            {timeUp && revealedForCurrent && (
              <div className={`mt-5 p-4 rounded-xl animate-fade-in-up ${
                revealedForCurrent.answers.find((a) => a.user_id === authUser?.id)?.is_correct
                  ? 'bg-success-50 dark:bg-success-950/30'
                  : 'bg-error-50 dark:bg-error-950/30'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    revealedForCurrent.answers.find((a) => a.user_id === authUser?.id)?.is_correct
                      ? 'bg-success-500 text-white' : 'bg-error-500 text-white'
                  }`}>
                    {revealedForCurrent.answers.find((a) => a.user_id === authUser?.id)?.is_correct
                      ? <Crown className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-700 dark:text-slate-200">
                      {revealedForCurrent.answers.find((a) => a.user_id === authUser?.id)?.is_correct
                        ? `Correct! +${revealedForCurrent.answers.find((a) => a.user_id === authUser?.id)?.points} points`
                        : 'Not this time!'}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{revealedForCurrent.explanation}</p>
                  </div>
                </div>
                {isHost && (
                  <button onClick={handleNextQuestion} disabled={busy} className="btn-primary w-full mt-4">
                    Next Question
                  </button>
                )}
                {!isHost && roomState.participants.filter((p) => !p.left_at).every((p) =>
                  revealedForCurrent.answers.some((a) => a.user_id === p.user_id)
                ) && !isHost && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">Loading next question…</p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 text-sm text-error-700 dark:text-error-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
          </div>
        )}
      </div>
    );
  }

  // ============================== RESULTS VIEW ==============================
  if (view === 'results' && roomState?.results) {
    const winner = roomState.results.find((r) => r.rank === 1);
    const iWon = winner?.user_id === authUser?.id;

    return (
      <div className="max-w-2xl mx-auto animate-fade-in-up space-y-6">
        <div className="glass-card p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-10" />
          {iWon && <div className="absolute top-4 left-1/2 -translate-x-1/2"><Crown className="w-8 h-8 text-amber-400 animate-bounce-in" /></div>}

          <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-4 mt-4 ${iWon ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30 animate-pulse-glow' : 'bg-gradient-to-br from-slate-400 to-slate-600 shadow-lg'}`}>
            <Trophy className="w-10 h-10 text-white" />
          </div>

          <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-800 dark:text-slate-100">
            {iWon ? 'Victory!' : 'Good Match!'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {iWon ? 'You dominated the arena!' : `${winner?.username ?? 'Someone'} took the crown this round.`}
          </p>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-800/60">
            <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">Final Standings</h3>
          </div>
          <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
            {roomState.results.map((r, i) => (
              <div key={r.user_id} className={`flex items-center gap-3 p-4 ${r.user_id === authUser?.id ? 'bg-primary-50/50 dark:bg-primary-950/20' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                  i === 1 ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                  i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${r.user_id === authUser?.id ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {r.username}{r.user_id === authUser?.id ? ' (You)' : ''}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Score: {r.score}</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-bold text-primary-600 dark:text-primary-400 flex-shrink-0">
                  <Zap className="w-4 h-4" />+{r.xp_awarded}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isHost ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={handleRematch} disabled={busy} className="btn-outline">
              <RotateCcw className="w-4 h-4" /> Rematch
            </button>
            <button onClick={handleLeaveRoom} className="btn-primary">
              Back to Arena
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button onClick={handleLeaveRoom} className="btn-primary">Back to Arena</button>
          </div>
        )}
      </div>
    );
  }

  // ============================== ROOM (LOBBY) VIEW ==============================
  if (view === 'room' && roomState) {
    const active = roomState.participants.filter((p) => !p.left_at);
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={handleLeaveRoom} className="btn-ghost text-sm">
            <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Leave</span>
          </button>
          <span className={`chip ${roomState.room.is_private ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400' : 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400'}`}>
            {roomState.room.is_private ? <><Lock className="w-3 h-3" /> Private</> : <><Globe className="w-3 h-3" /> Public</>}
          </span>
        </div>

        <div className="glass-card p-6 sm:p-8 text-center relative overflow-hidden animate-fade-in-up">
          <div className="absolute inset-0 bg-grid-pattern opacity-10" />
          <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 font-bold">Room Code</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="font-display font-extrabold text-4xl sm:text-5xl tracking-[0.3em] gradient-text">{roomState.room.code}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(roomState.room.code)}
              className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/40 text-primary-500 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/60 transition-colors"
              title="Copy code"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
            {roomState.quiz?.title} · {roomState.total_questions || roomState.room.question_count} questions · {roomState.room.per_question_seconds}s each
          </p>
        </div>

        {/* Players */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">
              Players ({active.length}/{roomState.room.max_players})
            </h3>
            {isHost && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"><CrownIcon className="w-3 h-3" /> You host</span>}
          </div>
          <div className="space-y-2">
            {active.map((p) => (
              <div key={p.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {p.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {p.username}{p.user_id === authUser?.id ? ' (You)' : ''}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Level {p.level}</p>
                </div>
                {roomState.room.host_id === p.user_id && (
                  <CrownIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Host controls */}
        {isHost && (
          <div className="glass-card p-5 space-y-4">
            <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">Host Controls</h3>

            <form onSubmit={handleInvite} className="flex gap-2">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Invite by username…"
                className="input-field flex-1"
              />
              <button type="submit" disabled={busy || !inviteUsername.trim()} className="btn-outline flex-shrink-0">
                <Mail className="w-4 h-4" /> Invite
              </button>
            </form>
            {inviteMessage && <p className="text-xs text-slate-500 dark:text-slate-400">{inviteMessage}</p>}

            <button onClick={handleStartMatch} disabled={busy || active.length < 2} className="btn-primary w-full">
              <Play className="w-4 h-4" />
              {active.length < 2 ? 'Need at least 2 players' : 'Start Match'}
            </button>
          </div>
        )}

        {!isHost && (
          <div className="glass-card p-5 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Waiting for the host to start the match…</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 text-sm text-error-700 dark:text-error-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
          </div>
        )}
      </div>
    );
  }

  // ============================== HOME VIEW ==============================
  return (
    <div className="space-y-6">
      <PageHeader title="Multiplayer Arena" subtitle="Real-time quiz battles against other readers" icon={<Swords className="w-6 h-6" />} />

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <section className="glass-card p-5 animate-fade-in-up">
          <div className="flex items-center gap-2.5 mb-4">
            <Mail className="w-5 h-5 text-primary-500" />
            <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">
              Invitations ({invitations.length})
            </h3>
          </div>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-primary-50/50 dark:bg-primary-950/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {inv.inviter?.username ?? 'Someone'} invited you to room <span className="font-mono font-bold text-primary-600 dark:text-primary-400">{inv.room?.code}</span>
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(inv.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleRespondInvitation(inv.id, true)} disabled={busy} className="btn-primary !py-2 !px-4 text-xs">Accept</button>
                  <button onClick={() => handleRespondInvitation(inv.id, false)} disabled={busy} className="btn-ghost !py-2 !px-4 text-xs text-error-500">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create / Join */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Create room */}
        <div className="glass-card p-5 sm:p-6 space-y-4 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <Plus className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Create a Room</h3>
          </div>

          <select value={quizId} onChange={(e) => setQuizId(e.target.value)} className="input-field">
            <option value="">Choose a quiz…</option>
            {quizzes.map((qz) => (
              <option key={qz.id} value={qz.id}>{qz.title}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Players</span>
              <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} className="input-field mt-1">
                {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Questions</span>
              <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="input-field mt-1">
                {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Seconds / question</span>
              <select value={perQuestionSeconds} onChange={(e) => setPerQuestionSeconds(Number(e.target.value))} className="input-field mt-1">
                {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Visibility</span>
              <select value={isPrivate ? 'private' : 'public'} onChange={(e) => setIsPrivate(e.target.value === 'private')} className="input-field mt-1">
                <option value="public">Public</option>
                <option value="private">Private (invite only)</option>
              </select>
            </label>
          </div>

          <button onClick={handleCreateRoom} disabled={busy || !quizId} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> Create Room
          </button>
        </div>

        {/* Join room */}
        <div className="glass-card p-5 sm:p-6 space-y-4 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-secondary-500 to-primary-600 flex items-center justify-center text-white shadow-lg shadow-secondary-500/30">
              <KeyRound className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Join with Code</h3>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (joinCode.trim().length >= 4) handleJoinRoom(joinCode.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              className="input-field flex-1 font-mono font-bold tracking-widest text-center uppercase"
            />
            <button type="submit" disabled={busy || joinCode.trim().length < 4} className="btn-primary flex-shrink-0">
              Join
            </button>
          </form>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Enter the 6-character code a friend shared, or pick a public room below.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 text-sm text-error-700 dark:text-error-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
        </div>
      )}

      {/* Public rooms */}
      <section>
        <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200 mb-3">Public Rooms</h3>
        {listsLoading ? (
          <div className="glass-card p-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : publicRooms.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No public rooms right now — create one and share the code.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {publicRooms.map((room) => {
              const full = (room.player_count ?? 0) >= room.max_players;
              return (
                <div key={room.id} className="glass-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary-500 to-primary-600 flex items-center justify-center text-white flex-shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{room.quiz_title ?? 'Quiz match'}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Host {room.host_username ?? 'Unknown'} · {room.player_count}/{room.max_players} players · {room.question_count} Qs · {room.per_question_seconds}s
                    </p>
                  </div>
                  <button
                    onClick={() => handleJoinRoom(room.code)}
                    disabled={busy || full}
                    className="btn-outline !py-2 !px-4 text-xs flex-shrink-0"
                  >
                    {full ? 'Full' : 'Join'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Match history */}
      <section>
        <div className="flex items-center gap-2.5 mb-3">
          <History className="w-4 h-4 text-primary-500" />
          <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">Your Match History</h3>
        </div>
        {history.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No matches played yet. Your results will appear here.
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {history.slice(0, 10).map((h) => (
                <div key={`${h.room_id}-${h.match_number}`} className="flex items-center gap-3 p-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    h.is_winner ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {h.is_winner ? <Trophy className="w-4 h-4" /> : `#${h.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{h.quiz_title}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Rank #{h.rank} · {h.score} points · {new Date(h.played_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-primary-600 dark:text-primary-400 flex items-center gap-1 flex-shrink-0">
                    <Zap className="w-3.5 h-3.5" />+{h.xp_awarded}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
