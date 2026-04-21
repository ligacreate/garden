# Упрощение формы домашних заданий

**Дата:** 2026-04-21  
**Статус:** В работе

## Цель

Упростить форму создания ДЗ: оставить только обязательные поля, переделать редактор анкеты на строгие пары вопрос→ответ, студентский вид — как Google Forms.

## Фазы

### [x] Фаза 1: Новый тип блока qa_pair

- [x] В `utils/pvlQuestionnaireBlocks.js` добавлен тип `qa_pair: { id, type, question }`
- [x] `createDefaultQuestionnaireBlocks()` возвращает один qa_pair блок
- [x] `normalizeQuestionnaireBlocks()` поддерживает qa_pair + обратная совместимость с text/short_text/long_text
- [x] `questionnaireHasAnswerBlocks()` учитывает qa_pair

### [x] Фаза 2: Google Forms стиль для студентки

- [x] `QuestionnaireFieldsEditor` в `pvlQuestionnaireShared.jsx`:
  - Шапка с зелёной полосой (title + description)
  - Каждый qa_pair — белая карточка с тенью
  - Ответ — plain textarea без ограничения символов
  - Обратная совместимость со старыми блоками
- [x] `QuestionnaireAnswersReadonly` — аналогично для ментора/истории
- [x] Пропсы `questionnaireTitle` и `questionnaireDescription` пробиты по всей цепочке в `PvlTaskDetailView.jsx`

### [x] Фаза 3: Новый редактор анкеты в LessonHomeworkBuilder

- [x] Строгие пары вопрос+ответ (нет отдельных text/short_text/long_text блоков)
- [x] Поле "Описание" вместо произвольных текстовых блоков
- [x] Навигация вверх/вниз/удалить работает на паре целиком
- [x] Кнопка "+ Добавить вопрос" добавляет qa_pair
- [x] `normalizeLessonHomework` и `createDefaultLessonHomework` обновлены для `questionnaireDescription`

### [x] Фаза 4: Упрощение формы ДЗ

- [x] Теги скрыты для всех `lessonKind === 'homework'` (create + edit форма)
- [x] Длительность скрыта для всех `lessonKind === 'homework'` (create + edit форма)
- [x] "Полный текст задания" (RichEditor) убран из create и edit форм для ДЗ
- [x] Название растянуто на всю ширину в create-форме для ДЗ

### [x] Фаза 5: Единый вид задания в трекере и результатах

- [x] `HomeworkInlineForm` в `pvlLibraryMaterialShared.jsx` экспортирован и расширен:
  - Добавлен дедлайн (из `getStudentTaskDetail`)
  - Добавлены отправленные версии ответов (текущая + предыдущие) через `HomeworkVersionItem`
  - Добавлена «Лента по заданию» (thread messages, без системных)
  - Убрана кнопка «Открыть полную карточку задания →»
  - Сохранение/отправка идут в БД через `pvlDomainApi.studentApi`
- [x] В `PlatformCourseModulesGrid` убрана спец-навигация `navigate(.../results/taskId)` — задания теперь открываются внутри трекера как любой другой шаг
- [x] Маршрут `/student/results/[taskId]` — для ДЗ теперь показывает `HomeworkInlineForm` в трекер-стиле (с хлебной крошкой «Результаты → название задания»), не открывая отдельную страницу

## Итог

Реализовано полностью. Ответы сохраняются в `payload.answersJson` через существующую систему — изменений в БД не потребовалось (поле уже есть).
