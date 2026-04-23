import React, { Suspense, lazy, useState, useEffect, useMemo, useRef } from 'react';
import {
    Shield, LogOut, X, BookOpen, Sparkles, Users,
    Leaf, LayoutGrid, Map as MapIcon, Settings, Menu, CalendarRange,
    GraduationCap, MessagesSquare, Bell, Info, Languages, Library,
    Route, CalendarCheck2, BarChart3, BadgeCheck, MessageCircleQuestion,
    CornerUpLeft, MessageCircle
} from 'lucide-react';
import Button from '../components/Button';
import UserAvatar from '../components/UserAvatar';
import StatsDashboardView from './StatsDashboardView';
import MeetingsView from './MeetingsView';
import PracticesView from './PracticesView';
/** Библиотека (включая AL Camp / ПВЛ) грузится отдельным чанком — сад не падает, если в ПВЛ ошибка */
const CourseLibraryView = lazy(() => import('./CourseLibraryView'));
import BuilderView from './BuilderView';
import CRMView from './CRMView';
import MarketView from './MarketView';
import MapView from './MapView';
import LeaderPageView from './LeaderPageView';
import ProfileView from './ProfileView';
import CommunicationsView from './CommunicationsView';
import { INITIAL_PRACTICES, INITIAL_CLIENTS } from '../data/data';
import { ROLES, hasAccess, getRoleLabel } from '../utils/roles';
import { normalizeSkills } from '../utils/skills';
import { api } from '../services/dataService';

