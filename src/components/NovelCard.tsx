import { useState } from 'react';
import { Star, BookOpen, Bookmark, BookmarkCheck, TrendingUp, Sparkles, BookOpenText } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { Novel } from '@/types';

interface NovelCardProps {
  novel: Novel;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export function NovelCover({ novel, className = '' }: { novel: Novel; className?: string }) {
  const [imgError, setImgError] = useState(false);
  const hasRealCover = novel.coverUrl && !imgError;

  if (hasRealCover) {
    return (
      <div className={`relative rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 ${className}`}>
        <img
          src={novel.coverUrl!}
          alt={`Cover of ${novel.title}`}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        {/* Subtle gradient overlay at bottom for text legibility if needed */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
      </div>
    );
  }

  // Elegant placeholder cover using gradient + title
  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-gradient-to-br ${novel.coverColor} ${className}`}
    >
      {/* Decorative pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-40" />
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-white/10 blur-xl" />
      <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-black/10 blur-lg" />

      {/* Book icon watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20">
        <BookOpenText className="w-1/3 h-1/3 text-white" />
      </div>

      {/* Title text on cover */}
      <div className="absolute inset-0 flex flex-col justify-end p-3">
        <p className="font-display font-bold text-white text-sm leading-tight line-clamp-2 drop-shadow-md">
          {novel.title}
        </p>
        <p className="text-white/70 text-[10px] mt-1 font-medium">{novel.author}</p>
      </div>

      {/* Sheen */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/10" />
    </div>
  );
}

export function NovelCard({ novel, onClick, size = 'md' }: NovelCardProps) {
  const { isInLibrary, toggleLibrary, navigate, readingProgress } = useApp();
  const inLib = isInLibrary(novel.id);
  const progress = readingProgress[novel.id]?.progress ?? 0;

  const handleClick = () => {
    if (onClick) onClick();
    else navigate('reader', { novelId: novel.id });
  };

  return (
    <div
      onClick={handleClick}
      className="group cursor-pointer card-hover animate-fade-in-up"
    >
      <div className={`relative w-full aspect-[3/4]`}>
        <NovelCover novel={novel} className="w-full h-full group-hover:scale-[1.03] transition-transform duration-400" />

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          {novel.trending && (
            <span className="chip bg-orange-500/90 text-white backdrop-blur-sm">
              <TrendingUp className="w-3 h-3" />
              Trending
            </span>
          )}
          {novel.newRelease && (
            <span className="chip bg-secondary-500/90 text-white backdrop-blur-sm">
              <Sparkles className="w-3 h-3" />
              New
            </span>
          )}
        </div>

        {/* Library toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLibrary(novel.id);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/30 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/50 transition-colors"
          aria-label={inLib ? 'Remove from library' : 'Add to library'}
        >
          {inLib ? (
            <BookmarkCheck className="w-4 h-4 text-primary-300" />
          ) : (
            <Bookmark className="w-4 h-4" />
          )}
        </button>

        {/* Progress indicator overlay */}
        {progress > 0 && progress < 100 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
            <div
              className="h-full bg-gradient-to-r from-primary-400 to-accent-400"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {progress === 100 && (
          <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-success-500 flex items-center justify-center text-white shadow-lg">
            <Star className="w-3 h-3 fill-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-3 px-0.5">
        <div className="flex items-center gap-1 mb-1">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{novel.rating}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">({novel.ratingCount.toLocaleString()})</span>
        </div>
        <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
          {novel.title}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{novel.author}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {novel.genres.slice(0, 2).map((g) => (
            <span
              key={g}
              className="chip bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400"
            >
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NovelCardRow({ novel, onClick }: { novel: Novel; onClick?: () => void }) {
  const { navigate, readingProgress } = useApp();
  const progress = readingProgress[novel.id]?.progress ?? 0;
  return (
    <div
      onClick={() => (onClick ? onClick() : navigate('reader', { novelId: novel.id }))}
      className="flex gap-4 items-center group cursor-pointer p-3 rounded-2xl hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors"
    >
      <NovelCover novel={novel} className="w-16 h-20 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
          {novel.title}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{novel.author}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{novel.rating}</span>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {novel.chapters.length} chapters
          </span>
          {progress > 0 && progress < 100 && (
            <>
              <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
              <span className="text-xs font-semibold text-primary-500">{progress}%</span>
            </>
          )}
        </div>
      </div>
      <BookOpen className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors flex-shrink-0" />
    </div>
  );
}
