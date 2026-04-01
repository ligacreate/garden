import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/dataService';
import PvlTaskDetailView from './PvlTaskDetailView';
import { Search } from 'lucide-react';
import { formatDateRu, formatDateTimeRu } from '../utils/dateFormat';

export const studentProfile = {
    id: 'stu-2026-001',
    fullName: 'Дарья Лебедева',
    cohort: 'ПВЛ 2026, поток 1',
    currentWeek: 6,
    currentModule: 'Модуль 2: Веди',
    coursePoints: 248,
    szSelfAssessmentPoints: 0,
    daysToModuleEnd: 3,
    daysToCourseEnd: 105,
    daysToSzDeadline: 91,
};

export const dashboardStats = {
    lessonsDone: 22,
    lessonsTotal: 47,
    homeworkDone: 10,
    homeworkTotal: 18,
    allHomeworkSubmitted: false,
    controlPointsDone: 3,
    controlPointsTotal: 9,
    overdueCount: 2,
};

export const studentDashboard = [
    { key: 'module', label: 'Текущий модуль', value: studentProfile.currentModule },
    { key: 'moduleDays', label: 'Дней до конца модуля', value: studentProfile.daysToModuleEnd },
    { key: 'courseDays', label: 'Дней до конца курса', value: studentProfile.daysToCourseEnd },
    { key: 'szDays', label: 'Дней до дедлайна СЗ', value: studentProfile.daysToSzDeadline },
];

export const courseWeeks = [
    { weekNumber: 0, title: 'Вход и настройка', steps: 4, controlPoints: ['КТ1'], mentorPractice: 'Онбординг', deadlineAt: '2026-04-21' },
    { weekNumber: 1, title: 'Карта ведущей', steps: 3, controlPoints: [], mentorPractice: 'Старт модуля', deadlineAt: '2026-04-28' },
    { weekNumber: 2, title: 'Роль и опоры', steps: 3, controlPoints: [], mentorPractice: 'Реалити-наблюдение', deadlineAt: '2026-05-05' },
    { weekNumber: 3, title: 'Микропрактики', steps: 4, controlPoints: ['КТ2'], mentorPractice: 'Первое ведение', deadlineAt: '2026-05-12' },
    { weekNumber: 4, title: 'Паспорт встречи', steps: 3, controlPoints: ['КТ3'], mentorPractice: 'Q&A модуль 1', deadlineAt: '2026-05-19' },
    { weekNumber: 5, title: 'Черновик сценария', steps: 3, controlPoints: [], mentorPractice: 'Разбор черновиков', deadlineAt: '2026-05-26' },
    { weekNumber: 6, title: 'Риски и сборные', steps: 5, controlPoints: ['КТ4', 'КТ5', 'КТ6'], mentorPractice: 'Сборный завтрак #1', deadlineAt: '2026-06-02' },
    { weekNumber: 7, title: 'План B', steps: 3, controlPoints: [], mentorPractice: 'Сборный завтрак #2', deadlineAt: '2026-06-09' },
    { weekNumber: 8, title: 'Финальный сценарий', steps: 3, controlPoints: ['КТ7'], mentorPractice: 'Q&A модуль 2', deadlineAt: '2026-06-16' },
    { weekNumber: 9, title: 'Подготовка СЗ', steps: 3, controlPoints: [], mentorPractice: 'Тренировочный #1', deadlineAt: '2026-06-23' },
    { weekNumber: 10, title: 'СЗ и запись', steps: 3, controlPoints: ['КТ8'], mentorPractice: 'Тренировочный #2', deadlineAt: '2026-06-30' },
    { weekNumber: 11, title: 'Пост-СЗ', steps: 3, controlPoints: [], mentorPractice: 'Чай с ментором', deadlineAt: '2026-07-07' },
    { weekNumber: 12, title: 'Финал и Лига', steps: 3, controlPoints: ['КТ9'], mentorPractice: 'Финальная встреча', deadlineAt: '2026-07-14' },
];

