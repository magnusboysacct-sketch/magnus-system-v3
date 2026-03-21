import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  noBorder?: boolean;
}

export function Card({
  children,
  className = '',
  padding = 'md',
  noBorder = false
}: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const borderClass = noBorder ? '' : 'border border-slate-200 dark:border-slate-800';

  return (
    <div className={`rounded-2xl ${borderClass} bg-white dark:bg-slate-900 ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between mb-6 ${className}`}>
      <div className="flex-1">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="ml-4">
          {action}
        </div>
      )}
    </div>
  );
}

interface CardSectionProps {
  children: ReactNode;
  className?: string;
  noBorder?: boolean;
}

export function CardSection({ children, className = '', noBorder = false }: CardSectionProps) {
  const borderClass = noBorder ? '' : 'border-t border-slate-200 dark:border-slate-800';

  return (
    <div className={`pt-6 mt-6 ${borderClass} ${className}`}>
      {children}
    </div>
  );
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-200 dark:border-slate-800 ${className}`}>
      {children}
    </div>
  );
}
