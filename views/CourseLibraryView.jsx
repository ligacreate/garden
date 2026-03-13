import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Video } from 'lucide-react';
import Button from '../components/Button';
import { hasAccess, ROLES } from '../utils/roles';
import { api } from '../services/dataService';
import DOMPurify from 'dompurify';

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
        title: "AI Camp (система)",
        description: "Единая система курса: вход ученика и ментора, дашборды, трекер, материалы и фидбек. Пока доступно только администраторам.",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800",
        tag: "Курсы",
        minRole: ROLES.ADMIN,
        hideWhenEmpty: false,
        materials: [
            {
                id: "aicamp-system-1",
                title: "Вход в систему AI Camp",
                type: "Текст",
                tags: ["Вход", "Роли"],
                content: `Внутри этого курса доступен вход для двух ролей:
- ментор;
- ученик.

После входа показывается соответствующий кабинет.`,
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

const AI_CAMP_TITLE = "AI Camp (система)";
const AI_CAMP_SESSION_KEY = "garden_ai_camp_session";
const AI_CAMP_MENTOR_PIN = "1234";
const AI_CAMP_STUDENT_PIN = "1111";
const AI_CAMP_LESSON_BADGES = ["Видео", "Урок", "Домашнее задание", "Тест"];

const buildModuleLessons = (moduleId, moduleTitle) => (
    Array.from({ length: 6 }, (_, index) => {
        const lessonNumber = index + 1;
        return {
            id: `${moduleId}-lesson-${lessonNumber}`,
            title: `Урок ${lessonNumber}`,
            description: `${moduleTitle}: тема урока ${lessonNumber}, разбор кейсов и практическая часть.`,
            badges: AI_CAMP_LESSON_BADGES
        };
    })
);

const AI_CAMP_MENTOR_DATA = {
    students: [
        { id: "m-st-1", name: "Ирина К.", completed: 5, total: 12, currentLesson: "Урок 6. Работа с промтами", homeworkStatus: "Непроверенные ДЗ: 1" },
        { id: "m-st-2", name: "Мария Л.", completed: 8, total: 12, currentLesson: "Тест 3. Проверка модуля", homeworkStatus: "Проверено: 3" },
        { id: "m-st-3", name: "Елена Р.", completed: 3, total: 12, currentLesson: "Урок 4. AI-браузеры", homeworkStatus: "Непроверенные ДЗ: 2" },
        { id: "m-st-4", name: "Ольга Т.", completed: 10, total: 12, currentLesson: "Урок 11. Сборка ассистента", homeworkStatus: "Проверено: 5" },
        { id: "m-st-5", name: "Светлана П.", completed: 6, total: 12, currentLesson: "Урок 7. Автоворонки", homeworkStatus: "Непроверенные ДЗ: 1" }
    ],
    allHomework: [
        { id: "m-hw-1", studentName: "Ирина К.", lessonTitle: "ДЗ к уроку 5", submittedAt: "2026-03-11 19:30", status: "Непроверено", checkedAt: null },
        { id: "m-hw-2", studentName: "Мария Л.", lessonTitle: "ДЗ к уроку 8", submittedAt: "2026-03-12 09:15", status: "Проверено", checkedAt: "2026-03-12 12:20" },
        { id: "m-hw-3", studentName: "Елена Р.", lessonTitle: "ДЗ к уроку 3", submittedAt: "2026-03-12 13:00", status: "Непроверено", checkedAt: null },
        { id: "m-hw-4", studentName: "Ольга Т.", lessonTitle: "ДЗ к уроку 10", submittedAt: "2026-03-10 18:05", status: "Проверено", checkedAt: "2026-03-10 20:10" },
        { id: "m-hw-5", studentName: "Светлана П.", lessonTitle: "ДЗ к уроку 6", submittedAt: "2026-03-13 08:40", status: "Непроверено", checkedAt: null },
        { id: "m-hw-6", studentName: "Мария Л.", lessonTitle: "Тест 3", submittedAt: "2026-03-09 16:25", status: "Проверено", checkedAt: "2026-03-09 18:05" }
    ],
    courseOutline: [
        {
            id: "mod-1",
            title: "Модуль 1. Типы и виды письменных практик",
            lessons: buildModuleLessons("mod-1", "Типы и виды письменных практик")
        },
        {
            id: "mod-2",
            title: "Модуль 2. Составление практик",
            lessons: buildModuleLessons("mod-2", "Составление практик")
        },
        {
            id: "mod-3",
            title: "Модуль 3. Сценарии и проведение встреч",
            lessons: buildModuleLessons("mod-3", "Сценарии и проведение встреч")
        },
        {
            id: "mod-4",
            title: "Модуль 4. Уроки по социальной психологии",
            lessons: buildModuleLessons("mod-4", "Уроки по социальной психологии")
        }
    ]
};

const AI_CAMP_STUDENT_DATA = {
    stats: { completedLessons: 7, totalLessons: 12, pendingHomework: 2 },
    feedback: [
        { id: "s-fb-1", title: "ДЗ к дню 2", comment: "Хорошая структура. Добавьте 1-2 живых примера из своей практики.", date: "2026-03-10" },
        { id: "s-fb-2", title: "ДЗ к дню 3", comment: "Отлично! По Whisper добавьте скриншот финального результата.", date: "2026-03-12" }
    ],
    tracker: [
        { id: "s-tr-1", lesson: "День 1: Введение", status: "done", hw: "Проверено" },
        { id: "s-tr-2", lesson: "День 2: Вводная лекция + AI-браузеры", status: "done", hw: "Проверено" },
        { id: "s-tr-3", lesson: "День 3: Whisper", status: "in_progress", hw: "На проверке" },
        { id: "s-tr-4", lesson: "День 4: Оплата сервисов", status: "todo", hw: "Не отправлено" }
    ],
    materials: [
        { id: "s-c-1", title: "Урок 1. Введение", type: "Видео", duration: "18 мин" },
        { id: "s-c-2", title: "Урок 2. AI-браузеры", type: "Урок", duration: "24 мин" },
        { id: "s-c-3", title: "Урок 3. Whisper", type: "Урок", duration: "29 мин" }
    ],
    bookshelf: [
        { id: "s-b-1", title: "Атомные привычки", author: "Джеймс Клир" },
        { id: "s-b-2", title: "Пиши, сокращай", author: "Ильяхов, Сарычева" },
        { id: "s-b-3", title: "Поток", author: "Михай Чиксентмихайи" }
    ]
};

const CourseLibraryView = ({
    user,
    knowledgeBase = [],
    librarySettings,
    onCompleteLesson,
    onNotify,
    onBackToGarden,
    onCourseSidebarChange,
    externalCourseNavKey,
    resetToken = 0
}) => {
    const [selectedFilter, setSelectedFilter] = useState('Все');
    const [selectedCourseId, setSelectedCourseId] = useState(null);
    const [selectedTag, setSelectedTag] = useState('Все');
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [aiCampRole, setAiCampRole] = useState('student');
    const [aiCampName, setAiCampName] = useState('');
    const [aiCampPin, setAiCampPin] = useState('');
    const [aiCampError, setAiCampError] = useState('');
    const [mentorActiveTab, setMentorActiveTab] = useState('students');
    const [selectedMentorModuleId, setSelectedMentorModuleId] = useState('mod-1');
    const [aiCampSession, setAiCampSession] = useState(() => {
        try {
            const raw = localStorage.getItem(AI_CAMP_SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });

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
        const baseHtml = hasHtmlTags ? raw : plainTextToHtml(raw);
        const sanitized = DOMPurify.sanitize(baseHtml);
        const withLinks = enhanceLinksInHtml(sanitized);

        return DOMPurify.sanitize(withLinks, {
            ADD_ATTR: ['target', 'rel'],
            FORBID_TAGS: ['style', 'script']
        });
    };

    const role = user?.role || ROLES.APPLICANT;
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
            if (!hasAccess(role, course.minRole)) return false;
            if (hiddenCourses.includes(course.title)) return false;
            if (course.hidden) return false;
            if (!course.hideWhenEmpty) return true;
            return (materialsCountByCourse.get(course.title) || 0) > 0;
        });
    }, [hiddenCourses, knowledgeBase, role]);

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
        setAiCampPin('');
        setAiCampError('');
        setMentorActiveTab('students');
    }, [resetToken]);

    useEffect(() => {
        if (!selectedCourseId) return;
        if (availableCourses.some(c => c.id === selectedCourseId)) return;
        setSelectedCourseId(null);
        setSelectedTag('Все');
        setSelectedMaterial(null);
    }, [availableCourses, selectedCourseId]);

    const completedCount = selectedCourse ? courseMaterials.filter(m => completedIds.has(String(m.id))).length : 0;
    const totalCount = selectedCourse ? courseMaterials.length : 0;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
    const getHomeworkLessonOrder = (lessonTitle) => {
        const text = String(lessonTitle || '');
        const lessonMatch = text.match(/урок[ау]?\s*(\d+)/i);
        if (lessonMatch) return Number(lessonMatch[1]);
        const testMatch = text.match(/тест\s*(\d+)/i);
        if (testMatch) return Number(testMatch[1]);
        return 0;
    };
    const mentorPendingHomework = useMemo(
        () => AI_CAMP_MENTOR_DATA.allHomework.filter((hw) => hw.status === 'Непроверено'),
        []
    );
    const sortedMentorHomework = useMemo(
        () => [...AI_CAMP_MENTOR_DATA.allHomework].sort((a, b) => {
            const aPendingRank = a.status === 'Непроверено' ? 0 : 1;
            const bPendingRank = b.status === 'Непроверено' ? 0 : 1;
            if (aPendingRank !== bPendingRank) return aPendingRank - bPendingRank;

            const aLesson = getHomeworkLessonOrder(a.lessonTitle);
            const bLesson = getHomeworkLessonOrder(b.lessonTitle);
            if (aLesson !== bLesson) return bLesson - aLesson;

            return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''), 'ru');
        }),
        []
    );
    const selectedMentorModule = useMemo(
        () => AI_CAMP_MENTOR_DATA.courseOutline.find((module) => module.id === selectedMentorModuleId) || AI_CAMP_MENTOR_DATA.courseOutline[0],
        [selectedMentorModuleId]
    );

    const handleAiCampLogin = (e) => {
        e.preventDefault();
        const expectedPin = aiCampRole === 'mentor' ? AI_CAMP_MENTOR_PIN : AI_CAMP_STUDENT_PIN;
        if (aiCampPin !== expectedPin) {
            setAiCampError(`Неверный код для роли "${aiCampRole === 'mentor' ? 'Ментор' : 'Ученик'}".`);
            return;
        }
        const session = {
            role: aiCampRole,
            name: aiCampName?.trim() || (aiCampRole === 'mentor' ? 'Ментор' : 'Ученик')
        };
        setAiCampSession(session);
        localStorage.setItem(AI_CAMP_SESSION_KEY, JSON.stringify(session));
        setAiCampError('');
        setAiCampPin('');
    };

    const handleAiCampLogout = () => {
        setAiCampSession(null);
        setAiCampName('');
        setAiCampPin('');
        setAiCampError('');
        setMentorActiveTab('students');
        setSelectedMentorModuleId('mod-1');
        localStorage.removeItem(AI_CAMP_SESSION_KEY);
    };

    useEffect(() => {
        if (!selectedCourse || selectedCourse.title !== AI_CAMP_TITLE || !aiCampSession) {
            onCourseSidebarChange?.({ enabled: false, title: 'Курс', items: [], activeKey: null });
            return;
        }

        if (aiCampSession.role === 'mentor') {
            onCourseSidebarChange?.({
                enabled: true,
                title: 'Курс AI Camp',
                activeKey: mentorActiveTab,
                items: [
                    { key: 'students', label: 'Список учеников', iconKey: 'users' },
                    { key: 'homework', label: 'Домашние задания', iconKey: 'calendar' },
                    { key: 'course', label: 'Вкладка курса', iconKey: 'graduation' }
                ]
            });
            return;
        }

        onCourseSidebarChange?.({ enabled: false, title: 'Курс', items: [], activeKey: null });
    }, [aiCampSession, mentorActiveTab, onCourseSidebarChange, selectedCourse]);

    useEffect(() => {
        if (!externalCourseNavKey || !aiCampSession || aiCampSession.role !== 'mentor') return;
        if (['students', 'homework', 'course'].includes(externalCourseNavKey)) {
            setMentorActiveTab(externalCourseNavKey);
        }
    }, [aiCampSession, externalCourseNavKey]);

    return (
        <div className="h-full flex flex-col pt-6 px-4 lg:px-0 animate-in fade-in pb-12">
            <div className="flex justify-between items-end mb-10">
                <div>
                    <h1 className="text-4xl font-light text-slate-800 tracking-tight">{selectedCourse ? selectedCourse.title : 'Библиотека'}</h1>
                    <p className="text-slate-400 mt-1 font-light">{selectedCourse ? 'Материалы курса' : 'Обучающие материалы и курсы'}</p>
                </div>
                <div className="text-right hidden md:block">
                    <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">{selectedCourse ? 'Уроков' : 'Курсов'}</div>
                    <div className="font-mono text-xl text-blue-600">{selectedCourse ? totalCount : filteredCourses.length}</div>
                </div>
            </div>

            {selectedCourse && (
                <div className="mb-8 bg-white/80 border border-white/60 rounded-3xl p-5 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Прогресс</div>
                        <div className="flex items-center gap-3">
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                            </div>
                            <div className="text-xs font-medium text-slate-500 w-16 text-right">{progressPercent}%</div>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{completedCount} из {totalCount} уроков пройдено</div>
                    </div>
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
                            onClick={() => { setSelectedCourseId(course.id); setSelectedMaterial(null); setSelectedTag('Все'); }}
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
                                        onClick={(e) => { e.stopPropagation(); setSelectedCourseId(course.id); setSelectedMaterial(null); setSelectedTag('Все'); }}
                                    >
                                        Открыть
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : selectedCourse.title === AI_CAMP_TITLE ? (
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/50">
                    <div className="flex justify-end mb-4">
                        <Button variant="secondary" onClick={onBackToGarden}>Вернуться к саду</Button>
                    </div>
                    {!aiCampSession ? (
                        <form onSubmit={handleAiCampLogin} className="max-w-xl mx-auto">
                            <div className="text-2xl font-medium text-slate-900 mb-2">Вход в AI Camp</div>
                            <div className="text-sm text-slate-500 mb-5">Выберите роль и введите код доступа.</div>

                            <div className="flex gap-2 mb-4">
                                <button
                                    type="button"
                                    onClick={() => setAiCampRole('student')}
                                    className={`px-4 py-2 rounded-full text-sm ${aiCampRole === 'student' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                    Ученик
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAiCampRole('mentor')}
                                    className={`px-4 py-2 rounded-full text-sm ${aiCampRole === 'mentor' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                    Ментор
                                </button>
                            </div>

                            <div className="space-y-3">
                                <input
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                                    placeholder={aiCampRole === 'mentor' ? 'Имя ментора' : 'Имя ученика'}
                                    value={aiCampName}
                                    onChange={(e) => setAiCampName(e.target.value)}
                                />
                                <input
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                                    type="password"
                                    placeholder="Код доступа"
                                    value={aiCampPin}
                                    onChange={(e) => setAiCampPin(e.target.value)}
                                />
                            </div>
                            {aiCampError && <div className="text-sm text-rose-600 mt-3">{aiCampError}</div>}
                            <div className="text-xs text-slate-400 mt-2">
                                Демо-коды: ученик — {AI_CAMP_STUDENT_PIN}, ментор — {AI_CAMP_MENTOR_PIN}
                            </div>
                            <div className="mt-4">
                                <Button variant="primary" type="submit">Войти в систему</Button>
                            </div>
                        </form>
                    ) : aiCampSession.role === 'mentor' ? (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-2xl font-medium text-slate-900">Личный кабинет ментора</div>
                                    <div className="text-sm text-slate-500">Здравствуйте, {aiCampSession.name}</div>
                                </div>
                                <Button variant="secondary" onClick={handleAiCampLogout}>Сменить роль</Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-xs text-slate-400 uppercase">Непроверенные ДЗ</div>
                                    <div className="text-2xl font-semibold text-slate-900">{mentorPendingHomework.length}</div>
                                </div>
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-xs text-slate-400 uppercase">Ученики</div>
                                    <div className="text-2xl font-semibold text-slate-900">{AI_CAMP_MENTOR_DATA.students.length}</div>
                                </div>
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-xs text-slate-400 uppercase">Средний прогресс</div>
                                    <div className="text-2xl font-semibold text-slate-900">
                                        {Math.round(AI_CAMP_MENTOR_DATA.students.reduce((acc, s) => acc + Math.round((s.completed / s.total) * 100), 0) / AI_CAMP_MENTOR_DATA.students.length)}%
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMentorActiveTab('students')}
                                    className={`px-4 py-2 rounded-full text-sm ${mentorActiveTab === 'students' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                    Список учеников
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMentorActiveTab('homework')}
                                    className={`px-4 py-2 rounded-full text-sm ${mentorActiveTab === 'homework' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                    Все домашние задания
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMentorActiveTab('course')}
                                    className={`px-4 py-2 rounded-full text-sm ${mentorActiveTab === 'course' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                    Курс
                                </button>
                            </div>
                            {mentorActiveTab === 'students' && (
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-sm font-medium text-slate-800 mb-3">Список учеников</div>
                                    <div className="space-y-3">
                                        {AI_CAMP_MENTOR_DATA.students.map((student) => {
                                            const progress = Math.round((student.completed / student.total) * 100);
                                            const hasPending = student.homeworkStatus.includes('Непроверенные');
                                            return (
                                                <div key={student.id} className="p-3 rounded-xl border border-slate-100 bg-white">
                                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                                        <div>
                                                            <div className="text-sm font-medium text-slate-800">{student.name}</div>
                                                            <div className="text-xs text-slate-400 mt-0.5">{student.currentLesson}</div>
                                                        </div>
                                                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${hasPending ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50'}`}>
                                                            {student.homeworkStatus}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2">
                                                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                                                        </div>
                                                        <div className="text-xs text-slate-400 mt-1">{student.completed}/{student.total} уроков ({progress}%)</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {mentorActiveTab === 'homework' && (
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-sm font-medium text-slate-800 mb-3">Все домашние задания учеников</div>
                                    <div className="space-y-2">
                                        {sortedMentorHomework.map((hw) => (
                                            <div key={hw.id} className="p-3 rounded-xl border border-slate-100 bg-white">
                                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                                    <div className="text-sm text-slate-800">{hw.studentName} — {hw.lessonTitle}</div>
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${hw.status === 'Проверено' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
                                                        {hw.status}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-400 mt-1">
                                                    Отправлено: {hw.submittedAt}
                                                    {hw.checkedAt ? ` • Проверено: ${hw.checkedAt}` : ' • Ожидает проверки'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {mentorActiveTab === 'course' && (
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-sm font-medium text-slate-800 mb-3">Вкладка курса</div>
                                    <div className="text-xs text-slate-400 mb-4">4 модуля в режиме просмотра. Внутри каждого модуля: уроки и структура занятия.</div>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {AI_CAMP_MENTOR_DATA.courseOutline.map((module) => (
                                                <button
                                                    key={module.id}
                                                    type="button"
                                                    onClick={() => setSelectedMentorModuleId(module.id)}
                                                    className={`text-left px-4 py-3 rounded-xl border transition-all ${
                                                        selectedMentorModule?.id === module.id
                                                            ? 'bg-slate-900 text-white border-slate-900'
                                                            : 'bg-white text-slate-700 border-slate-100 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <div className="text-sm font-medium">{module.title}</div>
                                                    <div className={`text-xs mt-1 ${selectedMentorModule?.id === module.id ? 'text-white/70' : 'text-slate-400'}`}>
                                                        Уроков: {module.lessons.length}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {selectedMentorModule && (
                                            <div className="rounded-2xl border border-slate-100 bg-white">
                                                <div className="px-4 py-3 border-b border-slate-100">
                                                    <div className="text-sm font-semibold text-slate-800">{selectedMentorModule.title}</div>
                                                    <div className="text-xs text-slate-400 mt-1">Модуль. Урок 1 - Урок 6</div>
                                                </div>
                                                <div className="divide-y divide-slate-100">
                                                    {selectedMentorModule.lessons.map((lesson) => (
                                                        <div key={lesson.id} className="px-4 py-3">
                                                            <div className="text-sm font-medium text-slate-800">{lesson.title}</div>
                                                            <div className="text-xs text-slate-500 mt-1">{lesson.description}</div>
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {lesson.badges.map((badge) => (
                                                                    <span key={`${lesson.id}-${badge}`} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                                        {badge}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-2xl font-medium text-slate-900">Личный кабинет ученика</div>
                                    <div className="text-sm text-slate-500">Здравствуйте, {aiCampSession.name}</div>
                                </div>
                                <Button variant="secondary" onClick={handleAiCampLogout}>Сменить роль</Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-xs text-slate-400 uppercase">Прогресс курса</div>
                                    <div className="text-2xl font-semibold text-slate-900">
                                        {Math.round((AI_CAMP_STUDENT_DATA.stats.completedLessons / AI_CAMP_STUDENT_DATA.stats.totalLessons) * 100)}%
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-xs text-slate-400 uppercase">Пройдено уроков</div>
                                    <div className="text-2xl font-semibold text-slate-900">{AI_CAMP_STUDENT_DATA.stats.completedLessons}/{AI_CAMP_STUDENT_DATA.stats.totalLessons}</div>
                                </div>
                                <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                    <div className="text-xs text-slate-400 uppercase">ДЗ на проверке</div>
                                    <div className="text-2xl font-semibold text-slate-900">{AI_CAMP_STUDENT_DATA.stats.pendingHomework}</div>
                                </div>
                            </div>
                            <div className="p-4 rounded-2xl border border-slate-100 bg-white/60">
                                <div className="text-sm font-medium text-slate-800 mb-3">Обратная связь от ментора</div>
                                <div className="space-y-2">
                                    {AI_CAMP_STUDENT_DATA.feedback.map(item => (
                                        <div key={item.id} className="p-3 rounded-xl border border-slate-100 bg-white text-sm">
                                            <div className="font-medium text-slate-800">{item.title}</div>
                                            <div className="text-slate-600 mt-1">{item.comment}</div>
                                        </div>
                                    ))}
                                </div>
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

                    <div className="prose prose-slate max-w-none text-sm mb-8 [&_a]:text-blue-700 [&_a]:underline [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_li]:my-1 [&_img]:w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-2xl [&_img]:my-4 [&_img]:border [&_img]:border-slate-200" dangerouslySetInnerHTML={{ __html: selectedMaterialContentHtml }} />

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
