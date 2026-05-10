import React from 'react';

export default function ViewLoading({ label = 'Загружаем…' }) {
    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-slate-500 text-sm animate-pulse">{label}</div>
        </div>
    );
}
