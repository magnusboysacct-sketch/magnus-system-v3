const PERF_MARKS = new Map<string, number>();
const PERF_MEASURES = new Map<string, number[]>();

export function markStart(label: string) {
  PERF_MARKS.set(label, performance.now());
}

export function markEnd(label: string): number | null {
  const start = PERF_MARKS.get(label);
  if (!start) return null;

  const duration = performance.now() - start;
  PERF_MARKS.delete(label);

  if (!PERF_MEASURES.has(label)) {
    PERF_MEASURES.set(label, []);
  }
  PERF_MEASURES.get(label)!.push(duration);

  if (duration > 1000) {
    console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms (>1s)`);
  } else if (duration > 500) {
    console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms (>500ms)`);
  }

  return duration;
}

export function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  markStart(label);
  return fn().finally(() => markEnd(label));
}

export function measureSync<T>(label: string, fn: () => T): T {
  markStart(label);
  try {
    return fn();
  } finally {
    markEnd(label);
  }
}

export function getMetrics(label: string): { count: number; avg: number; max: number; min: number } | null {
  const measures = PERF_MEASURES.get(label);
  if (!measures || measures.length === 0) return null;

  return {
    count: measures.length,
    avg: measures.reduce((a, b) => a + b, 0) / measures.length,
    max: Math.max(...measures),
    min: Math.min(...measures),
  };
}

export function clearMetrics() {
  PERF_MARKS.clear();
  PERF_MEASURES.clear();
}

export function logAllMetrics() {
  console.group("Performance Metrics");
  for (const [label, measures] of PERF_MEASURES.entries()) {
    const metrics = getMetrics(label);
    if (metrics) {
      console.log(`${label}:`, {
        calls: metrics.count,
        avg: `${metrics.avg.toFixed(2)}ms`,
        max: `${metrics.max.toFixed(2)}ms`,
        min: `${metrics.min.toFixed(2)}ms`,
      });
    }
  }
  console.groupEnd();
}
