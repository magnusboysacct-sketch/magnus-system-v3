/**
 * Magnus System v3 - Centralized Theme System
 *
 * Provides consistent theme tokens for light and dark mode
 * Use these class strings instead of hard-coding colors
 */

export const theme = {
  // Page backgrounds
  page: {
    base: 'bg-slate-50 dark:bg-slate-950',
    alt: 'bg-white dark:bg-slate-900',
  },

  // Card and surface backgrounds
  surface: {
    base: 'bg-white dark:bg-slate-900',
    elevated: 'bg-white dark:bg-slate-800',
    muted: 'bg-slate-50 dark:bg-slate-800/50',
    hover: 'hover:bg-slate-50 dark:hover:bg-slate-800',
  },

  // Borders
  border: {
    base: 'border-slate-200 dark:border-slate-800',
    strong: 'border-slate-300 dark:border-slate-700',
    muted: 'border-slate-100 dark:border-slate-800/50',
  },

  // Text colors
  text: {
    primary: 'text-slate-900 dark:text-slate-100',
    secondary: 'text-slate-700 dark:text-slate-300',
    muted: 'text-slate-600 dark:text-slate-400',
    inverse: 'text-white dark:text-slate-900',
  },

  // Input elements
  input: {
    base: 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500',
    disabled: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
    focus: 'focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500/20 dark:focus:ring-blue-400/20',
  },

  // Tables
  table: {
    header: 'bg-slate-50 dark:bg-slate-800',
    row: 'bg-white dark:bg-slate-900',
    rowHover: 'hover:bg-slate-50 dark:hover:bg-slate-800',
    border: 'border-slate-200 dark:border-slate-800',
  },

  // Modals and overlays
  modal: {
    overlay: 'bg-black/50 dark:bg-black/70',
    surface: 'bg-white dark:bg-slate-900',
    border: 'border-slate-200 dark:border-slate-800',
  },

  // Loading states
  loading: {
    overlay: 'bg-white/80 dark:bg-slate-950/80',
    skeleton: 'bg-slate-200 dark:bg-slate-800',
    shimmer: 'bg-gradient-to-r from-transparent via-slate-300/50 dark:via-slate-700/50 to-transparent',
  },

  // Status colors (maintain across both modes)
  status: {
    success: {
      bg: 'bg-green-50 dark:bg-green-950/30',
      text: 'text-green-700 dark:text-green-400',
      border: 'border-green-200 dark:border-green-800',
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      text: 'text-yellow-700 dark:text-yellow-400',
      border: 'border-yellow-200 dark:border-yellow-800',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
    },
  },

  // Buttons (primary actions)
  button: {
    primary: 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200',
    secondary: 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700',
    ghost: 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
    danger: 'bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-800',
  },

  // Sidebar navigation
  sidebar: {
    bg: 'bg-white dark:bg-slate-950',
    item: 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900',
    itemActive: 'bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-100',
    border: 'border-slate-200 dark:border-slate-900',
  },

  // Headers and top bars
  header: {
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-slate-200 dark:border-slate-800',
    text: 'text-slate-900 dark:text-slate-100',
  },
};

/**
 * Helper to combine theme classes
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Get opacity-adjusted color for user-defined colors in dark mode
 */
export function getThemeAwareColor(color: string, isDark: boolean): string {
  if (!isDark) return color;

  // In dark mode, lighten user colors for better visibility
  // This can be enhanced with actual color manipulation if needed
  return color;
}
