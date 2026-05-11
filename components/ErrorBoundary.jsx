import React from 'react';
import { reportClientError } from '../utils/clientErrorReporter.js';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        const msg = String(error?.message || '');
        const isChunkLoadError = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg);

        if (isChunkLoadError) {
            reportClientError({
                message: 'ChunkLoadError → auto-reload',
                stack: error?.stack || msg,
                source: 'ErrorBoundary.chunkLoad',
            });
            // Защита от reload-loop
            if (!sessionStorage.getItem('garden_chunk_reloaded')) {
                sessionStorage.setItem('garden_chunk_reloaded', String(Date.now()));
                window.location.reload();
                return;
            }
        } else {
            // Generic ErrorBoundary reporting (baseline из eb8dd70 MON-001)
            reportClientError({
                message: error?.message || 'ErrorBoundary caught',
                stack: error?.stack || '',
                source: 'ErrorBoundary',
                extra: { componentStack: errorInfo?.componentStack },
            });
        }

        this.setState({ error, errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
                    <div className="max-w-2xl w-full bg-white p-8 rounded-3xl shadow-xl border border-red-100">
                        <h1 className="text-2xl font-bold text-red-600 mb-4">Что-то пошло не так 😔</h1>
                        <p className="text-slate-600 mb-6">Пожалуйста, сделайте скриншот этого экрана и отправьте разработчику.</p>

                        <div className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-auto text-sm font-mono mb-4">
                            <p className="text-red-400 font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
                            <pre className="text-slate-400 whitespace-pre-wrap">
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </pre>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition"
                        >
                            Попробовать перезагрузить
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
