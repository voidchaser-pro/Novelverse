import { useState, useMemo } from 'react';
import { Search, X, SlidersHorizontal, Compass, Star } from 'lucide-react';
import { ALL_GENRES } from '@/data/mockData';
import type { Genre } from '@/types';
import { NovelCard, NovelCover } from '@/components/NovelCard';
import { RecentReadingList } from '@/components/reader/RecentReadingList';
import { PageHeader, EmptyState } from '@/components/UI';
import { useApp } from '@/context/AppContext';

type SortOption = 'trending' | 'rating' | 'newest' | 'title';

export function DiscoverPage() {
  const { navigate, catalog, catalogLoading, catalogError, refreshCatalog } = useApp();
  const [query, setQuery] = useState('');
  const [activeGenres, setActiveGenres] = useState<Genre[]>([]);
  const [sort, setSort] = useState<SortOption>('trending');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = [...catalog];

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.author.toLowerCase().includes(q) ||
          n.synopsis.toLowerCase().includes(q) ||
          n.genres.some((g) => g.toLowerCase().includes(q))
      );
    }

    if (activeGenres.length > 0) {
      result = result.filter((n) => activeGenres.every((g) => n.genres.includes(g)));
    }

    switch (sort) {
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        result.sort((a, b) => b.year - a.year);
        break;
      case 'title':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'trending':
      default:
        result.sort((a, b) => Number(b.trending) - Number(a.trending) || b.ratingCount - a.ratingCount);
        break;
    }

    return result;
  }, [catalog, query, activeGenres, sort]);

  const toggleGenre = (g: Genre) => {
    setActiveGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const clearFilters = () => {
    setQuery('');
    setActiveGenres([]);
    setSort('trending');
  };

  const hasFilters = query || activeGenres.length > 0 || sort !== 'trending';

  // Featured novel (changes based on filters, or a random trending one)
  const featured = useMemo(() => {
    if (query || activeGenres.length > 0) return null;
    return catalog[0] ?? null;
  }, [catalog, query, activeGenres]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover"
        subtitle="Find your next obsession"
        icon={<Compass className="w-6 h-6" />}
      />

      {/* Search bar */}
      <div className="flex gap-3 animate-fade-in">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search novels, authors, genres…"
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
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`btn-outline !px-4 ${showFilters ? '!bg-primary-50 dark:!bg-primary-950/40' : ''}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-card p-5 space-y-4 animate-scale-in">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Genres</p>
            <div className="flex flex-wrap gap-2">
              {ALL_GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  className={`chip transition-all duration-200 ${
                    activeGenres.includes(g)
                      ? 'bg-primary-700 text-white shadow-md shadow-primary-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Sort by</p>
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'trending', label: 'Trending' },
                { id: 'rating', label: 'Top Rated' },
                { id: 'newest', label: 'Newest' },
                { id: 'title', label: 'A–Z' },
              ] as { id: SortOption; label: string }[]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSort(opt.id)}
                  className={`chip transition-all duration-200 ${
                    sort === opt.id
                      ? 'bg-accent-500 text-slate-900 shadow-md shadow-accent-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost text-sm text-error-500">
              <X className="w-4 h-4" />
              Clear all filters
            </button>
          )}
        </div>
      )}

      {!hasFilters && <RecentReadingList mode="continue" limit={3} />}

      {/* Featured banner (only when no active search) */}
      {featured && (
        <div
          onClick={() => navigate('reader', { novelId: featured.id })}
          className="relative overflow-hidden rounded-3xl cursor-pointer group animate-fade-in-up"
        >
          <div className={`bg-gradient-to-br ${featured.coverColor} p-6 sm:p-8`}>
            <div className="absolute inset-0 bg-grid-pattern opacity-20" />
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex gap-6 items-center">
              <NovelCover
                novel={featured}
                className="w-24 h-32 sm:w-32 sm:h-44 flex-shrink-0 shadow-2xl group-hover:scale-105 transition-transform duration-400"
              />
              <div className="flex-1 text-white">
                <span className="chip bg-white/20 text-white backdrop-blur-sm mb-3">
                  <Star className="w-3 h-3 fill-white" />
                  Editor's Pick
                </span>
                <h3 className="font-display font-extrabold text-xl sm:text-3xl leading-tight drop-shadow-md">
                  {featured.title}
                </h3>
                <p className="text-white/80 text-sm mt-1">by {featured.author}</p>
                <p className="text-white/70 text-sm mt-3 line-clamp-2 max-w-2xl hidden sm:block">
                  {featured.synopsis}
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-white text-white" />
                    <span className="font-bold text-sm">{featured.rating}</span>
                  </div>
                  <span className="text-white/50">·</span>
                  <span className="text-sm text-white/80">{featured.ratingCount.toLocaleString()} ratings</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {catalogLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
          ))}
        </div>
      ) : catalogError ? (
        <EmptyState
          icon={<Search className="w-7 h-7" />}
          title="Couldn't load novels"
          description={catalogError}
          action={
            <button onClick={() => refreshCatalog()} className="btn-primary">
              Try again
            </button>
          }
        />
      ) : filtered.length > 0 ? (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            {filtered.length} {filtered.length === 1 ? 'novel' : 'novels'} found
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((novel) => (
              <NovelCard key={novel.id} novel={novel} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Search className="w-7 h-7" />}
          title="No novels found"
          description="Try adjusting your search or filters. Maybe explore a new genre?"
          action={
            <button onClick={clearFilters} className="btn-primary">
              Clear filters
            </button>
          }
        />
      )}
    </div>
  );
}
