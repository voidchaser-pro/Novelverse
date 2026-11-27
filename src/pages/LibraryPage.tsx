import { useState, useMemo } from 'react';
import { BookMarked, Clock, CheckCircle2, Search, X } from 'lucide-react';
import { NovelCard } from '@/components/NovelCard';
import { PageHeader, EmptyState, ProgressBar } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { NovelCover } from '@/components/NovelCard';
import { RecentReadingList } from '@/components/reader/RecentReadingList';

type Tab = 'all' | 'reading' | 'completed' | 'want';

export function LibraryPage() {
  const { library, readingProgress, navigate, catalog } = useApp();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const libraryNovels = useMemo(() => {
    return catalog.filter((n) => library.includes(n.id));
  }, [catalog, library]);

  const filtered = useMemo(() => {
    let result = libraryNovels;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((n) => n.title.toLowerCase().includes(q) || n.author.toLowerCase().includes(q));
    }
    if (tab === 'reading') {
      result = result.filter((n) => {
        const rp = readingProgress[n.id];
        return rp && rp.progress > 0 && rp.progress < 100;
      });
    } else if (tab === 'completed') {
      result = result.filter((n) => readingProgress[n.id]?.progress === 100);
    } else if (tab === 'want') {
      result = result.filter((n) => !readingProgress[n.id] || readingProgress[n.id].progress === 0);
    }
    return result;
  }, [libraryNovels, query, tab, readingProgress]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: libraryNovels.length },
    {
      id: 'reading',
      label: 'Reading',
      count: libraryNovels.filter((n) => {
        const rp = readingProgress[n.id];
        return rp && rp.progress > 0 && rp.progress < 100;
      }).length,
    },
    {
      id: 'completed',
      label: 'Completed',
      count: libraryNovels.filter((n) => readingProgress[n.id]?.progress === 100).length,
    },
    {
      id: 'want',
      label: 'Want to Read',
      count: libraryNovels.filter((n) => !readingProgress[n.id] || readingProgress[n.id].progress === 0).length,
    },
  ];

  if (libraryNovels.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Library" subtitle="Your personal reading collection" icon={<BookMarked className="w-6 h-6" />} />
        <EmptyState
          icon={<BookMarked className="w-7 h-7" />}
          title="Your library is empty"
          description="Browse the Discover page and bookmark novels to add them here."
          action={
            <button onClick={() => navigate('discover')} className="btn-primary">
              Discover Novels
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Library"
        subtitle={`${libraryNovels.length} novels in your collection`}
        icon={<BookMarked className="w-6 h-6" />}
      />

      <RecentReadingList mode="history" limit={10} />

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row gap-3 animate-fade-in">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library…"
            className="input-field !pl-12 !pr-10"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 animate-fade-in">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`chip flex-shrink-0 transition-all duration-200 ${
              tab === t.id
                ? 'bg-primary-700 text-white shadow-md shadow-primary-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {t.label}
            <span className={`px-1.5 rounded-full text-[10px] ${tab === t.id ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Currently reading strip */}
      {tab === 'all' && filtered.filter((n) => readingProgress[n.id]?.progress > 0 && readingProgress[n.id]?.progress < 100).length > 0 && (
        <section className="animate-fade-in-up">
          <h2 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100 mb-3">Currently Reading</h2>
          <div className="space-y-3">
            {filtered
              .filter((n) => readingProgress[n.id]?.progress > 0 && readingProgress[n.id]?.progress < 100)
              .map((novel) => {
                const rp = readingProgress[novel.id];
                return (
                  <div
                    key={novel.id}
                    onClick={() => navigate('reader', { novelId: novel.id })}
                    className="glass-card p-4 flex gap-4 card-hover cursor-pointer group"
                  >
                    <NovelCover novel={novel} className="w-14 h-18 flex-shrink-0" />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {novel.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Chapter {rp.chapterIndex + 1} of {novel.chapters.length}
                      </p>
                      <div className="mt-auto pt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {rp.progress}% · Last read {rp.lastRead}
                          </span>
                        </div>
                        <ProgressBar value={rp.progress} max={100} />
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((novel) => {
            const rp = readingProgress[novel.id];
            return (
              <div key={novel.id} className="relative">
                <NovelCard novel={novel} />
                {rp && rp.progress === 100 && (
                  <div className="absolute top-2 left-2 chip bg-success-500/90 text-white backdrop-blur-sm z-10">
                    <CheckCircle2 className="w-3 h-3" />
                    Done
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Search className="w-7 h-7" />}
          title="No novels in this category"
          description="Try a different tab or adjust your search."
        />
      )}
    </div>
  );
}
