import { useState } from 'react';
import { X, CheckCircle2, XCircle, Globe, EyeOff, Save, Loader2, AlertCircle } from 'lucide-react';
import type { NovelSubmission } from '@/types';
import {
  reviewSubmission,
  editSubmissionMetadata,
  publishSubmission,
  unpublishSubmission,
} from '@/lib/submissions';

interface Props {
  submission: NovelSubmission;
  reviewerId: string;
  isLive: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

type Busy = null | 'approve' | 'reject' | 'publish' | 'unpublish' | 'save';

export function SubmissionReviewModal({ submission, reviewerId, isLive, onClose, onChanged }: Props) {
  const [title, setTitle] = useState(submission.title);
  const [author, setAuthor] = useState(submission.author);
  const [description, setDescription] = useState(submission.description ?? '');
  const [feedback, setFeedback] = useState(submission.admin_feedback ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const isPending = submission.status === 'pending';
  const isApproved = submission.status === 'approved';

  async function run(action: Busy, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const metaValid = title.trim().length > 0 && author.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 animate-scale-in">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Review submission</p>
            <h2 className="font-display font-bold text-xl text-slate-800 dark:text-slate-100 truncate">{submission.title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Submitted by {submission.submitter_username ?? 'Unknown reader'} · {new Date(submission.created_at).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost !px-2.5 !py-2" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <section className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Title</span>
              <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Author</span>
              <input className="input-field" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Description</span>
            <textarea className="input-field resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="flex justify-end">
            <button
              onClick={() =>
                run('save', () =>
                  editSubmissionMetadata(submission, {
                    title: title.trim(),
                    author: author.trim(),
                    description: description.trim() || null,
                  })
                )
              }
              disabled={!metaValid || busy !== null}
              className="btn-outline"
            >
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save details
            </button>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">
              Feedback for the author <span className="text-slate-400 font-normal">(required to reject)</span>
            </span>
            <textarea
              className="input-field resize-none"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Explain what needs to change, or welcome the author."
            />
          </label>
        </section>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
            <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {isPending && (
            <>
              <button
                onClick={() => run('approve', () => reviewSubmission(submission, reviewerId, 'approved', feedback.trim() || null))}
                disabled={busy !== null}
                className="btn-primary flex-1"
              >
                {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve
              </button>
              <button
                onClick={() => run('reject', () => reviewSubmission(submission, reviewerId, 'rejected', feedback.trim()))}
                disabled={busy !== null || feedback.trim().length === 0}
                className="btn-outline flex-1 !text-error-600 dark:!text-error-400"
              >
                {busy === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Reject
              </button>
            </>
          )}

          {isApproved && !isLive && (
            <button
              onClick={() => run('publish', () => publishSubmission(submission, reviewerId))}
              disabled={busy !== null}
              className="btn-primary flex-1"
            >
              {busy === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Publish to library
            </button>
          )}

          {isLive && (
            <button
              onClick={() => run('unpublish', () => unpublishSubmission(submission))}
              disabled={busy !== null}
              className="btn-outline flex-1 !text-error-600 dark:!text-error-400"
            >
              {busy === 'unpublish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
              Remove from public view
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
