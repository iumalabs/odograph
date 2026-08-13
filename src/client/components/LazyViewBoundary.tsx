import { Component, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { t } from "../i18n/strings";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { failed: boolean };

/**
 * Suspense alone only handles a pending lazy import — a genuinely failed dynamic import() (offline
 * mid-navigation, or a stale service-worker cache requesting a chunk hash a new deploy removed)
 * rejects the promise, which only a class component's getDerivedStateFromError/componentDidCatch
 * can catch (no hooks-based equivalent exists in React 19). Retrying re-mounts the subtree, which
 * re-issues the same dynamic import (specs/051 FR-006).
 */
class ChunkErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.failed) {
      return (
        <div
          style={{
            border: "1px dashed var(--line)",
            borderRadius: "var(--radius-lg)",
            padding: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "var(--dim)",
          }}
        >
          <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("viewLoadErrorLabel")}</span>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "6px 10px",
              color: "var(--fg)",
              font: "600 10.5px var(--font-ui)",
              cursor: "pointer",
            }}
          >
            {t("viewLoadRetryLabel")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wraps a lazily-imported view's content (specs/051) — AppShell itself is rendered outside this
 * boundary at every call site, so the header/nav never shows a loading or error state. */
export function LazyViewBoundary({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense
        fallback={
          <div
            style={{
              padding: 18,
              color: "var(--dim)",
              font: "500 12.5px var(--font-ui)",
            }}
          >
            {t("viewLoadingLabel")}
          </div>
        }
      >
        {children}
      </Suspense>
    </ChunkErrorBoundary>
  );
}