// Sidebar Item Component
const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative select-none
        ${active
                ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-[0_6px_16px_-12px_rgba(47,111,84,0.5)]'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 active:scale-[0.98]'
            }`}
    >
        <Icon
            size={22}
            className={`stroke-[1.6px] transition-transform duration-300 ${active ? 'scale-105' : 'group-hover:scale-105'}`}
            width={24}
        />
        <span className={`font-medium tracking-wide text-[15px] ${active ? 'font-semibold' : ''}`}>{label}</span>
        {badge && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
        )}
    </button>
);

const UserApp = ({ user, users, knowledgeBase, news, librarySettings, onLogout, onNotify, onSwitchToAdmin, onUpdateUser, onSendRay, onMarkAsRead }) => {
    const [view, setView] = useState(() => (user?.role || '').toLowerCase() === ROLES.APPLICANT ? 'library' : 'dashboard');
    const [practices, setPractices] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [scenarios, setScenarios] = useState([]);
    const [goals, setGoals] = useState([]);
    const [clients, setClients] = useState(INITIAL_CLIENTS);
    const [notificationModal, setNotificationModal] = useState(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [courseSidebar, setCourseSidebar] = useState({ enabled: false, title: 'Курс', items: [], activeKey: null });
    const gardenPvlBridgeRef = useRef(null);
    const [leaderUser, setLeaderUser] = useState(null);
    const [birthdayTemplates, setBirthdayTemplates] = useState([]);
    const [pushStatus, setPushStatus] = useState({ supported: false, permission: 'default', enabled: false, isStandalone: false, loading: false });
    const [libraryOpenRequest, setLibraryOpenRequest] = useState(0);
    const mergedUsers = useMemo(
        () => users.map(u => (u.id === user.id ? { ...u, ...user } : u)),
        [users, user]
    );
    const normalizedRole = (user?.role || '').toLowerCase();
    const isAdmin = normalizedRole === ROLES.ADMIN;
    const isApplicant = normalizedRole === ROLES.APPLICANT;
    const homeView = isApplicant ? 'library' : 'dashboard';
    const canOpenTeacherCabinet = hasAccess(normalizedRole, ROLES.MENTOR);
    const canOpenPvlButton = isApplicant;
    const openPvlCourse = () => {
        setLibraryOpenRequest((n) => n + 1);
        handleViewChange('library');
        setMobileMenuOpen(false);
    };
    const skillOptions = useMemo(() => {
        const skillMap = new Map();
        users.forEach((u) => {
            normalizeSkills(u.skills).forEach((s) => {
                const label = String(s || '').trim();
                if (!label) return;
                const key = label.toLowerCase();
                if (!skillMap.has(key)) skillMap.set(key, label);
            });
        });
        return Array.from(skillMap.values()).sort((a, b) => a.localeCompare(b, 'ru'));
    }, [mergedUsers]);

    useEffect(() => {
        api.getBirthdayTemplates()
            .then(setBirthdayTemplates)
            .catch(() => setBirthdayTemplates([]));
    }, []);

    useEffect(() => {
        let mounted = true;
        if (!api.getPushStatus) return () => { mounted = false; };
        api.getPushStatus()
            .then((status) => {
                if (mounted) setPushStatus((prev) => ({ ...prev, ...status }));
            })
            .catch(() => {
                if (mounted) setPushStatus((prev) => ({ ...prev, supported: false }));
            });
        return () => { mounted = false; };
    }, [user?.id]);

    const birthdayUsers = useMemo(() => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        return mergedUsers.filter(u => {
            if (!u.dob) return false;
            const dob = new Date(u.dob);
            return dob.getMonth() === currentMonth && dob.getDate() === currentDay;
        });
    }, [mergedUsers]);

    const dashboardNews = useMemo(() => {
        const manualNews = (news || []).map(n => ({
            ...n,
            type: 'manual',
            date: new Date(n.timestamp || Date.now())
        }));

        if (!birthdayTemplates || birthdayTemplates.length === 0) {
            return manualNews.sort((a, b) => b.date - a.date);
        }

        const birthdayNews = birthdayUsers.map(u => {
            const entropy = u.id.toString().charCodeAt(0) + new Date().getDate();
            const template = birthdayTemplates[entropy % birthdayTemplates.length];
            const body = template.replace('{name}', u.name);

            return {
                id: `bday-${u.id}`,
                type: 'birthday',
                title: `С днем рождения, ${u.name}! 🎉`,
                body,
                user: u,
                date: new Date()
            };
        });

        return [...birthdayNews, ...manualNews].sort((a, b) => b.date - a.date);
    }, [news, birthdayUsers, birthdayTemplates]);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            if (user?.id) {
                try {
                    const [meetingsData, practicesData, scenariosData, goalsData, clientsData] = await Promise.all([
                        api.getMeetings(user.id),
                        api.getPractices(user.id),
                        api.getScenarios(user.id),
                        api.getGoals(user.id),
                        api.getClients(user.id)
                    ]);
                    setMeetings(meetingsData || []);
                    setPractices(practicesData || []);
                    setScenarios(scenariosData || []);
                    setGoals(goalsData || []);
                    setClients(clientsData || []);
                } catch (e) {
                    console.error("Failed to load data", e);
                }
            }
        };
        loadData();
    }, [user?.id]);
    // One-time seed backfill (avoid jumping values)
    useEffect(() => {
        if (!user?.id) return;
        const flagKey = `garden_seeds_backfill_${user.id}`;
        const alreadyBackfilled = localStorage.getItem(flagKey) === '1';
        // Only run if seeds are missing (null/undefined) and we haven't backfilled yet
        if (!alreadyBackfilled && (user.seeds === null || user.seeds === undefined)) {
            const hasContent = meetings.length > 0 || practices.length > 0 || scenarios.length > 0 || clients.length > 0 || goals.length > 0;

            if (hasContent) {
                let totalSeeds = 0;

                // Scenarios: 100 per scenario (simplified)
                totalSeeds += scenarios.length * 100;

                // Practices: 80 per practice
                totalSeeds += practices.length * 80;

                // Clients: 10 per client
                totalSeeds += clients.length * 10;

                // Goals: 30 created + 100 completed
                goals.forEach(g => {
                    totalSeeds += 30;
                    if (g.completed) totalSeeds += 100;
                });

                // Meetings (New rules)
                meetings.forEach(m => {
                    totalSeeds += 5; // meeting created
                    if (m.status === 'completed') {
                        totalSeeds += 25; // meeting completed
                    }
                });

                if (totalSeeds > 0) {
                    onUpdateUser({ ...user, seeds: totalSeeds });
                    localStorage.setItem(flagKey, '1');
                    // onNotify(`Ваши семена пересчитаны: ${totalSeeds}`);
                }
            }
        }
    }, [meetings.length, practices.length, scenarios.length, clients.length, goals.length, user?.id]);
    const [initialTab, setInitialTab] = useState('meetings');
    const [libraryResetToken, setLibraryResetToken] = useState(0);
    const [builderInitialTab, setBuilderInitialTab] = useState('builder');
    const [builderResetToken, setBuilderResetToken] = useState(0);

    const handleViewChange = (newView, tab = null) => {


        if (newView === 'mastery') {
            setView('meetings');
            setInitialTab('mastery');
        } else {
            setView(newView);
            // Default to 'meetings' tab unless specified otherwise
            setInitialTab(tab || 'meetings');
        }

        if (newView === 'library') {
            setLibraryResetToken((v) => v + 1);
        } else if (newView === 'builder') {
            const nextBuilderTab = tab || 'builder';
            setBuilderInitialTab(nextBuilderTab);
            setBuilderResetToken((v) => v + 1);
            setCourseSidebar({ enabled: false, title: 'Курс', items: [], activeKey: null });
        } else {
            setCourseSidebar({ enabled: false, title: 'Курс', items: [], activeKey: null });
        }

        setMobileMenuOpen(false);
    };

    const courseIconMap = {
        users: Users,
        calendar: CalendarRange,
        graduation: GraduationCap,
        book: BookOpen,
        dashboard: LayoutGrid,
        tracker: BookOpen,
        mentor: Users,
        notifications: Sparkles,
        bell: Bell,
        messages: MessageCircle,
    };
    const courseLabelIconMap = {
        'Дашборд': LayoutGrid,
        'О курсе': Info,
        'Глоссарий': Languages,
        'Библиотека': Library,
        'Трекер': Route,
        Календарь: CalendarCheck2,
        Коммуникации: MessageCircle,
        'Результаты': BarChart3,
        'Сертификация': BadgeCheck,
        'FAQ': MessageCircleQuestion,
        'Настройки': Settings,
        'Вернуться в сад': CornerUpLeft,
    };
    const isCourseSidebarMode = view === 'library' && courseSidebar.enabled;

    const handleOpenLeader = (leader) => {
        if (!leader) return;
        setLeaderUser(leader);
        setView('leader');
        setMobileMenuOpen(false);
    };

    useEffect(() => {
        const r = gardenPvlBridgeRef;
        if (!r) return undefined;
        r.current = r.current || {};
        r.current.openGardenUserProfile = (userId) => {
            if (userId == null) return;
            const target = mergedUsers.find((u) => String(u.id) === String(userId));
            if (!target) return;
            setLeaderUser(target);
            setView('leader');
            setMobileMenuOpen(false);
        };
        return () => {
            if (r.current?.openGardenUserProfile) delete r.current.openGardenUserProfile;
        };
    }, [mergedUsers]);

    const handleUpdateProfile = async (updated) => {
        try {
            // Optimistic update
            onUpdateUser(updated);

            // Persist to backend
            await api.updateUser(updated);
            onNotify("Профиль сохранен");
        } catch (e) {
            console.error("Failed to update profile:", e);
            onNotify("Ошибка сохранения профиля");
        }
    };

    const handleAddMeeting = async (meetingData) => {
        try {
            const seedsEarned = 5; // Meeting created

            const newMeeting = { ...meetingData, user_id: user.id, seeds_awarded: false };

            const saved = await api.addMeeting(newMeeting);
            const localMeeting = { ...saved, title: saved?.title || meetingData.title };

            setMeetings((prev) => [localMeeting, ...prev]);

            const updatedUser = { ...user, seeds: (user.seeds || 0) + seedsEarned };
            onUpdateUser(updatedUser);
            onNotify(`Встреча сохранена! +${seedsEarned} семян`);

            if (Array.isArray(meetingData.co_hosts) && meetingData.co_hosts.length > 0) {
                try {
                    await api.incrementUserSeeds(meetingData.co_hosts, seedsEarned);
                    onNotify("Со-ведущим начислены семена");
                } catch (e) {
                    console.warn("Failed to add seeds for co-hosts:", e);
                    onNotify("Не удалось начислить семена со-ведущим");
                }
            }

        } catch (e) {
            console.error(e);
            onNotify("Ошибка сохранения встречи: " + e.message);
        }
    };

    const handleUpdateMeeting = async (updatedMeeting) => {
        try {
            const prevMeeting = meetings.find(m => m.id === updatedMeeting.id);
            const wasCompleted = prevMeeting?.status === 'completed';
            const willBeCompleted = updatedMeeting.status === 'completed';
            const alreadyAwarded = !!(prevMeeting?.seeds_awarded || updatedMeeting.seeds_awarded);
            const nextPayload = (!wasCompleted && willBeCompleted && !alreadyAwarded)
                ? { ...updatedMeeting, seeds_awarded: true }
                : updatedMeeting;
            const saved = await api.updateMeeting(nextPayload);
            const localUpdated = saved || nextPayload;
            setMeetings((prev) => prev.map((m) => (
                m.id === updatedMeeting.id
                    ? { ...m, ...localUpdated }
                    : m
            )));

            if (!wasCompleted && willBeCompleted && !alreadyAwarded) {
                const seedsEarned = 25;
                onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
                onNotify(`Встреча проведена! +${seedsEarned} семян`);

                const coHosts = Array.isArray(updatedMeeting.co_hosts) && updatedMeeting.co_hosts.length > 0
                    ? updatedMeeting.co_hosts
                    : (Array.isArray(prevMeeting?.co_hosts) ? prevMeeting.co_hosts : []);
                if (coHosts.length > 0) {
                    try {
                        await api.incrementUserSeeds(coHosts, seedsEarned);
                        onNotify("Со-ведущим начислены семена");
                    } catch (e) {
                        console.warn("Failed to add seeds for co-hosts:", e);
                        onNotify("Не удалось начислить семена со-ведущим");
                    }
                }
            } else {
                onNotify("Встреча обновлена");
            }
        } catch (e) {
            console.error(e);
            onNotify("Ошибка обновления встречи");
        }
    };

    const handleDeleteMeeting = async (meetingId) => {
        try {
            await api.deleteMeeting(meetingId);
            setMeetings(meetings.filter(m => m.id !== meetingId));
            onNotify("Встреча удалена");
        } catch (e) {
            console.error(e);
            onNotify("Ошибка удаления встречи");
        }
    };

    const handleAddPractice = async (practice, options = {}) => {
        const { silent = false, grantSeeds = true, propagateError = false } = options;
        try {
            const newPractice = { ...practice, user_id: user.id };
            const saved = await api.addPractice(newPractice);
            setPractices((prev) => [saved, ...prev]);

            if (grantSeeds) {
                // Seed Bonus: +80
                const seedsEarned = 80;
                onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
                if (!silent) onNotify(`Практика добавлена! +${seedsEarned} семян`);
            } else if (!silent) {
                onNotify("Практика добавлена");
            }

            return saved;
        } catch (e) {
            console.error(e);
            if (!silent) onNotify("Ошибка сохранения практики: " + e.message);
            if (propagateError) throw e;
            return null;
        }
    };

    const handleUpdatePractice = async (updatedPractice) => {
        try {
            await api.updatePractice(updatedPractice);
            setPractices((prev) => prev.map(p => p.id === updatedPractice.id ? updatedPractice : p));
            onNotify("Практика обновлена");
        } catch (e) {
            console.error(e);
            onNotify("Ошибка обновления: " + e.message);
        }
    };

    const handleDeletePractice = async (practiceId) => {
        try {
            await api.deletePractice(practiceId);
            setPractices((prev) => prev.filter(p => p.id !== practiceId));
            onNotify("Практика удалена");
        } catch (e) {
            console.error(e);
            onNotify("Ошибка удаления практики");
        }
    };

    // Notification handling
    useEffect(() => {
        if (user.notifications) {
            const unread = user.notifications.find(n => !n.read);
            if (unread) {
                setNotificationModal(unread);
            }
        }
    }, [user.notifications]);

    const handleCloseNotification = () => {
        if (notificationModal) {
            onMarkAsRead(notificationModal.id);
            setNotificationModal(null);
        }
    };

    const handleScenarioAdded = (isPublic) => {
        const seedsEarned = isPublic ? 150 : 100;
        onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
        onNotify(isPublic ? `Сценарий опубликован в Лиге! +${seedsEarned} семян` : `Сценарий сохранен! +${seedsEarned} семян`);
    };

    const handleLessonCompleted = (material, course) => {
        if (!material?.id || !user?.id) return;
        const seedsEarned = 20;
        onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
        onNotify(`Урок пройден: ${material.title}${course?.title ? ` (${course.title})` : ''}. +${seedsEarned} семян`);
    };

    const handleLeagueScenarioCompleted = (scenario) => {
        const seedsEarned = 20;
        onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
        onNotify(`Сценарий изучен: ${scenario?.title || 'Без названия'}. +${seedsEarned} семян`);
    };

    const handleUpdateClient = async (updatedClient) => {
        try {
            // Find old client to compare notes
            const oldClient = clients.find(c => c.id === updatedClient.id);
            let savedClient = updatedClient;
            if (api.updateClient) {
                savedClient = await api.updateClient(updatedClient);
            }
            setClients(prev => prev.map(old => old.id === savedClient.id ? savedClient : old));

            // Seed Bonus for Notes: +5
            if (oldClient && updatedClient.notes && updatedClient.notes !== oldClient.notes) {
                const seedsEarned = 5;
                onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
                onNotify(`Заметка обновлена! +${seedsEarned} семян`);
            } else {
                onNotify("Клиент обновлен");
            }

        } catch (e) {
            console.error(e);
            onNotify("Ошибка обновления клиента");
        }
    };

    const handleAddClient = async (client) => {
        try {
            const payload = { ...client, user_id: user.id };
            const newClient = api.addClient ? await api.addClient(payload) : { id: Date.now(), ...payload };
            setClients(prev => [newClient, ...prev]);

            // Seed Bonus: +10
            const seedsEarned = 10;
            onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
            onNotify(`Клиент добавлен! +${seedsEarned} семян`);
        } catch (e) {
            console.error(e);
            onNotify("Ошибка создания клиента");
        }
    };

    const handleDeleteClient = async (clientId) => {
        try {
            await api.deleteClient(clientId);
            setClients(clients.filter(c => c.id !== clientId));
            onNotify("Клиент удален");
        } catch (e) {
            console.error(e);
            onNotify("Ошибка удаления клиента");
        }
    };

    const handleAddGoal = async (goal) => {
        try {
            const newGoal = { ...goal, user_id: user.id };
            const saved = await api.addGoal(newGoal);
            if (!saved) throw new Error('Сервер не вернул созданную цель');
            setGoals([saved, ...goals]);

            // Seed Bonus: +30
            const seedsEarned = 30;
            onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
            onNotify(`Цель создана! +${seedsEarned} семян`);
        } catch (e) {
            console.error(e);
            onNotify("Ошибка создания цели: " + e.message);
        }
    };

    const handleUpdateGoal = async (updatedGoal) => {
        try {
            const oldGoal = goals.find(g => g.id === updatedGoal.id);
            const saved = await api.updateGoal(updatedGoal);
            const nextGoal = saved || updatedGoal;
            setGoals(goals.map(g => g.id === updatedGoal.id ? nextGoal : g));

            // Check for completion bonus: +100
            if (nextGoal.completed && (!oldGoal || !oldGoal.completed)) {
                const seedsEarned = 100;
                onUpdateUser({ ...user, seeds: (user.seeds || 0) + seedsEarned });
                onNotify(`Цель достигнута! +${seedsEarned} семян`);
            } else {
                onNotify("Цель обновлена");
            }
        } catch (e) {
            console.error(e);
            onNotify("Ошибка обновления цели");
        }
    };

    const handleDeleteGoal = async (goalId) => {
        try {
            await api.deleteGoal(goalId);
            setGoals(goals.filter(g => g.id !== goalId));
            onNotify("Цель удалена");
        } catch (e) {
            console.error(e);
            onNotify("Ошибка удаления цели");
        }
    };

    const handleEnablePushNotifications = async () => {
        if (!api.enablePushNotifications) {
            onNotify('Push-уведомления пока не поддерживаются в текущем режиме.');
            return;
        }
        try {
            setPushStatus((prev) => ({ ...prev, loading: true }));
            await api.enablePushNotifications(user);
            const next = await api.getPushStatus?.();
            if (next) setPushStatus((prev) => ({ ...prev, ...next, loading: false }));
            else setPushStatus((prev) => ({ ...prev, enabled: true, loading: false }));
            onNotify('Push-уведомления включены.');
        } catch (e) {
            console.error(e);
            setPushStatus((prev) => ({ ...prev, loading: false }));
            onNotify(e?.message || 'Не удалось включить уведомления');
        }
    };

    return (
        <div className="flex h-screen bg-transparent overflow-hidden selection:bg-blue-100 selection:text-blue-900 font-sans text-slate-700">
            {/* Desktop Sidebar - The Glass Dock */}
            <div className={`hidden md:flex flex-col w-80 h-full p-6 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] relative z-50`}>
                <div className="flex-1 surface-card px-4 pt-8 pb-8 flex flex-col relative overflow-hidden ring-1 ring-white/70">

                    {/* Fixed Avatar / Profile Section */}
                    <div className="flex-shrink-0">
                        <div className="flex items-center gap-4 px-4 mb-6 group cursor-pointer" onClick={() => handleViewChange('profile')}>
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500/15 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <div className="relative transform group-hover:scale-105 transition-transform duration-500 ease-out">
                                    <UserAvatar user={user} size="md" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                    <div className={`w-2.5 h-2.5 rounded-full border border-white ${isAdmin ? 'bg-purple-500' : 'bg-green-500'}`}></div>
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-slate-900 tracking-tight group-hover:text-blue-700 transition-colors duration-300">{user.name}</span>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em] leading-none">{getRoleLabel(user.role)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Navigation */}
                    <div className="flex-1 overflow-y-auto min-h-0 py-2 custom-scrollbar -mx-2 px-2">
                        <nav className="space-y-1">
                            {isCourseSidebarMode ? (
                                <>
                                    <div className="px-4 pb-2">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{courseSidebar.title}</div>
                                    </div>
                                    {courseSidebar.items.map((item) => {
                                        if (item.type === 'divider') {
                                            return <div key={item.key} className="h-px bg-slate-100/60 my-2 mx-2" />;
                                        }
                                        const Icon = courseLabelIconMap[item.label] || courseIconMap[item.iconKey] || GraduationCap;
                                        if (item.action === 'settings') {
                                            return (
                                                <SidebarItem
                                                    key={item.key}
                                                    icon={Settings}
                                                    label={item.label}
                                                    active={view === 'profile'}
                                                    onClick={() => handleViewChange('profile')}
                                                />
                                            );
                                        }
                                        if (item.action === 'exit_pvl') {
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => {
                                                        try {
                                                            gardenPvlBridgeRef.current?.exit?.();
                                                        } catch {
                                                            /* ignore */
                                                        }
                                                        handleViewChange(homeView);
                                                    }}
                                                    className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all duration-300 text-slate-600 hover:bg-white/80 hover:text-slate-900 active:scale-[0.98] select-none"
                                                >
                                                    <CornerUpLeft size={22} className="stroke-[1.6px]" width={24} />
                                                    <span className="font-medium tracking-wide text-[15px]">{item.label}</span>
                                                </button>
                                            );
                                        }
                                        return (
                                            <SidebarItem
                                                key={item.key}
                                                icon={Icon}
                                                label={item.label}
                                                active={courseSidebar.activeKey === item.key}
                                                onClick={() => {
                                                    try {
                                                        gardenPvlBridgeRef.current?.navigate?.(item.route);
                                                    } catch {
                                                        /* ignore */
                                                    }
                                                }}
                                            />
                                        );
                                    })}
                                </>
                            ) : (
                                <>
                                    {!isApplicant && (
                                        <SidebarItem
                                            icon={LayoutGrid}
                                            label="Дашборд"
                                            active={view === 'dashboard'}
                                            onClick={() => handleViewChange('dashboard')}
                                        />
                                    )}
                                    <SidebarItem
                                        icon={CalendarRange}
                                        label="Встречи"
                                        active={view === 'meetings'}
                                        onClick={() => handleViewChange('meetings')}
                                    />
                                    <SidebarItem
                                        icon={MapIcon}
                                        label="Сад ведущих"
                                        active={view === 'map'}
                                        onClick={() => handleViewChange('map')}
                                    />
                                    <SidebarItem
                                        icon={BookOpen}
                                        label="Практики"
                                        active={view === 'practices'}
                                        onClick={() => handleViewChange('practices')}
                                    />
                                    <SidebarItem
                                        icon={Sparkles}
                                        label="Сценарии"
                                        active={view === 'builder'}
                                        onClick={() => handleViewChange('builder')}
                                    />
                                    <SidebarItem
                                        icon={GraduationCap}
                                        label="Библиотека"
                                        active={view === 'library'}
                                        onClick={() => handleViewChange('library')}
                                    />
                                    {isAdmin && (
                                        <SidebarItem
                                            icon={MessagesSquare}
                                            label="Коммуникации"
                                            active={view === 'communications'}
                                            onClick={() => handleViewChange('communications')}
                                        />
                                    )}
                                    {hasAccess(normalizedRole, 'intern') && (
                                        <>
                                            <SidebarItem
                                                icon={Users}
                                                label="Люди CRM"
                                                active={view === 'crm'}
                                                onClick={() => handleViewChange('crm')}
                                            />
                                        </>
                                    )}
                                    {isAdmin && (
                                        <SidebarItem
                                            icon={Shield}
                                            label="Админка"
                                            onClick={onSwitchToAdmin}
                                        />
                                    )}
                                </>
                            )}
                            {!isCourseSidebarMode ? <div className="h-px bg-slate-100/60 my-3"></div> : null}
                            {!isCourseSidebarMode ? (
                                <>
                                    {canOpenPvlButton ? (
                                        <SidebarItem
                                            icon={GraduationCap}
                                            label="ПВЛ"
                                            onClick={openPvlCourse}
                                        />
                                    ) : null}
                                <SidebarItem
                                    icon={Settings}
                                    label="Настройки"
                                    active={view === 'profile'}
                                    onClick={() => handleViewChange('profile')}
                                />
                                </>
                            ) : (
                                <div className="h-px bg-slate-100/60 my-3" />
                            )}
                            {!isCourseSidebarMode && canOpenTeacherCabinet ? (
                                <SidebarItem
                                    icon={BadgeCheck}
                                    label="Учительская"
                                    onClick={openPvlCourse}
                                />
                            ) : null}
                            <button
                                onClick={onLogout}
                                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-slate-500 hover:text-rose-600 hover:bg-rose-50/60 transition-all duration-300 group select-none"
                            >
                                <LogOut size={22} className="stroke-[1.5px] group-hover:scale-110 transition-transform duration-300" />
                                <span className="font-medium tracking-wide text-[15px]">Выйти</span>
                            </button>
                        </nav>
                    </div>
                </div>
            </div>

            {/* Mobile Header - Glass Strip */}
            <div className="md:hidden fixed top-0 w-full bg-white/90 backdrop-blur-xl border-b border-white/40 z-50 px-4 py-4 flex justify-between items-center shadow-[0_10px_30px_-20px_rgba(21,17,12,0.6)]">
                {isCourseSidebarMode ? (
                    <>
                        <button
                            onClick={() => { try { gardenPvlBridgeRef.current?.exit?.(); } catch { /* ignore */ } handleViewChange(homeView); }}
                            className="flex items-center gap-1.5 text-slate-500 active:text-slate-700"
                        >
                            <CornerUpLeft size={18} strokeWidth={2} />
                            <span className="text-sm font-medium">Сад</span>
                        </button>
                        <span className="font-display font-semibold text-slate-900 text-base tracking-tight">{courseSidebar.title}</span>
                        <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 rounded-xl text-slate-400 active:bg-slate-100">
                            <Menu size={22} strokeWidth={1.5} />
                        </button>
                    </>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-700 rounded-2xl flex items-center justify-center text-white shadow-[0_10px_20px_-10px_rgba(47,111,84,0.7)]">
                            <Leaf size={18} strokeWidth={2.5} />
                        </div>
                        <span className="font-display font-semibold text-slate-900 text-lg tracking-tight">Сад ведущих</span>
                    </div>
                )}
            </div>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300 md:hidden">
                    <div className="absolute right-0 top-0 bottom-0 w-3/4 max-w-sm bg-white/95 backdrop-blur-xl shadow-[0_24px_60px_-32px_rgba(21,17,12,0.8)] p-6 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-display font-semibold text-slate-900">
                                {isCourseSidebarMode ? courseSidebar.title : 'Меню'}
                            </h2>
                            <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500">
                                <X size={24} />
                            </button>
                        </div>

                        {isCourseSidebarMode ? (
                            /* ПВЛ-навигация в оверлее */
                            <nav className="space-y-1 flex-1 overflow-y-auto">
                                {courseSidebar.items.map((item) => {
                                    if (item.type === 'divider') {
                                        return <div key={item.key} className="h-px bg-slate-100/60 my-2 mx-2" />;
                                    }
                                    const Icon = courseLabelIconMap[item.label] || courseIconMap[item.iconKey] || GraduationCap;
                                    if (item.action === 'settings') {
                                        return (
                                            <SidebarItem key={item.key} icon={Settings} label={item.label} active={view === 'profile'} onClick={() => handleViewChange('profile')} />
                                        );
                                    }
                                    if (item.action === 'exit_pvl') {
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => { try { gardenPvlBridgeRef.current?.exit?.(); } catch { /* ignore */ } handleViewChange(homeView); }}
                                                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all duration-300 text-slate-600 hover:bg-white/80 hover:text-slate-900 active:scale-[0.98] select-none"
                                            >
                                                <CornerUpLeft size={22} className="stroke-[1.6px]" />
                                                <span className="font-medium tracking-wide text-[15px]">{item.label}</span>
                                            </button>
                                        );
                                    }
                                    return (
                                        <SidebarItem
                                            key={item.key}
                                            icon={Icon}
                                            label={item.label}
                                            active={courseSidebar.activeKey === item.key}
                                            onClick={() => { try { gardenPvlBridgeRef.current?.navigate?.(item.route); } catch { /* ignore */ } setMobileMenuOpen(false); }}
                                        />
                                    );
                                })}
                            </nav>
                        ) : (
                            /* Обычная навигация Сада */
                            <nav className="space-y-2 flex-1 overflow-y-auto">
                                {!isApplicant && <SidebarItem icon={LayoutGrid} label="Дашборд" active={view === 'dashboard'} onClick={() => handleViewChange('dashboard')} />}
                                <SidebarItem icon={CalendarRange} label="Встречи" active={view === 'meetings'} onClick={() => handleViewChange('meetings')} />
                                <SidebarItem icon={MapIcon} label="Сад ведущих" active={view === 'map'} onClick={() => handleViewChange('map')} />
                                <div className="h-px bg-slate-100 my-4"></div>
                                <SidebarItem icon={BookOpen} label="Практики" active={view === 'practices'} onClick={() => handleViewChange('practices')} />
                                <SidebarItem icon={Sparkles} label="Сценарии" active={view === 'builder'} onClick={() => handleViewChange('builder')} />
                                <SidebarItem icon={GraduationCap} label="Библиотека" active={view === 'library'} onClick={() => handleViewChange('library')} />
                                {isAdmin && (
                                    <SidebarItem icon={MessagesSquare} label="Коммуникации" active={view === 'communications'} onClick={() => handleViewChange('communications')} />
                                )}
                                {hasAccess(normalizedRole, 'intern') && (
                                    <SidebarItem icon={Users} label="Люди CRM" active={view === 'crm'} onClick={() => handleViewChange('crm')} />
                                )}
                                <div className="h-px bg-slate-100 my-4"></div>
                                {isAdmin && (
                                    <SidebarItem icon={Shield} label="Админка" onClick={onSwitchToAdmin} />
                                )}
                                {canOpenPvlButton ? (
                                    <SidebarItem icon={GraduationCap} label="ПВЛ" onClick={openPvlCourse} />
                                ) : null}
                                <SidebarItem icon={Settings} label="Профиль" active={view === 'profile'} onClick={() => handleViewChange('profile')} />
                                {canOpenTeacherCabinet ? (
                                    <SidebarItem icon={BadgeCheck} label="Учительская" onClick={openPvlCourse} />
                                ) : null}
                                <div onClick={onLogout} className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-slate-500 active:bg-slate-50">
                                    <LogOut size={22} className="stroke-[1.5px]" />
                                    <span className="font-medium tracking-wide text-[15px]">Выйти</span>
                                </div>
                            </nav>
                        )}
                    </div>
                </div>
            )}


            {/* Main Content Area */}
            <div className="flex min-h-0 flex-1 overflow-y-auto pb-20 md:pb-6 md:pt-6 pt-20 relative isolate">
                {/* Ambient Background - Global */}
                <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(63,139,107,0.18),_transparent_55%),radial-gradient(circle_at_20%_20%,_rgba(143,127,106,0.15),_transparent_40%),linear-gradient(180deg,_#fbf9f3_0%,_#f7f3ea_100%)] -z-50" />

                <div className={`p-6 min-h-full animate-in fade-in duration-500 ${isCourseSidebarMode ? 'max-w-none mx-0 w-full' : 'max-w-6xl mx-auto'}`}>
                    {view === 'dashboard' && (
                        <StatsDashboardView
                            user={user}
                            meetings={meetings}
                            knowledgeBase={knowledgeBase}
                            clients={clients}
                            practices={practices}
                            scenarios={scenarios}
                            goals={goals}
                            onNavigate={handleViewChange}
                            onOpenLeaderPage={() => handleOpenLeader(user)}
                            newsItems={dashboardNews}
                        />
                    )}
                    {view === 'meetings' && <MeetingsView user={user} users={users} meetings={meetings} goals={goals} onAddMeeting={handleAddMeeting} onUpdateMeeting={handleUpdateMeeting} onDeleteMeeting={handleDeleteMeeting} onAddGoal={handleAddGoal} onUpdateGoal={handleUpdateGoal} onDeleteGoal={handleDeleteGoal} onNotify={onNotify} initialTab={initialTab} />}
                    {view === 'practices' && <PracticesView user={user} knowledgeBase={knowledgeBase} practices={practices} onAddPractice={handleAddPractice} onUpdatePractice={handleUpdatePractice} onDeletePractice={handleDeletePractice} onNotify={onNotify} />}
                    {view === 'library' && (
                        <Suspense fallback={(
                            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-slate-500">
                                <div className="w-10 h-10 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                                <span className="text-sm">Загрузка библиотеки…</span>
                            </div>
                        )}
                        >
                            <CourseLibraryView
                                user={user}
                                knowledgeBase={knowledgeBase}
                                librarySettings={librarySettings}
                                openPvlRequest={libraryOpenRequest}
                                onCompleteLesson={handleLessonCompleted}
                                onNotify={onNotify}
                                onBackToGarden={() => handleViewChange(homeView)}
                                onCourseSidebarChange={setCourseSidebar}
                                gardenPvlBridgeRef={gardenPvlBridgeRef}
                                resetToken={libraryResetToken}
                            />
                        </Suspense>
                    )}
                    {view === 'builder' && <BuilderView user={user} practices={practices} timeline={timeline} setTimeline={setTimeline} onNotify={onNotify} onSave={handleScenarioAdded} onCompleteLeagueScenario={handleLeagueScenarioCompleted} initialTab={builderInitialTab} resetToken={builderResetToken} />}
                    {view === 'crm' && <CRMView clients={clients} onAddClient={handleAddClient} onUpdateClient={handleUpdateClient} onDeleteClient={handleDeleteClient} onNotify={onNotify} />}
                    {view === 'market' && <MarketView />}
                    {view === 'map' && (
                        <MapView
                            users={mergedUsers}
                            currentUser={user}
                            onOpenLeader={handleOpenLeader}
                        />
                    )}
                    {view === 'leader' && (
                        <LeaderPageView
                            leader={leaderUser}
                            currentUser={user}
                            onBack={() => setView('map')}
                            onUpdateProfile={handleUpdateProfile}
                        />
                    )}
                    {view === 'communications' && isAdmin && (
                        <CommunicationsView
                            user={user}
                            users={mergedUsers}
                            channelItems={news}
                            onNotify={onNotify}
                            onOpenProfile={handleOpenLeader}
                        />
                    )}
                    {view === 'profile' && (
                        <ProfileView
                            user={user}
                            onUpdateProfile={handleUpdateProfile}
                            onLogout={onLogout}
                            onDeleteAccount={onLogout}
                            onNotify={onNotify}
                            skillOptions={skillOptions}
                            onOpenLeaderPage={() => handleOpenLeader(user)}
                            onEnablePushNotifications={handleEnablePushNotifications}
                            pushStatus={pushStatus}
                        />
                    )}
                </div>
            </div>

            {/* Mobile Bottom Navigation: компактная панель (меньше по высоте, чем pb-6 + крупные иконки) */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex w-full items-stretch justify-between border-t border-white/60 bg-white/95 px-0.5 pt-1.5 shadow-[0_-4px_18px_-12px_rgba(21,17,12,0.45)] backdrop-blur-xl pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
                {isCourseSidebarMode ? (
                    /* ПВЛ-режим: быстрые кнопки курса */
                    <>
                        <button
                            onClick={() => { try { gardenPvlBridgeRef.current?.exit?.(); } catch { /* ignore */ } handleViewChange(homeView); }}
                            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 text-slate-400 transition-colors duration-200 active:text-slate-600"
                        >
                            <CornerUpLeft size={20} strokeWidth={1.5} className="shrink-0" />
                            <span className="text-[9px] font-medium leading-none">Сад</span>
                        </button>
                        {courseSidebar.items
                            .filter(item => item.type !== 'divider' && item.action !== 'exit_pvl' && item.action !== 'settings')
                            .slice(0, 3)
                            .map((item) => {
                                const Icon = courseLabelIconMap[item.label] || courseIconMap[item.iconKey] || GraduationCap;
                                const isActive = courseSidebar.activeKey === item.key;
                                return (
                                    <button
                                        key={item.key}
                                        onClick={() => { try { gardenPvlBridgeRef.current?.navigate?.(item.route); } catch { /* ignore */ } }}
                                        className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`}
                                    >
                                        <Icon size={20} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
                                        <span className="max-w-[52px] truncate text-center text-[9px] font-medium leading-tight">{item.label}</span>
                                    </button>
                                );
                            })
                        }
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${mobileMenuOpen ? 'text-emerald-700' : 'text-slate-400'}`}
                        >
                            <Menu size={20} strokeWidth={1.5} className="shrink-0" />
                            <span className="text-[9px] font-medium leading-none">Меню</span>
                        </button>
                    </>
                ) : (
                    /* Обычный режим Сада */
                    <>
                        {isApplicant ? (
                            <button
                                onClick={() => handleViewChange('library')}
                                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${view === 'library' ? 'text-emerald-700' : 'text-slate-400'}`}
                            >
                                <GraduationCap size={20} strokeWidth={view === 'library' ? 2 : 1.5} className="shrink-0" />
                                <span className="text-[9px] font-medium leading-none">Библиотека</span>
                            </button>
                        ) : (
                            <button
                                onClick={() => handleViewChange('dashboard')}
                                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${view === 'dashboard' ? 'text-emerald-700' : 'text-slate-400'}`}
                            >
                                <LayoutGrid size={20} strokeWidth={view === 'dashboard' ? 2 : 1.5} className="shrink-0" />
                                <span className="text-[9px] font-medium leading-none">Дашборд</span>
                            </button>
                        )}

                        <button
                            onClick={() => handleViewChange('meetings')}
                            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${view === 'meetings' ? 'text-emerald-700' : 'text-slate-400'}`}
                        >
                            <CalendarRange size={20} strokeWidth={view === 'meetings' ? 2 : 1.5} className="shrink-0" />
                            <span className="text-[9px] font-medium leading-none">Встречи</span>
                        </button>

                        {/* Центральная акцентная кнопка — ПВЛ или Учительская */}
                        {(canOpenPvlButton || canOpenTeacherCabinet) ? (
                            <button onClick={openPvlCourse} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 -translate-y-1.5 py-0.5">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 shadow-[0_6px_16px_-6px_rgba(5,150,105,0.5)] transition-transform duration-200 active:scale-95">
                                    {canOpenTeacherCabinet
                                        ? <BadgeCheck size={22} color="white" strokeWidth={2} />
                                        : <GraduationCap size={22} color="white" strokeWidth={2} />
                                    }
                                </div>
                                <span className="text-[9px] font-semibold leading-none text-emerald-700">
                                    {canOpenTeacherCabinet ? 'Учительская' : 'ПВЛ'}
                                </span>
                            </button>
                        ) : null}

                        {(canOpenPvlButton || canOpenTeacherCabinet) && (
                            <button
                                onClick={() => handleViewChange('practices')}
                                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${view === 'practices' ? 'text-emerald-700' : 'text-slate-400'}`}
                            >
                                <BookOpen size={20} strokeWidth={view === 'practices' ? 2 : 1.5} className="shrink-0" />
                                <span className="text-[9px] font-medium leading-none">Практики</span>
                            </button>
                        )}

                        {!(canOpenPvlButton || canOpenTeacherCabinet) && (
                            <button
                                onClick={() => handleViewChange('practices')}
                                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${view === 'practices' ? 'text-emerald-700' : 'text-slate-400'}`}
                            >
                                <BookOpen size={20} strokeWidth={view === 'practices' ? 2 : 1.5} className="shrink-0" />
                                <span className="text-[9px] font-medium leading-none">Практики</span>
                            </button>
                        )}

                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-200 ${mobileMenuOpen ? 'text-emerald-700' : 'text-slate-400'}`}
                        >
                            <Menu size={20} strokeWidth={1.5} className="shrink-0" />
                            <span className="text-[9px] font-medium leading-none">Меню</span>
                        </button>
                    </>
                )}
            </div>

            {/* Notification Modal */}
            {notificationModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="surface-card p-8 w-full max-w-sm text-center relative animate-in zoom-in-95 duration-300 ring-1 ring-black/5">
                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <Sparkles size={32} className="text-blue-600" />
                        </div>
                        <h3 className="text-xl font-display font-semibold text-slate-900 mb-2">Вам пришел лучик!</h3>
                        <p className="text-slate-500 mb-6">От: <span className="font-medium text-slate-800">{notificationModal.from}</span></p>
                        <p className="text-sm text-slate-600 italic mb-8 bg-slate-50/80 p-4 rounded-2xl">"{notificationModal.message}"</p>
                        <Button onClick={handleCloseNotification} className="w-full py-4 text-base shadow-[0_18px_30px_-18px_rgba(47,111,84,0.6)]">Принять с благодарностью</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserApp;
