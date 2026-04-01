import React from 'react';

/**
 * Изолирует ошибки зоны ПВЛ/AL Camp от остального «Сада» и библиотеки.
 */
export default class PvlErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
                    <p className="font-medium mb-2">Не удалось отобразить курс AL Camp</p>
                    <p className="text-amber-900/90 mb-4">
                        Остальные разделы сада и список курсов в библиотеке не затронуты.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={this.handleReset}
                            className="px-4 py-2 rounded-xl bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/80"
                        >
                            Попробовать снова
                        </button>
                        <button
                            type="button"
                            onClick={this.props.onExit}
                            className="px-4 py-2 rounded-xl bg-amber-700 text-white hover:bg-amber-800"
                        >
                            Выйти из AL Camp
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
