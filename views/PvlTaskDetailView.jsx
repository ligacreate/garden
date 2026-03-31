import React, { useMemo, useState } from 'react';

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
    specialNote: 'Неделя 6 содержит 3 отдельные контрольные точки: КТ4, КТ5, КТ6.',
};

const relatedLinks = [
    { id: 'rl1', label: 'Неделя курса', href: '#/course/week/6' },
    { id: 'rl2', label: 'Связанный урок', href: '#/lesson/lesson-m2-scenario-logic' },
    { id: 'rl3', label: 'Практикум с ментором', href: '#/mentor-practice/practice-scenario-workshop' },
    { id: 'rl4', label: 'Соседнее задание недели', href: '#/results/task-kt5-mini-run' },
    { id: 'rl5', label: 'Сертификация', href: '#/certification/recording' },
];

const statusTone = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'принято') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (s === 'на доработке') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'не принято' || s === 'просрочено') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (s === 'к проверке' || s === 'отправлено') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    if (s === 'в работе') return 'bg-indigo-50 text-indigo-700 border-indigo-600/30';
    return 'bg-slate-100 text-slate-600 border-slate-300';
};

const Pill = ({ children, tone }) => (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
        {children}
    </span>
);

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

export function TaskHeader({ data, onBack }) {
    const isOverdue = data.deadlineAt && new Date(data.deadlineAt) < new Date() && data.status !== 'принято';
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <button onClick={onBack} className="text-xs text-[#9B8B80] hover:text-[#4A3728] mb-2">← Назад в «Результаты»</button>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-3xl text-[#4A3728]">{data.title}</h2>
                    <p className="text-sm text-[#9B8B80] mt-1">Неделя {data.weekNumber} · Модуль {data.moduleNumber} · {data.type}</p>
                </div>
                <Pill tone={statusTone(data.status)}>{data.status}</Pill>
            </div>
            <div className="grid md:grid-cols-4 gap-2 mt-3 text-sm">
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Дедлайн: {data.deadlineAt}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Отправка: {data.submittedAt || '—'}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Статус обновлен: {data.lastStatusChangedAt}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Баллы: {data.score}/{data.maxScore}</div>
            </div>
            {isOverdue ? <div className="mt-2 text-xs text-rose-700">Есть индикатор просрочки по дедлайну.</div> : null}
        </div>
    );
}

export function TaskMeta({ data }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Метаданные</h3>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Тип: {data.type}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Контрольная точка: {data.isControlPoint ? 'да' : 'нет'}</div>
            </div>
        </div>
    );
}

export function TaskDescription({ data }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Описание задания</h3>
            <p className="text-sm text-[#2C1810]">{data.summary}</p>
            <p className="text-sm mt-2"><strong>Ожидаемый артефакт:</strong> {data.artifact}</p>
            <p className="text-sm mt-2"><strong>Что загружать:</strong> {data.uploadTypes.join(', ')}</p>
            <div className="mt-2">
                <p className="text-sm font-medium text-[#4A3728]">Критерии зачета:</p>
                <ul className="text-sm text-[#2C1810] list-disc pl-5">
                    {data.criteria.map((c) => <li key={c}>{c}</li>)}
                </ul>
            </div>
            <div className="mt-2">
                <p className="text-sm font-medium text-[#4A3728]">Подсказки:</p>
                <ul className="text-sm text-[#2C1810] list-disc pl-5">
                    {data.hints.map((h) => <li key={h}>{h}</li>)}
                </ul>
            </div>
            {taskDetail.isControlPoint ? (
                <div className="mt-2 text-xs text-[#9B8B80]">Это контрольная точка: влияет на блок баллов и дедлайнов.</div>
            ) : null}
        </div>
    );
}

export function SubmissionVersionCard({ version }) {
    return (
        <article className={`rounded-xl border p-3 ${version.isCurrent ? 'border-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] bg-[#FAF6F2]'}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-sm font-medium text-[#4A3728]">Версия {version.versionNumber}</div>
                {version.isCurrent ? <span className="text-[10px] uppercase tracking-[0.08em] text-[#C8855A]">текущая</span> : null}
            </div>
            <p className="text-xs text-[#9B8B80]">{version.createdAt} · {version.authorRole}</p>
            <p className="text-sm text-[#2C1810] mt-1">{version.textContent}</p>
            {version.attachments?.length ? <p className="text-xs text-[#9B8B80] mt-1">Файлы: {version.attachments.join(', ')}</p> : null}
            {version.links?.length ? <p className="text-xs text-[#9B8B80] mt-1">Ссылки: {version.links.join(', ')}</p> : null}
        </article>
    );
}

export function renderSubmissionVersions(versions) {
    return versions.map((version) => <SubmissionVersionCard key={version.id} version={version} />);
}

export function SubmissionHistory({ versions, role, onUploadVersion, onSaveDraft, onSubmit, draftText, setDraftText }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Ответ участницы</h3>
            <div className="grid gap-2">{renderSubmissionVersions(versions)}</div>
            {role === 'student' ? (
                <div className="mt-3 border-t border-[#F5EDE6] pt-3">
                    <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="w-full rounded-xl border border-[#E8D5C4] p-2 text-sm"
                        rows={4}
                        placeholder="Черновик ответа..."
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => onSaveDraft(draftText)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Сохранить черновик</button>
                        <button onClick={() => onUploadVersion({ textContent: draftText, authorRole: 'student', attachments: ['new_version.docx'] })} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Добавить новую версию</button>
                        <button onClick={onSubmit} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Отправить на проверку</button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 text-xs text-[#9B8B80]">Для ментора: доступны просмотр всех версий, скачивание вложений и сравнение последней и предыдущей.</div>
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
    return messages.map((m) => (
        <article key={m.id} className={`rounded-xl border p-3 ${m.authorRole === 'mentor' ? 'bg-[#FAF6F2] border-[#E8D5C4]' : m.authorRole === 'system' ? 'bg-slate-50 border-slate-200' : 'bg-white border-[#E8D5C4]'}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#4A3728]">{m.authorName} <span className="text-xs text-[#9B8B80]">({m.authorRole})</span></p>
                <p className="text-xs text-[#9B8B80]">{m.createdAt}</p>
            </div>
            <p className="text-sm text-[#2C1810] mt-1">{m.text}</p>
            {m.attachments?.length ? <p className="text-xs text-[#9B8B80] mt-1">Вложения: {m.attachments.join(', ')}</p> : null}
            {m.isUnreadForCurrentUser ? <p className="text-xs text-rose-700 mt-1">Новое</p> : null}
        </article>
    ));
}

