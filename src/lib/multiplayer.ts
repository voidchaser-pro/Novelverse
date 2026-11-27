import { supabase } from '@/lib/supabase';

function requireClient() {
  if (!supabase) throw new Error('The database is not configured.');
  return supabase;
}

export interface MpRoomRow {
  id: string;
  code: string;
  host_id: string;
  quiz_id: string;
  status: 'lobby' | 'question' | 'finished' | 'ended';
  is_private: boolean;
  max_players: number;
  question_count: number;
  per_question_seconds: number;
  match_number: number;
  current_question_index: number;
  question_ends_at: string | null;
}

export interface MpParticipant {
  user_id: string;
  username: string;
  level: number;
  score: number;
  joined_at: string;
  left_at: string | null;
  last_seen_at: string;
}

export interface MpCurrentQuestion {
  position: number;
  question_id: string;
  question: string;
  options: string[];
  xp: number;
  ends_at: string;
}

export interface MpRevealedAnswer {
  user_id: string;
  selected_index: number;
  is_correct: boolean;
  points: number;
}

export interface MpRevealedQuestion {
  position: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  answers: MpRevealedAnswer[];
}

export interface MpResult {
  user_id: string;
  username: string;
  rank: number;
  score: number;
  xp_awarded: number;
  is_winner: boolean;
}

export interface MpRoomState {
  server_now: string;
  room: MpRoomRow;
  quiz: { id: string; title: string; difficulty: string; cover_color: string } | null;
  participants: MpParticipant[];
  me_answered: boolean;
  my_points: number;
  current_question: MpCurrentQuestion | null;
  revealed: MpRevealedQuestion[];
  total_questions: number;
  results: MpResult[] | null;
}

export interface MpHistoryEntry {
  room_id: string;
  match_number: number;
  quiz_title: string;
  rank: number;
  score: number;
  xp_awarded: number;
  is_winner: boolean;
  played_at: string;
}

export interface MpInvitation {
  id: string;
  room_id: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  room?: { code: string; quiz_title?: string } | null;
  inviter?: { username: string } | null;
}

export interface PublicRoom {
  id: string;
  code: string;
  host_id: string;
  quiz_id: string;
  status: string;
  max_players: number;
  question_count: number;
  per_question_seconds: number;
  host_username?: string;
  quiz_title?: string;
  player_count?: number;
}

export async function createRoom(opts: {
  quizId: string;
  isPrivate: boolean;
  maxPlayers: number;
  questionCount: number;
  perQuestionSeconds: number;
}): Promise<MpRoomRow> {
  const client = requireClient();
  const { data, error } = await client.rpc('create_mp_room', {
    p_quiz_id: opts.quizId,
    p_is_private: opts.isPrivate,
    p_max_players: opts.maxPlayers,
    p_question_count: opts.questionCount,
    p_per_question_seconds: opts.perQuestionSeconds,
  });
  if (error) throw new Error(error.message);
  return data as MpRoomRow;
}

export async function joinRoom(code: string): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc('join_mp_room', { p_code: code });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function leaveRoom(roomId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('leave_mp_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function heartbeat(roomId: string): Promise<void> {
  const client = requireClient();
  await client.rpc('heartbeat_mp', { p_room_id: roomId });
}

export async function inviteToRoom(roomId: string, username: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('invite_to_mp_room', { p_room_id: roomId, p_username: username });
  if (error) throw new Error(error.message);
}

export async function respondToInvitation(invitationId: string, accept: boolean): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('respond_mp_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

export async function startMatch(roomId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('start_mp_match', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function submitAnswer(roomId: string, selectedIndex: number): Promise<number> {
  const client = requireClient();
  const { data, error } = await client.rpc('submit_mp_answer', {
    p_room_id: roomId,
    p_selected_index: selectedIndex,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function advanceQuestion(roomId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('advance_mp_question', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function endMatch(roomId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('end_mp_match', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function resetRoom(roomId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('reset_mp_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function getRoomState(roomId: string): Promise<MpRoomState> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_mp_room_state', { p_room_id: roomId });
  if (error) throw new Error(error.message);
  return data as unknown as MpRoomState;
}

export async function getMyHistory(): Promise<MpHistoryEntry[]> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_my_mp_history');
  if (error) throw new Error(error.message);
  return (data as unknown as MpHistoryEntry[]) ?? [];
}

export async function fetchMyInvitations(): Promise<MpInvitation[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('mp_invitations')
    .select(`
      id, room_id, inviter_id, invitee_id, status, created_at,
      room:mp_rooms!mp_invitations_room_id_fkey(code),
      inviter:profiles!mp_invitations_inviter_id_fkey(username)
    `)
    .eq('invitee_id', (await client.auth.getUser()).data.user?.id ?? '')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MpInvitation[]).map((row) => ({
    ...row,
    room: Array.isArray(row.room) ? row.room[0] : row.room,
    inviter: Array.isArray(row.inviter) ? row.inviter[0] : row.inviter,
  }));
}

export async function fetchPublicRooms(): Promise<PublicRoom[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('mp_rooms')
    .select(`
      id, code, host_id, quiz_id, status, max_players, question_count, per_question_seconds,
      host:host_id, quiz:quiz_id
    `)
    .eq('is_private', false)
    .eq('status', 'lobby')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as {
    id: string; code: string; host_id: string; quiz_id: string; status: string;
    max_players: number; question_count: number; per_question_seconds: number;
    host: { username: string } | { username: string }[] | null;
    quiz: { title: string } | { title: string }[] | null;
  }[]).map((row) => {
    const host = Array.isArray(row.host) ? row.host[0] : row.host;
    const quiz = Array.isArray(row.quiz) ? row.quiz[0] : row.quiz;
    return {
      id: row.id,
      code: row.code,
      host_id: row.host_id,
      quiz_id: row.quiz_id,
      status: row.status,
      max_players: row.max_players,
      question_count: row.question_count,
      per_question_seconds: row.per_question_seconds,
      host_username: host?.username,
      quiz_title: quiz?.title,
    };
  });

  if (rows.length === 0) return [];

  const { data: counts, error: countError } = await client
    .from('mp_participants')
    .select('room_id, left_at');
  if (countError) throw new Error(countError.message);
  const countMap = new Map<string, number>();
  ((counts ?? []) as { room_id: string; left_at: string | null }[]).forEach((c) => {
    if (!c.left_at) countMap.set(c.room_id, (countMap.get(c.room_id) ?? 0) + 1);
  });

  return rows.map((r) => ({ ...r, player_count: countMap.get(r.id) ?? 0 }));
}

export function subscribeToRoom(
  roomId: string,
  onChange: () => void
): () => void {
  const client = requireClient();
  const channel = client
    .channel(`mp-room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mp_rooms', filter: `id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mp_participants', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mp_answers', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mp_results', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

export function subscribeToInvitations(
  userId: string,
  onChange: () => void
): () => void {
  const client = requireClient();
  const channel = client
    .channel(`mp-invites-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mp_invitations', filter: `invitee_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
