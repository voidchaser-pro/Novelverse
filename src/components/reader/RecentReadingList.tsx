import { useMemo } from 'react';
import { BookOpen, ChevronRight, History, PlayCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NovelCover } from '@/components/NovelCard';
import { ReadingProgressBar } from '@/components/reader/ReadingProgressBar';
import type { Novel, ReadingProgress } from '@/types';

interface RecentReadingListProps {
  mode: 'continue' | 'history';
  limit: number;
}

interface RecentEntry {
  novel: Novel;
  progress: ReadingProgress;
}

export function RecentReadingList({ mode, limit }: RecentReadingListProps) {
  const { catalog, readingProgress, navigate } = useApp();

  const entries = useMemo<RecentEntry[]>(() => {
    return catalog
      .map((novel) => ({ novel, progress: readingProgress[novel.id] }))
      .filter((e): e is RecentEntry => {
        if (!e.progress) return false;
        return mode === 'history' || e.progress.progress < 100;
      })
      .sort((a, b) => b.progress.lastReadAt.localeCompare(a.progress.lastReadAt))
      .slice(0, limit);
  }, [catalog, readingProgress, mode, limit]);

  if (entries.length === 0) return null;

  const isContinue = mode === 'continue';
  const Icon = isContinue ? PlayCircle : History;

  return (
    <section className="space-y-3 animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary-500" />
        <h2 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">
          {isContinue ? 'Continue Reading' : 'Reading History'}
        </h2>
      </div>
      <div className={isContinue ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'flex gap-3 overflow-x-auto no-scrollbar pb-1'}>
        {entries.map(({ novel, progress }) => {
          const chapter = novel.chapters[progress.chapterIndex];
          return (
            <button
              key={novel.id}
              onClick={() => navigate('reader', { novelId: novel.id })}
              className={`glass-card p-3 flex gap-3 text-left card-hover group ${
                isContinue ? '' : 'w-64 flex-shrink-0'
              }`}
            >
              <NovelCover novel={novel} className="w-14 h-20 flex-shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col">
                <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {novel.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  <BookOpen className="inline w-3 h-3 mr-1 -mt-0.5" />
                  Chapter {progress.chapterIndex + 1} of {novel.chapters.length}
                  {chapter ? ` · ${chapter.title}` : ''}
                </p>
                <div className="mt-auto pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    <span>{Math.round(progress.progress)}% complete</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <ReadingProgressBar ratio={progress.progress / 100} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
