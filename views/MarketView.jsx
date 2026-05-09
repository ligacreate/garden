import React, { useState, useEffect } from 'react';
import { ShoppingBag, Package, MessageCircle, Download } from 'lucide-react';
import { api } from '../services/dataService';

const SkeletonCard = () => (
    <div className="surface-card p-6 animate-pulse">
        <div className="w-full h-52 bg-slate-100 rounded-[1.5rem] mb-5" />
        <div className="h-4 bg-slate-100 rounded-full w-3/4 mb-2" />
        <div className="h-3 bg-slate-100 rounded-full w-full mb-1" />
        <div className="h-3 bg-slate-100 rounded-full w-2/3 mb-5" />
        <div className="flex justify-between items-end">
            <div className="h-7 bg-slate-100 rounded-full w-24" />
            <div className="h-10 bg-slate-100 rounded-2xl w-28" />
        </div>
    </div>
);

const DiscountBadge = ({ price, oldPrice }) => {
    const pct = Math.round((1 - price / oldPrice) * 100);
    return (
        <span className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            −{pct}%
        </span>
    );
};

/**
 * Описание товара может содержать переносы строк (\n) и URL'ы
 * (https://... | http://...). Регексп режет текст на куски,
 * URL-куски рендерятся как <a>, остальное — текст. Никакого
 * markdown-парсера — простая замена. По продуктовому решению
 * Ольги (2026-05-09): промокоды хранятся прямо в тексте описания.
 */
const URL_RE = /(https?:\/\/[^\s)]+)/g;
function renderDescriptionWithLinks(text) {
    if (!text) return null;
    const parts = text.split(URL_RE);
    return parts.map((p, i) => {
        if (URL_RE.test(p)) {
            URL_RE.lastIndex = 0;
            return (
                <a
                    key={i}
                    href={p}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 underline hover:text-emerald-800"
                >
                    {p}
                </a>
            );
        }
        return p;
    });
}

/**
 * Приоритет primary-кнопки:
 *   download_url → «Скачать»
 *   link_url     → «Перейти»
 *   contact_telegram → «Написать в Telegram» (прямая ссылка, без модалки)
 *   ничего — кнопки нет.
 *
 * Промокоды живут в тексте описания (решение Ольги 2026-05-09);
 * `shop_items.promo_code` — legacy, UI его игнорирует.
 */
function buildPrimaryAction(item) {
    if (item.download_url) {
        return {
            href: item.download_url,
            label: 'Скачать',
            icon: Download,
        };
    }
    if (item.link_url) {
        return {
            href: item.link_url,
            label: 'Перейти',
            icon: null,
        };
    }
    if (item.contact_telegram) {
        const handle = String(item.contact_telegram).replace(/^@/, '').trim();
        return {
            href: `https://t.me/${handle}`,
            label: 'Написать в Telegram',
            icon: MessageCircle,
        };
    }
    return null;
}

const ActionLink = ({ action, fullWidth = false }) => {
    if (!action) return null;
    const Icon = action.icon;
    return (
        <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-primary inline-flex items-center gap-2${fullWidth ? ' w-full justify-center' : ''}`}
        >
            {Icon && <Icon size={18} />}
            {action.label}
        </a>
    );
};

const ProductCard = ({ item }) => {
    const action = buildPrimaryAction(item);
    const hasPrice = item.price != null;
    const hasDesc = Boolean(item.description);

    return (
        <div className="surface-card flex flex-col overflow-hidden self-start">
            <div className="relative w-full h-52 bg-slate-100 flex-shrink-0">
                {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Package size={48} className="text-slate-300" />
                    </div>
                )}
                {item.old_price && <DiscountBadge price={item.price} oldPrice={item.old_price} />}
            </div>

            <div className="px-6 pt-6 pb-6 flex flex-col gap-4">
                <div>
                    <h3 className="text-lg font-display font-semibold text-slate-900 mb-1">{item.name}</h3>
                    {hasDesc && (
                        <p className="text-sm text-slate-500 whitespace-pre-line">
                            {renderDescriptionWithLinks(item.description)}
                        </p>
                    )}
                </div>

                {hasPrice ? (
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            {item.old_price && (
                                <div className="text-xs text-slate-400 line-through mb-0.5">
                                    {item.old_price.toLocaleString('ru-RU')} ₽
                                </div>
                            )}
                            <div className="text-2xl font-display font-semibold text-slate-900">
                                {item.price.toLocaleString('ru-RU')} ₽
                            </div>
                        </div>
                        <ActionLink action={action} />
                    </div>
                ) : (
                    action && <ActionLink action={action} fullWidth />
                )}
            </div>
        </div>
    );
};

const MarketView = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getShopItems({ activeOnly: true })
            .then(data => setItems(data || []))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <div className="section-kicker mb-2">для ведущих</div>
                    <h1 className="text-3xl font-light text-slate-900 mb-1">Магазин</h1>
                </div>
                {!loading && items.length > 0 && (
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Товаров</div>
                        <div className="font-mono text-xl text-blue-600">{items.length}</div>
                    </div>
                )}
            </div>

            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            )}

            {!loading && items.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                    <ShoppingBag size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Товары скоро появятся</p>
                </div>
            )}

            {!loading && items.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                    {items.map(item => (
                        <ProductCard key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default MarketView;
