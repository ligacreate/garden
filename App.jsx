import React, { useState, useEffect } from 'react';
import Toast from './components/Toast';
import AuthScreen from './views/AuthScreen';
import AdminPanel from './views/AdminPanel';
import UserApp from './views/UserApp';
import { INITIAL_KNOWLEDGE } from './data/data';
import { api } from './services/dataService';

export default function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [knowledgeBase, setKnowledgeBase] = useState(INITIAL_KNOWLEDGE);
    const [news, setNews] = useState([]);
    const [notification, setNotification] = useState(null);
    const [viewMode, setViewMode] = useState('default');
    const [loading, setLoading] = useState(true);

    const showNotification = (msg) => setNotification(msg);

    // Initial Data Fetch
    useEffect(() => {
        const init = async () => {
            try {
                const user = await api.getCurrentUser();
                if (user) setCurrentUser(user);

                const allUsers = await api.getUsers();
                setUsers(allUsers || []);

                const kb = await api.getKnowledgeBase();
                if (kb && kb.length > 0) setKnowledgeBase(kb);

                const newsData = await api.getNews();
                setNews(newsData || []);
            } catch (e) {
                console.error("Init error:", e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const handleLogin = async (authData) => {
        try {
            let user;
            if (authData.isReset) {
                await api.resetPassword(authData.email);
                return true;
            } else if (authData.isNew) {
                user = await api.register(authData);
                showNotification("Добро пожаловать!");
            } else {
                user = await api.login(authData.email, authData.password);
                showNotification("С возвращением!");
            }

            setCurrentUser(user);
            // Refresh users list
            const allUsers = await api.getUsers();
            setUsers(allUsers || []);
            return true;
        } catch (e) {
            console.error(e);
            let msg = e.message || "Ошибка входа";
            if (msg.includes("Invalid login credentials")) {
                msg = "Неверные данные, либо ваша почта не подтверждена. Проверьте пароль, найдите письмо подтверждения или попробуйте 'Создать аккаунт'.";
            } else if (msg.includes("Email not confirmed")) {
                msg = "Ваша почта не подтверждена. Пожалуйста, найдите письмо от 'Liga' или 'Supabase' (проверьте спам) и перейдите по ссылке. Или зарегистрируйтесь с другой почтой.";
            }
            alert(msg);
            return false;
        }
    };

    const handleLogout = async () => {
        await api.logout();
        setCurrentUser(null);
        setViewMode('default');
    };

    const updateUserRole = async (id, role) => {
        const userToUpdate = users.find(u => u.id === id);
        if (!userToUpdate) return;

        try {
            await api.updateUser({ id, role });
            const updated = { ...userToUpdate, role };
            setUsers(users.map(u => u.id === id ? updated : u));
            if (currentUser?.id === id) setCurrentUser(updated);
            showNotification("Роль обновлена");
        } catch (e) {
            console.error(e);
            showNotification("Ошибка обновления роли");
        }
    };

    const handleUpdateUser = async (updatedUser) => {
        try {
            const saved = await api.updateUser(updatedUser);
            setUsers(users.map(u => u.id === saved.id ? saved : u));
            if (currentUser && currentUser.id === saved.id) {
                setCurrentUser(saved);
            }
        } catch (e) {
            console.error(e);
            showNotification("Ошибка сохранения профиля");
        }
    };

    const handleSendRay = (targetUserId) => {
        try {
            api.checkActionTimer(); // Check cooldown
            const targetUser = users.find(u => u.id === targetUserId);
            if (!targetUser) return;
            showNotification(`Лучик света отправлен ${targetUser.name}!`);
        } catch (e) {
            showNotification(e.message);
        }
    };

    const handleMarkAsRead = (notificationId) => {
        // Placeholder for notification read status
    };

    const handleUpdateNews = async (updatedNews) => {
        try {
            await api.updateNews(updatedNews);
            setNews(news.map(n => n.id === updatedNews.id ? updatedNews : n));
            showNotification("Новость обновлена");
        } catch (e) {
            console.error(e);
            showNotification("Ошибка обновления новости");
        }
    };

    const handleDeleteNews = async (newsId) => {
        try {
            await api.deleteNews(newsId);
            setNews(news.filter(n => n.id !== newsId));
            showNotification("Новость удалена");
        } catch (e) {
            console.error(e);
            showNotification("Ошибка удаления новости");
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600 font-sans">Загрузка...</div>;

    return (
        <div className={`min-h-screen bg-transparent font-sans text-slate-700 selection:bg-blue-100 selection:text-blue-900 flex justify-center relative`}>
            <div className="w-full max-w-[480px] md:max-w-full bg-transparent min-h-screen relative flex flex-col">
                <Toast message={notification} onClose={() => setNotification(null)} />
                {!currentUser ? <AuthScreen onLogin={handleLogin} onNotify={showNotification} />
                    : (currentUser.role === 'admin' && viewMode !== 'app') ? <AdminPanel users={users} knowledgeBase={knowledgeBase} news={news} onUpdateUserRole={updateUserRole} onRefreshUsers={async () => {
                        const allUsers = await api.getUsers();
                        setUsers(allUsers || []);
                        showNotification("Список пользователей обновлен");
                    }} onAddContent={async (c) => {
                        try {
                            // Optimistic update
                            setKnowledgeBase([...knowledgeBase, c]);
                            await api.addKnowledge(c);
                            showNotification("Материал сохранен в базе");
                        } catch (e) {
                            console.error(e);
                            showNotification("Ошибка сохранения (см. консоль)");
                        }
                    }} onAddNews={async (n) => {
                        try {
                            api.checkActionTimer();
                            setNews([n, ...news]);
                            await api.addNews(n);
                            showNotification("Новость опубликована");
                        } catch (e) {
                            console.error(e);
                            showNotification(e.message || "Ошибка публикации");
                        }
                    }} onUpdateNews={handleUpdateNews} onDeleteNews={handleDeleteNews} onGetAllMeetings={() => api.getAllMeetings()} onExit={handleLogout} onNotify={showNotification} onSwitchToApp={() => setViewMode('app')} />
                        : <UserApp user={currentUser} users={users} knowledgeBase={knowledgeBase} news={news} onLogout={handleLogout} onNotify={showNotification} onSwitchToAdmin={() => setViewMode('default')} onUpdateUser={handleUpdateUser} onSendRay={handleSendRay} onMarkAsRead={handleMarkAsRead} />}
            </div>
        </div>
    );
}
