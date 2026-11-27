import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  AlertCircle,
  Shield,
  BookOpen,
  Sparkles,
  ChevronRight,
  Trash2,
  MessageSquare,
  Inbox,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { extractEpubMetadata } from '@/lib/epub';
import { uploadEpubFile, uploadCoverImage } from '@/lib/storage';
import { fetchOwnSubmissions, withdrawSubmission } from '@/lib/submissions';
import type { NovelSubmission, EpubMetadata } from '@/types';
import { PageHeader, EmptyState } from '@/components/UI';

type UploadPhase = 'idle' | 'parsing' | 'uploading' | 'success' | 'error';

const DEFAULT_COVER_COLOR = 'from-slate-700 to-slate-900';

export function SubmissionCentrePage() {
  const { authUser, navigate } = useApp();

  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<EpubMetadata | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<NovelSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);

  const loadSubmissions = useCallback(async () => {
    if (!authUser) return;
    setLoadingSubs(true);
    try {
      setSubmissions(await fetchOwnSubmissions(authUser.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your submissions.');
    } finally {
      setLoadingSubs(false);
    }
  }, [authUser]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  async function handleFileSelected(selectedFile: File) {
    setError(null);
    setFile(selectedFile);
    setPhase('parsing');

    // Validate file type
    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith('.epub') && selectedFile.type !== 'application/epub+zip') {
      setError('Please upload a valid .epub file.');
      setPhase('error');
      return;
    }

    try {
      const meta = await extractEpubMetadata(selectedFile);
      setMetadata(meta);
      if (meta.title) setTitle(meta.title);
      if (meta.author) setAuthor(meta.author);
      if (meta.description) setDescription(meta.description);
      setPhase('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read EPUB file.';
      setError(`EPUB parsing failed: ${msg}`);
      setPhase('error');
    }
  }

  async function handleSubmit() {
    if (!supabase || !authUser || !file || !metadata) return;
    if (!title.trim() || !author.trim()) {
      setError('Title and author are required.');
      return;
    }
    if (!rightsConfirmed) {
      setError('Please confirm you have the rights to share this content.');
      return;
    }

    setPhase('uploading');
    setError(null);

    try {
      // Generate a temporary ID for storage paths
      const tempId = crypto.randomUUID();

      // Upload cover image to storage
      let coverUrl: string | null = null;
      if (metadata.coverDataUrl) {
        coverUrl = await uploadCoverImage(metadata.coverDataUrl, tempId);
      }

      // Upload EPUB file to storage
      const epubPath = await uploadEpubFile(file, tempId);

      // Insert submission record
      const { data, error: insertError } = await supabase
        .from('novel_submissions')
        .insert({
          submitter_id: authUser.id,
          title: title.trim(),
          author: author.trim(),
          description: description.trim() || null,
          cover_url: coverUrl,
          cover_color: DEFAULT_COVER_COLOR,
          chapters: metadata.chapters,
          epub_storage_path: epubPath,
          epub_file_name: file.name,
          rights_confirmed: true,
          status: 'pending',
        })
        .select()
        .maybeSingle();

      if (insertError) throw insertError;

      setPhase('success');
      if (data) setSubmissions((prev) => [data as NovelSubmission, ...prev]);

      // Reset form after a delay
      setTimeout(() => {
        setFile(null);
        setMetadata(null);
        setTitle('');
        setAuthor('');
        setDescription('');
        setRightsConfirmed(false);
        setPhase('idle');
      }, 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit. Please try again.';
      setError(msg);
      setPhase('error');
    }
  }

  function handleReset() {
    setFile(null);
    setMetadata(null);
    setTitle('');
    setAuthor('');
    setDescription('');
    setRightsConfirmed(false);
    setError(null);
    setPhase('idle');
  }

  async function handleDeleteSubmission(sub: NovelSubmission) {
    if (!authUser) return;
    try {
      await withdrawSubmission(sub, authUser.id);
      setSubmissions((prev) => prev.filter((s) => s.id !== sub.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not withdraw this submission.');
    }
  }

  // Not signed in
  if (!authUser) {
    return (
      <div className="space-y-6">
        <PageHeader title="Submission Centre" subtitle="Submit your EPUB novels to NOVELVERSE" icon={<Upload className="w-6 h-6" />} />
        <EmptyState
          icon={<Shield className="w-7 h-7" />}
          title="Sign in to submit novels"
          description="You need an account to submit EPUB files. Sign in or create an account to get started."
          action={
            <button onClick={() => navigate('auth')} className="btn-primary">
              Sign In / Sign Up
            </button>
          }
        />
      </div>
    );
  }

  const statusConfig = {
    pending: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800/40', label: 'Pending Review' },
    approved: { icon: CheckCircle2, color: 'text-success-500', bg: 'bg-success-50 dark:bg-success-950/30', border: 'border-success-200 dark:border-success-800/40', label: 'Approved' },
    rejected: { icon: XCircle, color: 'text-error-500', bg: 'bg-error-50 dark:bg-error-950/30', border: 'border-error-200 dark:border-error-800/40', label: 'Rejected' },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submission Centre"
        subtitle="Submit your EPUB novels to NOVELVERSE"
        icon={<Upload className="w-6 h-6" />}
      />

      {/* Upload form */}
      <div className="glass-card p-6 sm:p-8 animate-fade-in-up">
        {phase === 'success' ? (
          <div className="text-center py-8 animate-scale-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-success-400 to-success-600 flex items-center justify-center text-white shadow-lg shadow-success-500/30 mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Submission Received!</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto">
              Your novel is now pending review. An administrator will review it shortly. You'll see the status update below.
            </p>
          </div>
        ) : (
          <>
            {/* File drop zone */}
            {!file ? (
              <div className="text-center py-8">
                <label className="cursor-pointer group">
                  <input
                    type="file"
                    accept=".epub,application/epub+zip"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) handleFileSelected(selected);
                    }}
                  />
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-primary-500/15 to-accent-500/15 flex items-center justify-center text-primary-500 mb-4 group-hover:scale-105 transition-transform">
                    <Upload className="w-9 h-9" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">
                    Upload an EPUB File
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm mx-auto">
                    Drag and drop or click to browse. We'll extract the cover, title, author, description, and chapters automatically.
                  </p>
                  <span className="btn-primary mt-5 inline-flex">
                    <FileText className="w-4 h-4" />
                    Choose EPUB File
                  </span>
                </label>
              </div>
            ) : (
              <div className="space-y-5">
                {/* File info */}
                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-100/60 dark:bg-slate-800/40">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-white flex-shrink-0">
                    {phase === 'parsing' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                      {metadata && ` · ${metadata.chapters.length} chapters detected`}
                    </p>
                  </div>
                  <button onClick={handleReset} className="btn-ghost !px-2.5 !py-2 text-sm">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>

                {/* Cover preview */}
                {metadata?.coverDataUrl && (
                  <div className="flex gap-4 items-start">
                    <img
                      src={metadata.coverDataUrl}
                      alt="Extracted cover"
                      className="w-20 h-28 rounded-xl object-cover shadow-lg flex-shrink-0"
                    />
                    <div className="flex-1 pt-1">
                      <p className="text-xs font-semibold text-success-600 dark:text-success-400 flex items-center gap-1.5 mb-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        Cover image extracted from EPUB
                      </p>
                      <p className="text-xs text-slate-400">The original embedded cover will be used — no generated placeholder.</p>
                    </div>
                  </div>
                )}

                {phase === 'parsing' && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting metadata from EPUB…
                  </div>
                )}

                {/* Editable metadata fields */}
                {phase !== 'parsing' && phase !== 'uploading' && (
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Title</label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="input-field"
                          placeholder="Novel title"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Author</label>
                        <input
                          type="text"
                          value={author}
                          onChange={(e) => setAuthor(e.target.value)}
                          className="input-field"
                          placeholder="Author name"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">
                        Description <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="input-field resize-none"
                        placeholder="A brief synopsis of the novel…"
                      />
                    </div>

                    {/* Rights confirmation */}
                    <label className="flex items-start gap-3 p-4 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={rightsConfirmed}
                        onChange={(e) => setRightsConfirmed(e.target.checked)}
                        className="mt-0.5 w-5 h-5 rounded-lg accent-primary-500 flex-shrink-0"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-primary-500" />
                          I confirm I have the rights or permission to share this content
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          By submitting, you affirm that you own the copyright or have explicit permission to distribute this work.
                        </p>
                      </div>
                    </label>

                    {error && (
                      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
                        <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button onClick={handleReset} className="btn-ghost">
                        Cancel
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={!rightsConfirmed || !title.trim() || !author.trim()}
                        className="btn-primary flex-1"
                      >
                        <Upload className="w-4 h-4" />
                        Submit for Review
                      </button>
                    </div>
                  </div>
                )}

                {/* Uploading state */}
                {phase === 'uploading' && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading EPUB and cover image to secure storage…
                  </div>
                )}
              </div>
            )}

            {error && phase === 'error' && !file && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50 mt-4">
                <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Submission history */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/40 flex items-center justify-center text-primary-500">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display font-bold text-xl text-slate-800 dark:text-slate-100">My Submissions</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Track the status of your submitted novels</p>
          </div>
        </div>

        {loadingSubs ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading your submissions…
          </div>
        ) : submissions.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-7 h-7" />}
            title="No submissions yet"
            description="Upload your first EPUB above to see it appear here."
          />
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const config = statusConfig[sub.status];
              const StatusIcon = config.icon;
              return (
                <div key={sub.id} className={`glass-card p-4 border-l-4 ${config.border} animate-fade-in-up`}>
                  <div className="flex items-start gap-4">
                    {/* Cover thumbnail */}
                    {sub.cover_url ? (
                      <img src={sub.cover_url} alt={sub.title} className="w-12 h-16 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${sub.cover_color} flex-shrink-0 flex items-center justify-center`}>
                        <BookOpen className="w-5 h-5 text-white/60" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{sub.title}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">by {sub.author}</p>
                        </div>
                        <span className={`chip ${config.bg} ${config.color} flex-shrink-0`}>
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </div>

                      {/* Admin feedback */}
                      {sub.admin_feedback && (
                        <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-slate-100/60 dark:bg-slate-800/40">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-slate-600 dark:text-slate-300">{sub.admin_feedback}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 dark:text-slate-500">
                        <span>{new Date(sub.created_at).toLocaleDateString()}</span>
                        {sub.chapters?.length > 0 && <span>· {sub.chapters.length} chapters</span>}
                        {sub.status === 'pending' && (
                          <button
                            onClick={() => handleDeleteSubmission(sub)}
                            className="ml-auto text-error-400 hover:text-error-500 transition-colors flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Withdraw
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
