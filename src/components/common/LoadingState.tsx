import React from "react";
import { Loader as Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
}

export function LoadingState({ message = "Loading...", size = "md", fullScreen = false }: LoadingStateProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={`${sizeClasses[size]} text-blue-500 animate-spin`} />
      {message && (
        <div className={`${textSizeClasses[size]} text-slate-400 font-medium`}>
          {message}
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      {content}
    </div>
  );
}

export function InlineLoader({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return <Loader2 className={`${sizeClasses[size]} text-blue-500 animate-spin`} />;
}

export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-slate-800">
      {Array.from({ length: columns }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-slate-800 rounded animate-pulse"
          style={{ width: i === 0 ? "40%" : "20%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4">
      <div className="h-6 bg-slate-800 rounded w-1/3 animate-pulse" />
      <div className="space-y-2">
        <div className="h-4 bg-slate-800 rounded w-full animate-pulse" />
        <div className="h-4 bg-slate-800 rounded w-4/5 animate-pulse" />
        <div className="h-4 bg-slate-800 rounded w-3/5 animate-pulse" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="bg-slate-900/50 border-b border-slate-800 p-4 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-4 bg-slate-800 rounded flex-1 animate-pulse" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  );
}
