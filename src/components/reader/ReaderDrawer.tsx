import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ReaderDrawerProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function ReaderDrawer({ title, onClose, children }: ReaderDrawerProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={title}
        className="fixed top-0 right-0 z-[120] h-full w-80 max-w-[90vw] glass-panel border-l border-slate-200/50 dark:border-slate-800/50 overflow-y-auto animate-slide-in-right"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200/50 dark:border-slate-800/50 sticky top-0 glass-panel z-10">
          <h3 className="font-display font-bold text-base">{title}</h3>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
