# RECON: BUG-CALENDAR-EVENT-TYPE-DRIFT — прод или только dev-mock?

- **Дата:** 2026-05-31
- **Автор:** codeexec (READ-ONLY recon, фикс не делался)
- **Тип:** recon / triage
- **Вопрос:** расхождение `normalizeCalendarEventTypeForDb` между mock и postgrest — это реальный баг в проде или косметика dev-mock?
- **Вердикт:** **A — прод пишет КОРРЕКТНЫЙ тип, читается верно. Расходится только mock (dev). Понизить P2 → P3, не горит.**

---

## 1. Оба маппинга бок-о-бок

| input-тип | postgrest (ПРОД, `pvlPostgrestApi.js:147`) | mock (DEV, `pvlMockApi.js:526`) | совпадает? |
|---|---|---|---|
| lesson | `lesson` | `lesson` | ✅ |
| practicum | `practicum` | `practicum` | ✅ |
| practicum_done | `practicum_done` | `practicum_done` | ✅ |
| breakfast | `breakfast` | `breakfast` | ✅ |
| deadline | `deadline` | `deadline` | ✅ |
| other | `other` | `other` | ✅ |
| week_closure | `deadline` | `deadline` | ✅ |
| **mentor_meeting** | **`mentor_meeting`** | **`practicum`** | ❌ |
| **lesson_release** | **`lesson_release`** | **`lesson`** | ❌ |
| **live_stream** | **`live_stream`** | **`breakfast`** | ❌ |
| **session** | **`mentor_meeting`** | **`practicum`** | ❌ |
| (default / неизвестный) | `other` | `other` | ✅ |

Расходятся ровно 4 входа: `mentor_meeting`, `lesson_release`, `live_stream`, `session`.
Суть: **postgrest сохраняет канонические типы как есть (identity)**, а mock **сворачивает их в старый набор** (помечено в коде `// legacy types:`).

---

## 2. Прод-путь (postgrest): что уходит в БД и что читается обратно

**Writer:** `pvlPostgrestApi.js:277` (createCalendarEvent) и `:289` (updateCalendarEvent) →
колонка **`pvl_calendar_events.event_type`** (PostgREST POST/PATCH).

**Схема — CHECK-constraint (актуальный, `database/pvl/migrations/010_pvl_practicum_recordings.sql:9`,
он DROP+ADD поверх исходного из `002_pvl_runtime_content.sql:105`):**
```
event_type IN ('lesson','practicum','practicum_done','breakfast',
               'mentor_meeting','live_stream','lesson_release','deadline','other')
```
→ Все выходы прод-маппинга (`mentor_meeting`, `live_stream`, `lesson_release`, плюс identity-набор и
`session→mentor_meeting`, `week_closure→deadline`, `default→other`) **входят в разрешённый CHECK-набор.**
Прод физически НЕ может записать невалидный тип: либо валидное значение, либо `other`.

**Reader:** `listCalendarEvents` (`pvlPostgrestApi.js:263`) делает `select: '*'` — обратного маппинга нет,
`event_type` уходит в UI как есть. UI (`views/PvlCalendarBlock.jsx`) канонические типы **знает и рендерит корректно:**
- `PVL_CAL_EVENT_LABELS` (:85): `mentor_meeting→«Практикум»`, `live_stream→«Завтрак»`, `lesson_release→«Урок»`.
- `calendarEventDotClass` (:95): `mentor_meeting`→teal, `live_stream`→violet, `lesson_release`→amber — все обработаны.
- навигация (:193-198) и архив-фильтр (:571) трактуют `mentor_meeting/live_stream/lesson_release` наравне с practicum/breakfast/lesson.

**Ключевое следствие:** канонический тип и его «legacy»-аналог в UI дают **один и тот же лейбл и цвет**
(`mentor_meeting`≡`practicum`→«Практикум»/teal; `live_stream`≡`breakfast`→«Завтрак»/violet;
`lesson_release`≡`lesson`→«Урок»/amber). То есть даже визуально разница между маппингами **не видна пользователю**.

---

## 3. Факт из БД (DISTINCT event_type)

**Не снят из этого окружения:** psql под `gen_user` живёт на сервере (creds в `/opt/garden-auth/.env`,
см. `scripts/check_grants.sh`), локально доступен только REST-эндпоинт, а прямой anon-GET к prod-API
в этой сессии не выполнялся (отклонён). Прямого DB-доступа с этой машины нет.

Но для вердикта это не блокер: **CHECK-constraint гарантирует**, что в колонке не может быть значений вне
разрешённого набора (иначе INSERT/PATCH упал бы с 400). А прод-маппинг по построению выдаёт только
значения из этого набора. Кривым значениям взяться неоткуда.

**Чтобы подтвердить эмпирически — выполнить на сервере под gen_user:**
```sql
SELECT event_type, count(*) FROM pvl_calendar_events GROUP BY 1 ORDER BY 2 DESC;
-- ожидаемо: только значения из CHECK-набора; «кривых» нет (гарантировано constraint'ом):
SELECT count(*) FROM pvl_calendar_events
 WHERE event_type NOT IN ('lesson','practicum','practicum_done','breakfast',
                          'mentor_meeting','live_stream','lesson_release','deadline','other');
-- ожидаемо: 0
```

---

## ВЕРДИКТ: **A** (косметика dev)

Прод-маппинг (postgrest) пишет канонические, **CHECK-валидные** типы, которые UI читает и рендерит корректно;
визуально результат идентичен legacy-варианту. Расхождение существует **только в mock** (dev-only, в реальную
БД не пишет). Сквозной поток прод (write → DB → read → render) корректен на всех слоях.

**Влияние на пользователя: нулевое.** Это внутреннее различие представления в dev-mock.

**Рекомендация:**
- Понизить `BUG-CALENDAR-EVENT-TYPE-DRIFT` **P2 → P3**, не горит.
- При будущей дедупликации в `pvlTransforms` — за источник правды брать **postgrest-маппинг** (он = схема + UI);
  mock привести к нему. Это уберёт «legacy»-сворачивание и сделает dev-mock соответствующим проду.
- (Side-note, вне scope) `practicum_done` валиден только с миграции 010; `session`/`week_closure` в CHECK
  отсутствуют, но оба маппинга переводят их в валидные значения до записи — рисков нет.

**Фикс не делался. Жду решения по вердикту.**
