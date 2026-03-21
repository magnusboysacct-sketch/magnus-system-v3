import { type TextareaHTMLAttributes } from 'react';

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function FormTextarea({
  label,
  error,
  hint,
  required,
  className = '',
  id,
  ...props
}: FormTextareaProps) {
  const inputId = id || `textarea-${label?.toLowerCase().replace(/\s+/g, '-')}`;
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

      <textarea
        id={inputId}
        className={`w-full rounded-lg border ${
          hasError
            ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
            : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
        } bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-offset-0 transition-colors px-3 py-2 text-sm resize-y ${className}`}
        {...props}
      />

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
