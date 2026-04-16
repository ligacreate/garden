import React, { useMemo, useState } from 'react';
import { pvlDomainApi } from '../services/pvlMockApi';
import RichEditor from '../components/RichEditor';
import { ChecklistFieldsEditor, ChecklistAnswersReadonly } from './pvlChecklistShared';
import { QuestionnaireFieldsEditor, QuestionnaireAnswersReadonly } from './pvlQuestionnaireShared';
import { pvlReadImageFileAsDataUrl, sanitizeHomeworkAnswerHtml, homeworkAnswerPlainText } from '../utils/pvlHomeworkAnswerRichText';

function threadEventLabel(messageType) {
    const m = {
        status: 'Системное событие',
        dispute_opened: 'Спор открыт',
        dispute_comment: 'Спор',
        mentor_review: 'Оценка ментора',
        comment: 'Сообщение',
        version_submitted: 'Отправка работы',
        bonus: 'Баллы',
        reminder_lesson: 'Напоминание: урок',
        reminder_meeting: 'Напоминание: встреча',
        reminder_live: 'Напоминание: эфир',
    };
    return m[messageType] || 'Событие';
}

export const taskDetail = {
    id: 'task-kt4-scenario-v08',
    title: 'Сценарий >= v0.8',
    weekNumber: 6,
    moduleNumber: 2,
    type: 'контрольная точка',
    isControlPoint: true,
    controlPointId: 'КТ4',
    status: 'на доработке',
    deadlineAt: '2026-06-02',
    submittedAt: '2026-06-01',
    lastStatusChangedAt: '2026-06-02 14:30',
    score: 12,
    maxScore: 20,
    relatedLessonId: 'lesson-m2-scenario-logic',
    relatedPracticeId: 'practice-scenario-workshop',
    relatedCertificationStepId: 'cert-recording-deadline',
};

export const taskDescription = {
    summary: 'Соберите рабочую версию сценария встречи с логикой, таймингом и прогнозом рисков.',
    artifact: 'Файл сценария версии не ниже v0.8 + краткий саморазбор.',
    criteria: [
        'Целостная структура встречи: начало, середина, завершение',
        'Понятный артефакт и ожидаемый результат встречи',
        'Тайминг и логика переходов между этапами',
        'Блок рисков и запасной план',
    ],
    uploadTypes: ['текст', 'файл', 'ссылка'],
    hints: [
        'Сначала проверьте, нет ли дублей в этапах сценария.',
        'К каждому этапу добавьте цель и ожидаемый результат.',
        'Отдельно проверьте, как сценарий читается глазами участницы.',
    ],
};

export const submissionVersions = [
    {
        id: 'ver-1',
        versionNumber: 1,
        createdAt: '2026-05-31 19:20',
        authorRole: 'student',
        textContent: 'Черновой сценарий, прошу обратную связь по структуре.',
        attachments: ['scenario_v07.docx'],
        links: [],
        isCurrent: false,
    },
    {
        id: 'ver-2',
        versionNumber: 2,
        createdAt: '2026-06-01 12:40',
        authorRole: 'student',
        textContent: 'Обновила блок РО и тайминг.',
        attachments: ['scenario_v08.docx'],
        links: ['https://docs.google.com/document/d/xyz'],
        isCurrent: true,
    },
];

export const statusHistory = [
    { id: 's1', fromStatus: 'в работе', toStatus: 'отправлено', changedAt: '2026-06-01 12:41', changedBy: 'Дарья Лебедева', comment: 'Отправлено на проверку' },
    { id: 's2', fromStatus: 'отправлено', toStatus: 'к проверке', changedAt: '2026-06-01 13:00', changedBy: 'Система', comment: 'Задание добавлено в очередь проверок' },
    { id: 's3', fromStatus: 'к проверке', toStatus: 'на доработке', changedAt: '2026-06-02 14:30', changedBy: 'Ментор', comment: 'Требуется уточнить критерий финального артефакта' },
];

export const threadMessages = [
    {
        id: 'm1',
        type: 'message',
        authorName: 'Дарья Лебедева',
        authorRole: 'student',
        createdAt: '2026-06-01 12:41',
        text: 'Отправляю версию 0.8, буду благодарна за точечную обратную связь.',
        attachments: ['scenario_v08.docx'],
        linkedStatusChange: null,
        linkedVersionId: 'ver-2',
        isUnreadForCurrentUser: false,
    },
    {
        id: 'm2',
        type: 'system',
        authorName: 'Система',
        authorRole: 'system',
        createdAt: '2026-06-01 13:00',
        text: 'Статус изменен: отправлено -> к проверке.',
        attachments: [],
        linkedStatusChange: 's2',
        linkedVersionId: null,
        isUnreadForCurrentUser: false,
    },
    {
        id: 'm3',
        type: 'message',
        authorName: 'Ментор',
        authorRole: 'mentor',
        createdAt: '2026-06-02 14:30',
        text: 'Сильная база. Проверьте 2 блока на дубли и уточните финальный артефакт.',
        attachments: [],
        linkedStatusChange: 's3',
        linkedVersionId: null,
        isUnreadForCurrentUser: true,
    },
];

export const mentorReview = {
    reviewCycle: 2,
    strengths: 'Логика встречи стала заметно чище, хороший ритм начала.',
    blockers: 'Финальный артефакт описан слишком общо, критерий результата неоперационален.',
    nextActions: '1) Уточнить формулировку артефакта. 2) Убрать дубли между шагами 2 и 3.',
    statusDecision: 'на доработке',
    generalComment: 'После правок можно повторно отправлять в проверку.',
    linkedCriteria: ['структура', 'артефакт', 'тайминг'],
    warningTooManyRevisions: false,
};

