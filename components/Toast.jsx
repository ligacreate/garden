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
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-white/90 backdrop-blur-lg text-slate-700 px-6 py-3 rounded-full shadow-[0_18px_40px_-20px_rgba(21,17,12,0.6)] flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none border border-white/70">
            <CheckCircle2 size={20} className="text-blue-600" />
            <span className="text-sm font-semibold tracking-wide">{message}</span>
        </div>
    );
};

export default Toast;
