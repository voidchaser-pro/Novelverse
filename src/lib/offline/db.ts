import type { AuthUser, Chapter, ChapterBookmark, Novel, ReadingProgress } from '@/types';

const DB_NAME = 'novelverse-offline';
const DB_VERSION = 1;

export const STORES = {
  downloads: 'downloads',
  chapters: 'chapters',
  userState: 'userState',
  queue: 'queue',
} as const;

export type DownloadStatus = 'downloading' | 'complete' | 'partial';

export interface DownloadRecord {
  novelId: string;
  meta: Omit<Novel, 'chapters'>;
  totalChapters: number;
  chapterTitles: string[];
  status: DownloadStatus;
  savedChapters: number;
  lastError: string | null;
  updatedAt: string;
}

export interface ChapterRecord {
  key: string;
  novelId: string;
  index: number;
  chapter: Chapter;
  savedAt: string;
}

export interface UserStateRecord {
  userId: string;
  library: string[];
  progress: ReadingProgress[];
  bookmarks: ChapterBookmark[];
  profile: AuthUser | null;
  updatedAt: string;
}

export type QueueOp =
  | { kind: 'chapter-read'; novelId: string; chapterIndex: number }
  | { kind: 'position'; novelId: string; chapterIndex: number; scrollRatio: number }
  | { kind: 'bookmark-add'; novelId: string; chapterIndex: number }
  | { kind: 'bookmark-remove'; novelId: string; chapterIndex: number };

export interface QueueRecord {
  id?: number;
  userId: string;
  op: QueueOp;
  dedupeKey: string;
  createdAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error('Offline storage is not supported in this browser.'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.downloads)) db.createObjectStore(STORES.downloads, { keyPath: 'novelId' });
        if (!db.objectStoreNames.contains(STORES.chapters)) db.createObjectStore(STORES.chapters, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORES.userState)) db.createObjectStore(STORES.userState, { keyPath: 'userId' });
        if (!db.objectStoreNames.contains(STORES.queue)) {
          db.createObjectStore(STORES.queue, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Could not open offline storage.'));
      };
      request.onblocked = () => reject(new Error('Offline storage is blocked by another open tab.'));
    });
  }
  return dbPromise;
}

async function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openOfflineDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('Offline storage operation failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Offline storage write was aborted, likely because the device is out of storage.'));
  });
}

export function getRecord<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return runRequest<T | undefined>(storeName, 'readonly', (store) => store.get(key));
}

export function getAllRecords<T>(storeName: string): Promise<T[]> {
  return runRequest<T[]>(storeName, 'readonly', (store) => store.getAll());
}

export function putRecord<T>(storeName: string, value: T): Promise<void> {
  return runRequest<IDBValidKey>(storeName, 'readwrite', (store) => store.put(value)).then(() => undefined);
}

export function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
  return runRequest<undefined>(storeName, 'readwrite', (store) => store.delete(key)).then(() => undefined);
}

export function addRecord<T>(storeName: string, value: T): Promise<number> {
  return runRequest<IDBValidKey>(storeName, 'readwrite', (store) => store.add(value)).then((key) => Number(key));
}

export async function deleteChaptersForNovel(novelId: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.chapters, 'readwrite');
    const range = IDBKeyRange.bound(`${novelId}:`, `${novelId}:\uffff`);
    const request = tx.objectStore(STORES.chapters).delete(range);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Could not delete downloaded chapters.'));
  });
}

export async function getChaptersForNovel(novelId: string): Promise<ChapterRecord[]> {
  const db = await openOfflineDb();
  return new Promise<ChapterRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORES.chapters, 'readonly');
    const range = IDBKeyRange.bound(`${novelId}:`, `${novelId}:\uffff`);
    const request = tx.objectStore(STORES.chapters).getAll(range);
    request.onsuccess = () => resolve(request.result as ChapterRecord[]);
    request.onerror = () => reject(request.error);
  });
}

export function chapterKey(novelId: string, index: number): string {
  return `${novelId}:${index}`;
}