export const controlPointMeta = {
    id: 'КТ4',
    title: 'Сценарий >= v0.8',
    weekNumber: 6,
    deadlineAt: '2026-06-02',
    affectsPoints: true,
    affectsAdmission: true,
    specialNote: 'Модуль 2 содержит 3 отдельные контрольные точки: КТ4, КТ5, КТ6.',
};

const relatedLinks = [
    { id: 'rl1', label: 'Модуль курса', href: '#/course/module/2' },
    { id: 'rl2', label: 'Связанный урок', href: '#/lesson/lesson-m2-scenario-logic' },
    { id: 'rl3', label: 'Практикум с ментором', href: '#/mentor-practice/practice-scenario-workshop' },
    { id: 'rl4', label: 'Соседнее задание модуля', href: '#/results/task-kt5-mini-run' },
    { id: 'rl5', label: 'Сертификация', href: '#/certification/recording' },
];

const statusTone = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'принято' || s === 'проверено') return 'bg-emerald-50 text-emerald-700 border-emerald-300';
    if (s === 'на доработке') return 'bg-amber-50 text-amber-800 border-amber-300';
    if (s === 'не принято' || s === 'просрочено') return 'bg-rose-50 text-rose-700 border-rose-300';
    if (s === 'к проверке' || s === 'на проверке' || s === 'отправлено') return 'bg-sky-50 text-sky-700 border-sky-300';
    if (s === 'в работе' || s === 'черновик') return 'bg-slate-100 text-slate-700 border-slate-300';
    return 'bg-slate-100 text-slate-600 border-slate-300';
};

function shortStatusLabel(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('проверено')) return 'Проверено';
    if (s === 'принято') return 'Проверено';
    if (s === 'отправлено') return 'Отправлено';
    if (s === 'к проверке' || s === 'на проверке') return 'На проверке';
    if (s === 'на доработке') return 'На доработке';
    if (s === 'черновик' || s === 'в работе') return 'Черновик';
    if (s === 'не начато') return 'Не начато';
    if (s === 'просрочено' || s === 'не принято') return 'Просрочено';
    return status;
}

const Pill = ({ children, tone }) => (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
        {children}
    </span>
);

function RevisionCyclesMeter({ revisionCycles = 0, maxCycles = 3 }) {
    const used = Math.max(0, Number(revisionCycles) || 0);
    const max = Math.max(1, Number(maxCycles) || 3);
    return (
        <div className="w-[120px] self-end">
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>Правок</span>
                <span className="tabular-nums">{used}/{max}</span>
            </div>
        </div>
    );
}

export function detectTooManyRevisions(nextActionsText = '') {
    const lines = String(nextActionsText)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const numbered = lines.filter((l) => /^(\d+[\).\s-]|[-*])/.test(l)).length;
    return numbered > 3;
}

export function changeTaskStatus(setter, toStatus, actor = 'system', comment = '') {
    setter((prev) => ({
        ...prev,
        status: toStatus,
        lastStatusChangedAt: new Date().toLocaleString('ru-RU'),
        statusHistory: [
            ...prev.statusHistory,
            {
                id: `s-${Date.now()}`,
                fromStatus: prev.status,
                toStatus,
                changedAt: new Date().toLocaleString('ru-RU'),
                changedBy: actor,
                comment: comment || `Статус изменен на ${toStatus}`,
            },
        ],
    }));
}

export function addThreadMessage(setter, message) {
    setter((prev) => ({
        ...prev,
        threadMessages: [
            ...prev.threadMessages,
            {
                id: `m-${Date.now()}`,
                type: 'message',
                messageType: message.messageType || 'comment',
                authorName: message.authorName,
                authorRole: message.authorRole,
                createdAt: new Date().toLocaleString('ru-RU'),
                text: message.text,
                attachments: message.attachments || [],
                linkedStatusChange: message.linkedStatusChange || null,
                linkedVersionId: message.linkedVersionId || null,
                isUnreadForCurrentUser: false,
            },
        ],
    }));
}

export function uploadNewSubmissionVersion(setter, payload) {
    setter((prev) => {
        const nextVersion = (prev.submissionVersions?.length || 0) + 1;
        const nextList = (prev.submissionVersions || []).map((v) => ({ ...v, isCurrent: false }));
        const nextVersionItem = {
            id: `ver-${Date.now()}`,
            versionNumber: nextVersion,
            createdAt: new Date().toLocaleString('ru-RU'),
            authorRole: payload.authorRole || 'student',
            textContent: payload.textContent || '',
            attachments: payload.attachments || [],
            links: payload.links || [],
            isCurrent: true,
        };
        return {
            ...prev,
            submittedAt: new Date().toLocaleString('ru-RU'),
            submissionVersions: [...nextList, nextVersionItem],
            threadMessages: [
                ...prev.threadMessages,
                {
                    id: `sys-${Date.now()}`,
                    type: 'system',
                    authorName: 'Система',
                    authorRole: 'system',
                    createdAt: new Date().toLocaleString('ru-RU'),
                    text: `Загружена новая версия ответа v${nextVersion}.`,
                    attachments: [],
                    linkedStatusChange: null,
                    linkedVersionId: nextVersionItem.id,
                    isUnreadForCurrentUser: false,
                },
            ],
        };
    });
}

