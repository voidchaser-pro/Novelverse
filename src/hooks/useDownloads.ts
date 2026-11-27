import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { DownloadRecord } from '@/lib/offline/db';
import {
  checkDownloadConnection,
  deleteDownload,
  downloadChapter,
  downloadNovel,
  listDownloads,
} from '@/lib/offline/downloads';
import { loadOfflineSettings } from '@/lib/offline/settings';

export interface DownloadProgress {
  saved: number;
  total: number;
}

export function useDownloads() {
  const { refreshCatalog } = useApp();
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [active, setActive] = useState<Record<string, DownloadProgress>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRecords(await listDownloads());
    } catch {
      setError('Could not read your downloads on this device.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const settle = useCallback(
    async (novelId: string | null) => {
      if (novelId) {
        setActive((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== novelId)));
      }
      await refresh();
      await refreshCatalog();
    },
    [refresh, refreshCatalog]
  );

  const saveNovel = useCallback(
    async (novelId: string) => {
      setError(null);
      const blocked = checkDownloadConnection(loadOfflineSettings().wifiOnly);
      if (blocked) {
        setError(blocked);
        return;
      }
      setActive((prev) => ({ ...prev, [novelId]: { saved: 0, total: 0 } }));
      try {
        await downloadNovel(novelId, (saved, total) =>
          setActive((prev) => ({ ...prev, [novelId]: { saved, total } }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Download failed.');
      } finally {
        await settle(novelId);
      }
    },
    [settle]
  );

  const saveChapter = useCallback(
    async (novelId: string, index: number) => {
      setError(null);
      const blocked = checkDownloadConnection(loadOfflineSettings().wifiOnly);
      if (blocked) {
        setError(blocked);
        return;
      }
      try {
        await downloadChapter(novelId, index);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save this chapter.');
      }
      await settle(null);
    },
    [settle]
  );

  const removeDownload = useCallback(
    async (novelId: string) => {
      setError(null);
      try {
        await deleteDownload(novelId);
      } catch {
        setError('Could not remove this download. Please try again.');
      }
      await settle(null);
    },
    [settle]
  );

  const clearError = useCallback(() => setError(null), []);

  return { records, active, error, clearError, saveNovel, saveChapter, removeDownload };
}
