"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Temporary error boundary wrapping StudioChrome.
 *
 * The app crashes silently ~2 minutes after startup with no logs. This
 * boundary catches any React render/lifecycle error thrown inside
 * StudioChrome (or its children) and surfaces the full stack trace on
 * screen and in the console so we can identify the root cause.
 *
 * Remove once the underlying crash is diagnosed and fixed.
 */
export default class StudioChromeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Log to the server-side console so the crash is visible in Railway
    // deployment logs even if the browser tab is not open.
    console.error("[StudioChromeErrorBoundary] Caught an error:", error);
    console.error("[StudioChromeErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div
          style={{
            fontFamily: "monospace",
            padding: "2rem",
            background: "#0a0a0a",
            color: "#f87171",
            minHeight: "100vh",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "#fca5a5" }}>
            ⚠ StudioChrome crashed — error boundary caught an exception
          </h1>

          <section style={{ marginBottom: "1.5rem" }}>
            <strong style={{ color: "#fbbf24" }}>Error:</strong>
            {"\n"}
            {error?.toString() ?? "Unknown error"}
          </section>

          {error?.stack && (
            <section style={{ marginBottom: "1.5rem" }}>
              <strong style={{ color: "#fbbf24" }}>Stack trace:</strong>
              {"\n"}
              {error.stack}
            </section>
          )}

          {errorInfo?.componentStack && (
            <section>
              <strong style={{ color: "#fbbf24" }}>React component stack:</strong>
              {"\n"}
              {errorInfo.componentStack}
            </section>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