export function saveDraftSubmission(setDraft, text) {
    setDraft(text);
    localStorage.setItem('pvl_task_draft_v1', text || '');
}

export function submitForReview(setter) {
    changeTaskStatus(setter, 'к проверке', 'Участница', 'Отправлено на проверку');
}

function buildTaskHeaderDateParts(data) {
    const deadline = data.deadlineAt || '—';
    const st = String(data.status || '').toLowerCase();
    const accepted = st.includes('принят') || st.includes('проверено');
    const submitted = data.submittedAt && String(data.submittedAt).trim() && data.submittedAt !== '—';
    const acceptedAt = data.acceptedAt && String(data.acceptedAt).trim() && data.acceptedAt !== '—';
    const changed = data.lastStatusChangedAt && String(data.lastStatusChangedAt).trim() && data.lastStatusChangedAt !== '—';

    const second =
        accepted && acceptedAt
            ? { label: 'Принято', value: data.acceptedAt }
            : accepted && submitted
              ? { label: 'Принято', value: data.submittedAt }
              : submitted
                ? { label: 'Сдано', value: data.submittedAt }
                : changed
                  ? { label: 'Обновлено', value: data.lastStatusChangedAt }
                  : null;

    return { deadline, second };
}

export function TaskHeader({ data, onBack, backLabel = '← Назад в «Результаты»', showBackButton = true }) {
    const stLower = String(data.status || '').toLowerCase();
    const isDone = stLower.includes('принят') || stLower.includes('проверено');
    const isOverdue = data.deadlineAt && new Date(data.deadlineAt) < new Date() && !isDone;
    const { deadline, second } = buildTaskHeaderDateParts(data);
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            {showBackButton ? (
                <button type="button" onClick={onBack} className="text-xs text-slate-500 hover:text-slate-700 mb-2">{backLabel}</button>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-3xl text-slate-800">{data.title}</h2>
                    <p className="text-sm text-slate-500 mt-1">Модуль {data.moduleNumber ?? data.weekNumber} · {data.type}</p>
                </div>
                <div className="flex w-[132px] flex-col items-end gap-1">
                    <Pill tone={statusTone(data.status)}>{shortStatusLabel(data.status)}</Pill>
                    <span className="w-[120px] text-right text-xs tabular-nums text-slate-500">Оценка: {data.score}/{data.maxScore}</span>
                    <RevisionCyclesMeter revisionCycles={data.revisionCycles} maxCycles={3} />
                </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
                    <span>
                        Дедлайн: <span className="font-medium text-slate-800">{deadline}</span>
                    </span>
                    {second ? (
                        <span>
                            {second.label}: <span className="font-medium text-slate-800">{second.value}</span>
                        </span>
                    ) : null}
                </div>
            </div>
            {isOverdue ? <div className="mt-2 text-xs text-rose-700">Просрочен дедлайн сдачи.</div> : null}
        </div>
    );
}

/** Компактная шапка задания для ментора: только название, дедлайн, статус, оценка */
export function MentorTaskHeaderCompact({ data, onBack, backLabel, showBackButton = true }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            {showBackButton ? (
                <button type="button" onClick={onBack} className="text-xs text-[#9B8B80] hover:text-[#4A3728] mb-2">{backLabel}</button>
            ) : null}
            <h2 className="font-display text-2xl md:text-3xl text-[#4A3728]">{data.title}</h2>
            <div className="mt-3 rounded-xl border border-[#F0E6DC] bg-[#FAF6F2]/70 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#7A6758]">
                    <span>Дедлайн: <span className="font-medium text-[#4A3728]">{data.deadlineAt || '—'}</span></span>
                    <span className="inline-flex items-center gap-2">
                        <span>Статус</span>
                        <Pill tone={statusTone(data.status)}>{data.status}</Pill>
                    </span>
                    <span className="tabular-nums">Оценка: <span className="font-medium text-[#4A3728]">{data.score}/{data.maxScore}</span></span>
                    <div className="min-w-[150px]">
                        <RevisionCyclesMeter revisionCycles={data.revisionCycles} maxCycles={3} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function TaskMeta({ data }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Метаданные</h3>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Тип: {data.type}</div>
            </div>
        </div>
    );
}

function TaskRevisionSummary({ revisionCyclesFromHistory, storedRevisionCycles }) {
    const stored = Number(storedRevisionCycles);
    const n = Math.max(
        revisionCyclesFromHistory || 0,
        Number.isFinite(stored) ? stored : 0,
    );
    return (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-sm text-[#2C1810] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/75">Доработок (циклов)</div>
                    <div className="font-display text-2xl tabular-nums text-amber-950">{n}</div>
                </div>
                <p className="text-xs text-amber-950/80 max-w-xl leading-relaxed">
                    Счётчик совпадает с «Результаты»: каждый переход в «на доработке» увеличивает число. Стандартный ответ ментора — в блоке «Ответ ментора» и в ленте ниже.
                </p>
            </div>
        </div>
    );
}

export function TaskDescription({ data, showControlPointNote = false }) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-slate-800 mb-2">Задание</h3>
            <p className="text-sm text-slate-700">{data.summary}</p>
            <p className="text-sm mt-2"><strong>Ожидаемый артефакт:</strong> {data.artifact}</p>
            <p className="text-sm mt-2"><strong>Что загружать:</strong> {data.uploadTypes.join(', ')}</p>
            <div className="mt-2">
                <p className="text-sm font-medium text-slate-800">Критерии зачета:</p>
                <ul className="text-sm text-slate-700 list-disc pl-5">
                    {data.criteria.map((c) => <li key={c}>{c}</li>)}
                </ul>
            </div>
            <div className="mt-2">
                <p className="text-sm font-medium text-slate-800">Подсказки:</p>
                <ul className="text-sm text-slate-700 list-disc pl-5">
                    {data.hints.map((h) => <li key={h}>{h}</li>)}
                </ul>
            </div>
            {showControlPointNote ? (
                <div className="mt-2 text-xs text-slate-500">Это контрольная точка: влияет на блок баллов и дедлайнов.</div>
            ) : null}
        </div>
    );
}

