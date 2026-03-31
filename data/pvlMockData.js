export const pvlMockData = {
    users: [
        { id: 'u-st-1', role: 'student', fullName: 'Дарья Лебедева' },
        { id: 'u-st-2', role: 'student', fullName: 'Анна Ковалева' },
        { id: 'u-st-3', role: 'student', fullName: 'Мария Громова' },
        { id: 'u-men-1', role: 'mentor', fullName: 'Екатерина Соловьева' },
    ],
    studentProfiles: [
        { id: 'u-st-1', cohort: 'ПВЛ 2026 · Поток 1', currentWeek: 6, currentModule: 'Модуль 2: Веди', coursePoints: 248, szSelfAssessmentPoints: 0, daysToModuleEnd: 3, daysToCourseEnd: 42, daysToSzDeadline: 28 },
        { id: 'u-st-2', cohort: 'ПВЛ 2026 · Поток 1', currentWeek: 8, currentModule: 'Модуль 2: Веди', coursePoints: 332, szSelfAssessmentPoints: 0, daysToModuleEnd: 2, daysToCourseEnd: 28, daysToSzDeadline: 20 },
        { id: 'u-st-3', cohort: 'ПВЛ 2026 · Поток 1', currentWeek: 10, currentModule: 'Модуль 3: Люби', coursePoints: 190, szSelfAssessmentPoints: 37, daysToModuleEnd: 5, daysToCourseEnd: 14, daysToSzDeadline: 6 },
    ],
    mentorProfiles: [
        { id: 'u-men-1', menteeIds: ['u-st-1', 'u-st-2', 'u-st-3'] },
    ],
    courseWeeks: Array.from({ length: 13 }).map((_, i) => ({
        weekNumber: i,
        title: i === 0 ? 'Вход и настройка' : `Неделя ${i}`,
        deadlineAt: ['2026-04-21', '2026-04-28', '2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26', '2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30', '2026-07-07', '2026-07-14'][i],
    })),
    lessons: [
        { id: 'l-1', weekNumber: 6, title: 'Сценарий: логика и структура', stepType: 'изучить', status: 'done', artifact: 'Конспект', uploadType: 'text' },
        { id: 'l-2', weekNumber: 6, title: 'Сценарий v0.8', stepType: 'выполнить', status: 'in_progress', artifact: 'Файл сценария', uploadType: 'file' },
        { id: 'l-3', weekNumber: 6, title: 'Сдать сценарий ментору', stepType: 'сдать', status: 'pending', artifact: 'Отправка на проверку', uploadType: 'file' },
    ],
    homeworkTasks: [
        { id: 't-101', studentId: 'u-st-1', title: 'Паспорт встречи', weekNumber: 4, moduleNumber: 1, type: 'обычное задание', isControlPoint: false, controlPointId: null, status: 'принято', deadlineAt: '2026-05-19', submittedAt: '2026-05-18', score: 18, maxScore: 20, mentorCommentPreview: 'Хорошая логика.', revisionCycles: 0 },
        { id: 't-102', studentId: 'u-st-1', title: 'КТ4: Сценарий >= v0.8', weekNumber: 6, moduleNumber: 2, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ4', status: 'на доработке', deadlineAt: '2026-06-02', submittedAt: '2026-06-01', score: 12, maxScore: 20, mentorCommentPreview: 'Уточнить артефакт.', revisionCycles: 2 },
        { id: 't-103', studentId: 'u-st-1', title: 'КТ5: Мини-проведение', weekNumber: 6, moduleNumber: 2, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ5', status: 'к проверке', deadlineAt: '2026-06-02', submittedAt: '2026-06-02', score: 0, maxScore: 10, mentorCommentPreview: 'Ожидает проверки.', revisionCycles: 0 },
        { id: 't-104', studentId: 'u-st-1', title: 'КТ6: Два завтрака Лиги', weekNumber: 6, moduleNumber: 2, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ6', status: 'просрочено', deadlineAt: '2026-06-02', submittedAt: null, score: 0, maxScore: 10, mentorCommentPreview: 'Нет сдачи.', revisionCycles: 0 },
        { id: 't-201', studentId: 'u-st-2', title: 'Финальный сценарий', weekNumber: 8, moduleNumber: 2, type: 'обычное задание', isControlPoint: false, controlPointId: null, status: 'принято', deadlineAt: '2026-06-16', submittedAt: '2026-06-15', score: 20, maxScore: 20, mentorCommentPreview: 'Сильная работа.', revisionCycles: 1 },
        { id: 't-301', studentId: 'u-st-3', title: 'КТ8: Запись СЗ', weekNumber: 10, moduleNumber: 3, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ8', status: 'к проверке', deadlineAt: '2026-06-30', submittedAt: '2026-06-29', score: 0, maxScore: 10, mentorCommentPreview: 'Проверка записи.', revisionCycles: 0 },
    ],
    controlPoints: [
        { id: 'КТ1', title: 'Встреча с ПП + лист наблюдения', weekNumber: 0, deadlineAt: '2026-04-21' },
        { id: 'КТ2', title: 'Микропрактики + рефлексия', weekNumber: 3, deadlineAt: '2026-05-12' },
        { id: 'КТ3', title: 'Паспорт встречи', weekNumber: 4, deadlineAt: '2026-05-19' },
        { id: 'КТ4', title: 'Сценарий >= v0.8', weekNumber: 6, deadlineAt: '2026-06-02' },
        { id: 'КТ5', title: 'Мини-проведение + самоанализ', weekNumber: 6, deadlineAt: '2026-06-02' },
        { id: 'КТ6', title: 'Два завтрака Лиги', weekNumber: 6, deadlineAt: '2026-06-02' },
        { id: 'КТ7', title: 'План набора гостей на СЗ', weekNumber: 8, deadlineAt: '2026-06-16' },
        { id: 'КТ8', title: 'Пробный завтрак + запись СЗ', weekNumber: 10, deadlineAt: '2026-06-30' },
        { id: 'КТ9', title: 'Сертификационный пакет', weekNumber: 12, deadlineAt: '2026-07-14' },
    ],
    submissions: [
        { id: 'sub-1', taskId: 't-102', status: 'на доработке' },
        { id: 'sub-2', taskId: 't-103', status: 'к проверке' },
    ],
    submissionVersions: [
        { id: 'ver-1', taskId: 't-102', versionNumber: 1, createdAt: '2026-05-31 19:20', authorRole: 'student', textContent: 'Черновик', attachments: ['scenario_v07.docx'], links: [], isCurrent: false },
        { id: 'ver-2', taskId: 't-102', versionNumber: 2, createdAt: '2026-06-01 12:40', authorRole: 'student', textContent: 'Версия 0.8', attachments: ['scenario_v08.docx'], links: ['https://docs.google.com/document/d/mock'], isCurrent: true },
    ],
    statusHistory: [
        { id: 'sh-1', taskId: 't-102', fromStatus: 'в работе', toStatus: 'отправлено', changedAt: '2026-06-01 12:41', changedBy: 'Дарья Лебедева', comment: 'Отправлено' },
        { id: 'sh-2', taskId: 't-102', fromStatus: 'отправлено', toStatus: 'к проверке', changedAt: '2026-06-01 13:00', changedBy: 'Система', comment: 'Очередь проверок' },
        { id: 'sh-3', taskId: 't-102', fromStatus: 'к проверке', toStatus: 'на доработке', changedAt: '2026-06-02 14:30', changedBy: 'Ментор', comment: 'Нужны правки' },
    ],
    threadMessages: [
        { id: 'msg-1', taskId: 't-102', type: 'message', authorRole: 'student', authorName: 'Дарья Лебедева', createdAt: '2026-06-01 12:41', text: 'Отправила v0.8', isUnread: false, linkedStatus: null, linkedVersionId: 'ver-2' },
        { id: 'msg-2', taskId: 't-102', type: 'status', authorRole: 'system', authorName: 'Система', createdAt: '2026-06-01 13:00', text: 'Статус: отправлено -> к проверке', isUnread: false, linkedStatus: 'к проверке', linkedVersionId: null },
        { id: 'msg-3', taskId: 't-102', type: 'message', authorRole: 'mentor', authorName: 'Екатерина Соловьева', createdAt: '2026-06-02 14:30', text: 'Уточните финальный артефакт.', isUnread: true, linkedStatus: 'на доработке', linkedVersionId: null },
    ],
    mentorMeetings: [
        { id: 'meet-1', studentId: 'u-st-1', weekNumber: 5, title: 'Разбор черновика', focus: 'Логика сценария', scheduledAt: '2026-05-26 19:00', happenedAt: '2026-05-26 19:00', status: 'прошла', reflectionStatus: 'есть', linkedTaskId: 't-102', mentorNotePreview: 'Усилить артефакт.' },
        { id: 'meet-2', studentId: 'u-st-1', weekNumber: 6, title: 'Сборный завтрак #1', focus: 'КТ4-КТ6', scheduledAt: '2026-06-03 10:00', happenedAt: null, status: 'запланирована', reflectionStatus: 'нет', linkedTaskId: 't-103', mentorNotePreview: 'Подготовить вопросы.' },
    ],
    libraryItems: [
        { id: 'lib-1', title: 'Доказательная база ПП', category: 'доказательная база', contentType: 'article', duration: '12 мин', completedBy: ['u-st-1', 'u-st-2'] },
        { id: 'lib-2', title: 'Карта практик', category: 'карта практик', contentType: 'pdf', duration: '8 мин', completedBy: ['u-st-1'] },
        { id: 'lib-3', title: 'Техника безопасности', category: 'техника безопасности', contentType: 'video', duration: '24 мин', completedBy: [] },
        { id: 'lib-4', title: 'Мифы и объяснения', category: 'мифы и объяснения', contentType: 'article', duration: '10 мин', completedBy: [] },
        { id: 'lib-5', title: 'Социальная психология', category: 'социальная психология', contentType: 'video', duration: '31 мин', completedBy: [] },
        { id: 'lib-6', title: 'Онлайн и офлайн', category: 'онлайн и офлайн', contentType: 'checklist', duration: '6 мин', completedBy: [] },
        { id: 'lib-7', title: 'МАК: практический блок', category: 'МАК', contentType: 'video', duration: '18 мин', completedBy: [] },
        { id: 'lib-8', title: 'Телесные и дыхательные практики', category: 'телесные и дыхательные практики', contentType: 'pdf', duration: '14 мин', completedBy: [] },
        { id: 'lib-9', title: 'Форматы встреч', category: 'форматы встреч', contentType: 'article', duration: '15 мин', completedBy: [] },
        { id: 'lib-10', title: 'Культурный код Лиги', category: 'культурный код Лиги', contentType: 'pdf', duration: '11 мин', completedBy: [] },
        { id: 'lib-11', title: 'Материалы для ведущих и менторов', category: 'материалы для ведущих и менторов', contentType: 'checklist', duration: '9 мин', completedBy: [] },
        { id: 'lib-12', title: 'Сценарии: примеры', category: 'сценарии', contentType: 'video', duration: '20 мин', completedBy: [] },
    ],
    glossaryItems: [
        { id: 'g-1', term: 'Письменная практика', definition: 'Структурированное упражнение с инструкцией и таймингом.' },
        { id: 'g-2', term: 'Артефакт', definition: 'Что остается у участницы после практики.' },
        { id: 'g-3', term: 'Результат встречи', definition: 'Внутреннее изменение участницы.' },
        { id: 'g-4', term: 'Рефлексивный отклик', definition: 'Вопросы после практики для присвоения опыта.' },
    ],
    faqItems: [
        { id: 'f-1', q: 'Как получить баллы?', a: 'Закрывать недели, КТ и сдавать в срок.' },
        { id: 'f-2', q: 'Где смотреть комментарии ментора?', a: 'В Результатах и карточке задания.' },
        { id: 'f-3', q: 'СЗ и курсовые баллы вместе?', a: 'Нет, это отдельные шкалы.' },
    ],
    certificationProgress: [
        { studentId: 'u-st-1', guestPlanStatus: 'в процессе', trialBreakfastStatus: 'запланирован', szRecordingStatus: 'не начато', szSelfAssessmentStatus: 'не начато', certificationPackageStatus: 'не начато', admissionStatus: 'ожидается', redFlags: [], deadlineAt: '2026-06-30' },
        { studentId: 'u-st-2', guestPlanStatus: 'готово', trialBreakfastStatus: 'готово', szRecordingStatus: 'готово', szSelfAssessmentStatus: 'в процессе', certificationPackageStatus: 'в процессе', admissionStatus: 'преддопуск', redFlags: [], deadlineAt: '2026-06-30' },
        { studentId: 'u-st-3', guestPlanStatus: 'готово', trialBreakfastStatus: 'готово', szRecordingStatus: 'готово', szSelfAssessmentStatus: 'готово', certificationPackageStatus: 'в процессе', admissionStatus: 'на проверке', redFlags: ['нет оплаты'], deadlineAt: '2026-06-30' },
    ],
    deadlineRisks: [
        { id: 'dr-1', studentId: 'u-st-1', riskType: 'просроченная контрольная точка', relatedTaskId: 't-104', title: 'КТ6: 2 завтрака Лиги', daysOverdue: 1, riskLevel: 'высокий', recommendedAction: 'Связаться сегодня и назначить досдачу.', isResolved: false },
        { id: 'dr-2', studentId: 'u-st-1', riskType: 'антидолг D+3', relatedTaskId: 't-102', title: 'Сценарий >= v0.8', daysOverdue: 0, riskLevel: 'средний', recommendedAction: 'Ограничить фокус до 1-2 правок.', isResolved: false },
        { id: 'dr-3', studentId: 'u-st-2', riskType: 'ближайший дедлайн', relatedTaskId: 't-201', title: 'Финальный сценарий', daysOverdue: -1, riskLevel: 'низкий', recommendedAction: 'Подтвердить прием.', isResolved: false },
    ],
    dashboardWidgets: [],
};

export const getStudentProfile = (studentId) => pvlMockData.studentProfiles.find((s) => s.id === studentId);
export const getUser = (id) => pvlMockData.users.find((u) => u.id === id);
export const getStudentTasks = (studentId) => pvlMockData.homeworkTasks.filter((t) => t.studentId === studentId);
export const getStudentRisks = (studentId) => pvlMockData.deadlineRisks.filter((r) => r.studentId === studentId);
export const getStudentMeetings = (studentId) => pvlMockData.mentorMeetings.filter((m) => m.studentId === studentId);
export const getStudentCertification = (studentId) => pvlMockData.certificationProgress.find((c) => c.studentId === studentId);
export const getTaskById = (taskId) => pvlMockData.homeworkTasks.find((t) => t.id === taskId);
export const getTaskThread = (taskId) => pvlMockData.threadMessages.filter((m) => m.taskId === taskId);
export const getTaskHistory = (taskId) => pvlMockData.statusHistory.filter((s) => s.taskId === taskId);
export const getTaskVersions = (taskId) => pvlMockData.submissionVersions.filter((v) => v.taskId === taskId);

