import React, { Suspense, lazy, useEffect, useMemo, useState, useCallback } from 'react';
import { FileText, Video } from 'lucide-react';
import Button from '../components/Button';
import PvlErrorBoundary from '../components/PvlErrorBoundary';
import { hasAccess, ROLES } from '../utils/roles';
import { api } from '../services/dataService';
import DOMPurify from 'dompurify';
import { clearAppSession, getHomeRouteByRole, loadAppSession, saveAppSession } from '../services/pvlAppKernel';
import { PVL_COURSE_DISPLAY_NAME } from '../data/pvl/courseDisplay';
import { canSeePvlInGarden, resolvePvlRoleFromGardenProfile } from '../services/pvlRoleResolver';
import {
    buildGardenPvlAdminNav,
    buildGardenPvlMentorNav,
    buildGardenPvlStudentNav,
    gardenPvlItemActive,
} from '../services/pvlGardenNav';

/** PvlPrototypeApp грузится отдельным чанком только после входа в курс ПВЛ — не в стартовом графе библиотеки */
const PvlPrototypeApp = lazy(() => import('./PvlPrototypeApp'));

const COURSES = [
    {
        id: 0,
        title: "Инструкции",
        description: "Быстрые инструкции по работе с платформой: вход, профиль, встречи, библиотека и публикация в расписании.",
        image: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&q=80&w=800",
        tag: "Полезное",
        minRole: ROLES.APPLICANT,
        pinned: true,
        hideWhenEmpty: false
    },
    {
        id: 1,
        title: "Пиши, веди, люби",
        description: "Курс для ведущих встреч с письменными практиками. Освойте искусство бережной модерации и создания смыслов.",
        image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=800",
        tag: "Курсы",
        minRole: ROLES.APPLICANT,
        hideWhenEmpty: true
    },
    {
        id: 2,
        title: "Начало пути",
        description: "Курс для стажеров: первые шаги, опоры и базовые навыки ведущей.",
        image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=800",
        tag: "Курсы",
        minRole: ROLES.INTERN,
        hideWhenEmpty: true
    },
    {
        id: 3,
        title: "Расти",
        description: "Курс для развития личного бренда ведущей. Как проявляться, привлекать своих людей и монетизировать талант.",
        image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=800",
        tag: "Курсы",
        minRole: ROLES.INTERN,
        hideWhenEmpty: true
    },
    {
        id: 4,
        title: "Промты, ассистенты, лайфхаки",
        description: "Полезные рекомендации для ведущих. Коллекция проверенных инструментов для упрощения работы.",
        image: "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?auto=format&fit=crop&q=80&w=800",
        tag: "Полезное",
        minRole: ROLES.INTERN,
        hideWhenEmpty: true
    },
    {
        id: 5,
        title: "Менторский курс",
        description: "Курс для кураторов ПВЛ. Углубленное обучение наставничеству и поддержке других ведущих.",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800",
        tag: "Курсы",
        minRole: ROLES.LEADER,
        hideWhenEmpty: true
    },
    {
        id: 6,
        title: PVL_COURSE_DISPLAY_NAME,
        description: "Курс для ведущих встреч с письменными практиками: кабинет ученицы, ментора и учительской — по коду доступа; материалы, уроки и проверка работ.",
        image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&q=80&w=800",
        tag: "Курсы",
        minRole: ROLES.APPLICANT,
        pinned: true,
        hideWhenEmpty: false,
        materials: [
            {
                id: "aicamp-system-1",
                title: "Вход в курс",
                type: "Текст",
                tags: ["Вход", "Роли"],
                content: `Внутри курса «${PVL_COURSE_DISPLAY_NAME}» — вход для трёх ролей:
- ученица;
- ментор;
- администратор курса (учительская, контент и потоки — отдельный код).

Это не то же самое, что пункт «Админка» в меню всего сада.`,
                role: "all"
            },
            {
                id: "aicamp-system-admin",
                title: "Администратор курса и учительская ПВЛ",
                type: "Текст",
                tags: ["Админ курса", "ПВЛ"],
                content: `Выберите роль «Администратор курса» на экране входа и введите код для этой роли. Откроется учительская ПВЛ: контент, потоки, проверки. Садовская «Админка» в левом меню сада — другой раздел.`,
                role: "all"
            },
            {
                id: "aicamp-system-2",
                title: "ЛК ученика: трекер и прогресс",
                type: "Текст",
                tags: ["Ученик", "Трекер", "Прогресс"],
                content: `Ученик видит:
- трекер уроков;
- доступ к материалам курса;
- книжную полку;
- обратную связь от ментора по ДЗ.`,
                role: "all"
            },
            {
                id: "aicamp-system-3",
                title: "ЛК ментора: ученики и ДЗ",
                type: "Текст",
                tags: ["Ментор", "Ученики", "ДЗ"],
                content: `Ментор видит:
- дашборд непроверенных домашних;
- список учеников;
- прогресс учеников по курсу.`,
                role: "all"
            }
        ]
    }
];

