import { supabase } from '@/lib/supabase';
import { deleteEpubFile } from '@/lib/storage';
import type { EpubChapter, NovelSubmission, SubmissionStatus } from '@/types';

export interface SubmissionMetaEdit {
  title: string;
  author: string;
  description: string | null;
}

function requireClient() {
  if (!supabase) throw new Error('The database is not configured.');
  return supabase;
}

async function attachSubmitterNames(rows: NovelSubmission[]): Promise<NovelSubmission[]> {
  const client = requireClient();
  const ids = [...new Set(rows.map((r) => r.submitter_id))];
  if (ids.length === 0) return rows;
  const { data, error } = await client.from('profiles').select('id, username').in('id', ids);
  if (error) {
    console.error('Failed to load submitter names:', error.message);
    return rows;
  }
  const names = new Map((data ?? []).map((p) => [p.id as string, p.username as string]));
  return rows.map((r) => ({ ...r, submitter_username: names.get(r.submitter_id) }));
}

export async function fetchOwnSubmissions(submitterId: string): Promise<NovelSubmission[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('novel_submissions')
    .select('*')
    .eq('submitter_id', submitterId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NovelSubmission[];
}

export async function fetchAllSubmissions(): Promise<NovelSubmission[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('novel_submissions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return attachSubmitterNames((data ?? []) as NovelSubmission[]);
}

export async function fetchLiveNovelIds(): Promise<Set<string>> {
  const client = requireClient();
  const { data, error } = await client.from('novels').select('id').eq('is_published', true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((n) => n.id as string));
}

export async function withdrawSubmission(submission: NovelSubmission, submitterId: string) {
  const client = requireClient();
  const { error } = await client
    .from('novel_submissions')
    .delete()
    .eq('id', submission.id)
    .eq('submitter_id', submitterId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  if (submission.epub_storage_path) {
    await deleteEpubFile(submission.epub_storage_path);
  }
}

export async function reviewSubmission(
  submission: NovelSubmission,
  reviewerId: string,
  status: Exclude<SubmissionStatus, 'pending'>,
  feedback: string | null
) {
  const client = requireClient();
  const { error } = await client
    .from('novel_submissions')
    .update({
      status,
      admin_feedback: feedback,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submission.id);
  if (error) throw new Error(error.message);

  if (status === 'rejected' && submission.novel_id) {
    await setNovelPublished(submission.novel_id, false);
  }
}

export async function editSubmissionMetadata(submission: NovelSubmission, edit: SubmissionMetaEdit) {
  const client = requireClient();
  const { error } = await client
    .from('novel_submissions')
    .update({
      title: edit.title,
      author: edit.author,
      description: edit.description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submission.id);
  if (error) throw new Error(error.message);

  if (submission.novel_id) {
    const { error: novelError } = await client
      .from('novels')
      .update({
        title: edit.title,
        author: edit.author,
        description: edit.description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submission.novel_id);
    if (novelError) throw new Error(novelError.message);
  }
}

export async function publishSubmission(submission: NovelSubmission, reviewerId: string) {
  const client = requireClient();

  if (submission.novel_id) {
    await setNovelPublished(submission.novel_id, true);
    return;
  }

  const { data: novel, error: insertError } = await client
    .from('novels')
    .insert({
      title: submission.title,
      author: submission.author,
      description: submission.description,
      cover_url: submission.cover_url,
      cover_color: submission.cover_color,
      chapters: submission.chapters as EpubChapter[],
      epub_storage_path: submission.epub_storage_path,
      submitted_by: submission.submitter_id,
      is_published: true,
      year: new Date().getFullYear(),
    })
    .select('id')
    .maybeSingle();
  if (insertError) throw new Error(insertError.message);
  if (!novel) throw new Error('The novel could not be created.');

  const { error: linkError } = await client
    .from('novel_submissions')
    .update({ novel_id: novel.id, reviewed_by: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', submission.id);
  if (linkError) throw new Error(linkError.message);
}

export async function unpublishSubmission(submission: NovelSubmission) {
  if (!submission.novel_id) return;
  await setNovelPublished(submission.novel_id, false);
}

async function setNovelPublished(novelId: string, published: boolean) {
  const client = requireClient();
  const { error } = await client
    .from('novels')
    .update({ is_published: published, updated_at: new Date().toISOString() })
    .eq('id', novelId);
  if (error) throw new Error(error.message);
}
