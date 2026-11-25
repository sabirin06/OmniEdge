import { Component } from 'react';
import type { ReactNode } from 'react';

export class ApplicationErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="workspace-page">
        <section className="panel page-stack" role="alert">
          <h1>OmniEdge could not display this page</h1>
          <p>Reload the page to try again. If the problem persists, contact your administrator.</p>
          <div><button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button></div>
        </section>
      </main>
    );
  }
}
