import React, { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

const Toast = ({ message, onClose }) => {
    useEffect(() => {
        if (message) {
            const timer = setTimeout(onClose, 3000);
            return () => clearTimeout(timer);
        }
    }, [message, onClose]);

    if (!message) return null;

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <span className="text-sm font-medium tracking-wide">{message}</span>
        </div>
    );
};

export default Toast;
