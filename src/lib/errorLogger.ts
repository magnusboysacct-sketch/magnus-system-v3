export interface ErrorLogEntry {
  timestamp: Date;
  message: string;
  context?: string;
  error?: Error;
  userId?: string;
  metadata?: Record<string, any>;
}

class ErrorLogger {
  private logs: ErrorLogEntry[] = [];
  private maxLogs = 100;

  log(message: string, error?: Error, context?: string, metadata?: Record<string, any>) {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      message,
      context,
      error,
      metadata,
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.error(`[${context || "Error"}] ${message}`, error || "", metadata || "");

    return entry;
  }

  logDatabaseError(operation: string, error: any, metadata?: Record<string, any>) {
    return this.log(`Database error during ${operation}`, error, "Database", {
      operation,
      ...metadata,
    });
  }

  logNetworkError(endpoint: string, error: any, metadata?: Record<string, any>) {
    return this.log(`Network error calling ${endpoint}`, error, "Network", {
      endpoint,
      ...metadata,
    });
  }

  logUserError(action: string, message: string, metadata?: Record<string, any>) {
    return this.log(`User error: ${message}`, undefined, `User:${action}`, metadata);
  }

  getLogs(): ErrorLogEntry[] {
    return [...this.logs];
  }

  getRecentLogs(count: number = 10): ErrorLogEntry[] {
    return this.logs.slice(-count);
  }

  clearLogs() {
    this.logs = [];
  }
}

export const errorLogger = new ErrorLogger();

export function getUserFriendlyMessage(error: any): string {
  if (!error) return "An unknown error occurred";

  const message = error?.message || String(error);

  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Network connection issue. Please check your internet connection and try again.";
  }

  if (message.includes("permission") || message.includes("denied")) {
    return "You don't have permission to perform this action.";
  }

  if (message.includes("not found") || message.includes("404")) {
    return "The requested item was not found.";
  }

  if (message.includes("timeout")) {
    return "The operation took too long. Please try again.";
  }

  if (message.includes("duplicate") || message.includes("unique constraint")) {
    return "This item already exists.";
  }

  if (message.includes("foreign key") || message.includes("constraint")) {
    return "Cannot complete this action due to related data.";
  }

  if (message.length > 100) {
    return "An error occurred. Please try again or contact support.";
  }

  return message;
}
