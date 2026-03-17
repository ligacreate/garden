import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Megaphone, MessageCircle, Send, Clock3, User, ImagePlus, X, ChevronDown } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../services/dataService';
import { subscribeToMessages } from '../services/realtimeMessages';

const CHAT_POLL_INTERVAL_MS = 2000;
const MAX_MESSAGE_LENGTH = 2000;
const CHAT_LAST_SEEN_PREFIX = 'garden_chat_last_seen_';
const CHAT_PAGE_SIZE = 50;

const CommunicationsView = ({ user, users = [], channelItems = [], onNotify, onOpenProfile }) => {
    const [tab, setTab] = useState('channel');
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [attachmentFile, setAttachmentFile] = useState(null);
    const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingDraft, setEditingDraft] = useState('');
    const [unreadThresholdMs, setUnreadThresholdMs] = useState(null);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const realtimeWarnedRef = useRef(false);
    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);

    const sortedChannelItems = useMemo(() => {
        return [...(channelItems || [])].sort((a, b) => {
            const aDate = new Date(a.created_at || a.timestamp || 0).getTime();
            const bDate = new Date(b.created_at || b.timestamp || 0).getTime();
            return bDate - aDate;
        });
    }, [channelItems]);
    const userById = useMemo(() => {
        const map = new Map();
        (users || []).forEach((u) => {
            if (!u?.id) return;
            map.set(String(u.id), u);
        });
        return map;
    }, [users]);

    const unreadDividerMessageId = useMemo(() => {
        if (!unreadThresholdMs) return null;
        const target = messages.find((msg) => {
            const createdMs = new Date(msg.created_at || 0).getTime();
            return Number.isFinite(createdMs) && createdMs > unreadThresholdMs;
        });
        return target?.id ?? null;
    }, [messages, unreadThresholdMs]);

    const sortMessages = (items) =>
        [...items].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    const mergeMessages = (current, incoming) => {
        const map = new Map();
        current.forEach((item) => map.set(String(item.id), item));
        incoming.forEach((item) => map.set(String(item.id), { ...(map.get(String(item.id)) || {}), ...item }));
        return sortMessages(Array.from(map.values()).filter((item) => !item.deleted_at));
    };
    const oldestLoadedCreatedAt = useMemo(() => {
        if (messages.length === 0) return null;
        return messages[0]?.created_at || null;
    }, [messages]);
    const formatMessageTime = (value) => {
        const date = new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) return '';
        const now = new Date();
        const isSameDay =
            now.getFullYear() === date.getFullYear()
            && now.getMonth() === date.getMonth()
            && now.getDate() === date.getDate();
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        const isYesterday =
            y.getFullYear() === date.getFullYear()
            && y.getMonth() === date.getMonth()
            && y.getDate() === date.getDate();
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (isSameDay) return `сегодня ${time}`;
        if (isYesterday) return `вчера ${time}`;
        return date.toLocaleString();
    };

    const filteredMessages = useMemo(() => {
        const q = String(searchQuery || '').trim().toLowerCase();
        if (!q) return messages;
        return messages.filter((msg) => {
            const text = String(msg.text || '').toLowerCase();
            const author = String(msg.author_name || '').toLowerCase();
            return text.includes(q) || author.includes(q);
        });
    }, [messages, searchQuery]);

    const loadMessages = async () => {
        try {
            const data = await api.getMessages({ limit: CHAT_PAGE_SIZE });
            const incoming = (Array.isArray(data) ? data : [])
                .filter((m) => !m.deleted_at)
                .map((m) => ({ ...m, delivery_status: 'sent' }));
            setHasMoreHistory(incoming.length >= CHAT_PAGE_SIZE);
            setMessages((prev) => {
                const localPending = prev.filter((m) => String(m.id || '').startsWith('temp-'));
                return mergeMessages(localPending, incoming);
            });
        } catch (e) {
            console.error(e);
            onNotify?.('Чат недоступен: проверьте таблицу messages и доступ к API');
        }
    };

    const loadOlderMessages = async () => {
        if (!oldestLoadedCreatedAt || isLoadingHistory || !hasMoreHistory) return;
        setIsLoadingHistory(true);
        try {
            const data = await api.getMessages({ limit: CHAT_PAGE_SIZE, before: oldestLoadedCreatedAt });
            const older = (Array.isArray(data) ? data : [])
                .filter((m) => !m.deleted_at)
                .map((m) => ({ ...m, delivery_status: 'sent' }));
            if (older.length < CHAT_PAGE_SIZE) setHasMoreHistory(false);
            setMessages((prev) => mergeMessages(prev, older));
        } catch (e) {
            console.error(e);
            onNotify?.('Не удалось загрузить историю чата');
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (tab !== 'chat') return;
        const seenKey = `${CHAT_LAST_SEEN_PREFIX}${String(user?.id || 'guest')}`;
        const prevSeen = Number(localStorage.getItem(seenKey) || 0);
        setUnreadThresholdMs(prevSeen > 0 ? prevSeen : null);
        localStorage.setItem(seenKey, String(Date.now()));
        loadMessages();
        const timer = setInterval(loadMessages, CHAT_POLL_INTERVAL_MS);

        const unsubscribe = subscribeToMessages({
            onInsert: (message) => {
                if (!message?.id) return;
                setMessages((prev) => {
                    const withoutTemp = prev.filter(
                        (item) =>
                            !(String(item.id || '').startsWith('temp-')
                                && String(item.text || '') === String(message.text || '')
                                && String(item.author_id || '') === String(message.author_id || ''))
                    );
                    if (withoutTemp.some((item) => String(item.id) === String(message.id))) return withoutTemp;
                    return sortMessages([...withoutTemp, { ...message, delivery_status: 'sent' }]);
                });
            },
            onUpdate: (message) => {
                if (!message?.id) return;
                setMessages((prev) => {
                    if (message.deleted_at) {
                        return prev.filter((item) => String(item.id) !== String(message.id));
                    }
                    return prev.map((item) =>
                        String(item.id) === String(message.id)
                            ? { ...item, ...message, delivery_status: 'sent' }
                            : item
                    );
                });
            },
            onDelete: (message) => {
                if (!message?.id) return;
                setMessages((prev) => prev.filter((item) => String(item.id) !== String(message.id)));
            },
            onError: () => {
                if (!realtimeWarnedRef.current) {
                    realtimeWarnedRef.current = true;
                    onNotify?.('Realtime временно недоступен, включен авто-рефреш чата');
                }
            }
        });

        return () => {
            clearInterval(timer);
            unsubscribe?.();
        };
    }, [tab, user?.id]);

    useEffect(() => {
        if (tab !== 'chat') return;
        const container = messagesContainerRef.current;
        if (!container) return;
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceToBottom < 120 || messages.length <= 1 || isAtBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }, [messages, tab, isAtBottom]);

    useEffect(() => {
        return () => {
            if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
        };
    }, [attachmentPreviewUrl]);

    const handleSend = async () => {
        const text = String(newMessage || '').trim();
        if ((!text && !attachmentFile) || isSending || isUploadingImage) return;
        const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const tempMessage = {
            id: tempId,
            author_id: user.id,
            author_name: user.name,
            text,
            image_url: attachmentPreviewUrl || null,
            created_at: new Date().toISOString(),
            delivery_status: 'sending'
        };
        setMessages((prev) => sortMessages([...prev, tempMessage]));
        setIsSending(true);
        try {
            let uploadedImageUrl = '';
            if (attachmentFile) {
                setIsUploadingImage(true);
                uploadedImageUrl = await api.uploadChatImage(attachmentFile);
                setIsUploadingImage(false);
            }
            const created = await api.addMessage({
                author_id: user.id,
                author_name: user.name,
                text,
                image_url: uploadedImageUrl || null
            });
            setNewMessage('');
            if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
            setAttachmentPreviewUrl('');
            setAttachmentFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (created) {
                setMessages((prev) => {
                    const withoutTemp = prev.filter((item) => String(item.id) !== tempId);
                    if (withoutTemp.some((item) => String(item.id) === String(created.id))) return withoutTemp;
                    return mergeMessages(withoutTemp, [{ ...created, delivery_status: 'sent' }]);
                });
            } else {
                await loadMessages();
            }
        } catch (e) {
            console.error(e);
            setMessages((prev) =>
                prev.map((item) =>
                    String(item.id) === tempId
                        ? { ...item, delivery_status: 'failed', delivery_error: e?.message || 'Ошибка отправки' }
                        : item
                )
            );
            onNotify?.(e?.message || 'Не удалось отправить: чат должен сохраняться в общей базе');
        } finally {
            setIsUploadingImage(false);
            setIsSending(false);
        }
    };

    const handleTextareaKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    };

    const handlePickAttachment = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            onNotify?.('Можно прикреплять только изображения');
            return;
        }
        const maxBytes = 10 * 1024 * 1024;
        if (file.size > maxBytes) {
            onNotify?.('Фото слишком большое (максимум 10MB)');
            return;
        }

        if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
        setAttachmentFile(file);
        setAttachmentPreviewUrl(URL.createObjectURL(file));
    };

    const handleRemoveAttachment = () => {
        if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
        setAttachmentPreviewUrl('');
        setAttachmentFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRetryMessage = async (msg) => {
        if (!msg) return;
        setMessages((prev) => prev.filter((item) => String(item.id) !== String(msg.id)));
        setNewMessage(String(msg.text || ''));
        onNotify?.('Сообщение возвращено в поле ввода. Нажмите "Отправить" еще раз.');
    };

    const beginEditMessage = (msg) => {
        setEditingMessageId(msg.id);
        setEditingDraft(String(msg.text || ''));
    };

    const cancelEditMessage = () => {
        setEditingMessageId(null);
        setEditingDraft('');
    };

    const saveEditMessage = async (msg) => {
        const nextText = String(editingDraft || '').trim();
        if (!nextText) return;
        try {
            const updated = await api.updateMessage(msg.id, { text: nextText });
            setMessages((prev) =>
                prev.map((item) =>
                    String(item.id) === String(msg.id)
                        ? { ...item, ...(updated || {}), text: nextText, edited_at: updated?.edited_at || new Date().toISOString() }
                        : item
                )
            );
            cancelEditMessage();
        } catch (e) {
            console.error(e);
            onNotify?.(e?.message || 'Не удалось сохранить правки');
        }
    };

    const handleDeleteMessage = async (msg) => {
        try {
            await api.deleteMessage(msg.id);
            setMessages((prev) => prev.filter((item) => String(item.id) !== String(msg.id)));
            if (String(editingMessageId) === String(msg.id)) cancelEditMessage();
        } catch (e) {
            console.error(e);
            onNotify?.(e?.message || 'Не удалось удалить сообщение');
        }
    };

    const handleMessagesScroll = (event) => {
        const node = event.currentTarget;
        const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
        setIsAtBottom(distanceToBottom < 100);
    };

    const scrollToBottom = () => {
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
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
                        <div className="space-y-2">
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Поиск по чату"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                            />
                        </div>
                        <div
                            ref={messagesContainerRef}
                            onScroll={handleMessagesScroll}
                            className="bg-slate-50 border border-slate-200 rounded-2xl p-3 h-[60vh] overflow-y-auto space-y-2"
                        >
                            {filteredMessages.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                                    {messages.length === 0 ? 'В чате пока нет сообщений' : 'Ничего не найдено'}
                                </div>
                            ) : (
                                <div className="min-h-full flex flex-col justify-end gap-2">
                                    {(hasMoreHistory || isLoadingHistory) && (
                                        <div className="flex justify-center py-1">
                                            <button
                                                type="button"
                                                onClick={loadOlderMessages}
                                                disabled={isLoadingHistory}
                                                className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700 disabled:opacity-60"
                                            >
                                                {isLoadingHistory ? 'Загрузка...' : 'Показать еще'}
                                            </button>
                                        </div>
                                    )}
                                    {filteredMessages.map((msg) => {
                                        const isOwn = String(msg.author_id || '') === String(user?.id || '');
                                        const isEditing = String(editingMessageId || '') === String(msg.id || '');
                                        const authorById = userById.get(String(msg.author_id || ''));
                                        const authorByName = (users || []).find(
                                            (u) =>
                                                String(u?.name || '').trim().toLowerCase()
                                                === String(msg.author_name || '').trim().toLowerCase()
                                        );
                                        const authorUser = authorById || authorByName || null;
                                        const canOpenAuthorProfile = Boolean(authorUser && onOpenProfile);
                                        return (
                                            <React.Fragment key={msg.id}>
                                                {unreadDividerMessageId && String(unreadDividerMessageId) === String(msg.id) && (
                                                    <div className="flex items-center gap-3 py-1">
                                                        <div className="h-px bg-slate-200 flex-1" />
                                                        <span className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Новые сообщения</span>
                                                        <div className="h-px bg-slate-200 flex-1" />
                                                    </div>
                                                )}
                                                <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`w-full max-w-[88%] border rounded-xl p-3 ${isOwn ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100'}`}>
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                                                                <User size={12} />
                                                            {canOpenAuthorProfile ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onOpenProfile?.(authorUser)}
                                                                    className="font-medium text-slate-700 hover:text-blue-700 underline-offset-2 hover:underline"
                                                                    title="Открыть профиль"
                                                                >
                                                                    {msg.author_name || 'Участник'}
                                                                </button>
                                                            ) : (
                                                                <span className="font-medium text-slate-700">{msg.author_name || 'Участник'}</span>
                                                            )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-400 text-right">
                                                                <div>{formatMessageTime(msg.created_at)}</div>
                                                                {msg.edited_at && <div>изменено</div>}
                                                            </div>
                                                        </div>
                                                        {isEditing ? (
                                                            <div className="mt-2 space-y-2">
                                                                <textarea
                                                                    value={editingDraft}
                                                                    onChange={(e) => setEditingDraft(e.target.value)}
                                                                    maxLength={MAX_MESSAGE_LENGTH}
                                                                    className="w-full min-h-[84px] max-h-40 bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 resize-y"
                                                                />
                                                                <div className="flex gap-2 justify-end">
                                                                    <button
                                                                        type="button"
                                                                        onClick={cancelEditMessage}
                                                                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                                                                    >
                                                                        Отмена
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => saveEditMessage(msg)}
                                                                        className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                                                                    >
                                                                        Сохранить
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            !!msg.text && (
                                                                <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap break-words">{msg.text}</p>
                                                            )
                                                        )}
                                                        {!!msg.image_url && (
                                                            <a href={msg.image_url} target="_blank" rel="noreferrer" className="block mt-2">
                                                                <img
                                                                    src={msg.image_url}
                                                                    alt="Вложение"
                                                                    className="max-h-64 rounded-lg border border-slate-200 object-cover"
                                                                    loading="lazy"
                                                                />
                                                            </a>
                                                        )}
                                                        {isOwn && !String(msg.id).startsWith('temp-') && !isEditing && (
                                                            <div className="mt-2 flex items-center justify-end gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => beginEditMessage(msg)}
                                                                    className="text-[11px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-white"
                                                                >
                                                                    Изменить
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteMessage(msg)}
                                                                    className="text-[11px] px-2 py-1 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                                                                >
                                                                    Удалить
                                                                </button>
                                                            </div>
                                                        )}
                                                        {String(msg.id).startsWith('temp-') && (
                                                            <div className="mt-2 flex items-center justify-end gap-2">
                                                                <span className={`text-[11px] ${msg.delivery_status === 'failed' ? 'text-rose-500' : 'text-slate-400'}`}>
                                                                    {msg.delivery_status === 'failed' ? 'Не отправлено' : 'Отправляется...'}
                                                                </span>
                                                                {msg.delivery_status === 'failed' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRetryMessage(msg)}
                                                                        className="text-[11px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-white"
                                                                    >
                                                                        Повторить
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {!isAtBottom && (
                            <div className="flex justify-center -mt-2">
                                <button
                                    type="button"
                                    onClick={scrollToBottom}
                                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:text-slate-800 shadow-sm"
                                >
                                    <ChevronDown size={14} />
                                    К последним сообщениям
                                </button>
                            </div>
                        )}
                        {attachmentPreviewUrl && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-start gap-3">
                                <img src={attachmentPreviewUrl} alt="Предпросмотр" className="w-20 h-20 rounded-lg object-cover border border-slate-200" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-slate-500">Фото к сообщению</div>
                                    <div className="text-sm text-slate-700 truncate">{attachmentFile?.name || 'image'}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleRemoveAttachment}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 transition-all"
                                    title="Убрать фото"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                        <div className="flex items-end gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePickAttachment}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="h-11 w-11 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all inline-flex items-center justify-center"
                                title="Прикрепить фото"
                            >
                                <ImagePlus size={18} />
                            </button>
                            <textarea
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={handleTextareaKeyDown}
                                maxLength={MAX_MESSAGE_LENGTH}
                                placeholder="Напишите сообщение..."
                                className="flex-1 min-h-[84px] max-h-40 bg-slate-50 border border-slate-200 rounded-2xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 resize-y"
                            />
                            <Button onClick={handleSend} disabled={isSending || isUploadingImage || (!newMessage.trim() && !attachmentFile)} icon={Send}>
                                {isUploadingImage ? 'Загрузка фото...' : isSending ? 'Отправка...' : 'Отправить'}
                            </Button>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                            <span>Enter - отправить, Shift+Enter - новая строка</span>
                            <span>{newMessage.length}/{MAX_MESSAGE_LENGTH}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommunicationsView;
