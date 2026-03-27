import React from 'react';
import Button from '../components/Button';

const SubscriptionExpiredScreen = ({ renewUrl, onRetry, message }) => {
    const text = message || 'Дорогая, все круто, но у тебя закончилась подписка. Продлить ее можно в этом боте. После продления доступ к платформе откроется автоматически.';
    return (
        <div className="min-h-screen bg-transparent flex items-center justify-center p-6">
            <div className="w-full max-w-xl surface-card p-8 md:p-10 space-y-6">
                <h1 className="text-3xl font-display font-semibold text-slate-900">Подписка завершена</h1>
                <p className="text-slate-600 leading-relaxed">{text}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                    {renewUrl ? (
                        <a href={renewUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                            <Button className="w-full">Продлить подписку</Button>
                        </a>
                    ) : (
                        <Button disabled className="w-full sm:w-auto">Ссылка на продление недоступна</Button>
                    )}
                    <Button variant="secondary" onClick={onRetry} className="w-full sm:w-auto">
                        Я уже оплатил
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionExpiredScreen;
