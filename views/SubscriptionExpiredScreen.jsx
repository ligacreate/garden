import React from 'react';
import Button from '../components/Button';
import SubscriptionCheckout from '../components/SubscriptionCheckout';

const SubscriptionExpiredScreen = ({ onRetry, message, onNotify }) => {
    const text = message || 'Подписка на Лигу завершена. Выбери план и продли — доступ откроется сразу после оплаты. Ждём тебя.';
    return (
        <div className="min-h-screen bg-transparent flex items-center justify-center p-6">
            <div className="w-full max-w-xl surface-card p-8 md:p-10 space-y-6">
                <h1 className="text-3xl font-display font-semibold text-slate-900">Подписка завершена</h1>
                <p className="text-slate-600 leading-relaxed">{text}</p>
                <SubscriptionCheckout heading="Выберите план" ctaLabel="Продлить подписку" onNotify={onNotify} />
                <Button variant="secondary" onClick={onRetry} className="w-full sm:w-auto">
                    Я уже оплатил
                </Button>
            </div>
        </div>
    );
};

export default SubscriptionExpiredScreen;