export function SubmissionVersionCard({ version, checklistSections, homeworkAssignmentType = 'standard', questionnaireBlocks = [] }) {
    const hasChecklist = version?.answersJson && typeof version.answersJson === 'object' && Object.keys(version.answersJson).length > 0;
    const showQuestionnaire = homeworkAssignmentType === 'questionnaire' && Array.isArray(questionnaireBlocks) && questionnaireBlocks.length > 0;
    return (
        <article className={`rounded-xl border p-3 ${version.isCurrent ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/70'}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-sm font-medium text-slate-800">Версия {version.versionNumber}</div>
                {version.isCurrent ? <span className="text-[10px] uppercase tracking-[0.08em] text-emerald-700">текущая</span> : null}
            </div>
            <p className="text-xs text-slate-500">{version.createdAt} · {version.authorRole}</p>
            {showQuestionnaire ? (
                <QuestionnaireAnswersReadonly blocks={questionnaireBlocks} answersJson={version.answersJson} />
            ) : hasChecklist && checklistSections?.length ? (
                <ChecklistAnswersReadonly sections={checklistSections} answersJson={version.answersJson} />
            ) : (
                <div
                    className="text-sm text-slate-700 mt-1 max-w-none [&_h2]:text-xl [&_h3]:text-lg [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_img]:max-w-full"
                    dangerouslySetInnerHTML={{
                        __html: homeworkAnswerPlainText(version.textContent)
                            ? sanitizeHomeworkAnswerHtml(version.textContent)
                            : '<p class="text-slate-400">—</p>',
                    }}
                />
            )}
            {version.attachments?.length ? <p className="text-xs text-slate-500 mt-1">Файлы: {version.attachments.join(', ')}</p> : null}
            {version.links?.length ? <p className="text-xs text-slate-500 mt-1">Ссылки: {version.links.join(', ')}</p> : null}
        </article>
    );
}

export function renderSubmissionVersions(versions, checklistSections, homeworkAssignmentType, questionnaireBlocks) {
    return versions.map((version) => (
        <SubmissionVersionCard
            key={version.id}
            version={version}
            checklistSections={checklistSections}
            homeworkAssignmentType={homeworkAssignmentType}
            questionnaireBlocks={questionnaireBlocks}
        />
    ));
}

export function SubmissionHistory({
    versions,
    role,
    onSaveDraft,
    onSubmit,
    draftText,
    setDraftText,
    canEditStudentSubmission = true,
    homeworkAssignmentType = 'standard',
    checklistSections = [],
    questionnaireBlocks = [],
    checklistAnswers = {},
    setChecklistAnswers,
}) {
    const currentVersion = versions.find((v) => v.isCurrent) || versions[versions.length - 1];
    const previousVersions = versions.filter((v) => v.id !== currentVersion?.id).sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    const isChecklist = homeworkAssignmentType === 'checklist' && Array.isArray(checklistSections) && checklistSections.length > 0;
    const isQuestionnaire = homeworkAssignmentType === 'questionnaire' && Array.isArray(questionnaireBlocks) && questionnaireBlocks.length > 0;
    const isStructured = isChecklist || isQuestionnaire;
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-slate-800 mb-2">Ответ участницы</h3>
            {currentVersion ? (
                <div>
                    <p className="text-xs text-slate-500 mb-2">Текущая версия</p>
                    <SubmissionVersionCard
                        version={currentVersion}
                        checklistSections={checklistSections}
                        homeworkAssignmentType={homeworkAssignmentType}
                        questionnaireBlocks={questionnaireBlocks}
                    />
                </div>
            ) : null}
            {previousVersions.length > 0 ? (
                <details className="mt-3">
                    <summary className="text-xs text-slate-600 cursor-pointer">Предыдущие версии ({previousVersions.length})</summary>
                    <div className="grid gap-2 mt-2">{previousVersions.map((version) => (
                        <SubmissionVersionCard
                            key={version.id}
                            version={version}
                            checklistSections={checklistSections}
                            homeworkAssignmentType={homeworkAssignmentType}
                            questionnaireBlocks={questionnaireBlocks}
                        />
                    ))}</div>
                </details>
            ) : null}
            {role === 'student' ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                    {canEditStudentSubmission ? (
                        <>
                            {isQuestionnaire && setChecklistAnswers ? (
                                <QuestionnaireFieldsEditor
                                    blocks={questionnaireBlocks}
                                    value={checklistAnswers}
                                    onChange={setChecklistAnswers}
                                    disabled={false}
                                />
                            ) : isChecklist && setChecklistAnswers ? (
                                <ChecklistFieldsEditor
                                    sections={checklistSections}
                                    value={checklistAnswers}
                                    onChange={setChecklistAnswers}
                                    disabled={false}
                                />
                            ) : (
                                <RichEditor
                                    value={draftText}
                                    onChange={setDraftText}
                                    placeholder="Черновик ответа: заголовки, жирный, курсив, подчёркивание, списки, таблица. Картинки — только загрузкой файла."
                                    variant="student"
                                    onUploadImage={pvlReadImageFileAsDataUrl}
                                />
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={() => (isStructured ? onSaveDraft() : onSaveDraft(draftText))}
                                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50"
                                >
                                    Сохранить черновик
                                </button>
                                <button type="button" onClick={onSubmit} className="text-xs rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800 hover:bg-emerald-100">Отправить на проверку</button>
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-slate-500">
                            Ответ уже отправлен и ожидает решения ментора. Редактирование откроется, если ментор вернет работу на доработку.
                        </p>
                    )}
                </div>
            ) : (
                <div className="mt-3 text-xs text-slate-500">Для ментора: доступны просмотр всех версий, скачивание вложений и сравнение последней и предыдущей.</div>
            )}
        </div>
    );
}

export function renderStatusTimeline(history) {
    return history.map((h) => (
        <div key={h.id} className="flex gap-2 items-start">
            <div className="mt-1 w-2 h-2 rounded-full bg-[#C8855A]" />
            <div>
                <p className="text-sm text-[#2C1810]">{h.fromStatus || '—'} → <strong>{h.toStatus}</strong></p>
                <p className="text-xs text-[#9B8B80]">{h.changedAt} · {h.changedBy}</p>
                {h.comment ? <p className="text-xs text-[#9B8B80]">{h.comment}</p> : null}
            </div>
        </div>
    ));
}

export function StatusTimeline({ history }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Статус и история</h3>
            <div className="space-y-2">{renderStatusTimeline(history)}</div>
        </div>
    );
}

export function renderCommentsThread(messages) {
    const visibleMessages = messages || [];
    return visibleMessages.map((m) => (
        <article key={m.id} className={`rounded-xl border p-3 ${m.authorRole === 'mentor' ? 'bg-emerald-50/30 border-emerald-200/70' : m.authorRole === 'system' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`${m.authorRole === 'system' ? 'text-[10px] text-slate-400' : 'text-[10px] font-semibold uppercase tracking-wider text-slate-500'}`}>{threadEventLabel(m.messageType)}</span>
                    <p className={`${m.authorRole === 'system' ? 'text-xs text-slate-500' : 'text-sm font-medium text-slate-800'}`}>{m.authorName} <span className="text-xs text-slate-500 font-normal">({m.authorRole})</span></p>
                </div>
                <p className={`${m.authorRole === 'system' ? 'text-[10px] text-slate-400' : 'text-xs text-slate-500'}`}>{m.createdAt}</p>
            </div>
            <p className={`mt-1 ${m.authorRole === 'system' ? 'text-xs text-slate-500' : 'text-sm text-slate-700'}`}>{m.text}</p>
            {m.attachments?.length ? <p className="text-xs text-slate-500 mt-1">Вложения: {m.attachments.join(', ')}</p> : null}
            {m.isUnreadForCurrentUser ? <p className="text-xs text-rose-700 mt-1">Новое</p> : null}
        </article>
    ));
}

