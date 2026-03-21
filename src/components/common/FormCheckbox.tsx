import { type InputHTMLAttributes } from 'react';

interface FormCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  error?: string;
}

export function FormCheckbox({
  label,
  description,
  error,
  className = '',
  id,
  ...props
}: FormCheckboxProps) {
  const inputId = id || `checkbox-${label?.toLowerCase().replace(/\s+/g, '-')}`;
  const hasError = !!error;

  return (
    <div className="w-full">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={inputId}
          className={`mt-1 w-4 h-4 rounded border ${
            hasError
              ? 'border-red-300 dark:border-red-700 text-red-600 focus:ring-red-500'
              : 'border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500'
          } focus:ring-2 focus:ring-offset-0 bg-white dark:bg-slate-900 transition-colors cursor-pointer ${className}`}
          {...props}
        />

        <div className="flex-1">
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {label}
          </label>

          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}

          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
