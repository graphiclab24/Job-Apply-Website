import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('Caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const isOfflineError =
        this.state.error?.message?.includes('client is offline') ||
        this.state.error?.message?.includes('offline') ||
        this.state.error?.message?.includes('network');

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 md:p-8 text-center shadow-lg space-y-4">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {isOfflineError ? 'ইন্টারনেট সংযোগ চেক করুন' : 'সাময়িক লোডিং সমস্যা'}
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              {isOfflineError
                ? 'ডাটাবেজের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি। আপনার ইন্টারনেট সংযোগ নিশ্চিত করে পুনরায় চেষ্টা করুন।'
                : 'পেজটি লোড হতে কিছুটা বিলম্ব হচ্ছে। রিলোড বাটনে ক্লিক করুন।'}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: undefined });
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>পুনরায় লোড করুন</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>রিলোড দিন</span>
              </button>
              <a
                href="/"
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" />
                <span>হোমপেজে যান</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
