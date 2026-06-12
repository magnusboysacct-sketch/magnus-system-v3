// Magnus ERP — Unified Design System v2
// Full dark + light mode support via Tailwind dark: classes
// No hardcoded colors — all use CSS variables / dark: variants

import React from "react";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

// ─── cn helper ───────────────────────────────────────────────────────────────

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-screen bg-slate-50 dark:bg-[#080b10] text-slate-900 dark:text-slate-200 transition-colors", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title, subtitle, actions, back
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  back?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-transparent">
      <div className="flex items-center gap-3">
        {back && (
          <button onClick={back} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mr-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className, onClick, padding = true }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] transition-colors",
        padding && "p-4",
        onClick && "cursor-pointer hover:border-slate-300 dark:hover:border-white/[0.13] hover:bg-slate-50 dark:hover:bg-[#111820]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 dark:text-slate-600 mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, color = "text-slate-900 dark:text-slate-100", icon, trend
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label?: string };
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-2">{label}</div>
          <div className={cn("text-2xl font-bold tracking-tight", color)}>{value}</div>
          {sub && <div className="text-[10px] text-slate-500 dark:text-slate-600 mt-1">{sub}</div>}
          {trend && (
            <div className={cn("flex items-center gap-1 mt-2 text-[10px] font-semibold", trend.value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              <span>{trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}%</span>
              {trend.label && <span className="text-slate-500 font-normal">{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] flex items-center justify-center text-slate-400 dark:text-slate-600 flex-shrink-0 ml-3">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type BtnSize = "xs" | "sm" | "md" | "lg";

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary:   "bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 border border-cyan-500 dark:border-cyan-500/30 text-white dark:text-cyan-300",
  secondary: "bg-white hover:bg-slate-50 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] border border-slate-300 dark:border-white/[0.08] text-slate-700 dark:text-slate-300",
  ghost:     "hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200",
  danger:    "bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300",
  success:   "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300",
};

const BTN_SIZES: Record<BtnSize, string> = {
  xs: "px-2 py-1 text-[10px] rounded-md gap-1",
  sm: "px-2.5 py-1.5 text-[11px] rounded-lg gap-1.5",
  md: "px-3.5 py-2 text-xs rounded-lg gap-2",
  lg: "px-5 py-2.5 text-sm rounded-xl gap-2",
};

export function Btn({
  children, variant = "secondary", size = "sm", onClick, disabled, icon, type = "button", className
}: {
  children?: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  type?: "button" | "submit" | "reset";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center font-semibold transition-all select-none",
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        disabled && "opacity-40 cursor-not-allowed pointer-events-none",
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeColor = "cyan" | "green" | "amber" | "red" | "blue" | "violet" | "orange" | "slate";

const BADGE_COLORS: Record<BadgeColor, string> = {
  cyan:   "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/25",
  green:  "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/25",
  amber:  "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25",
  red:    "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/25",
  blue:   "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/25",
  violet: "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/25",
  orange: "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/25",
  slate:  "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.08]",
};

export function Badge({ children, color = "slate", dot }: { children: React.ReactNode; color?: BadgeColor; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border", BADGE_COLORS[color])}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ─── Input / Select / Textarea ────────────────────────────────────────────────

const INPUT_BASE = "w-full bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 outline-none focus:border-cyan-500 dark:focus:border-cyan-500/50 focus:bg-white dark:focus:bg-white/[0.06] transition-colors";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT_BASE, props.className)} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(INPUT_BASE, "cursor-pointer [&>option]:bg-white dark:[&>option]:bg-[#111820] [&>option]:text-slate-900 dark:[&>option]:text-slate-200 [&>optgroup]:bg-white dark:[&>optgroup]:bg-[#111820] [&>optgroup]:text-slate-500", props.className)}>
      {children}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(INPUT_BASE, "resize-none", props.className)} />;
}

export function Field({ label, children, hint, error }: { label?: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block">{label}</label>}
      {children}
      {hint && !error && <p className="text-[10px] text-slate-500 dark:text-slate-700">{hint}</p>}
      {error && <p className="text-[10px] text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────

type AlertType = "info" | "success" | "warning" | "error";

const ALERT_STYLES: Record<AlertType, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  info:    { bg:"bg-blue-50 dark:bg-blue-500/10",    border:"border-blue-200 dark:border-blue-500/20",    text:"text-blue-700 dark:text-blue-300",    icon:<Info size={14}/> },
  success: { bg:"bg-emerald-50 dark:bg-emerald-500/10", border:"border-emerald-200 dark:border-emerald-500/20", text:"text-emerald-700 dark:text-emerald-300", icon:<CheckCircle size={14}/> },
  warning: { bg:"bg-amber-50 dark:bg-amber-500/10",   border:"border-amber-200 dark:border-amber-500/20",   text:"text-amber-700 dark:text-amber-300",   icon:<AlertTriangle size={14}/> },
  error:   { bg:"bg-red-50 dark:bg-red-500/10",     border:"border-red-200 dark:border-red-500/20",     text:"text-red-700 dark:text-red-300",     icon:<AlertCircle size={14}/> },
};

export function Alert({ type = "info", children, onClose, className }: { type?: AlertType; children: React.ReactNode; onClose?: () => void; className?: string }) {
  const s = ALERT_STYLES[type];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs", s.bg, s.border, s.text, className)}>
      <span className="flex-shrink-0 mt-0.5">{s.icon}</span>
      <div className="flex-1 leading-relaxed">{children}</div>
      {onClose && <button onClick={onClose} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"><X size={12}/></button>}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">{children}</table>
    </div>
  );
}

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn("px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-transparent", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

export function Tr({ children, onClick, highlight }: { children: React.ReactNode; onClick?: () => void; highlight?: boolean }) {
  return (
    <tr
      onClick={onClick}
      className={cn("border-b border-slate-100 dark:border-white/[0.04] transition-colors", onClick && "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]", highlight && "bg-cyan-50 dark:bg-cyan-500/[0.05]")}
    >
      {children}
    </tr>
  );
}

export function Td({ children, right, muted, className, colSpan }: { children: React.ReactNode; right?: boolean; muted?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2.5", right ? "text-right" : "text-left", muted ? "text-slate-500 dark:text-slate-600" : "text-slate-700 dark:text-slate-300", className)}>
      {children}
    </td>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="w-14 h-14 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.03] flex items-center justify-center text-slate-400 dark:text-slate-700 mb-4">{icon}</div>}
      <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">{title}</div>
      {body && <div className="text-xs text-slate-400 dark:text-slate-700 mb-5 max-w-xs">{body}</div>}
      {action}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, subtitle, children, width = "max-w-lg" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className={cn("w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1520] shadow-2xl", width)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
            {subtitle && <div className="text-[10px] text-slate-500 dark:text-slate-600 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"><X size={15}/></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin text-cyan-500">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.06]" />
      {label && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-700">{label}</span>}
      <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.06]" />
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex border-b border-slate-200 dark:border-white/[0.06]">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cn("flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold border-b-2 transition-colors",
            active === t.key
              ? "border-cyan-500 text-cyan-600 dark:text-cyan-300"
              : "border-transparent text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-400")}>
          {t.label}
          {t.count !== undefined && (
            <span className={cn("px-1.5 py-0.5 rounded text-[9px]",
              active === t.key
                ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-300"
                : "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-600")}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export function Progress({ value, max = 100, color = "cyan", height = 4 }: {
  value: number; max?: number; color?: string; height?: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const colorMap: Record<string, string> = {
    cyan: "bg-cyan-500", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500"
  };
  return (
    <div className="w-full rounded-full bg-slate-200 dark:bg-white/[0.06]" style={{ height }}>
      <div className={cn("rounded-full transition-all", colorMap[color] || "bg-cyan-500")} style={{ width: `${pct}%`, height }} />
    </div>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-700 px-3 pt-4 pb-1.5">
      {children}
    </div>
  );
}
