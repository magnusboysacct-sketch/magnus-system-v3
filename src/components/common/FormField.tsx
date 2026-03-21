import { type InputHTMLAttributes, type ReactNode } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

export function FormField({
  label,
  error,
  hint,
  required,
  icon,
  iconPosition = 'left',
  className = '',
  id,
  ...props
}: FormFieldProps) {
  const inputId = id || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`;
  const hasError = !!error;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            {icon}
          </div>
        )}

        <input
          id={inputId}
          className={`w-full rounded-lg border ${
            hasError
              ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
              : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
          } bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-offset-0 transition-colors ${
            icon && iconPosition === 'left' ? 'pl-10' : 'pl-3'
          } ${
            icon && iconPosition === 'right' ? 'pr-10' : 'pr-3'
          } py-2 text-sm ${className}`}
          {...props}
        />

        {icon && iconPosition === 'right' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            {icon}
          </div>
        )}
      </div>

      {hint && !error && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
