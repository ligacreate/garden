import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/dataService';
import PvlTaskDetailView from './PvlTaskDetailView';

/** Дата старта курса ПВЛ 2026 (поток 1). При смене потока — обновить здесь. */
const PVL_COURSE_START_DATE = '2026-04-15';
/** Дата конца курса ПВЛ 2026 (поток 1). */
const PVL_COURSE_END_DATE = '2026-07-14';
/** Дедлайн самозащиты СЗ ПВЛ 2026. */
const PVL_SZ_DEADLINE_DATE = '2026-06-30';

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
    { id: 'mp-1', title: 'Практикум модуля 2', dateTime: '2026-06-01 19:00', status: 'прошла', link: '#' },
    { id: 'mp-2', title: 'Сборный завтрак #1', dateTime: '2026-06-03 10:00', status: 'скоро', link: '#' },
    { id: 'mp-3', title: 'Сборный завтрак #2', dateTime: '2026-06-09 10:00', status: 'запланирована', link: '#' },
];

export const faqItems = [
    { id: 'f-1', q: 'Как не копить долги?', a: 'Используйте антидолги D+1, D+3, D+7, D+10 и сдавайте шаги по модулям.' },
    { id: 'f-2', q: 'Где смотреть комментарии ментора?', a: 'В разделе "Результаты", в карточке каждой домашки.' },
    { id: 'f-3', q: 'СЗ и курсовые баллы — это одно?', a: 'Нет. Курсовые баллы (до 400) отдельно, самооценка СЗ (до 54) отдельно.' },
];

