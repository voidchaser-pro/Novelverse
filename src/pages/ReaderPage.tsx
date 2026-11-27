import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  List,
  Bookmark,
  BookmarkCheck,
  Library,
  Settings2,
  Maximize2,
  Minimize2,
  Download,
  Check,
  Loader2,
  ArrowDownToLine,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NovelCover } from '@/components/NovelCard';
import { ChapterMenu } from '@/components/reader/ChapterMenu';
import { ReaderSettingsPanel } from '@/components/reader/ReaderSettingsPanel';
import { ReadingProgressBar } from '@/components/reader/ReadingProgressBar';
import { useDownloads } from '@/hooks/useDownloads';
import {
  READER_FONTS,
  READER_LINE_SPACING,
  READER_THEME_STYLES,
  loadReaderSettings,
  saveReaderSettings,
  type ReaderSettings,
} from '@/lib/readerSettings';

type SyncStatus = 'idle' | 'saving' | 'saved' | 'queued' | 'error';

interface PendingPosition {
  novelId: string;
  chapterIndex: number;
  ratio: number;
}

const SAVE_DELAY_MS = 1500;

function ratioFromScroll(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / max));
}

function scrollToRatio(ratio: number, container: HTMLElement | null) {
  if (container) {
    container.scrollTop = ratio * Math.max(0, container.scrollHeight - container.clientHeight);
    return;
  }
  window.scrollTo(0, ratio * Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  idle: '',
  saving: 'Saving position…',
  saved: 'Position synced',
  queued: 'Saved offline, syncs when online',
  error: 'Could not sync position',
};

export function ReaderPage() {
  const {
    pageParams,
    navigate,
    authUser,
    isInLibrary,
    toggleLibrary,
    touchReadingHistory,
    updateReadingProgress,
    readingProgress,
    catalog,
    bookmarks,
    toggleBookmark,
    savePosition,
    isOnline,
    catalogSource,
  } = useApp();
  const downloads = useDownloads();
  const novel = catalog.find((n) => n.id === pageParams.novelId);
  const novelId = novel?.id ?? '';
  const savedProgress = novel ? readingProgress[novel.id] : undefined;
  const savedChapter = savedProgress?.chapterIndex;

  const [chapterIndex, setChapterIndex] = useState(savedChapter ?? 0);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(loadReaderSettings);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  const focusRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(0);
  const restoreRatioRef = useRef<number | null>(null);
  const restoredNovelRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<PendingPosition | null>(null);
  const saveTimerRef = useRef<number | undefined>(undefined);

  const flushPosition = useCallback(() => {
    window.clearTimeout(saveTimerRef.current);
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    setSyncStatus('saving');
    savePosition(pending.novelId, pending.chapterIndex, pending.ratio)
      .then((result) => setSyncStatus(result === 'queued' ? 'queued' : 'saved'))
      .catch(() => setSyncStatus('error'));
  }, [savePosition]);

  const handleScrollRatio = useCallback(
    (ratio: number) => {
      ratioRef.current = ratio;
      setScrollRatio(ratio);
      if (!novelId || !authUser) return;
      pendingSaveRef.current = { novelId, chapterIndex, ratio };
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flushPosition, SAVE_DELAY_MS);
    },
    [novelId, authUser, chapterIndex, flushPosition]
  );

  useEffect(() => {
    if (focusMode) return;
    const onScroll = () =>
      handleScrollRatio(ratioFromScroll(window.scrollY, document.documentElement.scrollHeight, window.innerHeight));
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [focusMode, handleScrollRatio]);

  useEffect(() => {
    window.addEventListener('pagehide', flushPosition);
    return () => {
      window.removeEventListener('pagehide', flushPosition);
      flushPosition();
    };
  }, [flushPosition]);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        restoreRatioRef.current = ratioRef.current;
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  useEffect(() => {
    if (!novel || restoredNovelRef.current === novel.id) return;
    if (savedChapter !== undefined) {
      restoredNovelRef.current = novel.id;
      const ratio = savedProgress?.scrollRatio ?? 0;
      if (savedChapter === chapterIndex) {
        requestAnimationFrame(() => scrollToRatio(ratio, focusMode ? focusRef.current : null));
      } else {
        restoreRatioRef.current = ratio;
        setChapterIndex(savedChapter);
      }
    } else if (novel.chapters.length > 0) {
      restoredNovelRef.current = novel.id;
      touchReadingHistory(novel.id);
    }
  }, [novel?.id, savedChapter]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const target = restoreRatioRef.current;
    if (target === null) return;
    restoreRatioRef.current = null;
    scrollToRatio(target, focusMode ? focusRef.current : null);
  }, [chapterIndex, focusMode]);

  if (!novel) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        {isOnline ? (
          <p className="text-slate-500 dark:text-slate-400">Novel not found.</p>
        ) : (
          <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <WifiOff className="w-4 h-4" />
            This novel is not saved on this device. Connect to the internet to open it.
          </p>
        )}
        <button onClick={() => navigate('library')} className="btn-primary mt-4">
          Back to Library
        </button>
      </div>
    );
  }

  const totalChapters = novel.chapters.length;
  const chapter = novel.chapters[chapterIndex];
  if (!chapter) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-slate-500 dark:text-slate-400">This novel has no chapters yet.</p>
        <button onClick={() => navigate('library')} className="btn-primary mt-4">
          Back to Library
        </button>
      </div>
    );
  }

  const inLib = isInLibrary(novel.id);
  const chapterMissing = catalogSource === 'offline' && chapter.content.length === 0;
  const downloadRecord = downloads.records.find((r) => r.novelId === novel.id);
  const downloadProgress = downloads.active[novel.id];
  const isNovelDownloaded = downloadRecord?.status === 'complete';
  const chapterProgress = ((chapterIndex + 1) / totalChapters) * 100;
  const isBookmarked = bookmarks.some((b) => b.novelId === novel.id && b.chapterIndex === chapterIndex);
  const novelBookmarks = bookmarks.filter((b) => b.novelId === novel.id);
  const theme = READER_THEME_STYLES[settings.theme];
  const textStyle = {
    fontSize: `${settings.fontSize}px`,
    fontFamily: READER_FONTS[settings.fontFamily].stack,
    lineHeight: READER_LINE_SPACING[settings.lineSpacing].value,
  };


  const updateSettings = (patch: Partial<ReaderSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveReaderSettings(next);
  };

  const scrollCurrentToTop = () => scrollToRatio(0, focusMode ? focusRef.current : null);

  const goToChapter = async (index: number) => {
    if (index < 0 || index >= totalChapters) return;
    setShowChapters(false);
    if (index === chapterIndex) {
      scrollCurrentToTop();
      return;
    }
    flushPosition();
    restoreRatioRef.current = 0;
    ratioRef.current = 0;
    setScrollRatio(0);
    setChapterIndex(index);
    await updateReadingProgress(novel.id, index);
    if (authUser) {
      pendingSaveRef.current = { novelId: novel.id, chapterIndex: index, ratio: 0 };
      flushPosition();
    }
  };

  const toggleFocus = (next: boolean) => {
    restoreRatioRef.current = ratioRef.current;
    setShowChapters(false);
    setShowSettings(false);
    setFocusMode(next);
  };

  const handleToggleBookmark = async (index: number) => {
    setBookmarkError(null);
    try {
      await toggleBookmark(novel.id, index);
    } catch (err) {
      setBookmarkError(err instanceof Error ? err.message : 'Could not update bookmark.');
    }
  };

  const syncLabel = authUser ? SYNC_LABEL[syncStatus] : '';

  const chapterBody = (
    <>
      <article
        className={`rounded-2xl ${theme.surface} ${theme.text} transition-colors duration-300 p-6 sm:p-10 ${
          focusMode ? 'max-w-3xl mx-auto w-full' : ''
        }`}
      >
        <h2 className="font-display font-bold text-lg sm:text-xl mb-6 opacity-80">
          Chapter {chapterIndex + 1}: {chapter.title}
        </h2>
        <div className="whitespace-pre-wrap text-balance" style={textStyle}>
          {chapterMissing
            ? 'This chapter is not saved on this device. Connect to the internet and save it to read offline.'
            : chapter.content}
        </div>
      </article>

      <div className={`flex items-center justify-between gap-3 mt-4 ${focusMode ? 'max-w-3xl mx-auto w-full' : ''}`}>
        <button
          onClick={() => goToChapter(chapterIndex - 1)}
          disabled={chapterIndex === 0}
          className="btn-outline disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <span className="text-sm text-slate-400 dark:text-slate-500 font-medium tabular-nums">
          {chapterIndex + 1} / {totalChapters}
        </span>
        <button
          onClick={() => goToChapter(chapterIndex + 1)}
          disabled={chapterIndex === totalChapters - 1}
          className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="hidden sm:inline">Next Chapter</span>
          <span className="sm:hidden">Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  const drawers = (
    <>
      {showChapters && (
        <ChapterMenu
          novel={novel}
          currentIndex={chapterIndex}
          bookmarks={novelBookmarks}
          onSelect={goToChapter}
          onRemoveBookmark={handleToggleBookmark}
          onClose={() => setShowChapters(false)}
        />
      )}
      {showSettings && (
        <ReaderSettingsPanel settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
    </>
  );

  const bookmarkButton = (
    <button
      onClick={() => handleToggleBookmark(chapterIndex)}
      className="btn-ghost text-sm"
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark this chapter'}
      aria-pressed={isBookmarked}
    >
      {isBookmarked ? <BookmarkCheck className="w-4 h-4 text-primary-500" /> : <Bookmark className="w-4 h-4" />}
    </button>
  );

  const chaptersButton = (
    <button onClick={() => setShowChapters(true)} className="btn-ghost text-sm" title="Chapter list">
      <List className="w-4 h-4" />
      <span className="hidden sm:inline">Chapters</span>
    </button>
  );

  const settingsButton = (
    <button onClick={() => setShowSettings(true)} className="btn-ghost text-sm" title="Reader settings">
      <Settings2 className="w-4 h-4" />
    </button>
  );

  const handleRemoveDownload = () => {
    if (window.confirm(`Remove "${novel.title}" from this device? You can download it again later.`)) {
      downloads.removeDownload(novel.id);
    }
  };

  const downloadControls = (
    <>
      <button
        onClick={() => (isNovelDownloaded ? handleRemoveDownload() : downloads.saveNovel(novel.id))}
        disabled={!isOnline && !isNovelDownloaded && !downloadProgress}
        className="btn-ghost text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        title={isNovelDownloaded ? 'Saved offline. Tap to remove' : 'Download for offline reading'}
      >
        {downloadProgress ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isNovelDownloaded ? (
          <Check className="w-4 h-4 text-primary-500" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {downloadProgress && (
          <span className="hidden sm:inline tabular-nums">
            {downloadProgress.saved}/{downloadProgress.total || '…'}
          </span>
        )}
      </button>
      {!isNovelDownloaded && (
        <button
          onClick={() => downloads.saveChapter(novel.id, chapterIndex)}
          disabled={!isOnline}
          className="btn-ghost text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save this chapter for offline reading"
        >
          <ArrowDownToLine className="w-4 h-4" />
        </button>
      )}
    </>
  );

  if (focusMode) {
    return (
      <div
        ref={focusRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          handleScrollRatio(ratioFromScroll(el.scrollTop, el.scrollHeight, el.clientHeight));
        }}
        className={`fixed inset-0 z-[100] overflow-y-auto ${theme.surface} ${theme.text} transition-colors duration-300`}
      >
        <div className={`sticky top-0 z-20 ${theme.bar} backdrop-blur-md border-b border-black/5 dark:border-white/10`}>
          <div className="max-w-3xl mx-auto px-3 sm:px-6 pt-3 pb-2 flex items-center justify-between gap-2">
            <button onClick={() => toggleFocus(false)} className="btn-ghost text-sm" title="Exit focus mode (Esc)">
              <Minimize2 className="w-4 h-4" />
              <span className="hidden sm:inline">Exit focus</span>
            </button>
            <p className="text-xs font-medium opacity-70 truncate min-w-0">
              {novel.title} · {chapterIndex + 1}/{totalChapters}
            </p>
            <div className="flex items-center gap-1">
              {bookmarkButton}
              {chaptersButton}
              {settingsButton}
            </div>
          </div>
          <div className="max-w-3xl mx-auto px-3 sm:px-6 pb-2">
            <ReadingProgressBar ratio={scrollRatio} />
          </div>
        </div>
        <div className="max-w-3xl mx-auto p-3 sm:p-6 pb-16">{chapterBody}</div>
        {drawers}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => navigate('library')} className="btn-ghost text-sm">
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Library</span>
        </button>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => toggleLibrary(novel.id)}
            disabled={!isOnline}
            className="btn-ghost text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title={inLib ? 'Remove from library' : 'Add to library'}
          >
            <Library className={`w-4 h-4 ${inLib ? 'text-primary-500' : ''}`} />
          </button>
          {bookmarkButton}
          {downloadControls}
          <button onClick={() => toggleFocus(true)} className="btn-ghost text-sm" title="Distraction-free mode">
            <Maximize2 className="w-4 h-4" />
          </button>
          {settingsButton}
          {chaptersButton}
        </div>
      </div>

      {/* Novel header */}
      <div className="flex gap-4 sm:gap-6 items-start">
        <NovelCover novel={novel} className="w-20 h-28 sm:w-28 sm:h-40 flex-shrink-0 shadow-xl" />
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-extrabold text-xl sm:text-2xl text-slate-800 dark:text-slate-100">
            {novel.title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">by {novel.author}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {novel.genres.map((g) => (
              <span key={g} className="chip bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400">
                {g}
              </span>
            ))}
          </div>

        </div>
      </div>

      {/* Chapter progress and live reading indicator */}
      <div className="sticky top-0 z-20 py-2 -mx-1 px-1 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-400 dark:text-slate-500 font-medium mb-1.5">
          <span>
            Chapter {chapterIndex + 1} of {totalChapters}
            {syncLabel && <span className="ml-2 opacity-80">· {syncLabel}</span>}
          </span>
          <span className="tabular-nums">
            {Math.round(chapterProgress)}% of book · {Math.round(scrollRatio * 100)}% of chapter
          </span>
        </div>
        <ReadingProgressBar ratio={scrollRatio} />
      </div>

      {bookmarkError && (
        <p className="text-sm text-red-500" role="alert">
          {bookmarkError}
        </p>
      )}

      {downloads.error && (
        <p className="text-sm text-red-500" role="alert">
          {downloads.error}
        </p>
      )}

      {chapterBody}
      {drawers}
    </div>
  );
}
