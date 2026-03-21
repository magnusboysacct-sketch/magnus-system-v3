import { PostgrestError } from "@supabase/supabase-js";
import { errorLogger, getUserFriendlyMessage } from "./errorLogger";

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export async function handleDatabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  operation: string,
  metadata?: Record<string, any>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await queryFn();

    if (error) {
      errorLogger.logDatabaseError(operation, error, metadata);
      return {
        data: null,
        error: getUserFriendlyMessage(error),
      };
    }

    return { data, error: null };
  } catch (err) {
    errorLogger.logDatabaseError(operation, err, metadata);
    return {
      data: null,
      error: getUserFriendlyMessage(err),
    };
  }
}

export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  metadata?: Record<string, any>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await operation();
    return { data, error: null };
  } catch (err) {
    errorLogger.log(`Error in ${operationName}`, err as Error, operationName, metadata);
    return {
      data: null,
      error: getUserFriendlyMessage(err),
    };
  }
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
