import React, { useMemo, useState, useEffect } from 'react';
import { Bell, Calendar, PartyPopper } from 'lucide-react';
import { api } from '../services/dataService';
import DOMPurify from 'dompurify';
import Card from '../components/Card';
import UserAvatar from '../components/UserAvatar';

const NewsView = ({ news = [], users = [] }) => {
    const [templates, setTemplates] = useState([]);

    useEffect(() => {
        api.getBirthdayTemplates().then(setTemplates);
    }, []);

    // Logic to find birthdays
    const birthdayUsers = useMemo(() => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        return users.filter(u => {
            if (!u.dob) return false;
            const dob = new Date(u.dob);
            return dob.getMonth() === currentMonth && dob.getDate() === currentDay;
        });
    }, [users]);

    // Merge manual news with birthday auto-news
    const allNews = useMemo(() => {
        const manualNews = news.map(n => ({ ...n, type: 'manual', date: new Date(n.timestamp || Date.now()) }));

        if (templates.length === 0) return manualNews; // Wait for templates

        const birthdayNews = birthdayUsers.map(u => {
            // Pick a random template deterministically based on user ID and date, 
            // so it doesn't change on every re-render but changes daily/per user
            const entropy = u.id.toString().charCodeAt(0) + new Date().getDate();
            const template = templates[entropy % templates.length];
            const body = template.replace('{name}', u.name);

            return {
                id: `bday-${u.id}`,
                type: 'birthday',
                title: `С Днем Рождения, ${u.name}! 🎉`,
                body: body,
                user: u,
                date: new Date() // Today
            };
        });

        return [...birthdayNews, ...manualNews].sort((a, b) => b.date - a.date);
    }, [news, birthdayUsers, templates]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-light text-slate-900 mb-1">Новости</h1>
                    <p className="text-slate-500">События и обновления</p>
                </div>
                <div className="text-right hidden md:block">
                    <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Событий</div>
                    <div className="font-mono text-xl text-blue-600">{allNews.length}</div>
                </div>
            </div>

            {allNews.map(item => (
                <Card key={item.id} className="border-l-4 border-l-blue-500 overflow-hidden relative">
                    {item.type === 'birthday' && (
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <PartyPopper size={100} />
                        </div>
                    )}

                    <div className="flex gap-4 relative z-10">
                        {item.user ? (
                            <div className="flex flex-col items-center gap-2">
                                <UserAvatar user={item.user} size={item.type === 'birthday' ? 'lg' : 'md'} />
                                {item.type === 'birthday' && (
                                    <span className="text-[10px] uppercase tracking-widest text-slate-400">Именинница</span>
                                )}
                            </div>
                        ) : (
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                                <Calendar size={20} />
                            </div>
                        )}
                        <div>
                            <div className="text-xs text-slate-400 mb-1">
                                {item.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <h3 className="font-bold text-lg text-slate-800 mb-1">{item.title}</h3>
                            <div
                                className="text-slate-600 text-sm whitespace-pre-wrap clean-rich-text [&_a]:text-blue-700 [&_a]:underline [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_li]:my-1"
                                dangerouslySetInnerHTML={{ __html: formatNewsBody(item.body) }}
                            />
                        </div>
                    </div>
                </Card>
            ))}

            {allNews.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Bell size={24} />
                    </div>
                    <p>Пока новостей нет. Но скоро здесь будет интересно!</p>
                </div>
            )}
        </div>
    );
};

export default NewsView;
    const decodeEntities = (value) => {
        let current = String(value || '');
        for (let i = 0; i < 2; i += 1) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = current;
            const next = textarea.value;
            if (next === current) break;
            current = next;
        }
        return current;
    };

    const formatNewsBody = (value) => {
        const raw = decodeEntities(value);
        const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(raw);

        if (hasHtmlTags) {
            return DOMPurify.sanitize(raw, {
                FORBID_ATTR: ['style', 'class', 'id']
            });
        }

        const plain = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
        return plain.replace(/\n/g, '<br />');
    };
