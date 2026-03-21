import { Loader as Loader2 } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700',
    secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 focus:ring-slate-400 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 dark:bg-red-600 dark:hover:bg-red-700',
    ghost: 'text-slate-700 hover:bg-slate-100 focus:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800',
    link: 'text-blue-600 hover:text-blue-700 hover:underline focus:ring-blue-500 dark:text-blue-400 dark:hover:text-blue-300',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  const showIcon = icon && !loading;
  const showLoader = loading;

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {showLoader && <Loader2 className="w-4 h-4 animate-spin" />}
      {showIcon && iconPosition === 'left' && icon}
      {children}
      {showIcon && iconPosition === 'right' && icon}
    </button>
  );
}
