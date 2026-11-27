import { fetchPublishedNovelById } from '@/lib/novels';
import {
  STORES,
  chapterKey,
  deleteChaptersForNovel,
  deleteRecord,
  getAllRecords,
  getChaptersForNovel,
  getRecord,
  putRecord,
  type ChapterRecord,
  type DownloadRecord,
  type DownloadStatus,
} from '@/lib/offline/db';
import type { Chapter, Novel } from '@/types';

type NetworkConnection = { type?: string };

export function checkDownloadConnection(wifiOnly: boolean): string | null {
  if (typeof navigator === 'undefined') return null;
  if (!navigator.onLine) return 'You are offline. Connect to the internet to download.';
  if (!wifiOnly) return null;
  const connection = (navigator as Navigator & { connection?: NetworkConnection }).connection;
  if (connection?.type === 'cellular') {
    return 'Downloads are set to Wi-Fi only. Connect to Wi-Fi or turn off this setting.';
  }
  return null;
}

function toStorageError(err: unknown): Error {
  const quota = err instanceof DOMException && err.name === 'QuotaExceededError';
  const aborted = err instanceof Error && err.message.includes('out of storage');
  if (quota || aborted) {
    return new Error('Your device is out of storage space. Delete some downloads and try again.');
  }
  return new Error('Could not save this download. Please try again.');
}

function buildRecord(
  novel: Novel,
  savedChapters: number,
  status: DownloadStatus,
  lastError: string | null
): DownloadRecord {
  const { chapters, ...meta } = novel;
  return {
    novelId: novel.id,
    meta,
    totalChapters: chapters.length,
    chapterTitles: chapters.map((c) => c.title),
    status,
    savedChapters,
    lastError,
    updatedAt: new Date().toISOString(),
  };
}

async function loadNovel(novelId: string): Promise<Novel> {
  let novel: Novel | null;
  try {
    novel = await fetchPublishedNovelById(novelId);
  } catch (err) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('You are offline. Connect to the internet to download.');
    }
    throw err instanceof Error ? err : new Error('Could not download this novel.');
  }
  if (!novel) throw new Error('This novel is no longer available.');
  return novel;
}

async function saveChapter(novel: Novel, index: number): Promise<void> {
  const record: ChapterRecord = {
    key: chapterKey(novel.id, index),
    novelId: novel.id,
    index,
    chapter: novel.chapters[index],
    savedAt: new Date().toISOString(),
  };
  await putRecord(STORES.chapters, record);
}

export async function downloadNovel(
  novelId: string,
  onProgress: (saved: number, total: number) => void
): Promise<void> {
  const novel = await loadNovel(novelId);
  const total = novel.chapters.length;
  const saved = new Set((await getChaptersForNovel(novelId)).map((c) => c.index));
  let savedCount = saved.size;

  await putRecord(STORES.downloads, buildRecord(novel, savedCount, 'downloading', null));
  onProgress(savedCount, total);

  try {
    for (let index = 0; index < total; index++) {
      if (saved.has(index)) continue;
      await saveChapter(novel, index);
      savedCount += 1;
      await putRecord(STORES.downloads, buildRecord(novel, savedCount, 'downloading', null));
      onProgress(savedCount, total);
    }
  } catch (err) {
    const message = toStorageError(err).message;
    await putRecord(STORES.downloads, buildRecord(novel, savedCount, 'partial', message));
    throw new Error(message);
  }

  await putRecord(STORES.downloads, buildRecord(novel, savedCount, 'complete', null));
}

export async function downloadChapter(novelId: string, index: number): Promise<void> {
  const novel = await loadNovel(novelId);
  if (index < 0 || index >= novel.chapters.length) throw new Error('This chapter does not exist.');
  try {
    await saveChapter(novel, index);
    const savedCount = (await getChaptersForNovel(novelId)).length;
    const status: DownloadStatus = savedCount === novel.chapters.length ? 'complete' : 'partial';
    await putRecord(STORES.downloads, buildRecord(novel, savedCount, status, null));
  } catch (err) {
    throw toStorageError(err);
  }
}

export async function deleteDownload(novelId: string): Promise<void> {
  await deleteChaptersForNovel(novelId);
  await deleteRecord(STORES.downloads, novelId);
}

export async function deleteDownloadedChapter(novelId: string, index: number): Promise<void> {
  const record = await getRecord<DownloadRecord>(STORES.downloads, novelId);
  if (!record) return;
  await deleteRecord(STORES.chapters, chapterKey(novelId, index));
  const remaining = (await getChaptersForNovel(novelId)).length;
  if (remaining === 0) {
    await deleteRecord(STORES.downloads, novelId);
    return;
  }
  const status: DownloadStatus = remaining === record.totalChapters ? 'complete' : 'partial';
  await putRecord(STORES.downloads, {
    ...record,
    savedChapters: remaining,
    status,
    lastError: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function listDownloads(): Promise<DownloadRecord[]> {
  const records = await getAllRecords<DownloadRecord>(STORES.downloads);
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function markInterruptedDownloads(): Promise<void> {
  const records = await getAllRecords<DownloadRecord>(STORES.downloads);
  await Promise.all(
    records
      .filter((r) => r.status === 'downloading')
      .map((r) =>
        putRecord(STORES.downloads, {
          ...r,
          status: 'partial',
          lastError: 'The download was interrupted. Resume it to finish.',
          updatedAt: new Date().toISOString(),
        })
      )
  );
}

export async function loadOfflineCatalog(): Promise<Novel[]> {
  const [records, chapterRecords] = await Promise.all([
    getAllRecords<DownloadRecord>(STORES.downloads),
    getAllRecords<ChapterRecord>(STORES.chapters),
  ]);
  return records.map((record) => {
    const saved = new Map(
      chapterRecords.filter((c) => c.novelId === record.novelId).map((c) => [c.index, c.chapter])
    );
    const chapters: Chapter[] = Array.from({ length: record.totalChapters }, (_, index) =>
      saved.get(index) ?? {
        id: `${record.novelId}-${index}`,
        title: record.chapterTitles[index] ?? `Chapter ${index + 1}`,
        content: '',
        wordCount: 0,
      }
    );
    return { ...record.meta, chapters };
  });
}