export function CommentsThread({
    messages,
    onSend,
    role,
    disputeOpen,
    threadLocked,
    onOpenDispute,
}) {
    const [message, setMessage] = useState('');
    const disputeMode = disputeOpen;
    const showComposer = role !== 'student' && (!threadLocked || disputeMode);
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-slate-800 mb-1">Лента по заданию</h3>
            <p className="text-xs text-slate-500 mb-3">Сообщения, проверка и системные события по заданию.</p>
            <div className="grid gap-2">{renderCommentsThread(messages)}</div>
            {threadLocked && !disputeMode ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
                    <p className="mb-2">Работа принята и закрыта. Обычные сообщения по заданию отключены.</p>
                    <button
                        type="button"
                        onClick={() => onOpenDispute?.()}
                        className="text-xs rounded-full border border-amber-700/40 bg-white px-4 py-2 text-amber-900 hover:bg-amber-100/80"
                    >
                        Открыть спор по оценке
                    </button>
                </div>
            ) : null}
            {role === 'student' ? (
                <p className="mt-3 text-xs text-slate-500">
                    Лента только для уведомлений и ответов ментора по заданию.
                </p>
            ) : null}
            {disputeMode ? (
                <p className="mt-3 text-xs text-slate-600">Открыт спор — пишите только по сути расхождения с оценкой или проверкой.</p>
            ) : null}
            {showComposer ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 p-3 text-sm"
                        placeholder={disputeMode ? 'Сообщение в рамках спора…' : 'Написать комментарий…'}
                    />
                    <div className="mt-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (!message.trim()) return;
                                onSend({
                                    authorName: role === 'mentor' ? 'Ментор' : 'Участница',
                                    authorRole: role,
                                    text: message.trim(),
                                    attachments: [],
                                    disputeOnly: disputeMode,
                                });
                                setMessage('');
                            }}
                            className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50"
                        >
                            {disputeMode ? 'Отправить в споре' : 'Отправить сообщение'}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function renderMentorResponseForm(form, setForm, onSave) {
    const warning = detectTooManyRevisions(form.nextActions);
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Ответ ментора</h3>
            <div className="grid gap-2">
                <textarea value={form.strengths} onChange={(e) => setForm((p) => ({ ...p, strengths: e.target.value }))} rows={3} className="w-full rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Что уже хорошо работает" />
                <textarea value={form.blockers} onChange={(e) => setForm((p) => ({ ...p, blockers: e.target.value }))} rows={3} className="w-full rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Что блокирует зачет следующего этапа" />
                <textarea value={form.nextActions} onChange={(e) => setForm((p) => ({ ...p, nextActions: e.target.value }))} rows={3} className="w-full rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="1–3 конкретных действия до следующей точки" />
                {warning ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                        В брифе рекомендован лимит до 3 правок в одном ответе. Проверь, не перегружает ли это участницу.
                    </div>
                ) : null}
                <select value={form.statusDecision} onChange={(e) => setForm((p) => ({ ...p, statusDecision: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="принято">принято</option>
                    <option value="на доработке">на доработке</option>
                    <option value="не принято">не принято</option>
                </select>
                <textarea value={form.generalComment} onChange={(e) => setForm((p) => ({ ...p, generalComment: e.target.value }))} rows={3} className="w-full rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Общий комментарий" />
                <button onClick={onSave} className="w-fit text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">
                    Сохранить ответ и обновить статус
                </button>
                <p className="text-xs text-[#9B8B80]">Подсказка: критика должна быть привязана к критерию или стандарту.</p>
            </div>
        </div>
    );
}

export function MentorResponseForm({ role, form, setForm, onSave }) {
    if (role !== 'mentor') return null;
    return renderMentorResponseForm(form, setForm, onSave);
}

export function ControlPointMeta({ taskData }) {
    if (!taskData.isControlPoint) return null;
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Контрольная точка</h3>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">ID: {controlPointMeta.id}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Дедлайн: {controlPointMeta.deadlineAt}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Влияет на баллы: {controlPointMeta.affectsPoints ? 'да' : 'нет'}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Влияет на допуск: {controlPointMeta.affectsAdmission ? 'да' : 'нет'}</div>
            </div>
            <p className="text-xs text-[#9B8B80] mt-2">{controlPointMeta.specialNote}</p>
        </div>
    );
}

export function RelatedLinks() {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Связанные элементы</h3>
            <div className="flex flex-wrap gap-2">
                {relatedLinks.map((item) => (
                    <a key={item.id} href={item.href} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">
                        {item.label}
                    </a>
                ))}
            </div>
        </div>
    );
}

