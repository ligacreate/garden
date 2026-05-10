# Bulk-операции в админке: один `in.(...)` запрос вместо N последовательных await'ов

**Дата:** 2026-05-10.
**Тикет:** FEAT-016 (bulk ZIP per-student MD-отчёт).
**Связанный фикс:** commit `193c999` —
`pvlPostgrestApi.listStudentHomeworkSubmissionsBulk(studentIds)`.

## Симптом

В FEAT-016 кнопка «Выгрузить ZIP» в admin-табе «Прогресс ПВЛ»
зависала на «Готовлю архив… 0/14», крутилась минут 5-7, потом
пропадала без скачанного файла.

Со стороны Ольги:
- Кнопка кликабельная, спиннер появляется → выглядит как «работает».
- Прогресс никогда не сдвигается с `0/14`.
- Через несколько минут окно само закрывается, ZIP не скачался.
- Console errors нет.

## Корневая причина

В [`views/AdminPvlProgress.jsx`](../../views/AdminPvlProgress.jsx)
экспорт делал per-student последовательные запросы:

```js
const submissionsByStudent = [];
for (let i = 0; i < visibleStudents.length; i += 1) {
    const s = visibleStudents[i];
    // eslint-disable-next-line no-await-in-loop
    const subs = await pvlPostgrestApi.listStudentHomeworkSubmissions(s.student_id);
    submissionsByStudent.push(subs);
    setProgress(i + 1);
}
```

Smoke replay показал — `pvl_student_homework_submissions` **на проде
отвечает ~190 секунд** на одного студента (тяжёлая RLS + jsonb без
индексов, см. PERF-001-ADMIN-API). Соответственно:

```
14 студенток × 190с ≈ 45 минут
```

ZIP-генератор клиента сдавался задолго до конца. Прогресс «0/14»
был честным — первый студент ещё не успел вернуться.

## Почему так получилось

1. **Привычный паттерн «for-await per item» из user-сценариев.**
   В пользовательском flow per-item OK: «откройте свой профиль» = 1
   запрос, «откройте чужой профиль» = тоже 1. Per-item стиль с
   loading state на этапе разработки выглядит чисто. Но bulk-сценарий
   умножает время на N, и линейная зависимость становится катастрофой
   при медленном API.
2. **Slow PostgREST как контекст.** На быстром API (10мс на запрос)
   для-await цикл с 14 итерациями — 140мс, никто не заметит. PostgREST
   на проде с тяжёлыми RLS-policies и jsonb — другая история.
   Производительность тут не «детальной оптимизации», а архитектурной
   правды: запрос на 200 секунд = **запрос редкий, должен быть один**.
3. **Не было SLA на admin-операции.** UI обещает «архив за минуту-две»
   неявно (классический pattern спиннера). Если бэкенд за это время
   не уложится — UX-стек ломается. Без явного SLA нет механизма
   ловить такие случаи на ревью.
4. **Smoke на тестовых данных vs прод.** В dev/local 14 студенток
   на быстром локальном PostgREST = 1-2 секунды. На проде с 14
   реальными студентками = 45 минут. Smoke-без-прода обманул.

## Как починили

Один batch-запрос через PostgREST `student_id=in.(...)`:

```js
const studentIds = visibleStudents.map((s) => s.student_id).filter(Boolean);
const allSubmissions = await pvlPostgrestApi.listStudentHomeworkSubmissionsBulk(studentIds);
const submissionsByStudentId = new Map();
for (const sub of allSubmissions) {
    const sid = String(sub.student_id);
    if (!submissionsByStudentId.has(sid)) submissionsByStudentId.set(sid, []);
    submissionsByStudentId.get(sid).push(sub);
}
```

Аналогично для `homework_status_history` через
`listHomeworkStatusHistoryBulk(submissionIds)`. Итого: вместо 14+14
запросов — 2.

В новой `pvlPostgrestApi.listStudentHomeworkSubmissionsBulk` —
**защита от 414 URI Too Long** через chunk'и:

