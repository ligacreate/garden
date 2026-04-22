# Admin: сводная таблица успеваемости учениц

## Цель
Дать администратору единый экран с прогрессом каждой ученицы: просмотренные уроки, сданные домашки, контрольные точки.

## Фазы

### [x] Фаза 1 — Исправление критических багов с датами
- [x] `DASHBOARD_TODAY = '2026-06-03'` в `pvlMockApi.js` заменён на `getTodayYmd()` — живую дату
- [x] `mapStudentControlPointDisplayStatus` использует `effectiveToday = today ?? getTodayYmd()`
- [x] `computeStudentDashboardWidgets` использует `getTodayYmd()`
- [x] Константы дат курса в `PvlStudentCabinetView.jsx` вынесены в именованные константы (`PVL_COURSE_START_DATE`, `PVL_COURSE_END_DATE`, `PVL_SZ_DEADLINE_DATE`) и убран magic-string в `new Date()`

### [x] Фаза 2 — Расширение buildTeacherStudentRows()
Функция в `views/PvlPrototypeApp.jsx` дополнена:
- **Трекер**: `lessonsDone` / `lessonsTotal` — из `computePvlTrackerDashboardStats(getTrackerChecklist(userId))`
- **ДЗ**: `hwAccepted`, `hwPending`, `hwRevision`, `hwOverdue`, `hwTotal` — задания без `isControlPoint`
- **КТ**: `cpAccepted`, `cpPending`, `cpTotal` — задания с `isControlPoint === true`

### [x] Фаза 3 — Обновление таблицы (/admin/students)
**Desktop (min-w-[1100px])**: 9 колонок вместо 8:
- Имя | Статус | Модуль | Ментор | **Уроки** (X/Y + прогрессбар) | **ДЗ** (✓X ⚠Y ↑Z ✗W /total) | **КТ** (X/Y) | Баллы | Последнее

**Mobile карточки**: добавлены строки Уроки / ДЗ / КТ / Баллы с теми же индикаторами.

### [ ] Фаза 4 — Реальные данные по домашкам из БД (будущее)
Сейчас домашки и КТ считаются из in-memory `db.studentTaskStates` (заполняется при `syncTrackerAndHomeworkFromDb`). Нет таблиц:
- `pvl_homework_submissions` для статусов сабмишнов — **есть** (pvlPostgrestApi уже синхронизирует)
- Трекер (`studentTrackerChecks`) синхронизируется с `pvl_course_progress` — **есть**

Остаётся:
- [ ] Убедиться что `syncTrackerAndHomeworkFromDb` вызывается для всех реальных учениц при загрузке `/admin/students`
- [ ] Добавить явный триггер пересинхронизации (кнопка "Обновить" → `syncPvlActorsFromGarden()` уже есть)

## Синхронизация: как устроена сейчас

```
Загрузка страницы
  └→ syncPvlActorsFromGarden()
       └→ syncPvlRuntimeFromDb()
            └→ syncTrackerAndHomeworkFromDb()
                 ├→ ensureDbTrackerHomeworkStructure() — загружает маппинги week/homework ID
                 ├→ pvlPostgrestApi.getStudentCourseProgress(sqlStudentId) → db.studentTrackerChecks[userId]
                 └→ pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId) → db.studentTaskStates[]
```

**Важно**: `fireAndForget` при сохранении прогресса — данные записываются в in-memory db сразу, в PostgreSQL асинхронно. Если сеть упала → данные в памяти есть, в БД нет. При F5 — потеря. Это известный компромисс.

## Итог
Фазы 1-3 реализованы. Таблица `/admin/students` теперь показывает прогресс уроков, детальный статус домашек и контрольных точек с синхронизацией из трекера и БД.
