import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { TriangleAlert as AlertTriangle } from "lucide-react";
import { errorLogger } from "../lib/errorLogger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  context?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    errorLogger.log(
      `Error boundary caught error in ${this.props.context || "component"}`,
      error,
      "ErrorBoundary",
      { componentStack: errorInfo.componentStack }
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 rounded-xl border border-slate-800 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-200">Something went wrong</h2>
                <p className="text-sm text-slate-400">
                  {this.props.context || "This component"} encountered an error
                </p>
              </div>
            </div>

            <div className="bg-slate-950 rounded-lg p-4 mb-4">
              <p className="text-xs text-slate-500 font-mono">
                {this.state.error?.message || "Unknown error"}
              </p>
            </div>

            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
