import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, icon, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/40 flex items-center justify-center text-primary-500">
            {icon}
          </div>
        )}
        <div>
          <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-800 dark:text-slate-100">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-6 animate-fade-in">
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
          {icon}
        </div>
      )}
      <div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-800 dark:text-slate-100">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  color = 'primary',
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  color?: 'primary' | 'accent' | 'secondary' | 'success' | 'warning' | 'error';
  trend?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: 'from-primary-500/15 to-primary-500/5 text-primary-600 dark:text-primary-400',
    accent: 'from-accent-500/15 to-accent-500/5 text-accent-600 dark:text-accent-400',
    secondary: 'from-secondary-500/15 to-secondary-500/5 text-secondary-600 dark:text-secondary-400',
    success: 'from-success-500/15 to-success-500/5 text-success-600 dark:text-success-400',
    warning: 'from-warning-500/15 to-warning-500/5 text-warning-600 dark:text-warning-400',
    error: 'from-error-500/15 to-error-500/5 text-error-600 dark:text-error-400',
  };

  return (
    <div className="glass-card p-5 card-hover animate-fade-in-up">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      {trend && (
        <p className="text-xs text-success-600 dark:text-success-400 font-semibold mt-2">{trend}</p>
      )}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  className = '',
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={`h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-300 dark:text-slate-600 mb-4">
        {icon}
      </div>
      <h3 className="font-display font-bold text-lg text-slate-700 dark:text-slate-200">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
