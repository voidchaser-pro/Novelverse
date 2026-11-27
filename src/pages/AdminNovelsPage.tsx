import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Loader2,
  BookOpen,
  Globe,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  Search,
  AlertCircle,
  Inbox,
  FileText,
  Users,
  Clock,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageHeader, EmptyState } from '@/components/UI';
import { fetchAllNovelsForAdmin, deleteNovel, fetchAdminDashboardStats, type AdminDashboardStats } from '@/lib/admin';
import type { Novel } from '@/types';

interface AdminNovel extends Novel {
  tags: string[];
  isPublished: boolean;
}

export function AdminNovelsPage() {
  const { authUser, isAdmin, authLoading, navigate, refreshCatalog } = useApp();
  const [novels, setNovels] = useState<AdminNovel[]>([]);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [confirmDelete, setConfirmDelete] = useState<AdminNovel | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [novelList, dashboardStats] = await Promise.all([
        fetchAllNovelsForAdmin(),
        fetchAdminDashboardStats(),
      ]);
      setNovels(novelList as AdminNovel[]);
      setStats(dashboardStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return novels.filter((n) => {
      if (filter === 'published' && !n.isPublished) return false;
      if (filter === 'draft' && n.isPublished) return false;
      if (!q) return true;
      return `${n.title} ${n.author}`.toLowerCase().includes(q);
    });
  }, [novels, search, filter]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteNovel(confirmDelete.id);
      await load();
      await refreshCatalog();
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete novel.');
    } finally {
      setDeleting(false);
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
        <PageHeader title="Admin" subtitle="Novel management" icon={<ShieldCheck className="w-6 h-6" />} />
        <EmptyState
          icon={<ShieldCheck className="w-7 h-7" />}
          title="Admins only"
          description="This area is reserved for NOVELVERSE administrators."
          action={<button onClick={() => navigate('dashboard')} className="btn-outline">Back to Home</button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novel Management"
        subtitle="Add, edit, publish and manage your novel catalogue"
        icon={<BookOpen className="w-6 h-6" />}
      />

      <div className="flex justify-end">
        <button onClick={() => navigate('admin-novel-editor')} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Novel
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile icon={<BookOpen className="w-4 h-4" />} label="Total Novels" value={stats.total_novels} />
          <StatTile icon={<Globe className="w-4 h-4" />} label="Published" value={stats.published_novels} tone="text-success-500" />
          <StatTile icon={<EyeOff className="w-4 h-4" />} label="Drafts" value={stats.draft_novels} tone="text-amber-500" />
          <StatTile icon={<FileText className="w-4 h-4" />} label="Chapters" value={stats.total_chapters} tone="text-primary-500" />
          <StatTile icon={<Users className="w-4 h-4" />} label="Readers" value={stats.total_readers} tone="text-accent-500" />
          <StatTile icon={<Clock className="w-4 h-4" />} label="Pending" value={stats.pending_submissions} tone="text-secondary-500" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or author…"
            className="input-field pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'published', 'draft'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip capitalize transition-colors ${
                filter === f ? 'bg-primary-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
          <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading novels…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="w-7 h-7" />}
          title="No novels found"
          description="Add your first novel or adjust your search filters."
          action={<button onClick={() => navigate('admin-novel-editor')} className="btn-primary"><Plus className="w-4 h-4" /> Add Novel</button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((novel) => (
            <div key={novel.id} className="glass-card p-4 flex items-center gap-4 card-hover">
              {novel.coverUrl ? (
                <img src={novel.coverUrl} alt="" loading="lazy" className="w-12 h-16 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${novel.coverColor} flex items-center justify-center flex-shrink-0`}>
                  <BookOpen className="w-5 h-5 text-white/60" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{novel.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{novel.author}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`chip text-[10px] ${novel.isPublished ? 'bg-success-50 text-success-600 dark:bg-success-950/30 dark:text-success-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                    {novel.isPublished ? <Globe className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {novel.isPublished ? 'Published' : 'Draft'}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{novel.chapters.length} chapters</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => navigate('admin-novel-editor', { novelId: novel.id })}
                  className="btn-ghost !px-2.5 !py-2"
                  title="Edit novel"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(novel)}
                  className="btn-ghost !px-2.5 !py-2 !text-error-600 dark:!text-error-400"
                  title="Delete novel"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in" onClick={() => setConfirmDelete(null)}>
          <div className="glass-card max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Delete novel?</h3>
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost !px-2 !py-2"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              "{confirmDelete.title}" will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-primary flex-1 !bg-error-600 !from-error-600 !to-error-700">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon, label, value, tone = 'text-slate-500' }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <div className="glass-card p-4">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-display font-bold text-2xl text-slate-800 dark:text-slate-100 mt-2">{value}</p>
    </div>
  );
}
