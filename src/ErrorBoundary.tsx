import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <span className="text-4xl mb-4">⚠️</span>
          <h2 className="text-lg font-bold text-primary mb-2">Algo deu errado</h2>
          <p className="text-sm text-text-muted mb-6">Tente recarregar a página.</p>
          <button
            className="px-6 py-2.5 bg-accent text-white rounded-md text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
