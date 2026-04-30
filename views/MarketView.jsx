import React, { useState, useEffect } from 'react';
import { ShoppingBag, Package, MessageCircle, Phone } from 'lucide-react';
import { api } from '../services/dataService';
import ModalShell from '../components/ModalShell';
import Button from '../components/Button';

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

const PromoCode = ({ code }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button
            onClick={copy}
            className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-left transition-colors hover:bg-blue-100"
        >
            <span className="text-xs text-slate-400 uppercase tracking-widest whitespace-nowrap">Промокод</span>
            <span className="font-mono font-bold text-blue-700 tracking-wider">{code}</span>
            <span className="ml-auto text-[10px] text-blue-400 whitespace-nowrap">{copied ? 'скопировано' : 'нажми'}</span>
        </button>
    );
};

const ProductCard = ({ item, onContact }) => {
    const [selected, setSelected] = useState(null);
    const opts = item.options;
    const hasOpts = opts?.label && Array.isArray(opts.values) && opts.values.length > 0;
    const hasPromo = Boolean(item.promo_code && item.link_url);

    return (
        <div className="surface-card flex flex-col overflow-hidden">
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

            <div className="p-6 flex flex-col flex-1">
                <h3 className="text-lg font-display font-semibold text-slate-900 mb-1">{item.name}</h3>

                {item.description && (
                    <p className="text-sm text-slate-500 mb-4 flex-1">{item.description}</p>
                )}

                {hasOpts && (
                    <div className="mb-4">
                        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                            {opts.label}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {opts.values.map(v => (
                                <button
                                    key={v}
                                    onClick={() => setSelected(v === selected ? null : v)}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all
                                        ${selected === v
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {hasPromo ? (
                    <div className="mt-auto pt-2 space-y-3">
                        <div className="flex items-baseline gap-2">
                            {item.old_price && (
                                <span className="text-sm text-slate-400 line-through">
                                    {item.old_price.toLocaleString('ru-RU')} ₽
                                </span>
                            )}
                            <span className="text-2xl font-display font-semibold text-slate-900">
                                {item.price.toLocaleString('ru-RU')} ₽
                            </span>
                        </div>
                        <PromoCode code={item.promo_code} />
                        <a
                            href={item.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary w-full justify-center"
                        >
                            Перейти
                        </a>
                    </div>
                ) : (
                    <div className="flex items-end justify-between mt-auto pt-2">
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
                        <Button variant="primary" onClick={() => onContact(item, selected)}>
                            Связаться
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

const ContactModal = ({ item, option, onClose }) => (
    <ModalShell
        isOpen={Boolean(item)}
        onClose={onClose}
        title={item?.name}
        description={option ? `Выбрано: ${option}` : 'Свяжитесь напрямую с производителем'}
        size="sm"
    >
        {item && (
            <div className="space-y-3 pt-2">
                {item.contact_telegram && (
                    <a
                        href={`https://t.me/${item.contact_telegram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary w-full"
                    >
                        <MessageCircle size={18} />
                        Написать в Telegram
                    </a>
                )}
                {item.contact_whatsapp && (
                    <a
                        href={`https://wa.me/${item.contact_whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary w-full"
                    >
                        <Phone size={18} />
                        Написать в WhatsApp
                    </a>
                )}
                {!item.contact_telegram && !item.contact_whatsapp && (
                    <p className="text-sm text-slate-400 text-center py-2">
                        Контакты скоро будут добавлены
                    </p>
                )}
            </div>
        )}
    </ModalShell>
);

const MarketView = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [contactItem, setContactItem] = useState(null);
    const [contactOption, setContactOption] = useState(null);

    useEffect(() => {
        api.getShopItems({ activeOnly: true })
            .then(data => setItems(data || []))
            .finally(() => setLoading(false));
    }, []);

    const handleContact = (item, option) => {
        setContactItem(item);
        setContactOption(option);
    };

    const handleCloseContact = () => {
        setContactItem(null);
        setContactOption(null);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <div className="section-kicker mb-2">для ведущих</div>
                    <h1 className="text-3xl font-light text-slate-900 mb-1">Магазин</h1>
                    <p className="text-slate-500">Товары напрямую от производителя</p>
                </div>
                {!loading && items.length > 0 && (
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Товаров</div>
                        <div className="font-mono text-xl text-blue-600">{items.length}</div>
                    </div>
                )}
            </div>

            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map(item => (
                        <ProductCard key={item.id} item={item} onContact={handleContact} />
                    ))}
                </div>
            )}

            <ContactModal item={contactItem} option={contactOption} onClose={handleCloseContact} />
        </div>
    );
};

export default MarketView;
