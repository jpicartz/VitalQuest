import React from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Button } from './ui/Button';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-phase crashes so a bad AI response or corrupt saved state can
 * never leave the user staring at a blank page. Because app state lives in
 * localStorage, a plain reload would reproduce the crash forever — so the
 * recovery path offers clearing the saved data as well.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('VitalQuest crashed:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    if (
      !window.confirm(
        'This clears your saved VitalQuest data (profile, food logs, weight history) from this browser. Continue?'
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem('vitalQuestData');
    } catch {
      /* storage may be unavailable; the reload below is still worth trying */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-page text-fg flex items-center justify-center p-6">
        <div className="bg-card border border-edge rounded-card p-8 max-w-md w-full text-center shadow-e1">
          <div className="w-12 h-12 rounded-full bg-spark/15 text-spark flex items-center justify-center mx-auto mb-4">
            <IconAlertTriangle size={24} />
          </div>
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-fg-soft text-sm mb-6">
            VitalQuest hit an unexpected error. Reloading usually fixes it. If it
            keeps happening, clearing your saved data will get you back to a
            working state.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" className="w-full" onClick={this.handleReload}>
              Reload the app
            </Button>
            <Button variant="outline" className="w-full" onClick={this.handleReset}>
              Clear my data and start over
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
