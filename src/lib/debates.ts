import { supabase } from '@/lib/supabase';

function requireClient() {
  if (!supabase) throw new Error('The database is not configured.');
  return supabase;
}

export const DEBATE_CATEGORIES = [
  'Literature',
  'Science',
  'Technology',
  'Philosophy',
  'History',
  'Education',
  'Society',
  'General Knowledge',
  'Novel-Inspired',
] as const;

export interface DebateListItem {
  id: string;
  title: string;
  category: string;
  motion: string;
  status: 'upcoming' | 'live' | 'voting' | 'completed' | 'cancelled';
  visibility: 'public' | 'private';
  affirmative_label: string;
  opposing_label: string;
  max_per_side: number;
  round_count: number;
  speaking_seconds: number;
  voting_hours: number;
  scheduled_at: string | null;
  creator_id: string;
  creator_username: string;
  current_round: number;
  voting_ends_at: string | null;
  completed_at: string | null;
  created_at: string;
  affirmative_count: number;
  opposing_count: number;
  argument_count: number;
}

export interface DebateParticipant {
  user_id: string;
  username: string;
  level: number;
  side: 'affirmative' | 'opposing';
  is_moderator: boolean;
  argument_count: number;
}

export interface DebateArgument {
  id: string;
  round_number: number;
  side: 'affirmative' | 'opposing';
  user_id: string;
  username: string;
  kind: 'opening' | 'argument' | 'rebuttal' | 'closing';
  body: string;
  created_at: string;
}

export interface DebateResult {
  winning_side: 'affirmative' | 'opposing' | 'tie';
  affirmative_votes: number;
  opposing_votes: number;
  duration_seconds: number;
}

export interface DebateState {
  server_now: string;
  debate: {
    id: string;
    title: string;
    description: string;
    category: string;
    motion: string;
    affirmative_label: string;
    opposing_label: string;
    max_per_side: number;
    speaking_seconds: number;
    round_count: number;
    voting_hours: number;
    visibility: 'public' | 'private';
    status: 'upcoming' | 'live' | 'voting' | 'completed' | 'cancelled';
    creator_id: string;
    host_mode: 'host' | 'participant';
    scheduled_at: string | null;
    current_round: number;
    current_side: 'affirmative' | 'opposing' | null;
    turn_ends_at: string | null;
    voting_ends_at: string | null;
    completed_at: string | null;
    created_at: string;
  };
  is_moderator: boolean;
  my_side: 'affirmative' | 'opposing' | null;
  i_spoke_this_round: boolean;
  i_voted: boolean;
  participants: DebateParticipant[];
  arguments: DebateArgument[];
  side_counts: { affirmative: number; opposing: number };
  results: DebateResult | null;
}

export interface MyDebates {
  mine: {
    id: string;
    title: string;
    status: string;
    category: string;
    motion: string;
    role: 'creator' | 'debater';
    my_side: string | null;
    current_round: number;
    round_count: number;
    affirmative_label: string;
    opposing_label: string;
    completed_at: string | null;
    created_at: string;
  }[];
  moderating: { id: string; title: string; status: string; category: string; motion: string }[];
  invitations: {
    id: string;
    debate_id: string;
    side: string;
    debate_title: string;
    inviter_username: string;
    created_at: string;
  }[];
  history: {
    debate_id: string;
    title: string;
    category: string;
    my_side: string;
    winning_side: string;
    affirmative_votes: number;
    opposing_votes: number;
    argument_count: number;
    completed_at: string;
  }[];
}

export interface CreateDebateInput {
  title: string;
  description: string;
  category: string;
  motion: string;
  affirmativeLabel: string;
  opposingLabel: string;
  maxPerSide: number;
  speakingSeconds: number;
  roundCount: number;
  votingHours: number;
  isPrivate: boolean;
  hostMode: 'host' | 'participant';
  side: 'affirmative' | 'opposing';
  scheduledAt: string | null;
}

export async function createDebate(input: CreateDebateInput): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc('create_debate', {
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_motion: input.motion,
    p_affirmative_label: input.affirmativeLabel,
    p_opposing_label: input.opposingLabel,
    p_max_per_side: input.maxPerSide,
    p_speaking_seconds: input.speakingSeconds,
    p_round_count: input.roundCount,
    p_voting_hours: input.votingHours,
    p_is_private: input.isPrivate,
    p_host_mode: input.hostMode,
    p_side: input.side,
    p_scheduled_at: input.scheduledAt,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function joinDebate(debateId: string, side: 'affirmative' | 'opposing'): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('join_debate', { p_debate_id: debateId, p_side: side });
  if (error) throw new Error(error.message);
}

export async function leaveDebate(debateId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('leave_debate', { p_debate_id: debateId });
  if (error) throw new Error(error.message);
}

export async function inviteToDebate(debateId: string, username: string, side: 'affirmative' | 'opposing'): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('invite_to_debate', {
    p_debate_id: debateId,
    p_username: username,
    p_side: side,
  });
  if (error) throw new Error(error.message);
}

export async function respondDebateInvitation(invitationId: string, accept: boolean): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('respond_debate_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

export async function startDebate(debateId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('start_debate', { p_debate_id: debateId });
  if (error) throw new Error(error.message);
}

export async function submitDebateArgument(
  debateId: string,
  body: string,
  kind: 'opening' | 'argument' | 'rebuttal' | 'closing'
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('submit_debate_argument', {
    p_debate_id: debateId,
    p_body: body,
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
}

export async function advanceDebateTurn(debateId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('advance_debate_turn', { p_debate_id: debateId });
  if (error) throw new Error(error.message);
}

export async function castDebateVote(debateId: string, side: 'affirmative' | 'opposing'): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('cast_debate_vote', { p_debate_id: debateId, p_side: side });
  if (error) throw new Error(error.message);
}

export async function finalizeDebate(debateId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('finalize_debate', { p_debate_id: debateId });
  if (error) throw new Error(error.message);
}

export async function getDebateState(debateId: string): Promise<DebateState> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_debate_state', { p_debate_id: debateId });
  if (error) throw new Error(error.message);
  return data as unknown as DebateState;
}

export async function getDebateList(
  section: 'all' | 'live' | 'upcoming' | 'open' | 'completed',
  category?: string,
  search?: string
): Promise<DebateListItem[]> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_debate_list', {
    p_section: section,
    p_category: category ?? '',
    p_search: search ?? '',
    p_limit: 30,
  });
  if (error) throw new Error(error.message);
  const parsed = data as { debates: DebateListItem[] };
  return parsed?.debates ?? [];
}

export async function getMyDebates(): Promise<MyDebates> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_my_debates');
  if (error) throw new Error(error.message);
  return (data as unknown as MyDebates) ?? { mine: [], moderating: [], invitations: [], history: [] };
}

export async function reportDebateContent(debateId: string, argumentId: string | null, reason: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('report_debate_content', {
    p_debate_id: debateId,
    p_argument_id: argumentId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function removeDebateArgument(argumentId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('remove_debate_argument', { p_argument_id: argumentId });
  if (error) throw new Error(error.message);
}

export async function cancelDebate(debateId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('cancel_debate', { p_debate_id: debateId });
  if (error) throw new Error(error.message);
}

export function subscribeToDebate(debateId: string, onChange: () => void): () => void {
  const client = requireClient();
  const channel = client
    .channel(`debate-${debateId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deb_debates', filter: `id=eq.${debateId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deb_participants', filter: `debate_id=eq.${debateId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deb_arguments', filter: `debate_id=eq.${debateId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deb_results', filter: `debate_id=eq.${debateId}` }, onChange)
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}