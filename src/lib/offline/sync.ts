import { supabase } from '@/lib/supabase';
import { STORES, addRecord, deleteRecord, getAllRecords, type QueueOp, type QueueRecord } from '@/lib/offline/db';

export interface SyncResult {
  synced: number;
  pending: number;
}

function dedupeKeyFor(op: QueueOp): string {
  switch (op.kind) {
    case 'chapter-read':
      return `read:${op.novelId}:${op.chapterIndex}`;
    case 'position':
      return `position:${op.novelId}`;
    case 'bookmark-add':
    case 'bookmark-remove':
      return `bookmark:${op.novelId}:${op.chapterIndex}`;
  }
}

export async function enqueueChange(userId: string, op: QueueOp): Promise<void> {
  const dedupeKey = dedupeKeyFor(op);
  const existing = await getAllRecords<QueueRecord>(STORES.queue);
  for (const record of existing) {
    if (record.userId === userId && record.dedupeKey === dedupeKey && record.id !== undefined) {
      await deleteRecord(STORES.queue, record.id);
    }
  }
  await addRecord<QueueRecord>(STORES.queue, {
    userId,
    op,
    dedupeKey,
    createdAt: new Date().toISOString(),
  });
}

export async function countPendingChanges(userId: string): Promise<number> {
  const records = await getAllRecords<QueueRecord>(STORES.queue);
  return records.filter((r) => r.userId === userId).length;
}

async function applyOp(op: QueueOp, userId: string): Promise<void> {
  if (!supabase) throw new Error('Sync is unavailable right now.');
  const client = supabase;
  switch (op.kind) {
    case 'chapter-read': {
      const { error } = await client.rpc('record_chapter_read', {
        p_novel_id: op.novelId,
        p_chapter_index: op.chapterIndex,
      });
      if (error) throw error;
      return;
    }
    case 'position': {
      const { error } = await client.rpc('save_reading_position', {
        p_novel_id: op.novelId,
        p_chapter_index: op.chapterIndex,
        p_scroll_ratio: op.scrollRatio,
      });
      if (error) throw error;
      return;
    }
    case 'bookmark-add': {
      const { error } = await client
        .from('chapter_bookmarks')
        .insert({ novel_id: op.novelId, chapter_index: op.chapterIndex });
      if (error && error.code !== '23505') throw error;
      return;
    }
    case 'bookmark-remove': {
      const { error } = await client
        .from('chapter_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('novel_id', op.novelId)
        .eq('chapter_index', op.chapterIndex);
      if (error) throw error;
      return;
    }
  }
}

function isPermanentFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? '');
  return /not found|out of range/i.test(message);
}

async function flushQueue(userId: string): Promise<SyncResult> {
  const records = (await getAllRecords<QueueRecord>(STORES.queue))
    .filter((r) => r.userId === userId && r.id !== undefined)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  let synced = 0;
  for (const record of records) {
    let failure: unknown = null;
    try {
      await applyOp(record.op, userId);
    } catch (err) {
      failure = err;
    }
    if (failure !== null && !isPermanentFailure(failure)) break;
    if (record.id !== undefined) await deleteRecord(STORES.queue, record.id);
    if (failure === null) synced += 1;
  }

  return { synced, pending: await countPendingChanges(userId) };
}

export async function syncPendingChanges(userId: string): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, pending: await countPendingChanges(userId) };
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('novelverse-offline-sync', () => flushQueue(userId));
  }
  return flushQueue(userId);
}
