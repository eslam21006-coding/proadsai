// src/components/ErrorBoundary.tsx — React error boundary
//
// Wraps a subtree so that a render-time throw in any descendant is contained and shown
// as a recoverable fallback instead of unmounting the whole React tree (the "page goes
// blank" failure). React only routes RENDER/lifecycle errors here — errors thrown inside
// event handlers are not caught by boundaries (React logs those to the console instead).

import React from "react";

interface Props {
  children: React.ReactNode;
  // Optional custom fallback. Receives the error and a reset callback.
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  // When any value in this array changes, the boundary auto-clears its error state. Pass
  // e.g. [phase] so navigating away from a crashed view recovers automatically.
  resetKeys?: unknown[];
  // Fired when the boundary resets (manual "Try again" or a resetKeys change).
  onReset?: () => void;
  // Short label for the area being guarded (used in the default fallback copy).
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface the full error + component stack for debugging; the UI stays usable.
    console.error("[ErrorBoundary] caught render error:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.hasError) return;
    const a = prevProps.resetKeys;
    const b = this.props.resetKeys;
    // Auto-reset when any resetKey changes (length or shallow value diff).
    const changed =
      (a?.length ?? 0) !== (b?.length ?? 0) ||
      (b ?? []).some((v, i) => !Object.is(v, a?.[i]));
    if (changed) this.reset();
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center max-w-md mx-auto">
          <i className="fa-solid fa-triangle-exclamation text-amber-400 text-2xl"></i>
          <h3 className="text-sm font-bold text-white">
            Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}
          </h3>
          <p className="text-[11px] text-slate-400">
            This view hit an unexpected error, but the rest of the app is fine. Your work is
            saved — try again, or go back and reopen it.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
          >
            <i className="fa-solid fa-rotate-right text-[9px]"></i> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
