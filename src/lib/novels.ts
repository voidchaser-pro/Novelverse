import { supabase } from '@/lib/supabase';
import type { Chapter, Genre, Novel } from '@/types';

export interface NovelRow {
  id: string;
  title: string;
  author: string;
  description: string | null;
  cover_url: string | null;
  cover_color: string;
  genres: string[];
  tags: string[];
  rating: number | string;
  rating_count: number;
  chapters: Chapter[];
  year: number | null;
  is_published: boolean;
  created_at: string;
}

const NEW_RELEASE_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;

export function mapNovelRow(row: NovelRow): Novel {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    cover: '',
    coverUrl: row.cover_url,
    coverColor: row.cover_color,
    genres: row.genres as Genre[],
    tags: row.tags ?? [],
    rating: Number(row.rating),
    ratingCount: row.rating_count,
    synopsis: row.description ?? '',
    chapters: Array.isArray(row.chapters) ? row.chapters : [],
    trending: false,
    newRelease: Date.now() - new Date(row.created_at).getTime() < NEW_RELEASE_WINDOW_MS,
    year: row.year ?? new Date(row.created_at).getFullYear(),
  };
}

const NOVEL_COLUMNS = 'id, title, author, description, cover_url, cover_color, genres, tags, rating, rating_count, chapters, year, is_published, created_at';

export async function fetchPublishedNovels(): Promise<Novel[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('novels')
    .select(NOVEL_COLUMNS)
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load novels:', error.message);
    throw new Error('Could not load novels. Please try again.');
  }
  return (data as NovelRow[] | null ?? []).map(mapNovelRow);
}

export async function fetchPublishedNovelById(novelId: string): Promise<Novel | null> {
  if (!supabase) throw new Error('Novels are unavailable right now.');
  const { data, error } = await supabase
    .from('novels')
    .select(NOVEL_COLUMNS)
    .eq('id', novelId)
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw new Error('Could not load this novel.');
  return data ? mapNovelRow(data as NovelRow) : null;
}