export const resultItems = [
    {
        id: 'res-1',
        title: 'Паспорт встречи',
        week: 4,
        type: 'обычное задание',
        status: 'принято',
        deadlineAt: '2026-05-19',
        submittedAt: '2026-05-18',
        mentorCommentPreview: 'Сильная логика структуры, можно усилить финальный РО.',
        mentorCommentCount: 3,
        hasUnreadMentorComment: false,
        score: 18,
        attachments: ['passport_v1.pdf'],
    },
    {
        id: 'res-2',
        title: 'Сценарий >= v0.8',
        week: 6,
        type: 'контрольная точка',
        status: 'на доработке',
        deadlineAt: '2026-06-02',
        submittedAt: '2026-06-01',
        mentorCommentPreview: 'Уберите дубли в блоке 2 и уточните артефакт.',
        mentorCommentCount: 5,
        hasUnreadMentorComment: true,
        score: 12,
        attachments: ['scenario_v08.docx'],
    },
    {
        id: 'res-3',
        title: 'Два завтрака Лиги',
        week: 6,
        type: 'контрольная точка',
        status: 'к проверке',
        deadlineAt: '2026-06-02',
        submittedAt: '2026-06-02',
        mentorCommentPreview: 'Ожидает проверки ментором.',
        mentorCommentCount: 0,
        hasUnreadMentorComment: false,
        score: 0,
        attachments: ['obs_sheet_1.pdf', 'obs_sheet_2.pdf'],
    },
];

export const libraryItems = [
    { id: 'lib-1', title: 'Доказательная база ПП', category: 'доказательная база', contentType: 'article', duration: '12 мин', completed: true, progressPercent: 100 },
    { id: 'lib-2', title: 'Карта практик', category: 'карта практик', contentType: 'pdf', duration: '8 мин', completed: true, progressPercent: 100 },
    { id: 'lib-3', title: 'Техника безопасности', category: 'техника безопасности', contentType: 'video', duration: '24 мин', completed: false, progressPercent: 40 },
    { id: 'lib-4', title: 'Мифы и объяснения', category: 'мифы и объяснения', contentType: 'article', duration: '10 мин', completed: false, progressPercent: 10 },
    { id: 'lib-5', title: 'Социальная психология группы', category: 'социальная психология', contentType: 'video', duration: '31 мин', completed: false, progressPercent: 0 },
    { id: 'lib-6', title: 'Онлайн и офлайн форматы', category: 'онлайн и офлайн', contentType: 'checklist', duration: '6 мин', completed: false, progressPercent: 30 },
    { id: 'lib-7', title: 'МАК в сценарии', category: 'МАК', contentType: 'video', duration: '18 мин', completed: false, progressPercent: 0 },
    { id: 'lib-8', title: 'Культурный код Лиги', category: 'культурный код Лиги', contentType: 'pdf', duration: '14 мин', completed: false, progressPercent: 0 },
];

export const mentorPractices = [
    { id: 'mp-1', title: 'Практикум модуля 2', dateTime: '2026-06-01T19:00:00', status: 'прошла', type: 'практикум', link: '#' },
    { id: 'mp-2', title: 'Сборный завтрак #1', dateTime: '2026-06-03T10:00:00', status: 'скоро', type: 'сборный завтрак', link: '#' },
    { id: 'mp-3', title: 'Сборный завтрак #2', dateTime: '2026-06-09T10:00:00', status: 'запланирована', type: 'сборный завтрак', link: '#' },
    { id: 'mp-4', title: 'Дедлайн: Урок 7', dateTime: '2026-06-09T23:00:00', status: 'запланирована', type: 'дедлайн', link: '#' }
];

const GLOSSARY_TERMS = [
    { title: 'Артефакт', description: 'Измеримый результат шага в курсе: файл, текст, запись или отчет.' },
    { title: 'Антидолг', description: 'Механика отработки просроченных задач по окнам D+1, D+3, D+7, D+10.' },
    { title: 'Групповая динамика', description: 'Изменение состояния группы в процессе встречи и практики.' },
    { title: 'Контрольная точка', description: 'Обязательная веха потока, которая влияет на допуск и прогресс.' },
    { title: 'Письменная практика', description: 'Рефлексивная работа в тексте для закрепления содержания урока.' },
    { title: 'Рефлексивный отклик', description: 'Краткая фиксация инсайтов после урока, практикума или обратной связи.' }
];

