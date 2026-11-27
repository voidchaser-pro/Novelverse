import { supabase } from '@/lib/supabase';
import type { ChapterBookmark } from '@/types';

interface BookmarkRow {
  novel_id: string;
  chapter_index: number;
  created_at: string;
}

function requireClient() {
  if (!supabase) throw new Error('Reading features are unavailable right now.');
  return supabase;
}

export async function fetchBookmarks(userId: string): Promise<ChapterBookmark[]> {
  const { data, error } = await requireClient()
    .from('chapter_bookmarks')
    .select('novel_id, chapter_index, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load bookmarks.');
  return ((data ?? []) as BookmarkRow[]).map((row) => ({
    novelId: row.novel_id,
    chapterIndex: row.chapter_index,
    createdAt: row.created_at,
  }));
}

export async function addBookmark(novelId: string, chapterIndex: number): Promise<void> {
  const { error } = await requireClient()
    .from('chapter_bookmarks')
    .insert({ novel_id: novelId, chapter_index: chapterIndex });
  if (error) throw new Error('Could not save bookmark.');
}

export async function removeBookmark(userId: string, novelId: string, chapterIndex: number): Promise<void> {
  const { error } = await requireClient()
    .from('chapter_bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('novel_id', novelId)
    .eq('chapter_index', chapterIndex);
  if (error) throw new Error('Could not remove bookmark.');
}

export async function saveReadingPosition(novelId: string, chapterIndex: number, scrollRatio: number): Promise<void> {
  const { error } = await requireClient().rpc('save_reading_position', {
    p_novel_id: novelId,
    p_chapter_index: chapterIndex,
    p_scroll_ratio: scrollRatio,
  });
  if (error) throw new Error('Could not sync reading position.');
}
