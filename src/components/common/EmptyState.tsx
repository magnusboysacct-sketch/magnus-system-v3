import { type ReactNode } from 'react';
import { FileQuestionMark as FileQuestion } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        {icon ? (
          <div className="text-slate-400 dark:text-slate-500">
            {icon}
          </div>
        ) : (
          <FileQuestion className="w-8 h-8 text-slate-400 dark:text-slate-500" />
        )}
      </div>

      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mb-6">
          {description}
        </p>
      )}

      {action && (
        <Button
          variant="primary"
          onClick={action.onClick}
          icon={action.icon}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