export function CommentsThread({ messages, onSend, role }) {
    const [message, setMessage] = useState('');
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Комментарии и тред</h3>
            <div className="grid gap-2">{renderCommentsThread(messages)}</div>
            <div className="mt-3 border-t border-[#F5EDE6] pt-3">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Написать комментарий..." />
                <div className="mt-2">
                    <button
                        onClick={() => {
                            if (!message.trim()) return;
                            onSend({
                                authorName: role === 'mentor' ? 'Ментор' : 'Участница',
                                authorRole: role,
                                text: message.trim(),
                                attachments: [],
                            });
                            setMessage('');
                        }}
                        className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]"
                    >
                        Отправить сообщение
                    </button>
                </div>
            </div>
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

export function renderTaskDetail({
    role = 'student',
    state,
    onBack,
    onChangeStatus,
    onSendThreadMessage,
    onUploadVersion,
    onSaveDraft,
    onSubmitForReview,
    draftText,
    setDraftText,
    mentorForm,
    setMentorForm,
    onSaveMentorForm,
}) {
    return (
        <div className="space-y-3">
            <TaskHeader data={state.taskDetail} onBack={onBack} />
            <TaskMeta data={state.taskDetail} />
            <TaskDescription data={state.taskDescription} />
            <SubmissionHistory
                versions={state.submissionVersions}
                role={role}
                onUploadVersion={onUploadVersion}
                onSaveDraft={onSaveDraft}
                onSubmit={onSubmitForReview}
                draftText={draftText}
                setDraftText={setDraftText}
            />
            <StatusTimeline history={state.statusHistory} />
            <CommentsThread messages={state.threadMessages} onSend={onSendThreadMessage} role={role} />
            <MentorResponseForm role={role} form={mentorForm} setForm={setMentorForm} onSave={onSaveMentorForm} />
            <ControlPointMeta taskData={state.taskDetail} />
            <RelatedLinks />
            {/* Open questions:
               1) порог допуска к СЗ: 400 или 500
               2) ручной бонус ментора: в карточке задания или только в админ-логике
               3) можно ли участнице редактировать отправленную версию до открытия проверки ментором
               4) финальный список допустимых типов файлов по артефактам
            */}
        </div>
    );
}

export default function PvlTaskDetailView({ role = 'student', onBack }) {
    const [state, setState] = useState({
        taskDetail: { ...taskDetail },
        taskDescription: { ...taskDescription },
        submissionVersions: [...submissionVersions],
        statusHistory: [...statusHistory],
        threadMessages: [...threadMessages],
    });
    const [draftText, setDraftText] = useState(localStorage.getItem('pvl_task_draft_v1') || '');
    const [mentorForm, setMentorForm] = useState({ ...mentorReview });

    const revisionCycles = useMemo(
        () => state.statusHistory.filter((h) => h.toStatus === 'на доработке').length,
        [state.statusHistory]
    );

    const handleSendThreadMessage = (message) => {
        addThreadMessage(setState, message);
    };

    const handleUploadVersion = (payload) => {
        uploadNewSubmissionVersion(setState, payload);
    };

    const handleSaveMentorForm = () => {
        const warningTooManyRevisions = detectTooManyRevisions(mentorForm.nextActions);
        const decision = mentorForm.statusDecision || 'на доработке';
        changeTaskStatus(setState, decision, 'Ментор', mentorForm.generalComment);
        addThreadMessage(setState, {
            authorName: 'Ментор',
            authorRole: 'mentor',
            text: `${mentorForm.strengths}\n\n${mentorForm.blockers}\n\n${mentorForm.nextActions}`,
            attachments: [],
        });
        setMentorForm((prev) => ({ ...prev, warningTooManyRevisions }));
    };

    return (
        <div className="space-y-3">
            {role === 'mentor' ? (
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3 text-xs text-[#9B8B80]">
                    Циклов доработки: {revisionCycles}
                </div>
            ) : null}
            {renderTaskDetail({
                role,
                state,
                onBack,
                onChangeStatus: (status, comment) => changeTaskStatus(setState, status, role === 'mentor' ? 'Ментор' : 'Участница', comment),
                onSendThreadMessage: handleSendThreadMessage,
                onUploadVersion: handleUploadVersion,
                onSaveDraft: (text) => saveDraftSubmission(setDraftText, text),
                onSubmitForReview: () => submitForReview(setState),
                draftText,
                setDraftText,
                mentorForm,
                setMentorForm,
                onSaveMentorForm: handleSaveMentorForm,
            })}
        </div>
    );
}

