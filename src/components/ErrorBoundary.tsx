import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: ''
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    let message = error.message;
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error) {
        message = parsed.error;
      }
    } catch (e) {
      // Not a JSON error
    }
    return { hasError: true, errorMessage: message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { hasError, errorMessage } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="glass-card p-8 rounded-3xl max-w-md w-full text-center space-y-6 border border-white/10 shadow-2xl">
            <div className="w-20 h-20 bg-danger/20 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={40} className="text-danger" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black">發生了一些錯誤</h1>
              <p className="text-sm opacity-60 leading-relaxed">
                {errorMessage.includes('insufficient permissions') 
                  ? '您沒有權限執行此操作，請確認是否已登入。' 
                  : '應用程式遇到預料之外的問題。'}
              </p>
              {errorMessage && (
                <div className="mt-4 p-4 bg-black/20 rounded-xl text-left overflow-auto max-h-32">
                  <code className="text-[10px] font-mono opacity-50">{errorMessage}</code>
                </div>
              )}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/80 transition-all shadow-lg shadow-primary/20"
            >
              <RefreshCw size={20} />
              重新整理
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
