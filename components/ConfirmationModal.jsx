import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import Button from './Button';

// BUG-PRACTICE-DELETE-ZINDEX (2026-05-15): рендерим через Portal в document.body.
// Без портала диалог попадал внутрь #root (position:relative; z-index:1; overflow:auto)
// — это изолированный stacking context, и z-[100] внутри него меньше чем z-[80] у
// ModalShell в body. Z-index сравнивается только в одном stacking context.
// ModalShell использует тот же паттерн (createPortal в body) — теперь оба сиблинги.
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmVariant = "primary", icon: Icon = AlertTriangle, zIndex = "z-[100]" }) => {
    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200`}>
            <div className="surface-card w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="p-8 text-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${confirmVariant === 'danger' ? 'bg-rose-100 text-rose-600' :
                        confirmVariant === 'success' ? 'bg-emerald-100 text-emerald-600' :
                            'bg-amber-100 text-amber-600'
                        }`}>
                        <Icon size={32} />
                    </div>

                    <h3 className="text-xl font-display font-semibold text-slate-900 mb-2">
                        {title}
                    </h3>

                    <p className="text-slate-500 mb-8 leading-relaxed">
                        {message}
                    </p>

                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} className="flex-1">
                            Отмена
                        </Button>
                        <Button
                            variant={confirmVariant === 'danger' ? 'primary' : 'primary'}
                            className={`flex-1 ${confirmVariant === 'danger' ? '!bg-rose-600 hover:!bg-rose-700 !text-white' :
                                    confirmVariant === 'success' ? '!bg-emerald-600 hover:!bg-emerald-700 !text-white' :
                                        ''
                                }`}
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                        >
                            {confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmationModal;
