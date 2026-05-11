# Race condition: async sync + React useMemo без deps на state-флаг

**Дата:** 2026-05-11.
**Тикет:** BUG-PVL-ADMIN-AS-MENTOR-EMPTY.
**Связанный фикс:** Variant C (useMemo deps на флаги) + Variant B
(`reportClientError` в catch hydrate). См. `views/PvlPrototypeApp.jsx`
`MentorMenteesPanel` / `MentorDashboard` и `services/pvlMockApi.js`
catch'и вокруг `hydrateGardenMentorAssignmentsFromDb` и
`syncPvlActorsFromGarden`.

## Симптом

Куратор Лиги Ирина (role=admin) утром 11 мая написала: «не
отображаются мои менты в списке проверок, написано "список менти
пуст"». У неё в БД 4 связки `pvl_garden_mentor_links` (mentor_id =
её UUID), три из них с валидными студентками
(role=applicant, status=active).

- Никаких ошибок в Console и TG (MON-001 не алертит).
- Hard reload **не помог** при первой попытке.
- Через **~2 часа без её действий** список появился сам.

## Корневая причина

В `views/PvlPrototypeApp.jsx`:

```js
function MentorMenteesPanel({ mentorId, refreshKey = 0 }) {
    const menteeRows = useMemo(
        () => buildMentorMenteeRows(mentorId),
        [mentorId, refreshKey],   // ← deps только на props
    );
    // ...
}
```

`buildMentorMenteeRows` читает из in-memory singleton
`pvlDomainApi.db` — а его наполняет **асинхронная**
`syncPvlActorsFromGarden`. Цепочка:

1. PvlPrototypeApp монтируется → MentorPage рендерится с
   `mentorId = UUID Ирины`, но `db.mentorProfiles` ещё пуст
   (sync не успел).
2. `buildMentorMenteeRows` возвращает `[]` → «Список пуст».
3. Через ~200-500мс sync завершается, заполняет
   `db.mentorProfiles[Ирина].menteeIds = [3 студентки]` и
   `db.studentProfiles` для трёх.
4. **forceRefresh()** в PvlPrototypeApp поднимает `dataTick` → теоретически
   `refreshKey` меняется → useMemo пересчитывается. На практике —
   у Ирины **не сработало** (вероятная гипотеза: forceRefresh
   успел до того, как MentorMenteesPanel смонтировался; либо
   props пришли с тем же значением refreshKey).
5. **Случайно спасающий рендер** прилетел от Supabase Realtime
   websocket в `services/realtimeMessages.js` (когда кто-то прислал
   ей сообщение или система пингнула) → MentorMenteesPanel
   перерендерился → читает обновлённый `db` → видит список.

Поэтому Ирина «увидела сама через 2 часа» — это случайное
сообщение в чате прилетело.

## Категория

**Тихие state issues.** Невидимы для MON-001 — нет throw, нет
unhandled rejection, нет 4xx/5xx. UI gracefully показывает
«Список пуст», как и должен по дизайну, если у ментора реально
нет менти.

| Класс ошибок | MON-001 ловит? | Как заметим? |
|---|---|---|
| Uncaught JS exception | ✅ | Сразу, через TG |
| Unhandled promise rejection | ✅ | Сразу, через TG |
| Caught error (`.catch()` → swallow) | ❌ | Только по жалобе пользователя |
| Gracefully empty UI без exception | ❌ | Только по жалобе |
| Race condition stale state | ❌ | Только по жалобе |

## Почему так получилось

1. **Singleton state снаружи React-дерева.** `pvlDomainApi.db` —
   обычный JS-объект. React его не видит, deps на самом `db`
   бесполезны (shallow compare reference, никогда не меняется).
2. **deps на сторонние props без триггера на завершение sync.**
   `refreshKey` зависит от того, успел ли родитель (PvlPrototypeApp)
   увеличить `dataTick` ДО того, как ребёнок смонтировался. Это
   race.
3. **Supabase Realtime маскировал.** Любой incoming websocket-event
   триггерил React re-render где-то выше → каскадный пересчёт →
   `MentorMenteesPanel` подхватывал обновлённый `db`. **Без
   Realtime (после CLEAN-015) баг был бы постоянным.**
4. **Тестирование происходит у dev'ов с быстрым localhost'ом.** В
   локальном `npm run preview` sync завершается за 30-50мс —
   практически синхронно с первым render'ом. На проде с медленным
   PostgREST (см. PERF-001-ADMIN-API) — 1-2 секунды. Race гораздо
   заметнее.

## Как починили

### Variant C — useMemo deps на флаги завершения sync

```js
const menteeRows = useMemo(
    () => buildMentorMenteeRows(mentorId),
    [
        mentorId,
        refreshKey,
        pvlDomainApi.db._pvlGardenApplicantsSynced,   // ← флаг конца sync
        pvlDomainApi.db.mentorProfiles.length,         // ← страховка
        pvlDomainApi.db.studentProfiles.length,        // ← страховка
    ],
);
```

