import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/**
 * Top-level error boundary. Catches uncaught render errors
 * anywhere in the tree and shows a recovery UI instead of
 * a blank white page. The "Reload" button is a hard refresh
 * which drops any in-memory state - by design, since at
 * that point the app is in an unknown state.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error('Uncaught error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-full grid place-items-center p-6 bg-slate-50">
          <div className="bg-white border rounded-xl p-6 max-w-md text-center">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-lg font-bold mt-2">Something went wrong</h1>
            <p className="text-sm text-slate-600 mt-1">
              The page hit an unexpected error. Your work hasn't been lost if you saved a draft.
            </p>
            <pre className="mt-3 text-left text-xs text-slate-500 bg-slate-50 border rounded p-2 max-h-32 overflow-auto">
              {this.state.error.message}
            </pre>
            <div className="mt-4 flex gap-2 justify-center">
              <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm">
                Reload
              </button>
              <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} className="px-3 py-1.5 border rounded text-sm">
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
