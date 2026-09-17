import React from 'react';

interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: any) { console.error('[ErrorBoundary]', error, info); }
  reset = () => { this.setState({ error: null }); location.reload(); };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border rounded-lg p-6 shadow-lg text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4">{this.state.error.message || 'Unknown error'}</p>
          <button onClick={this.reset} className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
