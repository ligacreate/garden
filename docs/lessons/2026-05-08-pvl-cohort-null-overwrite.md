# PVL: cohort_id затирался upsert'ом ensurePvlStudentInDb

**Дата:** 2026-05-08.
**Тикет:** BUG-PVL-COHORT-NULL-OVERWRITE.
**Связанный фикс:** commit `7c28ed3` в [`services/pvlMockApi.js`](../../services/pvlMockApi.js).

## Симптом

После backfill 2026-05-07 (`UPDATE pvl_students SET cohort_id =
'11111111-…-101' WHERE …` — 22 студента в Поток 1) при следующем заходе
админа в PVL-учительскую `cohort_id` у всех затирался обратно на
`NULL`. Сразу не проявилось — backfill держался утром 2026-05-08, потому
что после apply'а никто из админов не заходил. Бомба замедленного
действия: первый же визит админа выпиливает данные.

Симптом со стороны UI — RPC `pvl_admin_progress_summary(p_cohort_id)`
возвращает пустой результат (студенты «сирые», не привязаны к когорте).

## Корневая причина

В [`services/pvlMockApi.js`](../../services/pvlMockApi.js#L622-L628)
функция `ensurePvlStudentInDb` хардкодом отправляла в payload:

```js
await pvlPostgrestApi.upsertPvlStudent({
    id: sqlId,
    full_name: fullName,
    status: 'active',
    cohort_id: null,    // ← затирает любое существующее значение
    mentor_id: null,    // ← тоже затирает
});
```

PostgREST с `Prefer: resolution=merge-duplicates` транслирует POST в SQL
вида `INSERT … ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name,
status = EXCLUDED.status, cohort_id = EXCLUDED.cohort_id,
mentor_id = EXCLUDED.mentor_id`. Если в payload передано
`cohort_id: null` — `EXCLUDED.cohort_id = NULL` → существующее значение
в строке безусловно заменяется на NULL.

Слой ответственности — клиентский upsert (`services/pvlMockApi.js`).
backfill же шёл прямым SQL — два разных слоя пишут в одну колонку,
клиент перетирает БД.

## Почему так получилось

1. **Дырявая абстракция между slug-id и SQL-uuid.** В моке когорта —
   строка `'cohort-2026-1'`, в БД — UUID. Конвертер
   `seedCohortIdToSqlUuid` уже существовал ([L187](../../services/pvlMockApi.js#L187)),
   но в `ensurePvlStudentInDb` его не задействовали. Автор функции,
   видимо, не знал, как маппить cohortId, и поставил `null` как «безопасный
   дефолт». На уровне типов TS этот null прошёл бы — но семантически в
   merge-duplicates контексте `null` ≠ «не передавать».
2. **Гейт по `pvlRole === 'admin'` (ARCH-012 hotfix).** Он спас на
   момент инцидента — менторы и ученицы upsert не запускают, иначе
   повреждение случалось бы у них тоже и проявилось бы раньше. Но он же
   и замаскировал проблему: разработчик увидел бы, что под mentor'ом
   всё «работает» (потому что upsert не запускается), и не заметил, что
   под admin'ом происходит wipe.
3. **Backfill через прямой SQL без runtime-фикса.** 2026-05-07 backfill
   починил данные, но не клиент. Между applies'ом backfill'а
   и первым визитом админа была иллюзия «работает», а корневой код
   `ensurePvlStudentInDb` оставался ядовитым.

## Как починили

В функции `ensurePvlStudentInDb` теперь:
1. Резолвим `cohort_id` из `db.studentProfiles[].cohortId` через
   `seedCohortIdToSqlUuid`.
2. Резолвим `mentor_id` через `uuidOrNull` (мок-mentorы вроде `u-men-1`
   не UUID — отфильтруются в `null`).
3. **Передаём поле в payload только если резолвинг дал не-null.**
   Иначе ключ опускается, и PostgREST с merge-duplicates оставляет
   существующее значение в БД нетронутым.

Семантический сдвиг: «передаём что знаем, не зануляем что не знаем».
Никаких правок callers'ов — все 8 callsite'ов передавали только
`userId`, фикс полностью локализован.

См. план [`docs/_session/2026-05-08_08_codeexec_bug_pvl_cohort_plan.md`](../_session/2026-05-08_08_codeexec_bug_pvl_cohort_plan.md)
для полной таблицы поведения по edge-кейсам.

## Что проверить в будущем

### Паттерн для ловли похожих багов

Любой upsert / merge-duplicates вызов, где payload содержит
**хардкоженный `null`** на колонке, в которую данные могут попадать
**из другого слоя** (backfill, миграция, админ-action, другая часть UI),
— потенциальная бомба. Семантически `null` в merge-duplicates payload
= «обнулить».

Чек-лист при ревью клиентского upsert'а:
- [ ] Какие колонки в payload? Все ли они «знаемы» из контекста
      вызова?
- [ ] Есть ли колонки, которые могут быть заполнены из других
      источников (backfill, ручной UPDATE, другой эндпоинт)?
- [ ] Если да — payload должен **опускать ключ**, а не отправлять `null`.
- [ ] Если используется PostgREST + `Prefer: resolution=merge-duplicates` —
      это правило обязательно (на стороне клиента нет способа отличить
      «не знаю» от «явно null», PostgREST трактует ключ как «хочу
      перезаписать»).

### Сигналы

- Backfill через SQL без сопровождающего runtime-фикса — всегда
  подозрительно. После backfill'а нужно проверить **все слои, которые
  пишут в эту колонку**, и убедиться, что они либо резолвят значение
  корректно, либо опускают ключ.
- Upsert-функции с фразой «hotfix» / «temporary» в комментариях —
  ARCH-012 здесь сработал двусмысленно: спас от массового
  повреждения, но и замаскировал баг.
- `merge-duplicates` + `null` в payload — поиск по grep'у вида
  `merge-duplicates` в кодовой базе и проверка соседних payload'ов.

### Тест на регресс

Полностью закрыть — добавить smoke / unit на `ensurePvlStudentInDb`,
который мокает `pvlPostgrestApi.upsertPvlStudent` и проверяет:
- что для студента **с** профилем → payload содержит правильный
  `cohort_id` UUID;
- что для студента **без** профиля (тест-фикстура `33333…01`) → payload
  **не содержит** ключа `cohort_id` (а не содержит `cohort_id: null`).

Тест не написан в этой сессии (open question в плане). Следующий
тикет.