const MENU = ['О курсе', 'Глоссарий курса', 'Библиотека курса', 'Уроки', 'Календарь', 'Чек-лист', 'Результаты', 'Сертификация', 'Культурный код Лиги'];

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
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">О курсе «Пиши, веди, люби»</h3>
                <p className="text-sm text-[#2C1810] leading-6">
                    Вы начинаете обучение на курсе «Пиши, веди, люби». Курс состоит из трёх модулей: Пиши, Веди, Люби. Отдельный курс — социальная психология (его можно слушать в любое время).
                </p>
                <p className="text-sm text-[#2C1810] leading-6 mt-2">
                    Финалом курса будет сертификационный завтрак, вы его соберёте и проведёте, а ментор прослушает и даст обратную связь. После нас ждёт защита проектов. Курс — это только начало, после него мы будем ждать вас в Лиге развивающих практиков.
                </p>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h4 className="font-display text-lg text-[#4A3728] mb-2">Что обязательно нужно делать на курсе</h4>
                <ul className="text-sm text-[#2C1810] leading-6 space-y-1 list-disc pl-5">
                    <li>слушать уроки</li>
                    <li>выполнять тесты</li>
                    <li>делать домашние задания</li>
                    <li>приходить на практикумы</li>
                    <li>посетить встречу с письменными практиками</li>
                    <li>участвовать в сборных завтраках</li>
                    <li>получать удовольствие</li>
                    <li>пробовать практики на себе</li>
                </ul>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm text-[#2C1810] leading-6">
                Все встречи мы будем вносить в календарь на платформе и анонсировать в канале. Записи будем размещать на платформе.
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm text-[#2C1810] leading-6">
                Мы очень рекомендуем вам не копить долги, делать все вовремя и планировать сертификационный завтрак заранее. Ведь он состоит не только из подготовки сценария, но и сбора группы. На платформе есть отдельный раздел о сертификации, где мы описали все требования к сертификационному завтраку.
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm text-[#2C1810] leading-6">
                Чуть позже там появится тест самооценки, который вы сможете пройти уже после того, как проведёте сертификационный завтрак. Точно такой же тест о вашем завтраке заполнит ваш ментор, и вы сравните результаты.
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h4 className="font-display text-lg text-[#4A3728] mb-2">Команда</h4>
                <div className="text-sm text-[#2C1810] leading-6 space-y-1">
                    <p><span className="font-medium">Куратор курса:</span> Ирина Одинцова</p>
                    <p className="font-medium mt-2">Менторы курса:</p>
                    <ul className="list-disc pl-5">
                        <li>Юлия Габрух</li>
                        <li>Василина Лузина</li>
                        <li>Елена Федотова</li>
                    </ul>
                    <p className="mt-2">Технические вопросы можно задавать Анастасии.</p>
                </div>
            </div>
        </div>
    );
}

function renderGlossaryPage() {
    return (
        <div className="space-y-3">
            <input className="w-full rounded-full border border-[#E8D5C4] bg-white px-4 py-2 text-sm" placeholder="" />
            <div className="grid md:grid-cols-2 gap-3">
                {['Письменная практика', 'Результат встречи', 'Артефакт', 'Рефлексивный отклик'].map((t) => (
                    <article key={t} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                        <h4 className="font-display text-xl text-[#4A3728]">{t}</h4>
                        <p className="text-sm text-[#2C1810] mt-1">Краткое определение термина и практическое применение в курсе.</p>
                    </article>
                ))}
            </div>
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
                {['all', 'video', 'article', 'pdf', 'checklist'].map((f) => (
                    <span key={f} className={`text-xs rounded-full border px-3 py-1 ${filter === f ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>
                        {f === 'all' ? 'все' : f}
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

export function renderLessonsPage() {
    return (
        <div className="space-y-3">
            {courseWeeks.map((w) => (
                <article key={w.weekNumber} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h4 className="font-display text-2xl text-[#4A3728]">Модуль {w.weekNumber}: {w.title}</h4>
                        <span className="text-xs text-[#9B8B80]">Дедлайн: {w.deadlineAt}</span>
                    </div>
                    <div className="grid md:grid-cols-3 gap-2 text-sm">
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">Изучить · Выполнить · Сдать</div>
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">Шагов: {w.steps}, форма загрузки: файл/текст</div>
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">Контрольные точки: {w.controlPoints.length ? w.controlPoints.join(', ') : 'нет'}</div>
                    </div>
                </article>
            ))}
        </div>
    );
}

function renderMentorPracticesPage() {
    return (
        <div className="space-y-3">
            {mentorPractices.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[#E8D5C4] bg-white p-4 flex items-center justify-between gap-3">
                    <div>
                        <h4 className="font-medium text-[#4A3728]">{item.title}</h4>
                        <p className="text-sm text-[#9B8B80]">{item.dateTime}</p>
                        <p className="text-xs text-[#9B8B80] mt-1">Напоминание за 24 часа + рефлексия после встречи</p>
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
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">КТ4-КТ6 скоро (модуль 2)</div>
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
                        <p className="text-xs text-[#9B8B80] mt-1">Модуль {item.week} · {item.type}</p>
                        <div className="grid md:grid-cols-3 gap-2 mt-3 text-sm">
                            <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Дедлайн: {item.deadlineAt}</div>
                            <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Сдано: {item.submittedAt || '—'}</div>
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

export function renderCertificationPage() {
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728]">Сертификационный завтрак — критерии и подготовка</h3>
                <p className="text-sm text-[#2C1810] mt-1 leading-6">Этот документ — ваша опора перед сертификацией. Здесь собрано всё, что важно: как подготовиться, какие есть обязательные условия, на что обращает внимание ментор и как устроена оценка.</p>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h4 className="font-display text-lg text-[#4A3728] mb-2">Когда можно выходить на сертификацию</h4>
                <ul className="text-sm text-[#2C1810] leading-6 space-y-1 list-disc pl-5">
                    <li>вы выполнили все обязательные домашние задания модулей 1–3, и ментор их принял</li>
                    <li>вы провели пробный завтрак или поучаствовали в тренировочной встрече</li>
                    <li>вы посетили минимум 1 завтрак действующей ведущей Лиги и заполнили чек-лист с вашими наблюдениями</li>
                    <li>вы согласовали сценарий сертификационного завтрака заранее</li>
                    <li>вы собрали группу: минимум 3 человека, это не однокурсницы и не подруги</li>
                    <li>вы назначили дату встречи, выбрали формат и подготовились технически к записи</li>
                </ul>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h4 className="font-display text-lg text-[#4A3728] mb-2">Административные требования</h4>
                <div className="text-sm text-[#2C1810] leading-6 space-y-3">
                    <div>
                        <p className="font-medium">Формат и сроки</p>
                        <p>Формат встречи — на ваш выбор: онлайн или офлайн. Длительность — <strong>60–90 минут</strong>. В группе должно быть <strong>не менее 3 участников</strong> из вашей целевой аудитории.</p>
                    </div>
                    <div>
                        <p className="font-medium">Анонс и приглашение</p>
                        <p>Встреча должна быть анонсирована в ваших медиа. В анонсе важно указать тему, формат, стоимость и то, что встреча является сертификационной. Отправьте анонс ментору. До встречи обязательно проговорите с каждым участником, что встреча сертификационная и будет записана.</p>
                    </div>
                    <div>
                        <p className="font-medium">Запись</p>
                        <p>Встреча должна быть записана в аудиоформате. После встречи вы передаёте запись ментору и заполняете лист самооценки.</p>
                    </div>
                    <div>
                        <p className="font-medium">Оплата</p>
                        <p>Встреча проводится <strong>на платной основе</strong> — от 500 рублей с участника. Исключение: бесплатная встреча для благотворительной организации или фонда.</p>
                    </div>
                    <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">
                        <p className="font-medium mb-1">Фраза, которую важно произнести в начале записи:</p>
                        <p className="italic">«Эта встреча является сертификационной в рамках курса. Встреча записывается, запись передаётся только ментору для проверки моей работы как ведущей».</p>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h4 className="font-display text-lg text-[#4A3728] mb-2">На что ментор обращает внимание</h4>
                <div className="text-sm text-[#2C1810] leading-6 space-y-3">
                    <div>
                        <p className="font-medium">Сценарий</p>
                        <p>Соответствие теме, ясная драматургия: правила безопасности, знакомство/разминка, основная часть, подведение итогов, финальные оргмоменты. Понятные инструкции к практикам, сохранены ключевые компоненты: настройка, инструкция, рефлексивный отклик, обратная связь.</p>
                    </div>
                    <div>
                        <p className="font-medium">Техническая и организационная часть</p>
                        <p>В начале проговорены правила. Материалы подготовлены. Нет значимых технических сбоев.</p>
                    </div>
                    <div>
                        <p className="font-medium">Работа ведущей</p>
                        <p>Удержан тайминг, соблюдена этика. Ориентир по балансу — примерно <strong>30/70 (разговор/письмо)</strong>. Инструкции короткие и ясные, есть время тишины. Удержана роль ведущей как хозяйки процесса.</p>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4">
                <h4 className="font-display text-lg text-[#4A3728] mb-2">Условия, при которых встреча уходит на пересдачу</h4>
                <ul className="text-sm text-rose-900 leading-6 space-y-2 list-none">
                    <li>🚫 Формат встречи не соответствует встрече с письменными практиками</li>
                    <li>🚫 Не удержан баланс письма и разговоров (ориентир 30/70)</li>
                    <li>🚫 Не удержана роль ведущей — управление перехвачено участниками</li>
                    <li>🚫 Пропущены обязательные этапы встречи</li>
                    <li>🚫 Проблемы с записью (неполная, неразборчивая, не прозвучала фраза)</li>
                    <li>🚫 Количество участников ниже минимального (менее 3)</li>
                    <li>🚫 Серьёзные нарушения этики или безопасности без реакции ведущей</li>
                </ul>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h4 className="font-display text-lg text-[#4A3728] mb-2">Как проходит оценка</h4>
                <ol className="text-sm text-[#2C1810] leading-6 space-y-1 list-decimal pl-5">
                    <li>Вы передаёте ментору запись сертификационного завтрака</li>
                    <li>Проходите тест для самооценки</li>
                    <li>Ментор слушает запись и даёт свою оценку по тем же маркерам</li>
                    <li>Ментор даёт обратную связь</li>
                    <li>Вы сверяете результаты, фиксируете точки роста и намечаете шаги к следующей встрече</li>
                </ol>
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 text-sm text-[#2C1810] leading-6">
                <p className="font-medium text-[#4A3728]">Важное напоминание</p>
                <p className="mt-1">Сертификация — это не экзамен на идеальность. Вы учитесь видеть, что уже получается хорошо, и что стоит подкрутить, чтобы вести встречи ещё увереннее и бережнее. Мы в чате с менторами всегда рядом — поможем и поддержим.</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">Анкета самооценки временно недоступна</p>
                <p className="mt-1">Бланк самооценки сертификационного завтрака будет открыт позже. Следите за обновлениями на платформе.</p>
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
                    <p className="text-xs text-[#9B8B80] mt-2">Как получить баллы: закрывайте модули, контрольные точки, сдавайте в срок.</p>
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
    const [profileState, setProfileState] = useState(studentProfile);
    const [dashboardState, setDashboardState] = useState(studentDashboard);
    const [statsState, setStatsState] = useState(dashboardStats);
    const [libraryState, setLibraryState] = useState(libraryItems);
    const [resultsState, setResultsState] = useState(resultItems);
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
                    const start = new Date(`${PVL_COURSE_START_DATE}T00:00:00`);
                    const now = new Date();
                    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) return 0;
                    return Math.max(0, Math.min(12, Math.floor(diffDays / 7)));
                })();

                const daysToCourseEnd = Math.max(0, Math.ceil((new Date(`${PVL_COURSE_END_DATE}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const daysToSzDeadline = Math.max(0, Math.ceil((new Date(`${PVL_SZ_DEADLINE_DATE}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

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
        if (activeMenu === 'Глоссарий курса') return renderGlossaryPage();
        if (activeMenu === 'Библиотека курса') return renderLibraryPage(libraryState, libraryFilter);
        if (activeMenu === 'Уроки') return renderLessonsPage();
        if (activeMenu === 'Календарь') return renderMentorPracticesPage();
        if (activeMenu === 'Чек-лист') return renderChecklistPage();
        if (activeMenu === 'Результаты') return renderResultsPage(resultsState, resultsFilter, setSelectedTask);
        if (activeMenu === 'Сертификация') return renderCertificationPage();
        if (activeMenu === 'Культурный код Лиги') return renderLeagueCodePage();
        return renderStudentDashboard(setActiveMenu, profileState, statsState, dashboardState);
    }, [activeMenu, profileState, statsState, dashboardState, libraryState, libraryFilter, resultsState, resultsFilter]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">
            <aside className="surface-card border border-[#E8D5C4] bg-white p-3 h-fit xl:sticky xl:top-6">
                <div className="mb-3">
                    <h2 className="font-display text-2xl text-[#4A3728]">ЛК участницы</h2>
                    <p className="text-xs text-[#9B8B80]">{profileState.fullName} · {profileState.cohort}</p>
                </div>
                {renderMenu(activeMenu, setActiveMenu)}
                {activeMenu === 'Библиотека курса' && (
                    <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] mb-1">Фильтр библиотеки</p>
                        <select value={libraryFilter} onChange={(e) => setLibraryFilter(e.target.value)} className="w-full rounded-xl border border-[#E8D5C4] px-2 py-1.5 text-sm">
                            <option value="all">Все</option>
                            <option value="video">Видео</option>
                            <option value="article">Статья</option>
                            <option value="pdf">PDF</option>
                            <option value="checklist">Чек-лист</option>
                        </select>
                    </div>
                )}
                {activeMenu === 'Результаты' && (
                    <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] mb-1">Фильтр результатов</p>
                        <select value={resultsFilter} onChange={(e) => setResultsFilter(e.target.value)} className="w-full rounded-xl border border-[#E8D5C4] px-2 py-1.5 text-sm">
                            <option value="all">Все</option>
                            <option value="к проверке">К проверке</option>
                            <option value="на доработке">На доработке</option>
                            <option value="принято">Принято</option>
                            <option value="не сдано">Не сдано</option>
                        </select>
                    </div>
                )}
            </aside>
            <main>
                {selectedTask ? (
                    <PvlTaskDetailView
                        role="student"
                        onBack={() => setSelectedTask(null)}
                    />
                ) : content}
            </main>
        </div>
    );
}

