import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  BookOpen,
  FileText,
  Globe,
  EyeOff,
  Check,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageHeader } from '@/components/UI';
import { ALL_GENRES } from '@/data/mockData';
import { fetchAllNovelsForAdmin, createNovel, updateNovel, uploadNovelCover, type NovelInput } from '@/lib/admin';
import type { Chapter, Genre } from '@/types';

const COVER_COLORS = [
  'from-emerald-600 to-teal-800',
  'from-blue-600 to-indigo-800',
  'from-amber-500 to-orange-700',
  'from-rose-500 to-pink-700',
  'from-slate-600 to-slate-800',
  'from-cyan-600 to-blue-800',
];

function makeChapterId(): string {
  return `ch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function AdminNovelEditorPage() {
  const { authUser, isAdmin, authLoading, navigate, pageParams, refreshCatalog } = useApp();
  const novelId = pageParams.novelId || null;

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [year, setYear] = useState<number | null>(null);

  const [loading, setLoading] = useState(Boolean(novelId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const autosaveRef = useRef<number | null>(null);

  const loadNovel = useCallback(async () => {
    if (!novelId) {
      setLoading(false);
      return;
    }
    try {
      const all = await fetchAllNovelsForAdmin();
      const novel = all.find((n) => n.id === novelId);
      if (!novel) {
        setError('Novel not found.');
        setLoading(false);
        return;
      }
      setTitle(novel.title);
      setAuthor(novel.author);
      setDescription(novel.synopsis);
      setCoverUrl(novel.coverUrl);
      setCoverColor(novel.coverColor);
      setGenres(novel.genres);
      setTags(novel.tags ?? []);
      setChapters(novel.chapters);
      setIsPublished(novel.isPublished ?? false);
      setYear(novel.year);
      if (novel.chapters.length > 0) {
        setSelectedChapterIdx(0);
        setChapterTitle(novel.chapters[0].title);
        setChapterContent(novel.chapters[0].content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load novel.');
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    if (isAdmin) loadNovel();
  }, [isAdmin, loadNovel]);

  function selectChapter(idx: number) {
    if (idx < 0 || idx >= chapters.length) return;
    setSelectedChapterIdx(idx);
    setChapterTitle(chapters[idx].title);
    setChapterContent(chapters[idx].content);
  }

  function addChapter() {
    const newCh: Chapter = {
      id: makeChapterId(),
      title: `Chapter ${chapters.length + 1}`,
      content: '',
      wordCount: 0,
    };
    const next = [...chapters, newCh];
    setChapters(next);
    setSelectedChapterIdx(next.length - 1);
    setChapterTitle(newCh.title);
    setChapterContent('');
  }

  function deleteChapter(idx: number) {
    const next = chapters.filter((_, i) => i !== idx);
    setChapters(next);
    if (selectedChapterIdx >= next.length) {
      const newIdx = Math.max(0, next.length - 1);
      setSelectedChapterIdx(newIdx);
      if (next[newIdx]) {
        setChapterTitle(next[newIdx].title);
        setChapterContent(next[newIdx].content);
      } else {
        setChapterTitle('');
        setChapterContent('');
      }
    }
  }

  function moveChapter(idx: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= chapters.length) return;
    const next = [...chapters];
    [next[idx], next[target]] = [next[target], next[idx]];
    setChapters(next);
    setSelectedChapterIdx(target);
  }

  function syncCurrentChapter() {
    setChapters((prev) =>
      prev.map((ch, i) =>
        i === selectedChapterIdx
          ? { ...ch, title: chapterTitle, content: chapterContent, wordCount: countWords(chapterContent) }
          : ch
      )
    );
  }

  useEffect(() => {
    if (chapters.length === 0) return;
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(() => {
      syncCurrentChapter();
    }, 800);
    return () => {
      if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterTitle, chapterContent]);

  function toggleGenre(genre: Genre) {
    setGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const tempId = novelId || `temp-${Date.now()}`;
      const url = await uploadNovelCover(file, tempId, file.type || 'image/jpeg');
      setCoverUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload cover.');
    }
  }

  async function handleSave(publish?: boolean) {
    setError(null);
    setSuccess(false);

    syncCurrentChapter();

    if (!title.trim() || !author.trim()) {
      setError('Title and author are required.');
      return;
    }

    setSaving(true);
    try {
      const input: NovelInput = {
        title: title.trim(),
        author: author.trim(),
        description: description.trim() || null,
        cover_url: coverUrl,
        cover_color: coverColor,
        genres,
        tags,
        chapters,
        is_published: publish ?? isPublished,
        year: year ?? new Date().getFullYear(),
      };

      if (novelId) {
        await updateNovel(novelId, input);
      } else {
        const newId = await createNovel(input);
        navigate('admin-novel-editor', { novelId: newId });
      }

      if (publish !== undefined) setIsPublished(publish);
      await refreshCatalog();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save novel.');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking your access…
      </div>
    );
  }

  if (!isAdmin || !authUser) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin" subtitle="Novel editor" icon={<BookOpen className="w-6 h-6" />} />
        <div className="glass-card p-8 text-center">
          <p className="text-slate-600 dark:text-slate-300 mb-4">Admins only.</p>
          <button onClick={() => navigate('dashboard')} className="btn-outline">Back to Home</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading novel…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title={novelId ? 'Edit Novel' : 'New Novel'}
          subtitle={novelId ? title || 'Editing existing novel' : 'Create a new novel for the library'}
          icon={<BookOpen className="w-6 h-6" />}
        />
        <button onClick={() => navigate('admin-novels')} className="btn-ghost flex-shrink-0">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
          <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-success-50 dark:bg-success-950/30 border border-success-200 dark:border-success-800/50">
          <Check className="w-5 h-5 text-success-500 flex-shrink-0" />
          <p className="text-sm text-success-700 dark:text-success-400">Novel saved successfully.</p>
        </div>
      )}

      {/* Cover + basic info */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="glass-card p-5 space-y-4">
          <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">Cover Image</h3>
          <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${coverColor} flex items-center justify-center`}>
                <BookOpen className="w-12 h-12 text-white/40" />
              </div>
            )}
          </div>
          <label className="btn-outline w-full cursor-pointer justify-center text-center">
            <Upload className="w-4 h-4" />
            <span>Upload cover</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
          </label>
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Or pick a colour</p>
            <div className="flex flex-wrap gap-2">
              {COVER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCoverColor(c); setCoverUrl(null); }}
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c} ${coverColor === c && !coverUrl ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card p-5 space-y-4 lg:col-span-2">
          <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200">Details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Title</span>
              <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novel title" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Author</span>
              <input className="input-field" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Description / Synopsis</span>
            <textarea className="input-field resize-none" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Write a compelling synopsis…" />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Publication Year</span>
              <input
                type="number"
                className="input-field"
                value={year ?? ''}
                onChange={(e) => setYear(e.target.value ? parseInt(e.target.value, 10) : null)}
                placeholder={String(new Date().getFullYear())}
              />
            </label>
            <div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Status</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsPublished(false)}
                  className={`chip ${!isPublished ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                >
                  <EyeOff className="w-3.5 h-3.5" /> Draft
                </button>
                <button
                  onClick={() => setIsPublished(true)}
                  className={`chip ${isPublished ? 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                >
                  <Globe className="w-3.5 h-3.5" /> Published
                </button>
              </div>
            </div>
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">Genres</span>
            <div className="flex flex-wrap gap-2">
              {ALL_GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  className={`chip transition-colors ${genres.includes(g) ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">Tags</span>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span key={tag} className="chip bg-accent-50 text-accent-600 dark:bg-accent-950/30 dark:text-accent-400">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="ml-1 hover:text-error-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag and press Enter"
              />
              <button onClick={addTag} className="btn-outline"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapter management */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Chapters ({chapters.length})
          </h3>
          <button onClick={addChapter} className="btn-outline">
            <Plus className="w-4 h-4" /> Add Chapter
          </button>
        </div>

        {chapters.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No chapters yet. Add your first chapter to start writing.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Chapter list */}
            <div className="space-y-2 lg:max-h-[500px] lg:overflow-y-auto no-scrollbar">
              {chapters.map((ch, idx) => (
                <div
                  key={ch.id}
                  className={`p-3 rounded-xl cursor-pointer transition-all border ${
                    idx === selectedChapterIdx
                      ? 'bg-primary-50 dark:bg-primary-950/30 border-primary-300 dark:border-primary-700'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => selectChapter(idx)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 flex-shrink-0">{idx + 1}</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex-1">{ch.title}</p>
                    <div className="flex flex-col gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => moveChapter(idx, 'up')}
                        disabled={idx === 0}
                        className="text-slate-400 hover:text-primary-500 disabled:opacity-30"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveChapter(idx, 'down')}
                        disabled={idx === chapters.length - 1}
                        className="text-slate-400 hover:text-primary-500 disabled:opacity-30"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChapter(idx); }}
                      className="text-slate-400 hover:text-error-500 flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{ch.wordCount} words</p>
                </div>
              ))}
            </div>

            {/* Chapter editor */}
            <div className="lg:col-span-2 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Chapter Title</span>
                <input
                  className="input-field"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder="Chapter title"
                />
              </label>
              <label className="block">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Chapter Content</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{countWords(chapterContent)} words</span>
                </div>
                <textarea
                  className="input-field resize-y font-serif text-base leading-relaxed"
                  rows={18}
                  value={chapterContent}
                  onChange={(e) => setChapterContent(e.target.value)}
                  placeholder="Write or paste the chapter content here…"
                />
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500">Changes auto-save to the chapter list as you type.</p>
            </div>
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-4 z-30">
        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className={`chip ${isPublished ? 'bg-success-50 text-success-600 dark:bg-success-950/30 dark:text-success-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'}`}>
              {isPublished ? <Globe className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {isPublished ? 'Published' : 'Draft'}
            </span>
            <span className="hidden sm:inline">{chapters.length} chapters · {chapters.reduce((s, c) => s + c.wordCount, 0).toLocaleString()} words</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleSave(false)} disabled={saving} className="btn-outline">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Draft
            </button>
            <button onClick={() => handleSave(true)} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Save & Publish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