```js
async listStudentHomeworkSubmissionsBulk(studentIds, chunkSize = 20) {
    // PostgREST URL-параметры лимитированы ~8KB, in.(uuid1,uuid2,...)
    // на 50+ uuid'ов уже подходит к лимиту. 20 — безопасный chunk.
    const chunks = chunkArray(studentIds, chunkSize);
    const results = await Promise.all(chunks.map((c) =>
        postgrestFetch('pvl_student_homework_submissions', {
            select: '*',
            student_id: `in.(${c.join(',')})`,
        })
    ));
    return results.flat();
}
```

Прогресс-бар тоже стал честнее: `0 → total/2` (после submissions
batch) → `total` (после history batch). Per-student гранулярность
не нужна, потому что генерация MD синхронная.

## Что проверить в будущем

### Паттерн для ловли похожих багов

**Триггер:** в админ-коде есть `for (... of items) { await api.something(item.id) }`.

**Чек-лист при ревью:**

- [ ] Это **админская** операция (один человек дёргает редко) или
      **пользовательская** (много пользователей, мало id за раз)?
- [ ] Если админская — есть ли `id=in.(...)` или RPC-агрегатор
      на бэке для этой коллекции? Если нет — заводим.
- [ ] Сколько items в типичном случае: 1, 5, 100? До 5 per-await
      простительно даже на медленном API. Выше — bulk-only.
- [ ] Какова latency endpoint'а на проде? Если >500мс — даже 5
      items уже плохо.
- [ ] Если данные нужны для генерации файла (ZIP, PDF, CSV) —
      все запросы должны быть **до** показа спиннера, не во время.

### Граница «когда per-item ок»

Per-item приемлемо когда:
- **Пользовательский сценарий**, не админский.
- N ≤ 3 (например, fetch user + fetch user's mentor + fetch user's
  current course — 3 запроса, OK).
- Latency < 200мс на запрос (быстрый эндпоинт, индексы покрывают).
- **Никогда** для генерации файла-агрегата, который пользователь
  ждёт.

Per-item **категорически нет** когда:
- Админский dashboard / отчёт по коллекции (всех студентов, всех
  ведущих, всех событий).
- N может быть произвольным (растёт с базой пользователей).
- Latency endpoint'а > 1с (любой read-heavy admin endpoint у нас).

### Сигналы

- Spinner на «X/N» застревает на `0/N` или `1/N` секундами/минутами =
  per-item endpoint медленный, должен быть bulk.
- В commit history фразы вроде «параллельным Promise.all» — это
  улучшает по latency (1 × max), но не по нагрузке (всё равно N
  запросов попадает в API одновременно). Bulk через `in.(...)` лучше:
  один запрос → одна оптимизация на стороне БД.
- В `services/*postgrestApi.js` для каждой админской таблицы должна
  быть **пара методов**: `listX(id)` для пользовательского сценария
  + `listXBulk(ids)` для админского. Если bulk-вариант отсутствует
  — это техдолг, а не «у нас пока нет необходимости».

### Архитектурно

Лучший результат — **серверный RPC-агрегатор**, как
`public.pvl_admin_progress_summary(p_cohort_id)` (phase 25). Он:
- считает агрегаты на стороне БД (быстрее любого client-side join'а);
- возвращает уже структурированный jsonb (один tcp roundtrip);
- может проигнорировать тяжёлые RLS на промежуточных таблицах через
  SECURITY DEFINER + явный access-check внутри функции.

Минус: каждый аггрегатор — отдельная миграция. Не масштабируется на
все админ-операции «по требованию». Поэтому road-map:
- **Bulk через `in.(...)`** — для большинства простых случаев.
- **RPC-агрегатор** — если сложная аггрегация и/или endpoint
  слишком медленный даже в bulk-варианте.

PERF-001-ADMIN-API в backlog покрывает накопительный аудит этого.

### Тест на регресс

Не пишу — нет тестовой инфраструктуры, и юнит-тест для
`listStudentHomeworkSubmissionsBulk(20+ ids)` всё равно мокает
PostgREST, что не проверяет real-world latency. Лучший тест —
ручной smoke на проде с реальной cohort'ой.

Когда появится TEST-INFRA-SETUP — добавить регрессионный smoke в
admin scenarios: «открыть Прогресс ПВЛ → выгрузить ZIP за <module>
для cohort 2026-1 → time < 60s, файл скачан».