Когда `syncPvlActorsFromGarden` завершается:
- `_pvlGardenApplicantsSynced: false → true` (флаг изменился)
- `mentorProfiles.length: 0 → N` (страховка если флаг не вызвался)
- `studentProfiles.length: 0 → M` (вторая страховка)

На **следующем render'е** (триггер от forceRefresh / Realtime /
любого state-update) React сравнит новые deps со старыми → увидит
изменение → пересчитает `menteeRows` → список появится.

**Что это НЕ лечит:** если render не происходит вообще (нет
forceRefresh, нет background trigger'а) — deps не считываются.
Но это уже не race, это другой класс (мёртвый компонент без
ребиндинга), и его в коде не наблюдается.

### Variant B — reportClientError в catch hydrate (и ещё двух)

В `services/pvlMockApi.js` три критичных try/catch, которые
раньше **тихо ели** ошибки:

1. `hydrateGardenMentorAssignmentsFromDb` (catch вокруг line 1230) —
   если RPC падает (JWT, network, RLS), `mentorProfiles[*].menteeIds`
   остаётся пустым.
2. `syncTrackerAndHomeworkFromDb` (catch вокруг line 1259) — если
   падает, у студентов не загрузятся submissions/tracker.
3. Top-level catch `syncPvlActorsFromGarden` (вокруг line 1279) —
   самый болезненный: если `api.getUsers()` упал, **db не заполнится
   вообще** → пустой UI у всех ролей.

В каждом из трёх — добавили:

```js
try {
    const mod = await import('../utils/clientErrorReporter');
    mod.reportClientError({
        source: 'pvlMockApi.hydrate',  // или .syncTracker, .syncPvlActorsFromGarden
        message: 'hydrate_mentor_links failed (caught)',
        stack: e?.stack || String(e),
        extra: { stage: 'hydrate_mentor_links' },
    });
} catch { /* reporter падать не должен, но silent на всякий */ }
```

Dynamic import — чтобы legacy `pvlMockApi` не получил static
зависимость от MON-001. Это не критично сейчас (оба файла —
prod-код), но снижает coupling и облегчает TECH-DEBT-PVLMOCK-MIGRATE
в будущем.

После Variant B такие тихие фейлы будут прилетать в TG-канал
`@garden_grants_monitor_bot` с сообщением `🚨 Garden client error /
hydrate_mentor_links failed (caught)`. То есть **silent fail
перестаёт быть silent** — мы увидим его до того, как пользователь
напишет в чат.

## Что проверить в будущем

### Паттерн для ловли похожих багов

**Триггер:** `useMemo` / `useEffect` / `useCallback` deps содержат
ТОЛЬКО props, а тело функции читает из **внешнего singleton**
(`pvlDomainApi.db`, `window.*`, импортированного store).

**Чек-лист при ревью:**

- [ ] Что читает тело hook'а? Если только props/state — OK.
- [ ] Если читает внешний singleton/store — есть ли в этом
      сторе **флаг готовности** (например, `_synced: boolean`)?
- [ ] Если есть — он в deps?
- [ ] Если нет — есть ли хотя бы `.length` или иной observable
      признак изменения внутри стора?
- [ ] Если стор пополняется **асинхронно** — кто триггерит
      re-render? Если только props-проп через родителя — это
      race. Нужен либо `useSyncExternalStore`, либо store-update
      events с подпиской.

### Сигналы

- **«У меня сначала пусто, потом через 2 минуты / hard reload —
  появилось»** — почти всегда race на async sync. Сразу проверять
  useMemo deps.
- **MON-001 молчит, но пользователь жалуется** — почти всегда
  caught error или gracefully empty UI. В catches должен быть
  reportClientError.
- **Локально работает, на проде нет** — race становится заметнее
  при медленном API. Воспроизводить через DevTools Network →
  «Slow 3G».

### Долгосрочно

- **Перевести `pvlDomainApi.db` на observable pattern** (zustand,
  redux, или собственный `useSyncExternalStore`). Тогда любое
  обновление в db автоматически триггерит re-render всех
  подписчиков, и race condition исчезает структурно. **Это
  крупный рефакторинг**, не сейчас — связано с
  TECH-DEBT-PVLMOCK-MIGRATE.

### Связано с CLEAN-015

Supabase Realtime в `services/realtimeMessages.js` сейчас работает
как **случайный спасатель** — websocket-события от чата триггерят
re-render → useMemo пересчёт → race скрывается.

После CLEAN-015 (выпиливание Realtime → polling) этот спасатель
исчезнет. Поэтому **Variant C ДОЛЖЕН быть применён ДО CLEAN-015**.
В обратном порядке мы бы получили deterministic регрессию во всей
учительской для admin'ов.

В backlog поставлен явный блокер: CLEAN-015 не делать до закрытия
BUG-PVL-ADMIN-AS-MENTOR-EMPTY (теперь снят — DONE).
