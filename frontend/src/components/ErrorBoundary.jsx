import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[color:var(--vc-bg,#0a0a0a)] text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full border border-white/10 rounded-xl bg-neutral-900 p-8 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-xl font-bold font-mono">
              !
            </div>
            <h2 className="font-display font-black text-2xl tracking-tight text-white">
              Something went wrong
            </h2>
            <p className="text-white/60 text-sm">
              {this.state.error?.message || "An unexpected error occurred while loading this page."}
            </p>
            <div className="pt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-md bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = "/";
                }}
                className="px-4 py-2 rounded-md border border-white/20 text-white/80 font-medium text-sm hover:bg-white/10 transition-colors"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
