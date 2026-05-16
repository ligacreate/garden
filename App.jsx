import React, { useState, useEffect, Suspense, lazy } from 'react';
import Toast from './components/Toast';
import ViewLoading from './components/ViewLoading';
import AuthScreen from './views/AuthScreen';
import UserApp from './views/UserApp';
import SubscriptionExpiredScreen from './views/SubscriptionExpiredScreen';
import { INITIAL_KNOWLEDGE } from './data/data';
import { api } from './services/dataService';

// Phase 2A — lazy admin chunk: AdminPanel (с вложенным
// AdminPvlProgress) грузится только при заходе админа.
const AdminPanel = lazy(() => import('./views/AdminPanel'));

const HIDDEN_GARDEN_USERS_KEY = 'garden_hidden_user_ids';

export default function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [knowledgeBase, setKnowledgeBase] = useState(INITIAL_KNOWLEDGE);
    const [news, setNews] = useState([]);
    const [notification, setNotification] = useState(null);
    const [viewMode, setViewMode] = useState('default');
    const [loading, setLoading] = useState(true);
    const [librarySettings, setLibrarySettings] = useState({ hiddenCourses: [], materialOrder: {} });
    const [accessBlock, setAccessBlock] = useState(null);
    const [maintenanceBanner, setMaintenanceBanner] = useState(null);
    // { reason: 'POSTGREST_JWT_MISCONFIG' | 'PARTIAL_DEGRADATION', detail?: string }
    const [hiddenGardenUserIds, setHiddenGardenUserIds] = useState(() => {
        try {
            const raw = JSON.parse(localStorage.getItem(HIDDEN_GARDEN_USERS_KEY) || '[]');
            if (!Array.isArray(raw)) return [];
            return raw.map((id) => String(id));
        } catch {
            return [];
        }
    });

    const showNotification = (msg) => setNotification(msg);
    const isHiddenInGarden = (userId) => hiddenGardenUserIds.includes(String(userId));

    useEffect(() => {
        try {
            localStorage.setItem(HIDDEN_GARDEN_USERS_KEY, JSON.stringify(hiddenGardenUserIds));
        } catch {
            /* ignore */
        }
    }, [hiddenGardenUserIds]);

    const normalizeLegacyRichContent = (rawContent) => {
        const raw = String(rawContent || '');
        if (!raw.trim()) return raw;
        if (!/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div id="root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return raw;

        const replaceTag = (node, nextTag) => {
            if (!node || node.tagName === nextTag.toUpperCase()) return node;
            const replacement = doc.createElement(nextTag);
            while (node.firstChild) replacement.appendChild(node.firstChild);
            node.replaceWith(replacement);
            return replacement;
        };

        Array.from(root.querySelectorAll('*')).forEach((node) => {
            const style = String(node.getAttribute('style') || '').toLowerCase();
            const className = String(node.getAttribute('class') || '').toLowerCase();
            const classLooksHeading = /(heading|title|subtitle|msoheading|ql-size-huge|ql-size-large)/.test(className);
            const sizeMatch = style.match(/font-size\s*:\s*([\d.]+)\s*(px|pt)/);
            const sizeRaw = sizeMatch ? parseFloat(sizeMatch[1]) : NaN;
            const sizePx = Number.isFinite(sizeRaw) ? (sizeMatch[2] === 'pt' ? sizeRaw * 1.333 : sizeRaw) : null;
            const isBold = /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
            const isItalic = /font-style\s*:\s*italic/.test(style);

            if (['DIV', 'P', 'SPAN'].includes(node.tagName) && (sizePx != null || classLooksHeading)) {
                if (sizePx >= 24) replaceTag(node, 'h2');
                else if (sizePx >= 19) replaceTag(node, 'h3');
                else if (sizePx >= 16 && isBold) replaceTag(node, 'h4');
                else if (classLooksHeading && isBold) replaceTag(node, 'h3');
            } else if (node.tagName === 'SPAN' && isBold) {
                replaceTag(node, 'strong');
            } else if (node.tagName === 'SPAN' && isItalic) {
                replaceTag(node, 'em');
            } else if (node.tagName === 'INPUT') {
                node.remove();
            }
        });

        Array.from(root.querySelectorAll('div')).forEach((div) => {
            const hasOnlyInlineChildren = Array.from(div.children).every((c) => ['SPAN', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR'].includes(c.tagName));
            if (hasOnlyInlineChildren && div.parentElement && !['LI', 'TD', 'TH'].includes(div.parentElement.tagName)) {
                const p = doc.createElement('p');
                while (div.firstChild) p.appendChild(div.firstChild);
                div.replaceWith(p);
            }
        });

        return root.innerHTML;
    };

    // Загружает базовые данные (users/kb/settings/news) через Promise.allSettled
    // и применяет успешные. Возвращает агрегаты для caller-side обработки
    // инфраструктурных ошибок (POSTGREST_JWT_MISCONFIG / 401 / полный отказ).
    const loadAndApplyInitialData = async () => {
        const results = await Promise.allSettled([
            api.getUsers(),
            api.getKnowledgeBase(),
            api.getLibrarySettings(),
            api.getNews(),
        ]);
        const [usersR, kbR, settingsR, newsR] = results;

        const jwtMisconfig = results.find(
            (r) => r.status === 'rejected' && r.reason?.code === 'POSTGREST_JWT_MISCONFIG'
        );
        const has401 = results.some(
            (r) => r.status === 'rejected' && r.reason?.status === 401
        );
        const allFailed = results.every((r) => r.status === 'rejected');

        if (usersR.status === 'fulfilled') setUsers(usersR.value || []);
        else console.error('getUsers failed:', usersR.reason);

        if (kbR.status === 'fulfilled' && kbR.value && kbR.value.length > 0) {
            setKnowledgeBase(kbR.value);
        } else if (kbR.status === 'rejected') {
            console.error('getKnowledgeBase failed:', kbR.reason);
        }

        if (settingsR.status === 'fulfilled' && settingsR.value) {
            setLibrarySettings(settingsR.value);
        } else if (settingsR.status === 'rejected') {
            console.error('getLibrarySettings failed:', settingsR.reason);
        }

        if (newsR.status === 'fulfilled') setNews(newsR.value || []);
        else console.error('getNews failed:', newsR.reason);

        return { jwtMisconfig, has401, allFailed };
    };

    // Initial Data Fetch
    useEffect(() => {
        const init = async () => {
            try {
                const user = await api.getCurrentUser();
                if (!user) {
                    setLoading(false);
                    return;
                }
                setCurrentUser(user);

                const { jwtMisconfig, has401, allFailed } = await loadAndApplyInitialData();

                if (jwtMisconfig) {
                    setMaintenanceBanner({
                        reason: 'POSTGREST_JWT_MISCONFIG',
                        detail: jwtMisconfig.reason?.detail || jwtMisconfig.reason?.message,
                    });
                    console.error('PostgREST JWT misconfigured:', jwtMisconfig.reason);
                } else if (has401) {
                    console.warn('Auth token rejected (401), clearing session');
                    await api.logout();
                    setCurrentUser(null);
                    setLoading(false);
                    return;
                } else if (allFailed) {
                    setMaintenanceBanner({
                        reason: 'PARTIAL_DEGRADATION',
                        detail: 'Все 4 запроса не удались',
                    });
                }
            } catch (e) {
                console.error("Init error:", e);
                if (e?.code === 'SUBSCRIPTION_EXPIRED' || e?.code === 'ACCESS_PAUSED_MANUAL') {
                    setAccessBlock({
                        code: e.code,
                        message: e.message,
                        botRenewUrl: e.botRenewUrl || null
                    });
                } else if (e?.code === 'POSTGREST_JWT_MISCONFIG') {
                    setMaintenanceBanner({
                        reason: 'POSTGREST_JWT_MISCONFIG',
                        detail: e.detail || e.message,
                    });
                } else if (e?.status === 401) {
                    console.warn('Auth token rejected (401) on getCurrentUser path');
                    await api.logout();
                    setCurrentUser(null);
                }
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return undefined;
        const timer = window.setInterval(async () => {
            try {
                await api.getCurrentUser();
            } catch (e) {
                if (e?.code === 'SUBSCRIPTION_EXPIRED' || e?.code === 'ACCESS_PAUSED_MANUAL') {
                    await api.logout();
                    setCurrentUser(null);
                    setViewMode('default');
                    setAccessBlock({
                        code: e.code,
                        message: e.message,
                        botRenewUrl: e.botRenewUrl || null
                    });
                }
            }
        }, 60000);
        return () => window.clearInterval(timer);
    }, [currentUser?.id]);

    const handleLogin = async (authData) => {
        try {
            let user;
            if (authData.isReset) {
                await api.resetPassword(authData.email);
                return true;
            } else if (authData.isNew) {
                user = await api.register(authData);
                // FEAT-023 Phase 2.5: pending — backend создал профиль, ждём одобрения.
                // До Phase 3 (полный PendingApprovalScreen + polling) — alert + logout,
                // чтобы JWT pending'а не висел в localStorage и не делал лишних fetch'ей.
                if (user?.access_status === 'pending_approval') {
                    alert('Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.');
                    await api.logout();
                    return false;
                }
                showNotification("Добро пожаловать!");
            } else {
                user = await api.login(authData.email, authData.password);
                showNotification("С возвращением!");
            }

            setCurrentUser(user);
            setAccessBlock(null);

            const { jwtMisconfig, has401, allFailed } = await loadAndApplyInitialData();

            if (jwtMisconfig) {
                setMaintenanceBanner({
                    reason: 'POSTGREST_JWT_MISCONFIG',
                    detail: jwtMisconfig.reason?.detail || jwtMisconfig.reason?.message,
                });
                console.error('PostgREST JWT misconfigured after login:', jwtMisconfig.reason);
            } else if (has401) {
                console.warn('Auth token rejected after login (401), clearing session');
                await api.logout();
                setCurrentUser(null);
                return false;
            } else if (allFailed) {
                setMaintenanceBanner({
                    reason: 'PARTIAL_DEGRADATION',
                    detail: 'Все 4 запроса не удались',
                });
            }
            return true;
        } catch (e) {
            console.error(e);
            if (e?.code === 'SUBSCRIPTION_EXPIRED' || e?.code === 'ACCESS_PAUSED_MANUAL') {
                setAccessBlock({
                    code: e.code,
                    message: e.message,
                    botRenewUrl: e.botRenewUrl || null
                });
                return false;
            }
            let msg = e.message || "Ошибка входа";
            const normalizedMsg = String(msg).toLowerCase();
            if (normalizedMsg.includes("invalid login credentials") || normalizedMsg === "invalid" || normalizedMsg.includes("invalid credentials")) {
                msg = "Неверные данные, либо ваша почта не подтверждена. Проверьте пароль, найдите письмо подтверждения или попробуйте 'Создать аккаунт'.";
            } else if (msg.includes("Email not confirmed")) {
                msg = "Ваша почта не подтверждена. Пожалуйста, найдите письмо от сервиса авторизации (проверьте спам) и перейдите по ссылке. Или зарегистрируйтесь с другой почтой.";
            }
            alert(msg);
            return false;
        }
    };

    const handleResetWithToken = async (token, newPassword) => {
        try {
            await api.resetPasswordWithToken(token, newPassword);
            showNotification("Пароль обновлен. Войдите снова.");
            return true;
        } catch (e) {
            console.error(e);
            alert(e.message || "Ошибка сброса пароля");
            return false;
        }
    };

    const handleLogout = async () => {
        await api.logout();
        setCurrentUser(null);
        setAccessBlock(null);
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

    const handleToggleUserVisibilityInGarden = (userId) => {
        const sid = String(userId);
        setHiddenGardenUserIds((prev) => (
            prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
        ));
        showNotification('Видимость аккаунта в саду обновлена');
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

    const handleSaveLibrarySettings = async (next) => {
        const normalized = {
            hiddenCourses: Array.isArray(next?.hiddenCourses) ? next.hiddenCourses : [],
            materialOrder: next?.materialOrder || {}
        };
        setLibrarySettings(normalized);
        try {
            await api.saveLibrarySettings(normalized);
        } catch (e) {
            console.error(e);
            showNotification("Не удалось сохранить настройки библиотеки");
        }
    };

    const handleSetCourseVisible = async (courseTitle, visible) => {
        const hidden = new Set(librarySettings.hiddenCourses || []);
        if (visible) hidden.delete(courseTitle);
        else hidden.add(courseTitle);
        await handleSaveLibrarySettings({
            ...librarySettings,
            hiddenCourses: Array.from(hidden)
        });
    };

    const handleReorderCourseMaterials = async (courseTitle, orderedMaterialIds) => {
        await handleSaveLibrarySettings({
            ...librarySettings,
            materialOrder: {
                ...(librarySettings.materialOrder || {}),
                [courseTitle]: orderedMaterialIds.map(String)
            }
        });
    };

    const handleGetLeagueScenarios = async () => {
        try {
            return await api.getPublicScenarios();
        } catch (e) {
            console.error(e);
            showNotification("Не удалось загрузить сценарии лиги");
            return [];
        }
    };

    const handleImportLeagueScenarios = async (items) => {
        try {
            return await api.importLeagueScenarios(items, {
                userId: currentUser?.id,
                authorName: currentUser?.name || 'Админ'
            });
        } catch (e) {
            console.error(e);
            throw e;
        }
    };

    const handleDeleteLeagueScenario = async (scenarioId) => {
        try {
            await api.deleteScenario(scenarioId);
            return true;
        } catch (e) {
            console.error(e);
            throw e;
        }
    };

    const handleUpdateLeagueScenario = async (scenarioId, patch) => {
        try {
            return await api.updateScenario(scenarioId, patch);
        } catch (e) {
            console.error(e);
            throw e;
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600 font-sans">Загрузка...</div>;

    const gardenUsers = (users || []).filter((u) => {
        if (!u) return false;
        if (currentUser && String(u.id) === String(currentUser.id)) return true;
        return !isHiddenInGarden(u.id);
    });

    return (
        <div className={`min-h-screen bg-transparent font-sans text-slate-700 selection:bg-blue-100 selection:text-blue-900 flex justify-center relative`}>
            <div className="w-full max-w-[480px] md:max-w-full bg-transparent min-h-screen relative flex flex-col">
                <Toast message={notification} onClose={() => setNotification(null)} />
                {maintenanceBanner ? (
                    <div className="min-h-screen flex items-center justify-center p-4">
                        <div className="max-w-md text-center">
                            <h2 className="text-xl font-semibold mb-2">База временно в режиме обслуживания</h2>
                            <p className="text-slate-600 mb-4">
                                {maintenanceBanner.reason === 'POSTGREST_JWT_MISCONFIG'
                                    ? 'Идёт настройка системы безопасности. Попробуйте обновить страницу через несколько минут.'
                                    : 'Часть данных недоступна. Попробуйте обновить страницу.'}
                            </p>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-blue-600 text-white rounded"
                            >
                                Обновить
                            </button>
                        </div>
                    </div>
                ) : !currentUser ? (
                    accessBlock?.code === 'SUBSCRIPTION_EXPIRED' ? (
                        <SubscriptionExpiredScreen
                            renewUrl={accessBlock.botRenewUrl || import.meta.env.VITE_DEFAULT_BOT_RENEW_URL || ''}
                            message={accessBlock.message}
                            onRetry={async () => {
                                try {
                                    const user = await api.getCurrentUser();
                                    if (user) {
                                        setCurrentUser(user);
                                        setAccessBlock(null);
                                        showNotification('Доступ восстановлен');
                                    }
                                } catch (e) {
                                    if (e?.code !== 'SUBSCRIPTION_EXPIRED') {
                                        alert(e?.message || 'Пока не удалось восстановить доступ');
                                    }
                                }
                            }}
                        />
                    ) : (
                        <AuthScreen onLogin={handleLogin} onResetPassword={handleResetWithToken} onNotify={showNotification} />
                    )
                )
                    : (currentUser.role === 'admin' && viewMode !== 'app') ? <Suspense fallback={<ViewLoading label="Загружаем админку…" />}><AdminPanel users={users} hiddenGardenUserIds={hiddenGardenUserIds} onToggleUserVisibilityInGarden={handleToggleUserVisibilityInGarden} knowledgeBase={knowledgeBase} news={news} librarySettings={librarySettings} onSetCourseVisible={handleSetCourseVisible} onReorderCourseMaterials={handleReorderCourseMaterials} onUpdateUserRole={updateUserRole} onRefreshUsers={async () => {
                        const allUsers = await api.getUsers();
                        setUsers(allUsers || []);
                        showNotification("Список пользователей обновлен");
                    }} onUserPatched={(updated) => {
                        // FEAT-015 Path C — оптимистичный merge после toggle/exempt save.
                        // updated может быть либо partial (status toggle), либо полным
                        // профилем из api.setProfileAutoPauseExempt; в обоих случаях
                        // мерджим через id, не теряя остальные поля.
                        if (!updated?.id) return;
                        setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
                    }} onAddContent={async (c, options = {}) => {
                        try {
                            const id = c?.id;
                            const isUpdate = options?.isEdit === true || (id != null && id !== '');
                            if (isUpdate) {
                                if (id == null || id === '') {
                                    throw new Error('Не найден id материала для сохранения изменений');
                                }
                                await api.updateKnowledge(c);
                                const fresh = await api.getKnowledgeBase();
                                if (Array.isArray(fresh) && fresh.length > 0) setKnowledgeBase(fresh);
                                else setKnowledgeBase((prev) => prev.map((k) => (String(k.id) === String(id) ? { ...k, ...c } : k)));
                                showNotification('Материал обновлён');
                            } else {
                                await api.addKnowledge(c);
                                setKnowledgeBase((prev) => [...prev, c]);
                                showNotification('Материал добавлен в базу');
                            }
                        } catch (e) {
                            console.error(e);
                            showNotification(e?.message || 'Ошибка сохранения (см. консоль)');
                        }
                    }} onNormalizeKnowledgeContent={async () => {
                        if (!Array.isArray(knowledgeBase) || knowledgeBase.length === 0) {
                            showNotification('Нет материалов для нормализации');
                            return { updated: 0, total: 0 };
                        }
                        const changedItems = [];
                        for (const item of knowledgeBase) {
                            const current = String(item?.content || item?.body || '');
                            const normalized = normalizeLegacyRichContent(current);
                            if (normalized === current) continue;
                            changedItems.push({ ...item, content: normalized });
                        }
                        if (changedItems.length > 0) await api.bulkUpdateKnowledge(changedItems);
                        const fresh = await api.getKnowledgeBase();
                        if (Array.isArray(fresh)) setKnowledgeBase(fresh);
                        showNotification(`Нормализация завершена: обновлено ${changedItems.length} из ${knowledgeBase.length}`);
                        return { updated: changedItems.length, total: knowledgeBase.length };
                    }} onGetLeagueScenarios={handleGetLeagueScenarios} onImportLeagueScenarios={handleImportLeagueScenarios} onDeleteLeagueScenario={handleDeleteLeagueScenario} onUpdateLeagueScenario={handleUpdateLeagueScenario} onAddNews={async (n, options = {}) => {
                        try {
                            const created = await api.addNews(n);
                            if (created) {
                                setNews([created, ...news]);
                                if (options.sendPush && api.sendNewsPush) {
                                    try {
                                        await api.sendNewsPush(created);
                                        showNotification("Push-уведомление отправлено");
                                    } catch (pushError) {
                                        console.error(pushError);
                                        showNotification(pushError?.message || "Новость опубликована, но push не отправлен");
                                    }
                                }
                            } else {
                                const fresh = await api.getNews();
                                setNews(fresh || []);
                            }
                            showNotification("Новость опубликована");
                        } catch (e) {
                            console.error(e);
                            showNotification(e.message || "Ошибка публикации");
                        }
                    }} onUpdateNews={handleUpdateNews} onDeleteNews={handleDeleteNews} onGetAllMeetings={() => api.getAllMeetings()} onGetAllEvents={() => api.getAllEvents()} onUpdateEvent={(e) => api.updateEvent(e)} onDeleteEvent={(id) => api.deleteEvent(id)} onExit={handleLogout} onNotify={showNotification} onSwitchToApp={() => setViewMode('app')} /></Suspense>
                        : <UserApp user={currentUser} users={gardenUsers} knowledgeBase={knowledgeBase} news={news} librarySettings={librarySettings} onLogout={handleLogout} onNotify={showNotification} onSwitchToAdmin={() => setViewMode('default')} onUpdateUser={handleUpdateUser} onSendRay={handleSendRay} onMarkAsRead={handleMarkAsRead} />}
            </div>
        </div>
    );
}
