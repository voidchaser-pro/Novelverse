import { STORES, getRecord, putRecord, deleteRecord, type UserStateRecord } from '@/lib/offline/db';

export type CachedUserState = Omit<UserStateRecord, 'userId' | 'updatedAt'>;

const EMPTY_STATE: CachedUserState = { library: [], progress: [], bookmarks: [], profile: null };

export async function loadUserState(userId: string): Promise<CachedUserState | null> {
  const record = await getRecord<UserStateRecord>(STORES.userState, userId);
  if (!record) return null;
  const { library, progress, bookmarks, profile } = record;
  return { library, progress, bookmarks, profile };
}

export async function updateUserState(userId: string, patch: Partial<CachedUserState>): Promise<void> {
  const current = (await loadUserState(userId)) ?? EMPTY_STATE;
  await putRecord<UserStateRecord>(STORES.userState, {
    ...current,
    ...patch,
    userId,
    updatedAt: new Date().toISOString(),
  });
}

export function clearUserState(userId: string): Promise<void> {
  return deleteRecord(STORES.userState, userId);
}