export const faqItems = [
    { id: 'f-1', q: 'Как не копить долги?', a: 'Используйте антидолги D+1, D+3, D+7, D+10 и сдавайте шаги по неделям.' },
    { id: 'f-2', q: 'Где смотреть комментарии ментора?', a: 'В разделе "Результаты", в карточке каждой домашки.' },
    { id: 'f-3', q: 'СЗ и курсовые баллы — это одно?', a: 'Нет. Курсовые баллы (до 400) отдельно, самооценка СЗ (до 54) отдельно.' },
];

const MENU = ['Дашборд', 'О курсе', 'Глоссарий курса', 'Библиотека курса', 'Уроки', 'Практикумы с менторами', 'Чек-лист', 'Результаты', 'Сертификация', 'Культурный код Лиги'];

export function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'принято') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (s === 'на доработке') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'не принято' || s === 'просрочено') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (s === 'к проверке' || s === 'отправлено') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    if (s === 'в работе') return 'bg-indigo-50 text-indigo-700 border-indigo-600/30';
    if (s === 'не начато' || s === 'не сдано') return 'bg-slate-100 text-slate-600 border-slate-300';
    if (s === 'скоро') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'запланирована') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    if (s === 'прошла') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    return 'bg-slate-100 text-slate-600 border-slate-300';
}

export function progressWidget(label, done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] mb-1">{label}</div>
            <div className="font-display text-3xl leading-none text-[#C8855A]">{done}/{total}</div>
            <div className="mt-2 h-1.5 rounded-full bg-[#E8D5C4] overflow-hidden">
                <div className="h-full bg-[#C8855A]" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function renderAboutPage() {
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">О курсе и онбординг</h3>
                <p className="text-sm text-[#2C1810] leading-6">3 месяца, 110 часов, контрольные точки, правила баллов, безопасность, связь и расписание. Стартовые материалы и видео встроены сюда, без отдельного пункта меню.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm">Как пользоваться платформой: уроки, задания, дедлайны, личная страница.</div>
                <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm">Экран "Старт": видео + красные флаги + критерии зачета.</div>
                <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm">Как не копить долги: антидолги D+1 / D+3 / D+7 / D+10.</div>
                <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm">Матрица ответственности: методолог, ментор, куратор, техподдержка.</div>
            </div>
        </div>
    );
}

