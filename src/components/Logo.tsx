import { BookOpenText } from 'lucide-react';

export function NOVELVERSE_LOGO({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <div
      className={`${className} rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/30`}
    >
      <BookOpenText className="w-1/2 h-1/2 text-white" strokeWidth={2.5} />
    </div>
  );
}
