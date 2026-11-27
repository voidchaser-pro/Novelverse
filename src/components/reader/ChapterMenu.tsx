import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import type { Novel, ChapterBookmark } from '@/types';
import { ReaderDrawer } from '@/components/reader/ReaderDrawer';

type MenuTab = 'chapters' | 'bookmarks';

interface ChapterMenuProps {
  novel: Novel;
  currentIndex: number;
  bookmarks: ChapterBookmark[];
  onSelect: (index: number) => void;
  onRemoveBookmark: (index: number) => void;
  onClose: () => void;
}

export function ChapterMenu({ novel, currentIndex, bookmarks, onSelect, onRemoveBookmark, onClose }: ChapterMenuProps) {
  const [tab, setTab] = useState<MenuTab>('chapters');
  const sortedBookmarks = [...bookmarks].sort((a, b) => a.chapterIndex - b.chapterIndex);

  return (
    <ReaderDrawer title="Chapters" onClose={onClose}>
      <div className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60">
          {(['chapters', 'bookmarks'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === id
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {id === 'chapters' ? `Chapters (${novel.chapters.length})` : `Bookmarks (${bookmarks.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === 'chapters' && (
        <div className="p-3 space-y-1">
          {novel.chapters.map((ch, i) => (
            <button
              key={ch.id}
              onClick={() => onSelect(i)}
              className={`w-full text-left p-3 rounded-xl transition-colors flex items-center gap-3 ${
                i === currentIndex
                  ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i === currentIndex
                    ? 'bg-primary-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold line-clamp-1">{ch.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{ch.wordCount} words</p>
              </div>
              {bookmarks.some((b) => b.chapterIndex === i) && (
                <Bookmark className="w-3.5 h-3.5 flex-shrink-0 fill-primary-500 text-primary-500" />
              )}
            </button>
          ))}
        </div>
      )}

      {tab === 'bookmarks' && (
        <div className="p-3 space-y-1">
          {sortedBookmarks.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 p-3">
              No bookmarks yet. Use the bookmark button while reading to save a chapter.
            </p>
          )}
          {sortedBookmarks.map((b) => {
            const chapter = novel.chapters[b.chapterIndex];
            if (!chapter) return null;
            return (
              <div
                key={b.chapterIndex}
                className="flex items-center gap-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
              >
                <button onClick={() => onSelect(b.chapterIndex)} className="flex-1 min-w-0 text-left p-3 flex items-center gap-3">
                  <Bookmark className="w-4 h-4 flex-shrink-0 fill-primary-500 text-primary-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold line-clamp-1 text-slate-700 dark:text-slate-200">
                      Chapter {b.chapterIndex + 1}: {chapter.title}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => onRemoveBookmark(b.chapterIndex)}
                  className="btn-ghost !px-2 !py-2 mr-1 text-slate-400 hover:text-red-500"
                  aria-label={`Remove bookmark for chapter ${b.chapterIndex + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ReaderDrawer>
  );
}