function renderGlossaryPage(searchTerm = '', selectedLetter = 'Все') {
    const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
    const filtered = GLOSSARY_TERMS.filter((term) => {
        const byLetter = selectedLetter === 'Все' || term.title.toUpperCase().startsWith(selectedLetter);
        const bySearch = !normalizedSearch
            || term.title.toLowerCase().includes(normalizedSearch)
            || term.description.toLowerCase().includes(normalizedSearch);
        return byLetter && bySearch;
    });
    return (
        <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
                {filtered.map((t) => (
                    <article key={t.title} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                        <h4 className="font-display text-xl text-[#4A3728]">{t.title}</h4>
                        <p className="text-sm text-[#2C1810] mt-1">{t.description}</p>
                    </article>
                ))}
            </div>
            {filtered.length === 0 && (
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm text-[#9B8B80]">
                    Ничего не найдено. Измени запрос или выбери другую букву.
                </div>
            )}
        </div>
    );
}

export function renderLibraryPage(items = libraryItems, filter = 'all') {
    const filtered = filter === 'all' ? items : items.filter((i) => i.contentType === filter);
    const completed = items.filter((i) => i.completed).length;
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 flex items-center justify-between">
                <div>
                    <h3 className="font-display text-2xl text-[#4A3728]">Библиотека курса</h3>
                    <p className="text-sm text-[#9B8B80]">Библиотека отделена от уроков. Фильтр: видео, статьи, PDF, чек-листы.</p>
                </div>
                <div className="text-sm text-[#2C1810]">Пройдено: <strong>{completed}/{items.length}</strong></div>
            </div>
            <div className="flex flex-wrap gap-2">
                {[
                    { key: 'all', label: 'все' },
                    { key: 'video', label: 'видео' },
                    { key: 'article', label: 'статья' },
                    { key: 'pdf', label: 'PDF' },
                    { key: 'checklist', label: 'чек-лист' }
                ].map((f) => (
                    <span key={f.key} className={`text-xs rounded-full border px-3 py-1 ${filter === f.key ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>
                        {f.label}
                    </span>
                ))}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
                {filtered.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4">
                        <div className="text-xs text-[#9B8B80] uppercase tracking-[0.08em]">{item.category}</div>
                        <h4 className="font-medium text-[#4A3728] mt-1">{item.title}</h4>
                        <p className="text-xs text-[#9B8B80] mt-1">{item.contentType} · {item.duration}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-[#E8D5C4] overflow-hidden">
                            <div className="h-full bg-[#C8855A]" style={{ width: `${item.progressPercent}%` }} />
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

export function renderLessonsPage(onOpenLesson = null) {
    return (
        <div className="space-y-3">
            {courseWeeks.map((w) => (
                <article key={w.weekNumber} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h4 className="font-display text-2xl text-[#4A3728]">Неделя {w.weekNumber}: {w.title}</h4>
                        <span className="text-xs text-[#9B8B80]">Дедлайн: {formatDateRu(w.deadlineAt)}</span>
                    </div>
                    <div className="grid md:grid-cols-3 gap-2 text-sm">
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">Изучить · Выполнить · Сдать</div>
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">Шагов: {w.steps}, форма загрузки: файл/текст</div>
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">Контрольные точки: {w.controlPoints.length ? w.controlPoints.join(', ') : 'нет'}</div>
                    </div>
                    <div className="mt-3">
                        <button
                            onClick={() => onOpenLesson?.(w)}
                            className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]"
                        >
                            Открыть урок
                        </button>
                    </div>
                </article>
            ))}
        </div>
    );
}

function renderMentorPracticesPage(events = mentorPractices, selectedDate = null, onSelectDate = null) {
    const groupedByDate = events.reduce((acc, item) => {
        const key = formatDateRu(item.dateTime);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
    const dateKeys = Object.keys(groupedByDate);
    const effectiveDate = selectedDate && groupedByDate[selectedDate] ? selectedDate : dateKeys[0];
    const dayEvents = effectiveDate ? groupedByDate[effectiveDate] : [];
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Календарь учебного ритма</h3>
                <div className="flex flex-wrap gap-2">
                    {dateKeys.map((dateKey) => (
                        <button
                            key={dateKey}
                            onClick={() => onSelectDate?.(dateKey)}
                            className={`rounded-full border px-3 py-1 text-xs ${effectiveDate === dateKey ? 'border-[#C8855A] bg-[#F5EDE6] text-[#4A3728]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}
                        >
                            {dateKey} • {groupedByDate[dateKey].length}
                        </button>
                    ))}
                </div>
            </div>
            {dayEvents.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[#E8D5C4] bg-white p-4 flex items-center justify-between gap-3">
                    <div>
                        <h4 className="font-medium text-[#4A3728]">{item.title}</h4>
                        <p className="text-sm text-[#9B8B80]">{formatDateTimeRu(item.dateTime)}</p>
                        <p className="text-xs text-[#9B8B80] mt-1">Тип: {item.type || 'практикум'}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusBadge(item.status)}`}>{item.status}</span>
                </article>
            ))}
        </div>
    );
}

function renderChecklistPage() {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Маршрут прохождения</h3>
            <p className="text-sm text-[#9B8B80] mb-3">Показывает обязательные точки, что закрыто, что просрочено, что впереди.</p>
            <div className="space-y-2 text-sm">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">КТ1 закрыта</div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">КТ4-КТ6 скоро (неделя 6)</div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">Антидолг D+3 активен по 1 задаче</div>
            </div>
        </div>
    );
}

export function renderResultsPage(items = resultItems, statusFilter = 'all', onOpenTask = null) {
    const filteredItems = statusFilter === 'all' ? items : items.filter((i) => i.status === statusFilter);
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728]">Результаты</h3>
                <p className="text-sm text-[#9B8B80]">Личная страница ведущей: домашки, статусы, история и комментарии ментора в одном месте.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                {['all', 'к проверке', 'на доработке', 'принято', 'не сдано'].map((f) => (
                    <span key={f} className={`text-xs rounded-full border px-3 py-1 ${statusFilter === f ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>
                        {f}
                    </span>
                ))}
            </div>
            <div className="grid gap-3">
                {filteredItems.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-medium text-[#4A3728]">{item.title}</h4>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusBadge(item.status)}`}>{item.status}</span>
                        </div>
                        <p className="text-xs text-[#9B8B80] mt-1">Неделя {item.week} · {item.type}</p>
                        <div className="grid md:grid-cols-3 gap-2 mt-3 text-sm">
                            <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Дедлайн: {formatDateRu(item.deadlineAt)}</div>
                            <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Сдано: {item.submittedAt && item.submittedAt !== '—' ? formatDateRu(item.submittedAt) : '—'}</div>
                            <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Комментарии: {item.mentorCommentCount}</div>
                        </div>
                        <p className="text-sm text-[#2C1810] mt-2">{item.mentorCommentPreview}</p>
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-[#9B8B80]">Вложения: {item.attachments.join(', ')}</span>
                            <button
                                onClick={() => onOpenTask?.(item)}
                                className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]"
                            >
                                Открыть карточку задания
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

export function renderCertificationPage(step = 1, onStepChange = null) {
    const steps = ['Самооценка', 'Критические условия', 'Сверка с ментором', 'Итог'];
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728]">Сертификация</h3>
                <p className="text-sm text-[#2C1810] mt-1">Условия СЗ, критерии, красные флаги, дедлайн записи СЗ.</p>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {steps.map((label, index) => (
                        <button
                            key={label}
                            onClick={() => onStepChange?.(index + 1)}
                            className={`rounded-xl border px-2 py-1 text-xs ${step === index + 1 ? 'border-[#C8855A] bg-[#F5EDE6] text-[#4A3728]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}
                        >
                            {index + 1}. {label}
                        </button>
                    ))}
                </div>
                <div className="grid md:grid-cols-2 gap-2 mt-3">
                    <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3 text-sm">Курсовые баллы: <strong>{studentProfile.coursePoints}/400</strong></div>
                    <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3 text-sm">Самооценка СЗ: <strong>{studentProfile.szSelfAssessmentPoints}/54</strong></div>
                </div>
                <div className="mt-3 rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3 text-sm text-[#2C1810]">
                    Текущий шаг: <strong>{steps[step - 1] || steps[0]}</strong>. Система хранит самооценку, критические условия и итог сравнения с оценкой ментора.
                </div>
            </div>
        </div>
    );
}

function renderLeagueCodePage() {
    return (
        <div className="grid md:grid-cols-2 gap-3">
            {['Бережность и границы', 'Без советов и интерпретаций', 'Стиль ведущей: ясность и экологичность', 'Участие в жизни сообщества'].map((item) => (
                <article key={item} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h4 className="font-medium text-[#4A3728]">{item}</h4>
                    <p className="text-sm text-[#9B8B80] mt-1">Краткий тезис культурного кода и поведения внутри Лиги.</p>
                </article>
            ))}
        </div>
    );
}

export function renderStudentDashboard(onNavigate, profile = studentProfile, stats = dashboardStats, dashboardItems = studentDashboard) {
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h2 className="font-display text-3xl text-[#4A3728]">Дашборд участницы</h2>
                <p className="text-sm text-[#9B8B80] mt-1">Где я сейчас и что делать дальше.</p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                {dashboardItems.map((i) => (
                    <div key={i.key} className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80]">{i.label}</div>
                        <div className="font-display text-3xl text-[#C8855A] mt-1">{i.value}</div>
                    </div>
                ))}
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                {progressWidget('Уроки', stats.lessonsDone, stats.lessonsTotal)}
                {progressWidget('Домашки', stats.homeworkDone, stats.homeworkTotal)}
                {progressWidget('Контрольные точки', stats.controlPointsDone, stats.controlPointsTotal)}
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] mb-1">Курсовые баллы</div>
                    <div className="font-display text-3xl text-[#C8855A]">{profile.coursePoints}/400</div>
                    <p className="text-xs text-[#9B8B80] mt-2">Как получить баллы: закрывайте недели, контрольные точки, сдавайте в срок.</p>
                </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h3 className="font-display text-2xl text-[#4A3728] mb-2">Ближайшие дедлайны</h3>
                    <ul className="text-sm text-[#2C1810] space-y-1">
                        <li>КТ4/КТ5/КТ6 — 2026-06-02</li>
                        <li>Антидолг D+1: 1 задача</li>
                        <li>Антидолг D+3: 1 задача</li>
                        <li>D+7 / D+10: пока нет</li>
                    </ul>
                </div>
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h3 className="font-display text-2xl text-[#4A3728] mb-2">FAQ</h3>
                    <ul className="text-sm text-[#2C1810] space-y-1">
                        {faqItems.map((f) => <li key={f.id}>• {f.q}</li>)}
                    </ul>
                </div>
            </div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Быстрые переходы</h3>
                <div className="flex flex-wrap gap-2">
                    {['Уроки', 'Результаты', 'Сертификация', 'Библиотека курса'].map((item) => (
                        <button key={item} onClick={() => onNavigate(item)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">
                            {item}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function renderMenu(active, onSelect) {
    return (
        <nav className="space-y-1">
            {MENU.map((item) => (
                <button
                    key={item}
                    onClick={() => onSelect(item)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition ${active === item ? 'bg-[#C8855A]/15 text-[#4A3728] border border-[#E8D5C4]' : 'text-[#9B8B80] hover:bg-white/70'}`}
                >
                    {item}
                </button>
            ))}
        </nav>
    );
}

const STORAGE_KEY = 'pvl_student_cabinet_ui_state_v1';

const readUiState = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return {
            activeMenu: raw.activeMenu || 'Дашборд',
            libraryFilter: raw.libraryFilter || 'all',
            resultsFilter: raw.resultsFilter || 'all',
        };
    } catch {
        return { activeMenu: 'Дашборд', libraryFilter: 'all', resultsFilter: 'all' };
    }
};

const saveUiState = (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

export default function PvlStudentCabinetView({ user }) {
    const initialUi = readUiState();
    const [activeMenu, setActiveMenu] = useState(initialUi.activeMenu);
    const [libraryFilter, setLibraryFilter] = useState(initialUi.libraryFilter);
    const [resultsFilter, setResultsFilter] = useState(initialUi.resultsFilter);
    const [glossarySearch, setGlossarySearch] = useState('');
    const [glossaryLetter, setGlossaryLetter] = useState('Все');
    const [profileState, setProfileState] = useState(studentProfile);
    const [dashboardState, setDashboardState] = useState(studentDashboard);
    const [statsState, setStatsState] = useState(dashboardStats);
    const [libraryState, setLibraryState] = useState(libraryItems);
    const [resultsState, setResultsState] = useState(resultItems);
    const [practiceEvents, setPracticeEvents] = useState(mentorPractices);
    const [selectedPracticeDate, setSelectedPracticeDate] = useState(null);
    const [selectedLesson, setSelectedLesson] = useState(null);
    const [certificationStep, setCertificationStep] = useState(1);
    const [selectedTask, setSelectedTask] = useState(null);

    useEffect(() => {
        saveUiState({ activeMenu, libraryFilter, resultsFilter });
    }, [activeMenu, libraryFilter, resultsFilter]);

    useEffect(() => {
        let mounted = true;
        const loadApiState = async () => {
            if (!user?.id) return;
            try {
                const [progressIds, meetings, goals, kb] = await Promise.all([
                    api.getCourseProgress?.(user.id).catch(() => []),
                    api.getMeetings?.(user.id).catch(() => []),
                    api.getGoals?.(user.id).catch(() => []),
                    api.getKnowledgeBase?.().catch(() => []),
                ]);
                if (!mounted) return;

                const lessonsTotal = courseWeeks.reduce((sum, w) => sum + Number(w.steps || 0), 0);
                const lessonsDone = Math.min(Array.isArray(progressIds) ? progressIds.length : 0, lessonsTotal);
                const homeworkTotal = 18;
                const homeworkDone = Array.isArray(goals) ? goals.filter((g) => g?.completed).length : 0;
                const controlPointsTotal = 9;
                const controlPointsDone = Math.min(Array.isArray(meetings) ? meetings.filter((m) => m?.status === 'completed').length : 0, controlPointsTotal);
                const overdueCount = Array.isArray(goals) ? goals.filter((g) => g?.completed === false && g?.deadline && new Date(g.deadline) < new Date()).length : dashboardStats.overdueCount;

                setStatsState({
                    lessonsDone,
                    lessonsTotal,
                    homeworkDone,
                    homeworkTotal,
                    allHomeworkSubmitted: homeworkDone >= homeworkTotal,
                    controlPointsDone,
                    controlPointsTotal,
                    overdueCount,
                });

                const currentWeek = (() => {
                    const start = new Date('2026-04-15');
                    const now = new Date();
                    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) return 0;
                    return Math.max(0, Math.min(12, Math.floor(diffDays / 7)));
                })();

                const daysToCourseEnd = Math.max(0, Math.ceil((new Date('2026-07-14').getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const daysToSzDeadline = Math.max(0, Math.ceil((new Date('2026-06-30').getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

                setProfileState((prev) => ({
                    ...prev,
                    id: String(user.id),
                    fullName: user.name || prev.fullName,
                    coursePoints: Math.min(400, Number(user.seeds || prev.coursePoints || 0)),
                    currentWeek,
                    daysToCourseEnd,
                    daysToSzDeadline,
                    daysToModuleEnd: Math.max(0, 7 - ((new Date().getDay() + 6) % 7)),
                }));

                setDashboardState([
                    { key: 'module', label: 'Текущий модуль', value: currentWeek <= 4 ? 'Модуль 1: Пиши' : currentWeek <= 8 ? 'Модуль 2: Веди' : 'Модуль 3: Люби' },
                    { key: 'moduleDays', label: 'Дней до конца модуля', value: Math.max(0, 7 - ((new Date().getDay() + 6) % 7)) },
                    { key: 'courseDays', label: 'Дней до конца курса', value: daysToCourseEnd },
                    { key: 'szDays', label: 'Дней до дедлайна СЗ', value: daysToSzDeadline },
                ]);

                if (Array.isArray(kb) && kb.length > 0) {
                    const mappedLibrary = kb.slice(0, 12).map((item, idx) => ({
                        id: `kb-${item.id || idx}`,
                        title: item.title || `Материал ${idx + 1}`,
                        category: item.category || item.course || 'материалы для ведущих и менторов',
                        contentType: item.type ? String(item.type).toLowerCase() : 'article',
                        duration: item.duration || '10 мин',
                        completed: idx < lessonsDone,
                        progressPercent: idx < lessonsDone ? 100 : 0,
                    }));
                    setLibraryState(mappedLibrary);
                }

                if (Array.isArray(goals) && goals.length > 0) {
                    const mappedResults = goals.slice(0, 20).map((g, idx) => ({
                        id: `goal-${g.id || idx}`,
                        title: g.title || `Задание ${idx + 1}`,
                        week: g.week || Math.max(0, Math.min(12, currentWeek)),
                        type: g.is_control_point ? 'контрольная точка' : 'обычное задание',
                        status: g.completed ? 'принято' : 'в работе',
                        deadlineAt: g.deadline || '—',
                        submittedAt: g.completed_at || '—',
                        mentorCommentPreview: g.description || 'Комментарий ментора пока отсутствует.',
                        mentorCommentCount: 0,
                        hasUnreadMentorComment: false,
                        score: 0,
                        attachments: [],
                    }));
                    setResultsState(mappedResults);
                }

                const calendar = await api.getCalendarEvents?.().catch(() => []);
                if (Array.isArray(calendar) && calendar.length > 0) {
                    const mappedEvents = calendar.map((event) => ({
                        id: `cal-${event.id}`,
                        title: event.title,
                        dateTime: event.starts_at,
                        status: 'запланирована',
                        type: event?.event_types?.title || 'событие',
                        link: '#'
                    }));
                    setPracticeEvents((prev) => [...mappedEvents, ...prev]);
                }
            } catch (e) {
                console.warn('PvlStudentCabinetView API fallback to mock state:', e);
            }
        };
        loadApiState();
        return () => { mounted = false; };
    }, [user?.id]);

    const content = useMemo(() => {
        if (activeMenu === 'Дашборд') return renderStudentDashboard(setActiveMenu, profileState, statsState, dashboardState);
        if (activeMenu === 'О курсе') return renderAboutPage();
        if (activeMenu === 'Глоссарий курса') return renderGlossaryPage(glossarySearch, glossaryLetter);
        if (activeMenu === 'Библиотека курса') return renderLibraryPage(libraryState, libraryFilter);
        if (activeMenu === 'Уроки') return renderLessonsPage(setSelectedLesson);
        if (activeMenu === 'Практикумы с менторами') return renderMentorPracticesPage(practiceEvents, selectedPracticeDate, setSelectedPracticeDate);
        if (activeMenu === 'Чек-лист') return renderChecklistPage();
        if (activeMenu === 'Результаты') return renderResultsPage(resultsState, resultsFilter, setSelectedTask);
        if (activeMenu === 'Сертификация') return renderCertificationPage(certificationStep, setCertificationStep);
        if (activeMenu === 'Культурный код Лиги') return renderLeagueCodePage();
        return renderStudentDashboard(setActiveMenu, profileState, statsState, dashboardState);
    }, [activeMenu, profileState, statsState, dashboardState, libraryState, libraryFilter, resultsState, resultsFilter, glossarySearch, glossaryLetter, practiceEvents, selectedPracticeDate, certificationStep]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">
            <aside className="surface-card border border-[#E8D5C4] bg-white p-3 h-fit xl:sticky xl:top-6">
                <div className="mb-3">
                    <h2 className="font-display text-2xl text-[#4A3728]">Личный кабинет</h2>
                    <p className="text-xs text-[#9B8B80]">{profileState.fullName} · {profileState.cohort}</p>
                </div>
                {renderMenu(activeMenu, setActiveMenu)}
                {activeMenu === 'Глоссарий курса' && (
                    <div className="mt-3 space-y-2">
                        <div className="relative">
                            <input
                                value={glossarySearch}
                                onChange={(e) => setGlossarySearch(e.target.value)}
                                className="w-full rounded-xl border border-[#E8D5C4] px-2 py-1.5 pr-9 text-sm"
                                placeholder="Поиск термина"
                            />
                            <button className="absolute right-1 top-1 rounded-lg border border-[#E8D5C4] p-1 text-[#4A3728] bg-[#F5EDE6]">
                                <Search size={14} />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {['Все', 'А', 'Г', 'К', 'П', 'Р'].map((letter) => (
                                <button
                                    key={letter}
                                    onClick={() => setGlossaryLetter(letter)}
                                    className={`rounded-full border px-2 py-0.5 text-xs ${glossaryLetter === letter ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}
                                >
                                    {letter}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {activeMenu === 'Библиотека курса' && (
                    <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] mb-1">Фильтр библиотеки</p>
                        <div className="flex flex-wrap gap-1">
                            {[
                                { key: 'all', label: 'Все' },
                                { key: 'video', label: 'Видео' },
                                { key: 'article', label: 'Статья' },
                                { key: 'pdf', label: 'PDF' },
                                { key: 'checklist', label: 'Чек-лист' }
                            ].map((f) => (
                                <button
                                    key={f.key}
                                    onClick={() => setLibraryFilter(f.key)}
                                    className={`rounded-full border px-2 py-0.5 text-xs ${libraryFilter === f.key ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {activeMenu === 'Результаты' && (
                    <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] mb-1">Фильтр результатов</p>
                        <div className="flex flex-wrap gap-1">
                            {['all', 'к проверке', 'на доработке', 'принято', 'не сдано'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setResultsFilter(status)}
                                    className={`rounded-full border px-2 py-0.5 text-xs ${resultsFilter === status ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </aside>
            <main>
                {selectedTask ? (
                    <PvlTaskDetailView
                        role="student"
                        onBack={() => setSelectedTask(null)}
                    />
                ) : (
                    <div className="grid xl:grid-cols-[1fr_320px] gap-4">
                        <div>{content}</div>
                        {selectedLesson && activeMenu === 'Уроки' && (
                            <aside className="rounded-2xl border border-[#E8D5C4] bg-white p-4 h-fit xl:sticky xl:top-6">
                                <h3 className="font-display text-2xl text-[#4A3728] mb-2">{selectedLesson.title}</h3>
                                <p className="text-sm text-[#9B8B80] mb-2">Дедлайн: {formatDateRu(selectedLesson.deadlineAt)}</p>
                                <div className="space-y-2 text-sm text-[#2C1810]">
                                    <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Видео: доступно</div>
                                    <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Конспект: доступен</div>
                                    <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Задание: в работе</div>
                                    <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Комментарий ментора: будет после сдачи</div>
                                </div>
                            </aside>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

