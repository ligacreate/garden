import React, { useRef, useId, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

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
    const dialogRef = useRef(null);
    const titleId = useId();

    // Держим актуальный onClose в ref, чтобы focus-эффект НЕ зависел от его
    // идентичности: большинство вызовов передают inline-стрелку (новая ссылка
    // на каждый ре-рендер), и deps [isOpen, onClose] перезапускали бы эффект,
    // воруя фокус из инпутов и портя focus-restore. Эффект жизненного цикла
    // ключим только по isOpen.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!isOpen) return;
        const dialog = dialogRef.current;
        const prevFocus = document.activeElement;
        // Стартовый фокус: первое текстовое поле формы (если есть), иначе сам
        // контейнер (role=dialog/aria-modal объявит контекст при входе фокуса).
        // НЕ первый focusable — там крестик «Закрыть»; и НЕ action-кнопки
        // (APG: стартовый фокус не сажаем на действие).
        const field = dialog?.querySelector(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
        );
        (field || dialog)?.focus();

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onCloseRef.current?.();
                return;
            }
            if (e.key === 'Tab') {
                const focusable = dialog
                    ? Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
                    : [];
                if (focusable.length === 0) {
                    // Некуда табать — держим фокус в диалоге.
                    e.preventDefault();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                const active = document.activeElement;
                if (e.shiftKey) {
                    // Включаем сам контейнер: после открытия фокус на нём,
                    // и первый Shift+Tab не должен утечь за модалку.
                    if (active === first || active === dialog) {
                        last.focus();
                        e.preventDefault();
                    }
                } else if (active === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            prevFocus?.focus?.();
        };
    }, [isOpen]);

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

    // Ссылаемся на заголовок только когда <h2 id={titleId}> реально рендерится
    // (title-ветка = нет header и есть title), иначе aria-labelledby повис бы
    // на несуществующий id.
    const labelledBy = !header && title ? titleId : undefined;

    return createPortal(
        <div className={`fixed inset-0 ${zIndex} flex ${alignClass} justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto`}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                tabIndex={-1}
                className={`surface-card ${dialogWidthClass} ${sizeClass} max-h-[calc(100vh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 relative flex flex-col`}>
                {showClose && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
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
                            {title && <h2 id={titleId} className="text-2xl font-display font-semibold text-slate-900">{title}</h2>}
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
