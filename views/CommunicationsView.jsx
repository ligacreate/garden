import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, MessageCircle, Send, Clock3, User } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../services/dataService';
import { subscribeToMessages } from '../services/realtimeMessages';

const CommunicationsView = ({ user, channelItems = [], onNotify }) => {
    const [tab, setTab] = useState('channel');
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const sortedChannelItems = useMemo(() => {
        return [...(channelItems || [])].sort((a, b) => {
            const aDate = new Date(a.created_at || a.timestamp || 0).getTime();
            const bDate = new Date(b.created_at || b.timestamp || 0).getTime();
            return bDate - aDate;
        });
    }, [channelItems]);

    const loadMessages = async () => {
        try {
            const data = await api.getMessages({ limit: 200 });
            setMessages(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            onNotify?.('Чат недоступен: проверьте таблицу messages и доступ к API');
        }
    };

    useEffect(() => {
        if (tab !== 'chat') return;
        loadMessages();
        const unsubscribe = subscribeToMessages({
            onInsert: (message) => {
                if (!message?.id) return;
                setMessages((prev) => {
                    if (prev.some((item) => String(item.id) === String(message.id))) return prev;
                    return [...prev, message];
                });
            },
            onUpdate: (message) => {
                if (!message?.id) return;
                setMessages((prev) =>
                    prev.map((item) => (String(item.id) === String(message.id) ? { ...item, ...message } : item))
                );
            },
            onDelete: (message) => {
                if (!message?.id) return;
                setMessages((prev) => prev.filter((item) => String(item.id) !== String(message.id)));
            },
            onError: () => {
                onNotify?.('Realtime временно недоступен, включен авто-рефреш чата');
            }
        });

        // Fallback for setups without configured realtime credentials.
        const timer = unsubscribe ? null : setInterval(loadMessages, 5000);

        return () => {
            if (timer) clearInterval(timer);
            unsubscribe?.();
        };
    }, [tab]);

    const handleSend = async () => {
        const text = String(newMessage || '').trim();
        if (!text || isSending) return;
        setIsSending(true);
        try {
            const created = await api.addMessage({
                author_id: user.id,
                author_name: user.name,
                text
            });
            setNewMessage('');
            if (created) {
                setMessages((prev) => {
                    if (prev.some((item) => String(item.id) === String(created.id))) return prev;
                    return [...prev, created];
                });
            } else {
                await loadMessages();
            }
        } catch (e) {
            console.error(e);
            onNotify?.('Не удалось отправить: чат должен сохраняться в общей базе');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="h-full pb-20 pt-6 px-4 lg:px-0">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h1 className="text-4xl font-display font-semibold text-slate-900 tracking-tight">Коммуникации</h1>
                    <p className="text-slate-500 mt-1 font-light">Канал важных сообщений и общий чат</p>
                </div>

                <div className="bg-white/70 p-1 rounded-2xl flex gap-1 w-fit border border-white/60">
                    <button
                        onClick={() => setTab('channel')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'channel'
                            ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'}`}
                    >
                        <span className="inline-flex items-center gap-2"><Megaphone size={16} /> Канал</span>
                    </button>
                    <button
                        onClick={() => setTab('chat')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'chat'
                            ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'}`}
                    >
                        <span className="inline-flex items-center gap-2"><MessageCircle size={16} /> Чат</span>
                    </button>
                </div>

                {tab === 'channel' ? (
                    <div className="surface-card p-6 md:p-8">
                        <h3 className="font-display font-semibold text-slate-900 mb-4">Важные сообщения ({sortedChannelItems.length})</h3>
                        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                            {sortedChannelItems.length === 0 ? (
                                <div className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-200 rounded-2xl">
                                    Пока нет сообщений в канале
                                </div>
                            ) : sortedChannelItems.map((item) => (
                                <article key={item.id} className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4">
                                    <h4 className="font-semibold text-slate-800">{item.title || 'Без заголовка'}</h4>
                                    <div className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1.5">
                                        <Clock3 size={12} />
                                        <span>{new Date(item.created_at || item.timestamp || Date.now()).toLocaleString()}</span>
                                    </div>
                                    <div
                                        className="text-sm text-slate-700 mt-3 prose prose-sm max-w-none clean-rich-text"
                                        dangerouslySetInnerHTML={{ __html: item.body || '' }}
                                    />
                                </article>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="surface-card p-6 md:p-8 space-y-4">
                        <h3 className="font-display font-semibold text-slate-900">Общий чат админов</h3>
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 h-[60vh] overflow-y-auto space-y-2">
                            {messages.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                                    В чате пока нет сообщений
                                </div>
                            ) : messages.map((msg) => (
                                <div key={msg.id} className="bg-white border border-slate-100 rounded-xl p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                                            <User size={12} />
                                            <span className="font-medium text-slate-700">{msg.author_name || 'Участник'}</span>
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                            {new Date(msg.created_at || Date.now()).toLocaleString()}
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap break-words">{msg.text}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-end gap-2">
                            <textarea
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Напишите сообщение..."
                                className="flex-1 min-h-[84px] max-h-40 bg-slate-50 border border-slate-200 rounded-2xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 resize-y"
                            />
                            <Button onClick={handleSend} disabled={isSending || !newMessage.trim()} icon={Send}>
                                {isSending ? 'Отправка...' : 'Отправить'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommunicationsView;
