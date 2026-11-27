import { useState } from 'react';
import { BookOpen, Download, Play, RotateCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDownloads, type DownloadProgress } from '@/hooks/useDownloads';
import type { DownloadRecord } from '@/lib/offline/db';
import { loadOfflineSettings, saveOfflineSettings, type OfflineSettings } from '@/lib/offline/settings';

const STATUS_LABEL: Record<DownloadRecord['status'], string> = {
  complete: 'Available offline',
  partial: 'Partly saved',
  downloading: 'Downloading',
};

export function DownloadsPage() {
  const { navigate, isOnline } = useApp();
  const { records, active, error, saveNovel, removeDownload } = useDownloads();
  const [settings, setSettings] = useState<OfflineSettings>(loadOfflineSettings);

  const toggleWifiOnly = () => {
    const next = { wifiOnly: !settings.wifiOnly };
    setSettings(next);
    saveOfflineSettings(next);
  };

  const handleRemove = (record: DownloadRecord) => {
    if (window.confirm(`Remove "${record.meta.title}" from this device? You can download it again later.`)) {
      removeDownload(record.novelId);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 dark:text-slate-50">
            Downloads
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Novels saved to this device for reading without a connection.
          </p>
        </div>
        <button
          onClick={toggleWifiOnly}
          role="switch"
          aria-checked={settings.wifiOnly}
          className="btn-outline text-sm self-start sm:self-auto"
        >
          {settings.wifiOnly ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          Download on Wi-Fi only: {settings.wifiOnly ? 'On' : 'Off'}
        </button>
      </header>

      {!isOnline && (
        <div className="glass-card p-4 text-sm text-amber-800 dark:text-amber-200">
          You are offline. Only novels saved on this device can be opened.
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {records.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Download className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-500" />
          <h2 className="font-display font-bold text-lg mt-4 text-slate-800 dark:text-slate-100">
            Nothing saved yet
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Open a novel and tap the download button to read it offline.
          </p>
          <button onClick={() => navigate('library')} className="btn-primary mt-5">
            Go to Library
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <DownloadRow
              key={record.novelId}
              record={record}
              progress={active[record.novelId]}
              isOnline={isOnline}
              onOpen={() => navigate('reader', { novelId: record.novelId })}
              onResume={() => saveNovel(record.novelId)}
              onRemove={() => handleRemove(record)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface DownloadRowProps {
  record: DownloadRecord;
  progress: DownloadProgress | undefined;
  isOnline: boolean;
  onOpen: () => void;
  onResume: () => void;
  onRemove: () => void;
}

function DownloadRow({ record, progress, isOnline, onOpen, onResume, onRemove }: DownloadRowProps) {
  const isBusy = progress !== undefined;
  const saved = progress?.saved ?? record.savedChapters;
  const total = progress?.total || record.totalChapters;
  const percent = total > 0 ? Math.round((saved / total) * 100) : 0;
  const canResume = !isBusy && record.status !== 'complete';

  return (
    <li className="glass-card p-4 sm:p-5 flex gap-4 items-start">
      <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center flex-shrink-0">
        <BookOpen className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-bold text-base text-slate-800 dark:text-slate-100 truncate">
            {record.meta.title}
          </h2>
          <span className="chip bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">
            {STATUS_LABEL[record.status]}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {record.meta.author} · {saved} of {total} chapters saved
        </p>
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        {record.lastError && !isBusy && (
          <p className="text-xs text-amber-700 dark:text-amber-300">{record.lastError}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={onOpen} className="btn-primary text-sm">
            <Play className="w-4 h-4" />
            Read
          </button>
          {canResume && (
            <button
              onClick={onResume}
              disabled={!isOnline}
              className="btn-outline text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCw className="w-4 h-4" />
              Resume download
            </button>
          )}
          <button
            onClick={onRemove}
            disabled={isBusy}
            className="btn-ghost text-sm text-red-600 dark:text-red-400 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
