import { supabase } from '@/lib/supabase';
import { uploadCoverImage } from '@/lib/storage';
import type { Chapter, Genre, Novel } from '@/types';
import { mapNovelRow, type NovelRow } from '@/lib/novels';

export interface AdminNovelRow extends NovelRow {
  tags: string[];
}

export function mapAdminNovelRow(row: AdminNovelRow): Novel & { tags: string[]; isPublished: boolean } {
  return {
    ...mapNovelRow(row),
    tags: row.tags ?? [],
    isPublished: row.is_published,
  };
}

export interface AdminDashboardStats {
  total_novels: number;
  published_novels: number;
  draft_novels: number;
  total_chapters: number;
  total_readers: number;
  pending_submissions: number;
}

function requireClient() {
  if (!supabase) throw new Error('The database is not configured.');
  return supabase;
}

export async function fetchAdminDashboardStats(): Promise<AdminDashboardStats> {
  const client = requireClient();
  const { data, error } = await client.rpc('admin_dashboard_stats');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    return {
      total_novels: 0,
      published_novels: 0,
      draft_novels: 0,
      total_chapters: 0,
      total_readers: 0,
      pending_submissions: 0,
    };
  }
  return data[0] as AdminDashboardStats;
}

export async function fetchAllNovelsForAdmin(): Promise<(Novel & { tags: string[]; isPublished: boolean })[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('novels')
    .select('id, title, author, description, cover_url, cover_color, genres, tags, rating, rating_count, chapters, year, is_published, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as AdminNovelRow[] | null ?? []).map(mapAdminNovelRow);
}

export interface NovelInput {
  title: string;
  author: string;
  description: string | null;
  cover_url: string | null;
  cover_color: string;
  genres: Genre[];
  tags: string[];
  chapters: Chapter[];
  is_published: boolean;
  year: number | null;
}

export async function createNovel(input: NovelInput): Promise<string> {
  const client = requireClient();
  const { data, error } = await client
    .from('novels')
    .insert({
      title: input.title,
      author: input.author,
      description: input.description,
      cover_url: input.cover_url,
      cover_color: input.cover_color,
      genres: input.genres,
      tags: input.tags,
      chapters: input.chapters as unknown as Record<string, unknown>[],
      is_published: input.is_published,
      year: input.year,
    })
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The novel could not be created.');
  return data.id as string;
}

export async function updateNovel(novelId: string, input: Partial<NovelInput>): Promise<void> {
  const client = requireClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) update.title = input.title;
  if (input.author !== undefined) update.author = input.author;
  if (input.description !== undefined) update.description = input.description;
  if (input.cover_url !== undefined) update.cover_url = input.cover_url;
  if (input.cover_color !== undefined) update.cover_color = input.cover_color;
  if (input.genres !== undefined) update.genres = input.genres;
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.chapters !== undefined) update.chapters = input.chapters as unknown as Record<string, unknown>[];
  if (input.is_published !== undefined) update.is_published = input.is_published;
  if (input.year !== undefined) update.year = input.year;

  const { error } = await client.from('novels').update(update).eq('id', novelId);
  if (error) throw new Error(error.message);
}

export async function deleteNovel(novelId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('novels').delete().eq('id', novelId);
  if (error) throw new Error(error.message);
}

export async function uploadNovelCover(
  file: File | Blob,
  novelId: string,
  mimeType = 'image/jpeg'
): Promise<string> {
  return uploadCoverImage(file, novelId, mimeType);
}