export function MentorStudentAnswerCompact({
    versions = [],
    checklistSections = [],
    questionnaireBlocks = [],
    homeworkAssignmentType = 'standard',
}) {
    const current = versions.find((v) => v.isCurrent) || versions[versions.length - 1];
    if (!current) {
        return (
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-xl text-[#4A3728] mb-2">Ответ участницы</h3>
                <p className="text-sm text-[#9B8B80]">Пока нет отправленной версии.</p>
            </div>
        );
    }
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-xl text-[#4A3728] mb-2">Ответ участницы</h3>
            <SubmissionVersionCard
                version={current}
                checklistSections={checklistSections}
                homeworkAssignmentType={homeworkAssignmentType}
                questionnaireBlocks={questionnaireBlocks}
            />
        </div>
    );
}

function MentorTaskSlim({
    state,
    onBack,
    backLabel,
    navigate,
    onMentorReview,
    onRefresh,
    mentorRoutePrefix = '/mentor',
    showHeaderBack = true,
}) {
    const td = state.taskDetail;
    const [reply, setReply] = useState('');
    const [scoreInput, setScoreInput] = useState(() => String(td.maxScore != null ? td.maxScore : ''));
    const [formError, setFormError] = useState('');
    const accepted = String(td.status || '').toLowerCase() === 'принято';

    const sendRevision = () => {
        setFormError('');
        if (!reply.trim()) {
            setFormError('Напишите ответ участнице для доработки.');
            return;
        }
        onMentorReview?.({
            statusDecision: 'на доработке',
            generalComment: reply.trim(),
            nextActions: [reply.trim()],
            strengths: '',
            blockers: '',
        });
        onRefresh?.();
    };

    const sendAccept = () => {
        setFormError('');
        const sc = Number(String(scoreInput).replace(',', '.'));
        if (!Number.isFinite(sc) || sc < 0) {
            setFormError('При принятии работы укажите оценку в баллах.');
            return;
        }
        if (td.maxScore != null && sc > td.maxScore) {
            setFormError(`Оценка не может быть больше ${td.maxScore}.`);
            return;
        }
        onMentorReview?.({
            statusDecision: 'принято',
            generalComment: reply.trim() || 'Принято.',
            nextActions: [],
            strengths: '',
            blockers: '',
            scoreAwarded: sc,
        });
        onRefresh?.();
    };

    const openLesson = () => {
        if (typeof navigate === 'function') {
            if (td.linkedLessonId) {
                navigate(`${mentorRoutePrefix}/library/${td.linkedLessonId}`);
                return;
            }
            navigate(`${mentorRoutePrefix}/library`);
        }
    };

    return (
        <div className="space-y-4">
            <MentorTaskHeaderCompact data={td} onBack={onBack} backLabel={backLabel} showBackButton={showHeaderBack} />
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={openLesson}
                    className="text-sm rounded-full border border-[#E8D5C4] bg-[#FAF6F2] px-4 py-2 text-[#4A3728] hover:bg-[#F5EDE6]"
                >
                    {td.linkedLessonTitle ? `Открыть урок: ${td.linkedLessonTitle}` : 'Открыть урок в библиотеке курса'}
                </button>
                <p className="text-xs text-[#9B8B80] max-w-xl">Открывает отдельный урок как материал в библиотеке, а не общий трекер.</p>
            </div>
            <TaskDescription data={state.taskDescription} showControlPointNote={false} />
            <MentorStudentAnswerCompact
                versions={state.submissionVersions}
                checklistSections={state.taskDescription?.checklistSections || []}
                questionnaireBlocks={state.taskDescription?.questionnaireBlocks || []}
                homeworkAssignmentType={state.taskDescription?.homeworkAssignmentType || 'standard'}
            />
            {!accepted ? (
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 space-y-3">
                    <h3 className="font-display text-xl text-[#4A3728]">Ответ ментора</h3>
                    <p className="text-xs text-[#9B8B80]">Единое поле ответа: фиксируйте решение (принять / доработка), критерии и следующий шаг — это же уйдёт участнице в ленту.</p>
                    <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-[#E8D5C4] p-3 text-sm"
                        placeholder="Комментарий для участницы…"
                    />
                    <div>
                        <label className="text-xs text-[#9B8B80] block mb-1">Оценка при принятии (макс. {td.maxScore ?? '—'})</label>
                        <input
                            type="number"
                            min={0}
                            max={td.maxScore ?? undefined}
                            value={scoreInput}
                            onChange={(e) => setScoreInput(e.target.value)}
                            className="w-full max-w-[200px] rounded-xl border border-[#E8D5C4] p-2 text-sm tabular-nums"
                        />
                    </div>
                    {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            type="button"
                            onClick={sendRevision}
                            className="text-sm rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-amber-950 hover:bg-amber-100"
                        >
                            Отправить на доработку
                        </button>
                        <button
                            type="button"
                            onClick={sendAccept}
                            className="text-sm rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-900 hover:bg-emerald-100"
                        >
                            Принять
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-[#9B8B80]">Работа принята.</p>
            )}
        </div>
    );
}

export function renderTaskDetail({
    role = 'student',
    state,
    onBack,
    onChangeStatus,
    onSendThreadMessage,
    onSaveDraft,
    onSubmitForReview,
    draftText,
    setDraftText,
    mentorForm,
    setMentorForm,
    onSaveMentorForm,
    backLabel,
    showHeaderBack = true,
    threadLocked,
    disputeOpen,
    onOpenDispute,
    canEditStudentSubmission,
    homeworkAssignmentType = 'standard',
    checklistSections = [],
    questionnaireBlocks = [],
    checklistAnswers = {},
    setChecklistAnswers,
}) {
    return (
        <div className="space-y-3">
            <TaskHeader data={state.taskDetail} onBack={onBack} backLabel={backLabel} showBackButton={showHeaderBack} />
            <TaskDescription data={state.taskDescription} showControlPointNote={false} />
            <SubmissionHistory
                versions={state.submissionVersions}
                role={role}
                onSaveDraft={onSaveDraft}
                onSubmit={onSubmitForReview}
                draftText={draftText}
                setDraftText={setDraftText}
                canEditStudentSubmission={canEditStudentSubmission}
                homeworkAssignmentType={homeworkAssignmentType}
                checklistSections={checklistSections}
                questionnaireBlocks={questionnaireBlocks}
                checklistAnswers={checklistAnswers}
                setChecklistAnswers={setChecklistAnswers}
            />
            <CommentsThread
                messages={state.threadMessages}
                onSend={onSendThreadMessage}
                role={role}
                threadLocked={threadLocked}
                disputeOpen={disputeOpen}
                onOpenDispute={onOpenDispute}
            />
            <MentorResponseForm role={role} form={mentorForm} setForm={setMentorForm} onSave={onSaveMentorForm} />
        </div>
    );
}

export default function PvlTaskDetailView({
    role = 'student',
    onBack,
    initialData = null,
    onStudentSaveDraft,
    onStudentSubmit,
    onStudentReply,
    onMentorReply,
    onMentorReview,
    taskStudentId,
    taskId,
    mentorActorId,
    onRefresh,
    navigate,
    mentorRoutePrefix = '/mentor',
    showHeaderBack = true,
    backLabelOverride,
}) {
    const [state, setState] = useState({
        taskDetail: initialData?.taskDetail || { ...taskDetail },
        taskDescription: initialData?.taskDescription || { ...taskDescription },
        submissionVersions: initialData?.submissionVersions || [...submissionVersions],
        statusHistory: initialData?.statusHistory || [...statusHistory],
        threadMessages: initialData?.threadMessages || [...threadMessages],
    });
    const [draftText, setDraftText] = useState(localStorage.getItem('pvl_task_draft_v1') || '');
    const [mentorForm, setMentorForm] = useState({ ...mentorReview });

    const homeworkAssignmentType = initialData?.taskDescription?.homeworkAssignmentType || 'standard';
    const checklistSections = initialData?.taskDescription?.checklistSections || [];
    const questionnaireBlocks = initialData?.taskDescription?.questionnaireBlocks || [];

    const getInitialChecklistAnswers = (data) => {
        const vers = data?.submissionVersions || [];
        const v = vers.find((x) => x.isDraft) || vers.find((x) => x.isCurrent);
        return v?.answersJson && typeof v.answersJson === 'object' ? { ...v.answersJson } : {};
    };
    const [checklistAnswers, setChecklistAnswers] = useState(() => getInitialChecklistAnswers(initialData));

    const threadLocked = (state.taskDetail.isAcceptedWork || state.taskDetail.status === 'принято') && !state.taskDetail.disputeOpen;
    const disputeOpen = !!state.taskDetail.disputeOpen;
    const canEditStudentSubmission = useMemo(() => {
        if (role !== 'student') return false;
        const s = String(state.taskDetail.status || '').toLowerCase();
        if (s.includes('отправлен')) return false;
        if (s.includes('на проверке') || s.includes('к проверке')) return false;
        if (s.includes('принят') || s.includes('проверено')) return false;
        return s === 'на доработке' || s === 'черновик' || s === 'в работе' || s === 'не начато';
    }, [role, state.taskDetail.status]);

    const handleOpenDispute = () => {
        if (role === 'mentor' && mentorActorId && taskStudentId && taskId) {
            pvlDomainApi.mentorApi.openTaskDispute(mentorActorId, taskStudentId, taskId);
        } else if (role === 'student' && taskStudentId && taskId) {
            pvlDomainApi.studentApi.openStudentTaskDispute(taskStudentId, taskId);
        }
        onRefresh?.();
    };

    const handleSendThreadMessage = (message) => {
        const sid = taskStudentId;
        const tid = taskId || state.taskDetail.id;
        if (sid && tid && !pvlDomainApi.helpers.canPostTaskThread(sid, tid, { disputeOnly: !!message.disputeOnly })) {
            return;
        }
        if (role === 'mentor' && onMentorReply) {
            onMentorReply(message);
            return;
        }
        if (role === 'student' && onStudentReply) {
            onStudentReply(message);
            return;
        }
        addThreadMessage(setState, { ...message, messageType: message.disputeOnly ? 'dispute_comment' : 'comment' });
    };

    const handleSaveMentorForm = () => {
        const warningTooManyRevisions = detectTooManyRevisions(mentorForm.nextActions);
        const decision = mentorForm.statusDecision || 'на доработке';
        if (onMentorReview) {
            onMentorReview({
                statusDecision: decision,
                strengths: mentorForm.strengths,
                blockers: mentorForm.blockers,
                nextActions: mentorForm.nextActions
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                generalComment: mentorForm.generalComment,
            });
            setMentorForm((prev) => ({ ...prev, warningTooManyRevisions }));
            return;
        }
        changeTaskStatus(setState, decision, 'Ментор', mentorForm.generalComment);
        addThreadMessage(setState, {
            authorName: 'Ментор',
            authorRole: 'mentor',
            messageType: 'mentor_review',
            text: `${mentorForm.strengths}\n\n${mentorForm.blockers}\n\n${mentorForm.nextActions}`,
            attachments: [],
        });
        setMentorForm((prev) => ({ ...prev, warningTooManyRevisions }));
    };

    const backLabel =
        backLabelOverride
        || (
        role === 'mentor'
            ? mentorRoutePrefix === '/admin'
                ? '← К карточке ученицы'
                : '← К карточке менти'
            : '← Назад в «Результаты»'
            );

    const showReviewAck =
        role === 'student'
        && taskStudentId
        && taskId
        && String(state.taskDetail.status || '').toLowerCase().includes('проверено');

    if (role === 'mentor') {
        return (
            <div className="space-y-3">
                <MentorTaskSlim
                    state={state}
                    onBack={onBack}
                    backLabel={backLabel}
                    navigate={navigate}
                    onMentorReview={onMentorReview}
                    onRefresh={onRefresh}
                    mentorRoutePrefix={mentorRoutePrefix}
                    showHeaderBack={showHeaderBack}
                />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {showReviewAck ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/90 p-4 text-sm text-indigo-950 shadow-sm">
                    <p className="font-medium">Работа проверена — посмотрите оценку и комментарии ментора в ленте ниже.</p>
                    <button
                        type="button"
                        onClick={() => {
                            pvlDomainApi.studentApi.acknowledgeStudentTaskReview(taskStudentId, taskId);
                            onRefresh?.();
                        }}
                        className="mt-3 text-xs rounded-full bg-indigo-700 text-white px-4 py-2 hover:bg-indigo-800"
                    >
                        Ознакомилась с оценкой
                    </button>
                </div>
            ) : null}
            {renderTaskDetail({
                role,
                state,
                onBack,
                backLabel,
                showHeaderBack,
                threadLocked,
                disputeOpen,
                onOpenDispute: handleOpenDispute,
                onChangeStatus: (status, comment) => changeTaskStatus(setState, status, role === 'mentor' ? 'Ментор' : 'Участница', comment),
                onSendThreadMessage: handleSendThreadMessage,
                onSaveDraft: (arg) => {
                    if (homeworkAssignmentType === 'checklist' || homeworkAssignmentType === 'questionnaire') {
                        if (onStudentSaveDraft) onStudentSaveDraft({ textContent: '', answersJson: checklistAnswers });
                        return;
                    }
                    const text = typeof arg === 'string' ? arg : draftText;
                    saveDraftSubmission(setDraftText, text);
                    if (onStudentSaveDraft) onStudentSaveDraft({ textContent: text });
                },
                onSubmitForReview: () => {
                    if (!canEditStudentSubmission) return;
                    if (homeworkAssignmentType === 'checklist' || homeworkAssignmentType === 'questionnaire') {
                        if (onStudentSubmit) onStudentSubmit({ textContent: '', answersJson: checklistAnswers });
                        return;
                    }
                    submitForReview(setState);
                    if (onStudentSubmit) onStudentSubmit({ textContent: draftText });
                },
                draftText,
                setDraftText,
                canEditStudentSubmission,
                homeworkAssignmentType,
                checklistSections,
                questionnaireBlocks,
                checklistAnswers,
                setChecklistAnswers,
                mentorForm,
                setMentorForm,
                onSaveMentorForm: handleSaveMentorForm,
            })}
        </div>
    );
}

