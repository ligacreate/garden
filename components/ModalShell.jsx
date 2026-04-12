import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const ModalShell = ({
    isOpen,
    onClose,
    title,
    description,
    header,
    footer,
    children,
    size = 'md',
    align = 'center',
    showClose = true,
    zIndex = 'z-[80]'
}) => {
    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    const sizeClass = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-3xl',
        xl: 'max-w-5xl',
        full: 'max-w-none'
    }[size] || 'max-w-lg';

    const alignClass = align === 'start' ? 'items-start pt-10' : 'items-center';
    const dialogWidthClass = size === 'full' ? 'w-[calc(100vw-2rem)]' : 'w-full';

    return createPortal(
        <div className={`fixed inset-0 ${zIndex} flex ${alignClass} justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto`}>
            <div className={`surface-card ${dialogWidthClass} ${sizeClass} max-h-[calc(100vh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 relative flex flex-col`}>
                {showClose && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        aria-label="Закрыть"
                    >
                        <X size={18} />
                    </button>
                )}
                {header ? (
                    <div className="px-8 pt-8">{header}</div>
                ) : (
                    (title || description) && (
                        <div className="px-8 pt-8">
                            {title && <h2 className="text-2xl font-display font-semibold text-slate-900">{title}</h2>}
                            {description && <p className="text-sm text-slate-500 mt-2">{description}</p>}
                        </div>
                    )
                )}
                <div className="px-8 py-8 overflow-y-auto flex-1">{children}</div>
                {footer && (
                    <div className="px-8 pb-8 pt-0">{footer}</div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default ModalShell;
