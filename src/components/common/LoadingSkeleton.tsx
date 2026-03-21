import React from "react";

interface LoadingSkeletonProps {
  className?: string;
}

export function LoadingSkeleton({ className = "" }: LoadingSkeletonProps) {
  return (
    <div className={`animate-pulse bg-slate-800 rounded ${className}`} />
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-10" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, j) => (
            <LoadingSkeleton key={j} className="h-12" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-slate-900 rounded-lg border border-slate-800 p-6">
          <LoadingSkeleton className="h-6 w-1/3 mb-4" />
          <LoadingSkeleton className="h-4 w-2/3 mb-2" />
          <LoadingSkeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <LoadingSkeleton className="h-4 w-24 mb-2" />
          <LoadingSkeleton className="h-10 w-full" />
        </div>
      ))}
      <LoadingSkeleton className="h-10 w-32" />
    </div>
  );
}