/** id карточки входа в ПВЛ в списке курсов библиотеки */
const PVL_ENTRY_COURSE_ID = 6;
const AI_CAMP_SESSION_KEY = "garden_ai_camp_session";

function normalizeStyledHtmlToSemantic(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
    const root = doc.getElementById('root');
    if (!root) return html;

    const toArray = Array.from(root.querySelectorAll('*'));
    toArray.forEach((node) => {
        const style = String(node.getAttribute('style') || '').toLowerCase();
        const className = String(node.getAttribute('class') || '').toLowerCase();
        if (!style && !className) return;

        const fontSizeMatch = style.match(/font-size\s*:\s*([\d.]+)\s*(px|pt)/);
        const rawSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : NaN;
        const sizePx = Number.isFinite(rawSize)
            ? (fontSizeMatch[2] === 'pt' ? rawSize * 1.333 : rawSize)
            : null;
        const isBold = /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
        const isItalic = /font-style\s*:\s*italic/.test(style);
        const classLooksHeading = /(heading|title|subtitle|msoheading|ql-size-huge|ql-size-large)/.test(className);

        const replaceWithTag = (nextTag) => {
            if (node.tagName === nextTag.toUpperCase()) return node;
            const replacement = doc.createElement(nextTag);
            while (node.firstChild) replacement.appendChild(node.firstChild);
            node.replaceWith(replacement);
            return replacement;
        };

        if (['DIV', 'P', 'SPAN'].includes(node.tagName) && (sizePx != null || classLooksHeading)) {
            if (sizePx >= 24) replaceWithTag('h2');
            else if (sizePx >= 19) replaceWithTag('h3');
            else if (sizePx >= 16 && isBold) replaceWithTag('h4');
            else if (classLooksHeading && isBold) replaceWithTag('h3');
        } else if (node.tagName === 'SPAN' && isBold) {
            replaceWithTag('strong');
        } else if (node.tagName === 'SPAN' && isItalic) {
            replaceWithTag('em');
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
}

const CourseLibraryView = ({
    user,
    knowledgeBase = [],
    librarySettings,
    onCompleteLesson,
    onNotify,
    onBackToGarden,
    onCourseSidebarChange,
    gardenPvlBridgeRef,
    resetToken = 0,
    openPvlRequest = 0
}) => {
    const [selectedFilter, setSelectedFilter] = useState('Все');
    const [selectedCourseId, setSelectedCourseId] = useState(null);
    const [selectedTag, setSelectedTag] = useState('Все');
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [aiCampSession, setAiCampSession] = useState(() => {
        try {
            const raw = localStorage.getItem(AI_CAMP_SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });
    /** Сброс дочернего lazy Pvl после ошибки в PvlErrorBoundary */
    const [pvlResetKey, setPvlResetKey] = useState(0);
    /** После выхода из курса ПВЛ не поднимать сессию снова, пока пользователь не нажмёт «Войти снова» */
    const [gardenCampPaused, setGardenCampPaused] = useState(false);
    const [pvlGardenRoute, setPvlGardenRoute] = useState(null);

    const filters = ['Все', 'Курсы', 'Полезное'];

    const normalizeTags = (tags) => {
        if (!tags) return [];
        if (Array.isArray(tags)) return tags;
        return String(tags)
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
    };

    const escapeHtml = (text) => String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const splitUrlAndPunctuation = (raw) => {
        const match = raw.match(/^(.*?)([),.;!?]+)?$/);
        const core = (match?.[1] || raw).trim();
        const trailing = match?.[2] || '';
        return { core, trailing };
    };

    const linkifyEscapedText = (escapedText) => {
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        return escapedText.replace(urlRegex, (raw) => {
            const { core, trailing } = splitUrlAndPunctuation(raw);
            if (!core) return raw;
            return `<a href="${core}" target="_blank" rel="noopener noreferrer">${core}</a>${trailing}`;
        });
    };

    const plainTextToHtml = (text) => {
        const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
        const html = [];
        let inList = false;

        lines.forEach((line) => {
            const trimmed = line.trim();
            const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);

            if (!trimmed) {
                if (inList) {
                    html.push('</ul>');
                    inList = false;
                }
                html.push('<p><br /></p>');
                return;
            }

            if (bulletMatch) {
                if (!inList) {
                    html.push('<ul>');
                    inList = true;
                }
                const escaped = escapeHtml(bulletMatch[1]);
                html.push(`<li>${linkifyEscapedText(escaped)}</li>`);
                return;
            }

            if (inList) {
                html.push('</ul>');
                inList = false;
            }

            const escaped = escapeHtml(line);
            html.push(`<p>${linkifyEscapedText(escaped)}</p>`);
        });

        if (inList) html.push('</ul>');
        return html.join('');
    };

    const enhanceLinksInHtml = (html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return html;

        const textNodes = [];
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            textNodes.push(node);
            node = walker.nextNode();
        }

        textNodes.forEach((textNode) => {
            const parentEl = textNode.parentElement;
            const value = textNode.nodeValue || '';
            if (!value || !parentEl || parentEl.closest('a')) return;
            if (!/(https?:\/\/[^\s<]+)/.test(value)) return;

            const frag = doc.createDocumentFragment();
            const parts = value.split(/(https?:\/\/[^\s<]+)/g);

            parts.forEach((part) => {
                if (!part) return;
                if (/^https?:\/\/[^\s<]+$/.test(part)) {
                    const { core, trailing } = splitUrlAndPunctuation(part);
                    if (core) {
                        const a = doc.createElement('a');
                        a.href = core;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.textContent = core;
                        frag.appendChild(a);
                        if (trailing) frag.appendChild(doc.createTextNode(trailing));
                    } else {
                        frag.appendChild(doc.createTextNode(part));
                    }
                } else {
                    frag.appendChild(doc.createTextNode(part));
                }
            });

            textNode.parentNode?.replaceChild(frag, textNode);
        });

        return root.innerHTML;
    };

    const formatMaterialContent = (content) => {
        const raw = String(content || '').trim();
        if (!raw) return '<p>Материал в процессе подготовки.</p>';

        const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(raw);
        const baseHtml = hasHtmlTags ? normalizeStyledHtmlToSemantic(raw) : plainTextToHtml(raw);
        const sanitized = DOMPurify.sanitize(baseHtml);
        const withLinks = enhanceLinksInHtml(sanitized);

        return DOMPurify.sanitize(withLinks, {
            ADD_ATTR: ['target', 'rel'],
            FORBID_TAGS: ['style', 'script'],
            FORBID_ATTR: ['style', 'class', 'id']
        });
    };

    const role = user?.role || ROLES.APPLICANT;
    const pvlResolvedRole = resolvePvlRoleFromGardenProfile(user);
    const pvlEntryRole = pvlResolvedRole === 'admin' ? 'mentor' : pvlResolvedRole;
    const pvlEmbeddedResolvedRole = pvlResolvedRole === 'admin'
        ? (aiCampSession?.role === 'mentor' ? 'mentor' : 'admin')
        : pvlResolvedRole;
    const canSeePvlCourse = canSeePvlInGarden(user);
    const hiddenCourses = librarySettings?.hiddenCourses || [];
    const materialOrder = librarySettings?.materialOrder || {};

    const availableCourses = useMemo(() => {
        const materialsCountByCourse = new Map();

        knowledgeBase
            .filter(k => k.role === 'all' || hasAccess(role, k.role))
            .forEach((k) => {
                const key = k.category;
                materialsCountByCourse.set(key, (materialsCountByCourse.get(key) || 0) + 1);
            });

        return COURSES.filter((course) => {
            if (course.id === PVL_ENTRY_COURSE_ID && !canSeePvlCourse) return false;
            if (!hasAccess(role, course.minRole)) return false;
            if (hiddenCourses.includes(course.title)) return false;
            if (course.hidden) return false;
            if (!course.hideWhenEmpty) return true;
            return (materialsCountByCourse.get(course.title) || 0) > 0;
        });
    }, [canSeePvlCourse, hiddenCourses, knowledgeBase, role]);

    const filteredCourses = useMemo(() => {
        return availableCourses
            .filter(course => {
                if (selectedFilter !== 'Все' && course.tag !== selectedFilter) return false;
                return true;
            })
            .sort((a, b) => {
                if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
                return a.id - b.id;
            });
    }, [availableCourses, selectedFilter]);

    const selectedCourse = availableCourses.find(c => c.id === selectedCourseId) || null;

    const courseMaterials = useMemo(() => {
        if (!selectedCourse) return [];
        const base = knowledgeBase
            .filter(k => k.category === selectedCourse.title)
            .filter(k => k.role === 'all' || hasAccess(role, k.role))
            .map(k => ({
                ...k,
                tags: normalizeTags(k.tags),
                video_link: k.video_link || (k.type === 'Видео' ? k.link : '') || '',
                file_link: k.file_link || (k.type === 'PDF' ? k.link : '') || ''
            }));
        const staticMaterials = (selectedCourse.materials || []).map((m) => ({
            ...m,
            category: selectedCourse.title,
            tags: normalizeTags(m.tags),
            video_link: m.video_link || (m.type === 'Видео' ? m.link : '') || '',
            file_link: m.file_link || (m.type === 'PDF' ? m.link : '') || ''
        }));
        const merged = [...base, ...staticMaterials];

        const order = materialOrder[selectedCourse.title];
        if (!Array.isArray(order) || order.length === 0) return merged;

        const rank = new Map(order.map((id, idx) => [String(id), idx]));
        return [...merged].sort((a, b) => {
            const aRank = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
            const bRank = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
            if (aRank !== bRank) return aRank - bRank;
            return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
        });
    }, [knowledgeBase, materialOrder, role, selectedCourse]);

    const availableTags = useMemo(() => {
        if (!selectedCourse) return [];
        const set = new Set();
        courseMaterials.forEach(m => m.tags.forEach(t => set.add(t)));
        return Array.from(set);
    }, [courseMaterials, selectedCourse]);

    const filteredMaterials = useMemo(() => {
        if (selectedTag === 'Все') return courseMaterials;
        return courseMaterials.filter(m => m.tags.includes(selectedTag));
    }, [courseMaterials, selectedTag]);

    const [completedIds, setCompletedIds] = useState(new Set());

    useEffect(() => {
        setSelectedCourseId(null);
        setSelectedTag('Все');
        setSelectedMaterial(null);
    }, [resetToken]);

    useEffect(() => {
        if (!selectedCourseId) return;
        if (availableCourses.some(c => c.id === selectedCourseId)) return;
        setSelectedCourseId(null);
        setSelectedTag('Все');
        setSelectedMaterial(null);
    }, [availableCourses, selectedCourseId]);
    useEffect(() => {
        if (!openPvlRequest || !canSeePvlCourse) return;
        setSelectedCourseId(PVL_ENTRY_COURSE_ID);
        setSelectedTag('Все');
        setSelectedMaterial(null);
    }, [openPvlRequest, canSeePvlCourse]);
    useEffect(() => {
        if (selectedCourse?.id !== PVL_ENTRY_COURSE_ID) return;
        if (canSeePvlCourse) return;
        setSelectedCourseId(null);
        setSelectedTag('Все');
        setSelectedMaterial(null);
        onBackToGarden?.();
    }, [canSeePvlCourse, onBackToGarden, selectedCourse?.id]);

    const totalCount = selectedCourse ? courseMaterials.length : 0;

    useEffect(() => {
        const loadProgress = async () => {
            if (!selectedCourse || !user?.id) {
                setCompletedIds(new Set());
                return;
            }
            try {
                const ids = await api.getCourseProgress(user.id, selectedCourse.title);
                setCompletedIds(new Set((ids || []).map(String)));
            } catch (e) {
                console.error(e);
                setCompletedIds(new Set());
            }
        };
        loadProgress();
    }, [selectedCourse?.title, user?.id]);

    const markCompleted = (material) => {
        if (!material?.id || !selectedCourse || !user?.id) return;
        if (completedIds.has(String(material.id))) return;

        api.markCourseLessonCompleted(user.id, material.id, selectedCourse.title)
            .then((res) => {
                if (!res?.inserted) return;
                const next = new Set(completedIds);
                next.add(String(material.id));
                setCompletedIds(next);
                if (onCompleteLesson) onCompleteLesson(material, selectedCourse);
                if (onNotify) onNotify("Отметили как пройденное. +20 семян");
            })
            .catch((e) => {
                console.error(e);
                if (onNotify) onNotify("Не удалось сохранить прогресс");
            });
    };

    const handleOpenMaterial = (material) => {
        setSelectedMaterial(material);
    };

    const selectedMaterialContentHtml = useMemo(
        () => formatMaterialContent(selectedMaterial?.content),
        [selectedMaterial?.content]
    );
    const syncPvlSessionFromAlCamp = (session) => {
        if (!session) return;
        if (!session.role) return;
        const pvlRole = session.role === 'mentor' ? 'mentor' : session.role === 'admin' ? 'admin' : 'student';
        const prev = loadAppSession();
        const rolePrefix = `/${pvlRole}/`;
        const prevRouteMatchesRole = String(prev?.route || '').startsWith(rolePrefix);
        const linked = session.linkedUserId != null ? String(session.linkedUserId) : null;
        if (prev?.role === pvlRole && prevRouteMatchesRole && (!linked || prev?.actingUserId === linked)) return;
        const actingUserId = linked || (pvlRole === 'mentor' ? 'u-men-1' : pvlRole === 'admin' ? 'u-adm-1' : 'u-st-1');
        const studentId = pvlRole === 'student' ? (linked || 'u-st-1') : (prev?.studentId || 'u-st-1');
        saveAppSession({
            role: pvlRole,
            studentId,
            actingUserId,
            nowDate: '2026-06-03',
            route: getHomeRouteByRole(pvlRole),
            studentSection: 'О курсе',
            adminSection: 'Дашборд',
        });
    };

    const buildGardenAlCampSession = (u) => ({
        role: pvlEntryRole,
        name: (u.name && String(u.name).trim()) || u.email || 'Участник',
        linkedUserId: u.id,
        authSource: 'garden',
    });

    const handleGardenCampResume = () => {
        if (!user?.id) return;
        setGardenCampPaused(false);
        const next = buildGardenAlCampSession(user);
        if (!next?.role || next.role === 'no_access') {
            setAiCampSession(null);
            clearAppSession();
            return;
        }
        setAiCampSession(next);
        try {
            localStorage.setItem(AI_CAMP_SESSION_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
        syncPvlSessionFromAlCamp(next);
    };

    const handleAiCampLogout = useCallback(() => {
        setAiCampSession(null);
        setGardenCampPaused(true);
        localStorage.removeItem(AI_CAMP_SESSION_KEY);
        clearAppSession();
    }, []);

    /** Demo-переключатель ролей внутри ПВЛ: синхронизация с боковым меню сада и сессией прототипа */
    const handleEmbeddedPvlDemoRoleChange = useCallback((nextRole) => {
        setAiCampSession((prev) => {
            if (!prev) return prev;
            const linkedUserId = prev.linkedUserId ?? user?.id;
            const next = { ...prev, role: nextRole, linkedUserId };
            try {
                localStorage.setItem(AI_CAMP_SESSION_KEY, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            return next;
        });
        const linked = user?.id != null ? String(user.id) : null;
        const actingUserId = linked || (nextRole === 'mentor' ? 'u-men-1' : nextRole === 'admin' ? 'u-adm-1' : 'u-st-1');
        const studentId = nextRole === 'student' ? (linked || 'u-st-1') : (loadAppSession()?.studentId || 'u-st-1');
        saveAppSession({
            role: nextRole,
            studentId,
            actingUserId,
            nowDate: '2026-06-03',
            route: getHomeRouteByRole(nextRole),
            studentSection: 'Дашборд',
            adminSection: 'Дашборд',
            mentorSection: 'Дашборд',
        });
    }, [user?.id]);

    const gardenPvlItems = useMemo(() => {
        if (!aiCampSession) return [];
        const routeBasedRole = String(pvlGardenRoute || '').startsWith('/admin/')
            ? 'admin'
            : String(pvlGardenRoute || '').startsWith('/mentor/')
                ? 'mentor'
                : String(pvlGardenRoute || '').startsWith('/student/')
                    ? 'student'
                    : null;
        const roleForNav = routeBasedRole || aiCampSession.role;
        if (roleForNav === 'mentor') return buildGardenPvlMentorNav();
        if (roleForNav === 'admin') return buildGardenPvlAdminNav();
        return buildGardenPvlStudentNav();
    }, [aiCampSession, pvlGardenRoute]);

    const gardenPvlActiveKey = useMemo(() => {
        if (pvlGardenRoute == null) return null;
        for (const it of gardenPvlItems) {
            if (it.type === 'item' && gardenPvlItemActive(pvlGardenRoute, it)) return it.key;
        }
        return null;
    }, [gardenPvlItems, pvlGardenRoute]);

    useEffect(() => {
        if (!aiCampSession || selectedCourse?.id !== PVL_ENTRY_COURSE_ID) {
            onCourseSidebarChange?.({ enabled: false, title: 'Курс', items: [], activeKey: null });
            return;
        }
        onCourseSidebarChange?.({
            enabled: true,
            title: PVL_COURSE_DISPLAY_NAME,
            items: gardenPvlItems,
            activeKey: gardenPvlActiveKey,
        });
    }, [aiCampSession, selectedCourse?.id, gardenPvlItems, gardenPvlActiveKey, onCourseSidebarChange]);

    useEffect(() => {
        const ref = gardenPvlBridgeRef;
        if (!ref || selectedCourse?.id !== PVL_ENTRY_COURSE_ID || !aiCampSession) return undefined;
        ref.current = ref.current || {};
        ref.current.exit = handleAiCampLogout;
        return () => {
            if (ref.current?.exit === handleAiCampLogout) delete ref.current.exit;
        };
    }, [gardenPvlBridgeRef, selectedCourse?.id, aiCampSession, handleAiCampLogout]);

    useEffect(() => {
        if (selectedCourse?.id !== PVL_ENTRY_COURSE_ID || !aiCampSession) return;
        syncPvlSessionFromAlCamp(aiCampSession);
    }, [selectedCourse?.id, aiCampSession]);
    useEffect(() => {
        if (selectedCourse?.id !== PVL_ENTRY_COURSE_ID) {
            setGardenCampPaused(false);
        }
    }, [selectedCourse?.id]);

    /** Вход в курс ПВЛ по роли из профиля сада (БД): без PIN для залогиненных пользователей */
    useEffect(() => {
        if (selectedCourse?.id !== PVL_ENTRY_COURSE_ID || !user?.id || gardenCampPaused) return;
        const next = buildGardenAlCampSession(user);
        if (!next?.role || next.role === 'no_access') {
            setAiCampSession(null);
            clearAppSession();
            return;
        }
        setAiCampSession((prev) => {
            if (prev?.authSource === 'garden' && prev.linkedUserId === user.id && prev.role === next.role) {
                return prev;
            }
            try {
                localStorage.setItem(AI_CAMP_SESSION_KEY, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, [selectedCourse?.id, user?.id, user?.role, user?.name, user?.email, gardenCampPaused]);

    return (
        <div className="flex min-h-0 flex-col pt-6 px-4 lg:px-0 animate-in fade-in pb-12">
            <div className="flex justify-between items-end mb-10">
                <div>
                    <h1 className="text-4xl font-light text-slate-800 tracking-tight">{selectedCourse ? selectedCourse.title : 'Библиотека'}</h1>
                    {!selectedCourse ? <p className="text-slate-400 mt-1 font-light">Обучающие материалы и курсы</p> : null}
                </div>
                {selectedCourse?.id !== PVL_ENTRY_COURSE_ID ? (
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">{selectedCourse ? 'Уроков' : 'Курсов'}</div>
                        <div className="font-mono text-xl text-blue-600">{selectedCourse ? totalCount : filteredCourses.length}</div>
                    </div>
                ) : null}
            </div>

            {selectedCourse && selectedCourse.id !== PVL_ENTRY_COURSE_ID && (
                <div className="mb-6 flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => { setSelectedCourseId(null); setSelectedTag('Все'); setSelectedMaterial(null); }}>Назад к курсам</Button>
                </div>
            )}

            {!selectedCourse && (
                <div className="flex items-center gap-8 mb-8">
                    <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                        {filters.map(f => (
                            <button
                                key={f}
                                onClick={() => setSelectedFilter(f)}
                                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${selectedFilter === f
                                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                                    : 'bg-white/80 text-slate-600 hover:bg-white border border-white/50'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {!selectedCourse ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredCourses.map(course => (
                        <div
                            key={course.id}
                            className="bg-white/80 backdrop-blur-xl p-4 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all border border-white/50 group flex flex-col h-full cursor-pointer"
                            onClick={() => {
                                setSelectedCourseId(course.id);
                                setSelectedMaterial(null);
                                setSelectedTag('Все');
                            }}
                        >
                            <div className="h-48 w-full rounded-[30px] overflow-hidden mb-5 relative flex-shrink-0">
                                <img src={course.image} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            </div>

                            <div className="px-2 pb-2 flex-1 flex flex-col">
                                <div className="mb-3">
                                    <h3 className="text-xl font-bold text-slate-900 leading-tight mb-2">{course.title}</h3>
                                </div>

                                <p className="text-slate-500 text-sm mb-6 leading-relaxed">{course.description}</p>

                                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-end gap-3">
                                    <Button
                                        variant="primary"
                                        className="!py-2 !px-4 text-xs"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedCourseId(course.id);
                                            setSelectedMaterial(null);
                                            setSelectedTag('Все');
                                        }}
                                    >
                                        Открыть
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : selectedCourse.id === PVL_ENTRY_COURSE_ID ? (
                <div className="min-w-0 w-full rounded-[2rem] bg-transparent px-0 pt-1 pb-0 shadow-none border-0 ring-0 outline-none">
                    {!aiCampSession && (
                        <div className="flex justify-end mb-4">
                            <Button variant="secondary" onClick={onBackToGarden}>Вернуться к саду</Button>
                        </div>
                    )}
                    {!aiCampSession ? (
                        gardenCampPaused && user ? (
                            <div className="max-w-xl mx-auto text-center space-y-4 py-6">
                                <p className="text-slate-600">Вы вышли из курса «{PVL_COURSE_DISPLAY_NAME}».</p>
                                <Button variant="primary" type="button" onClick={handleGardenCampResume}>Войти снова по роли в саду</Button>
                            </div>
                        ) : !user ? (
                            <div className="max-w-xl mx-auto text-center py-10 space-y-3">
                                <div className="text-2xl font-medium text-slate-900">Вход в курс «{PVL_COURSE_DISPLAY_NAME}»</div>
                                <div className="text-sm text-slate-500">Доступ к ПВЛ определяется только по роли в учетной записи САДА.</div>
                                <Button variant="secondary" onClick={onBackToGarden}>Вернуться в САД</Button>
                            </div>
                        ) : (
                            <div className="max-w-xl mx-auto text-center py-10 space-y-2">
                                <div className="text-slate-500 text-sm">Подключение к курсу по роли в вашем профиле сада…</div>
                                <div className="text-xs text-slate-400">
                                    Роль в курсе:{' '}
                                    <span className="font-medium text-slate-600">
                                        {pvlResolvedRole === 'admin' ? 'admin' : pvlResolvedRole === 'mentor' ? 'mentor' : pvlResolvedRole === 'student' ? 'student' : 'нет доступа'}
                                    </span>
                                    {' '}(из учётной записи САДА)
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <div className="text-sm text-slate-500">
                                    {aiCampSession.name}
                                    <span className="text-slate-400"> · </span>
                                    {aiCampSession.role === 'mentor' ? 'Ментор' : aiCampSession.role === 'admin' ? 'Администратор курса' : 'Ученик'}
                                </div>
                                {pvlResolvedRole === 'admin' && aiCampSession.role === 'mentor' ? (
                                    <div className="text-xs rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-1">
                                        Вошли как ментор (роль сада: админ)
                                    </div>
                                ) : null}
                            </div>
                            <div className="min-w-0 w-full">
                                <PvlErrorBoundary
                                    onExit={handleAiCampLogout}
                                    onReset={() => setPvlResetKey((k) => k + 1)}
                                >
                                    <Suspense fallback={(
                                        <div className="p-8 text-center text-slate-500 text-sm">Загрузка курса…</div>
                                    )}
                                    >
                                        <PvlPrototypeApp
                                            key={`${pvlResetKey}-al-camp-${aiCampSession.role}-${aiCampSession.linkedUserId || 'anon'}`}
                                            embeddedInGarden
                                            gardenResolvedRole={pvlEmbeddedResolvedRole}
                                            hideEmbeddedStudentRoleSwitch={pvlResolvedRole === 'admin'}
                                            gardenBridgeRef={gardenPvlBridgeRef}
                                            onGardenRouteChange={setPvlGardenRoute}
                                            onGardenExit={onBackToGarden}
                                            onEmbeddedDemoRoleChange={handleEmbeddedPvlDemoRoleChange}
                                            hideEmbeddedRoleSwitch={pvlResolvedRole !== 'admin'}
                                        />
                                    </Suspense>
                                </PvlErrorBoundary>
                            </div>
                        </div>
                    )}
                </div>

            ) : selectedMaterial ? (
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/50">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-slate-400">Материал</div>
                            <div className="text-2xl font-medium text-slate-900">{selectedMaterial.title}</div>
                            <div className="text-xs text-slate-400 mt-1">{selectedCourse.title}</div>
                        </div>
                        <Button variant="secondary" onClick={() => setSelectedMaterial(null)}>Назад к списку</Button>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-6">
                        {selectedMaterial.video_link && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Видео</span>
                        )}
                        {selectedMaterial.file_link && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Документ</span>
                        )}
                        {selectedMaterial.tags.map(t => (
                            <span key={t} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{t}</span>
                        ))}
                    </div>

                    <div className="prose prose-slate max-w-none text-sm mb-8 clean-rich-text [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:my-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:my-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-3 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:my-3 [&_a]:text-blue-700 [&_a]:underline [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_div]:my-3 [&_div]:leading-relaxed [&_li]:my-1 [&_img]:w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-2xl [&_img]:my-4 [&_img]:border [&_img]:border-slate-200" dangerouslySetInnerHTML={{ __html: selectedMaterialContentHtml }} />

                    <div className="border-t border-slate-100 pt-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {selectedMaterial.video_link && (
                                <a href={selectedMaterial.video_link} target="_blank" rel="noopener noreferrer">
                                    <Button variant="primary">Открыть видео</Button>
                                </a>
                            )}
                            {selectedMaterial.file_link && (
                                <a href={selectedMaterial.file_link} target="_blank" rel="noopener noreferrer">
                                    <Button variant="secondary">Скачать документ</Button>
                                </a>
                            )}
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => markCompleted(selectedMaterial)}
                            disabled={completedIds.has(String(selectedMaterial.id))}
                        >
                            {completedIds.has(String(selectedMaterial.id)) ? 'Пройдено' : 'Отметить как пройденное'}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 bg-white/80 backdrop-blur-xl p-4 rounded-[2.5rem] border border-white/50">
                        <div className="h-40 w-full rounded-[24px] overflow-hidden mb-4">
                            <img src={selectedCourse.image} alt={selectedCourse.title} className="w-full h-full object-cover" />
                        </div>
                        <div className="text-sm text-slate-600 mb-4">{selectedCourse.description}</div>

                        <div className="mb-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Теги</div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    className={`px-3 py-1 rounded-full text-xs font-medium ${selectedTag === 'Все' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                    onClick={() => setSelectedTag('Все')}
                                >
                                    Все
                                </button>
                                {availableTags.map(tag => (
                                    <button
                                        key={tag}
                                        className={`px-3 py-1 rounded-full text-xs font-medium ${selectedTag === tag ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                        onClick={() => setSelectedTag(tag)}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="text-xs text-slate-400">Материалов в разделе: {filteredMaterials.length}</div>
                    </div>

                    <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl p-5 rounded-[2.5rem] border border-white/50">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Материалы</div>
                        {filteredMaterials.length === 0 ? (
                            <div className="text-sm text-slate-400 italic py-8 text-center">Нет материалов по выбранному тегу</div>
                        ) : (
                            <div className="space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar pr-2">
                                {filteredMaterials.map(m => (
                                    <div
                                        key={m.id}
                                        className="p-4 rounded-2xl border border-slate-100 bg-white/60 hover:bg-white transition-all cursor-pointer"
                                        onClick={() => handleOpenMaterial(m)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                                {m.video_link ? <Video size={16} /> : <FileText size={16} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-slate-800 truncate">{m.title}</div>
                                                <div className="text-xs text-slate-400">Текстовый материал</div>
                                            </div>
                                            {completedIds.has(String(m.id)) && (
                                                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Пройдено</span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-3">
                                            {m.video_link && (
                                                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Видео</span>
                                            )}
                                            {m.file_link && (
                                                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Документ</span>
                                            )}
                                            {m.tags.map(t => (
                                                <span key={t} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourseLibraryView;
