import { supabase } from '@/lib/supabase';
import type {
  Scenario,
  ScenarioNode,
  ScenarioProgress,
  ScenarioSubmission,
} from '@/types';

function requireClient() {
  if (!supabase) throw new Error('The database is not configured.');
  return supabase;
}

export interface ScenarioRow {
  id: string;
  novel_id: string;
  title: string;
  description: string | null;
  cover_color: string;
  creator_id: string;
  start_node_id: string;
  nodes: ScenarioNode[];
  characters: { id: string; name: string; description: string; avatar: string }[];
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  is_published: boolean;
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  xp_reward: number;
  endings_count: number;
  created_at: string;
  updated_at: string;
}

function mapScenarioRow(row: ScenarioRow, novelTitle?: string, creatorUsername?: string): Scenario {
  return {
    id: row.id,
    novel_id: row.novel_id,
    novel_title: novelTitle,
    title: row.title,
    description: row.description,
    cover_color: row.cover_color,
    creator_id: row.creator_id,
    creator_username: creatorUsername,
    start_node_id: row.start_node_id,
    nodes: Array.isArray(row.nodes) ? row.nodes : [],
    characters: Array.isArray(row.characters) ? row.characters : [],
    status: row.status,
    is_published: row.is_published,
    admin_feedback: row.admin_feedback,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    xp_reward: row.xp_reward,
    endings_count: row.endings_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchPublishedScenarios(): Promise<Scenario[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('scenarios')
    .select('*, novels!inner(title)')
    .eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    mapScenarioRow(row as unknown as ScenarioRow, (row as { novels?: { title?: string } }).novels?.title)
  );
}

export async function fetchScenarioById(id: string): Promise<Scenario | null> {
  const client = requireClient();
  const { data, error } = await client
    .from('scenarios')
    .select('*, novels!inner(title)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapScenarioRow(
    data as ScenarioRow,
    (data as { novels?: { title?: string } }).novels?.title
  );
}

export async function fetchMyScenarios(userId: string): Promise<Scenario[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('scenarios')
    .select('*, novels!inner(title)')
    .eq('creator_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    mapScenarioRow(row as unknown as ScenarioRow, (row as { novels?: { title?: string } }).novels?.title)
  );
}

export async function fetchAllScenariosForAdmin(): Promise<Scenario[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('scenarios')
    .select('*, novels!inner(title)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (ScenarioRow & { novels?: { title?: string } })[];
  const creatorIds = [...new Set(rows.map((r) => r.creator_id))];
  const { data: profiles } = await client
    .from('profiles')
    .select('id, username')
    .in('id', creatorIds);
  const nameMap = new Map((profiles ?? []).map((p) => [p.id as string, p.username as string]));
  return rows.map((row) =>
    mapScenarioRow(row, row.novels?.title, nameMap.get(row.creator_id))
  );
}

export async function fetchScenarioProgress(scenarioId: string): Promise<ScenarioProgress | null> {
  const client = requireClient();
  const { data, error } = await client
    .from('scenario_progress')
    .select('*')
    .eq('scenario_id', scenarioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScenarioProgress | null) ?? null;
}

export async function fetchContinuePlaying(): Promise<{ scenario: Scenario; progress: ScenarioProgress }[]> {
  const client = requireClient();
  const { data: progressRows, error } = await client
    .from('scenario_progress')
    .select('*')
    .order('last_played_at', { ascending: false });
  if (error) throw new Error(error.message);
  if (!progressRows || progressRows.length === 0) return [];
  const scenarioIds = progressRows.map((p) => p.scenario_id as string);
  const { data: scenarioRows, error: sError } = await client
    .from('scenarios')
    .select('*, novels!inner(title)')
    .in('id', scenarioIds);
  if (sError) throw new Error(sError.message);
  return (progressRows as ScenarioProgress[]).flatMap((p) => {
    const row = (scenarioRows ?? []).find((s) => s.id === p.scenario_id);
    if (!row) return [];
    return [{ scenario: mapScenarioRow(row as ScenarioRow, (row as { novels?: { title?: string } }).novels?.title), progress: p }];
  });
}

export async function upsertProgress(
  scenarioId: string,
  nodeId: string,
  completed: boolean,
  endingsDiscovered: string[]
): Promise<void> {
  const client = requireClient();
  const now = new Date().toISOString();
  const { error } = await client
    .from('scenario_progress')
    .upsert(
      {
        scenario_id: scenarioId,
        current_node_id: nodeId,
        completed,
        endings_discovered: endingsDiscovered,
        last_played_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,scenario_id' }
    );
  if (error) throw new Error(error.message);
}

export async function awardScenarioXp(scenarioId: string): Promise<number> {
  const client = requireClient();
  const { data, error } = await client.rpc('award_scenario_xp', { p_scenario_id: scenarioId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export interface ScenarioDraft {
  novel_id: string;
  title: string;
  description: string | null;
  cover_color: string;
  start_node_id: string;
  nodes: ScenarioNode[];
  characters: { id: string; name: string; description: string; avatar: string }[];
  xp_reward: number;
  endings_count: number;
}

export async function createScenario(draft: ScenarioDraft): Promise<string> {
  const client = requireClient();
  const { data, error } = await client
    .from('scenarios')
    .insert({
      novel_id: draft.novel_id,
      title: draft.title,
      description: draft.description,
      cover_color: draft.cover_color,
      start_node_id: draft.start_node_id,
      nodes: draft.nodes,
      characters: draft.characters,
      xp_reward: draft.xp_reward,
      endings_count: draft.endings_count,
      status: 'draft',
      is_published: false,
    })
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Could not create scenario.');
  return (data as { id: string }).id;
}

export async function updateScenario(id: string, draft: Partial<ScenarioDraft>): Promise<void> {
  const client = requireClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (draft.title !== undefined) update.title = draft.title;
  if (draft.description !== undefined) update.description = draft.description;
  if (draft.cover_color !== undefined) update.cover_color = draft.cover_color;
  if (draft.start_node_id !== undefined) update.start_node_id = draft.start_node_id;
  if (draft.nodes !== undefined) update.nodes = draft.nodes;
  if (draft.characters !== undefined) update.characters = draft.characters;
  if (draft.xp_reward !== undefined) update.xp_reward = draft.xp_reward;
  if (draft.endings_count !== undefined) update.endings_count = draft.endings_count;
  const { error } = await client.from('scenarios').update(update).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function submitScenarioForReview(scenarioId: string): Promise<void> {
  const client = requireClient();
  const { error: subError } = await client.from('scenario_submissions').insert({
    scenario_id: scenarioId,
  });
  if (subError) throw new Error(subError.message);
  const { error: statusError } = await client
    .from('scenarios')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', scenarioId);
  if (statusError) throw new Error(statusError.message);
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('scenarios').delete().eq('id', scenarioId);
  if (error) throw new Error(error.message);
}

export async function publishScenario(scenarioId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('scenarios')
    .update({ is_published: true, status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', scenarioId);
  if (error) throw new Error(error.message);
}

export async function unpublishScenario(scenarioId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('scenarios')
    .update({ is_published: false, updated_at: new Date().toISOString() })
    .eq('id', scenarioId);
  if (error) throw new Error(error.message);
}

export async function approveScenarioSubmission(
  submissionId: string,
  scenarioId: string,
  reviewerId: string,
  feedback: string | null
): Promise<void> {
  const client = requireClient();
  const { error: subError } = await client
    .from('scenario_submissions')
    .update({
      status: 'approved',
      admin_feedback: feedback,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (subError) throw new Error(subError.message);
  const { error: scenarioError } = await client
    .from('scenarios')
    .update({ status: 'approved', is_published: true, admin_feedback: feedback, updated_at: new Date().toISOString() })
    .eq('id', scenarioId);
  if (scenarioError) throw new Error(scenarioError.message);
}

export async function rejectScenarioSubmission(
  submissionId: string,
  scenarioId: string,
  reviewerId: string,
  feedback: string
): Promise<void> {
  const client = requireClient();
  const { error: subError } = await client
    .from('scenario_submissions')
    .update({
      status: 'rejected',
      admin_feedback: feedback,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (subError) throw new Error(subError.message);
  const { error: scenarioError } = await client
    .from('scenarios')
    .update({ status: 'rejected', admin_feedback: feedback, updated_at: new Date().toISOString() })
    .eq('id', scenarioId);
  if (scenarioError) throw new Error(scenarioError.message);
}

export async function fetchPendingScenarioSubmissions(): Promise<ScenarioSubmission[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('scenario_submissions')
    .select('*, profiles!inner(username)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    scenario_id: row.scenario_id as string,
    submitter_id: row.submitter_id as string,
    submitter_username: (row as { profiles?: { username?: string } }).profiles?.username,
    status: row.status as ScenarioSubmission['status'],
    admin_feedback: row.admin_feedback as string | null,
    reviewed_by: row.reviewed_by as string | null,
    reviewed_at: row.reviewed_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}
