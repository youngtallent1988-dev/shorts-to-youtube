"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught a rendering error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white px-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-500/30 bg-red-950/20 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
            <div className="text-red-400 text-2xl font-black mb-2">
              Something went wrong
            </div>
            <p className="text-white/60 text-sm mb-6">
              A rendering error was caught. The rest of the app is still
              running. Check the browser console for details.
            </p>
            {this.state.error && (
              <pre className="text-xs text-red-300/80 bg-black/40 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-words border border-white/10">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/20 text-white/80 hover:border-purple-400/80 hover:text-white hover:shadow-[0_0_22px_rgba(168,85,247,0.8)] transition"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
