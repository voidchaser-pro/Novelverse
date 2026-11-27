interface ReadingProgressBarProps {
  ratio: number;
}

export function ReadingProgressBar({ ratio }: ReadingProgressBarProps) {
  const percent = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-[width] duration-150 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
