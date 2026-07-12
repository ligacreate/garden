import React, { useEffect, useState } from 'react';
import Button from './Button';
import { api } from '../services/dataService';

// Переиспользуемый блок оплаты/продления Лиги: планы из billing_plans +
// «Оплатить» → createCheckout → редирект на Prodamus. Единая логика для
// «Моей подписки» (ProfileView) и экрана продления (SubscriptionExpiredScreen),
// чтобы не дублировать checkout. Работает и у paused_expired: RLS пускает
// authenticated читать активные планы, checkout гейтится только валидным JWT.
const SubscriptionCheckout = ({ heading = 'Выбрать план', ctaLabel = 'Оплатить', onNotify, footer = null }) => {
    const [plans, setPlans] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        api.getBillingPlans()
            .then((p) => { if (alive) { setPlans(p); setSelected((s) => s || (p[0]?.code ?? null)); } })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    const handleCheckout = async () => {
        if (loading || !selected) return;
        setLoading(true);
        try {
            const res = await api.createCheckout(selected);
            if (res?.url) {
                window.location.href = res.url;   // редирект на хостед-форму Prodamus
            } else {
                onNotify?.('Не удалось создать оплату');
                setLoading(false);
            }
        } catch (e) {
            onNotify?.(e?.message || 'Ошибка оплаты');
            setLoading(false);
        }
    };

    return (
        <div className="mt-4 space-y-3">
            <div className="text-sm font-medium text-slate-700">{heading}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {plans.map((p) => (
                    <button
                        key={p.code}
                        type="button"
                        onClick={() => setSelected(p.code)}
                        className={`p-3 rounded-2xl border text-left transition-all ${selected === p.code ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/40' : 'border-slate-200 hover:border-emerald-300'}`}
                    >
                        <div className="text-sm font-semibold text-slate-800">{p.title}</div>
                        <div className="text-lg font-bold text-slate-900 mt-1">{p.amount_rub} ₽</div>
                    </button>
                ))}
            </div>
            <Button
                onClick={handleCheckout}
                disabled={loading || !selected || plans.length === 0}
                className="w-full !rounded-xl"
            >
                {loading ? 'Переходим к оплате…' : ctaLabel}
            </Button>
            {footer}
            <div className="text-[11px] text-slate-400 leading-relaxed">
                Оплата через Prodamus — на форме доступны СБП, карты РФ и зарубежные. Без автопродления.
            </div>
        </div>
    );
};

export default SubscriptionCheckout;
