# Recon #2: edit-окошко у Ирины НЕ открылось при status=revision вечером 25.05 (P1, переосмысленный)

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега → Ольга
**Дата:** 2026-05-26
**Предыдущий отчёт:** [2026-05-26_130](2026-05-26_130_codeexec_recon_petrunya_edit_window_and_tg_silent.md) — отвергнутый. Корень не «Юля промахнулась» (это был workaround), а **отсутствие refresh у menti после mentor-write**.

**Режим:** read-only psql под `gen_user` через ssh root@5.129.251.56 + чтение фронта. Никаких write/migrations/commit.

---

## TL;DR

- **БД на момент recon (26.05 ~21:00 MSK):** submission `437c513b-…` всё ещё **`accepted`**. Слов Юли «утром 26.05 откатил на revision» в `pvl_homework_status_history` **НЕТ**. Значит откат либо был только local-UI-action без хита БД (например через чат-reply), либо Юля что-то сделала, и оно не персистилось. См. § 1.
- 🎯 **Самая вероятная корневая причина P1: H3 (race condition / no refresh).** У menti после первичного init-sync **нет** auto-refresh от serverside изменений ментора. Никаких polling, `visibilitychange`, BroadcastChannel или websocket. Есть только: (a) sync на mount, (b) ОДИН `setTimeout(30s)` через 30 секунд после mount, (c) явный `forceRefresh()` на собственных action'ах. После этого state застывает до reload/SPA-навигации. См. § 3.
- 🚧 **Вспомогательный фактор P1: HTML-parse в TG-нотификации Ирине упал в dead_letter** (Q4 из _130) — то есть Ирина **не получила TG-сигнала** «доработай», ушло только Q3 с обрезанным старым comment'ом «Ответочка на проверку». Без TG-pingа Ирина не вышла из приложения и не reload'нула. См. § 6.
- 🪲 **Подтверждена системная регрессия дублей `pvl_homework_status_history`:** 329 строк history vs 82 submissions, до 12 копий одного status-change-события для отдельных submissions. Источник — `doPersistSubmissionToDb` отправляет `slice(-3)` локальной истории при каждом persist, и каждая дубль-запись плодит TG-event через INSERT-trigger. См. § 5.2 и § 6.
- 📋 **Гипотезы:** H3 — корень. H1 (cache snapshot) — частично, влияет только на CMS (`RUNTIME_SWR_KEY`), submissions из cache не восстанавливаются. H2 (stale bundle) — нет данных за/против, нужен `localStorage.app-version` Ирины. H4-H6 — отвергнуты по коду.

---

## 1. Свежее состояние submission `437c513b-…` (на 26.05 ~21:00 MSK)

```sql
SELECT id, status, submitted_at, checked_at, accepted_at, revision_cycles, updated_at
FROM pvl_student_homework_submissions WHERE id = '437c513b-3b27-426f-9c75-d08da045a324';
```

| поле | значение |
|---|---|
| status | **`accepted`** |
| revision_cycles | 2 |
| submitted_at | 2026-05-25 03:00 (seed-артефакт, не реальное время) |
| checked_at | 2026-05-25 03:00 (seed) |
| accepted_at | 2026-05-25 03:00 (seed) |
| updated_at | 2026-05-25 20:46:34.963256+03 |

```sql
SELECT id, from_status, to_status, changed_by, changed_at, LEFT(comment, 80)
FROM pvl_homework_status_history
WHERE submission_id = '437c513b-…' AND changed_at >= '2026-05-25 20:00+03'
ORDER BY changed_at;
```

Единственная запись после 20:00 — `3ab240c4-…` от 2026-05-25 **20:46:33** (Юля: revision → accepted, comment «Вопросы от Ирины: …»).

**Никаких новых записей в `pvl_homework_status_history` за 26.05 нет.** Сегодняшнее «утром Юля откатила на revision» — в БД отсутствует.

Возможные объяснения этого расхождения (вне scope текущей recon, но полезно зафиксировать):
- Юля делала action в `MentorTaskSlim`, но `persistSubmissionToDb` retry × 3 упал → notification «Не удалось сохранить» прилетел Ирине (см. `db_save_error` в [services/pvlMockApi.js:2231-2238](../../services/pvlMockApi.js#L2231-L2238)).
- Юля написала ответ в thread через `addMentorThreadReply` (не меняет статус) — это persist'ится, но `to_status` не пишется.
- Юля сделала действие на staging/dev-сборке.
- Действие потерялось из-за client-side ошибки (network, RLS reject под её токеном, etc.).

ℹ️ **Этот вопрос отдельный — стратегу стоит подтвердить с Юлей, что именно она делала и были ли error-toaster'ы.**

---

## 2. End-to-end рендеринг edit-окошка на стороне menti

### 2.1. Условие открытия (одно)

[views/PvlTaskDetailView.jsx:1188-1195](../../views/PvlTaskDetailView.jsx#L1188-L1195):
```js
const canEditStudentSubmission = useMemo(() => {
    if (role !== 'student') return false;
    const s = String(state.taskDetail.status || '').toLowerCase();
    if (s.includes('отправлен')) return false;
    if (s.includes('на проверке') || s.includes('к проверке')) return false;
    if (s.includes('принят') || s.includes('проверено')) return false;
    return s === 'на доработке' || s === 'черновик' || s === 'в работе' || s === 'не начато';
}, [role, state.taskDetail.status]);
```

Зависит только от `role` и `state.taskDetail.status`. Для `'на доработке'` → **true**. Для `'на проверке'` → false.

### 2.2. Как используется

[views/PvlTaskDetailView.jsx:636-700](../../views/PvlTaskDetailView.jsx#L636-L700) — внутри `SubmissionLayout`:
```jsx
{role === 'student' ? (
    <div className="…">
        {canEditStudentSubmission ? (
            <>
                <RichEditor … />  // textarea
                <button>Сохранить черновик</button>
                <button>Отправить на проверку</button>
            </>
        ) : (
            <p>Ответ уже отправлен и ожидает решения ментора.
               Редактирование откроется, если ментор вернет работу на доработку.</p>
        )}
    </div>
) : ( … )}
```

То что Ирина видела ровно эту фразу-плейсхолдер вместо textarea — однозначное подтверждение `canEditStudentSubmission === false`.

### 2.3. Связь с DB enum

Mapping DB enum → display label:
| DB `status` | rendered label | в whitelist? |
|---|---|---|
| `draft` | «черновик» | ✓ да |
| `submitted` | «отправлено» | **нет** (`includes('отправлен')` → false) |
| `in_review` | **«на проверке»** | **нет** (`includes('на проверке')` → false) |
| `revision` | «на доработке» | ✓ да |
| `accepted` | «принято»/«проверено» | нет (`includes('принят')` → false) |

См. [services/pvlMockApi.js:1805-1822](../../services/pvlMockApi.js#L1805-L1822) `mapStudentHomeworkDisplayStatus(state)` — это что в результате попадает в `state.taskDetail.status` через [views/PvlPrototypeApp.jsx:2004-2005](../../views/PvlPrototypeApp.jsx#L2004-L2005):
```js
const statusLabel =
    viewerRole === 'student' ? mapStudentHomeworkDisplayStatus(state) : …;
```

🚨 **Ключевой вывод:** если у Ирины state.status в её локальной `db.studentTaskStates` был `TASK_STATUS.PENDING_REVIEW` (`in_review`) — её UI отрисовал «на проверке» и закрыл окошко, **даже если в БД уже было `revision`**. Серверный update от Юли никак не дотягивается до её React-state без re-sync.

---

## 3. Цепочка обновления состояния на клиенте menti

### 3.1. Кто вызывает `syncTrackerAndHomeworkFromDb`

Эта функция ([services/pvlMockApi.js:797-837](../../services/pvlMockApi.js#L797-L837)) — единственный путь обновить `db.studentTaskStates` из БД. Вызывается ТОЛЬКО из `syncPvlActorsFromGarden` ([services/pvlMockApi.js:1371](../../services/pvlMockApi.js#L1371)).

**`syncPvlActorsFromGarden` вызывается:**

| Где | Когда | Триггер |
|---|---|---|
| [PvlPrototypeApp.jsx:8141](../../views/PvlPrototypeApp.jsx#L8141) | На монтировании root | один раз, async после `syncPvlRuntimeFromDb` |
| [PvlPrototypeApp.jsx:8157](../../views/PvlPrototypeApp.jsx#L8157) | Через ~600 ms если `embeddedInGarden` | один раз |
| [PvlPrototypeApp.jsx:8171](../../views/PvlPrototypeApp.jsx#L8171) | Через `setTimeout(30s)` после mount | **один раз, не setInterval** |
| [PvlPrototypeApp.jsx:6966](../../views/PvlPrototypeApp.jsx#L6966) | В админ-панели студентов (AdminStudents `<button>`) | вручную |
| [PvlPrototypeApp.jsx:7224](../../views/PvlPrototypeApp.jsx#L7224) | При открытии mentor-mentees панели | при навигации |

**И всё.** Никаких:
- `setInterval` для повторного sync
- `visibilitychange` listener (`document.addEventListener`)
- `focus` listener (`window.addEventListener('focus', …)`)
- BroadcastChannel/SharedWorker
- WebSocket/SSE (PostgREST realtime отсутствует)

Подтверждено grep'ом по `views/` + `services/` + `components/`: `setInterval`/`visibilitychange`/`BroadcastChannel`/`EventSource` нигде, кроме `views/CommunicationsView.jsx:140` (чат-poll, не PVL) и `views/ProfileView.jsx:387` (счётчик 5s, не PVL).

### 3.2. forceRefresh — что он делает

[PvlPrototypeApp.jsx:8089-8091](../../views/PvlPrototypeApp.jsx#L8089-L8091):
```js
const [dataTick, setDataTick] = useState(0);
const forceRefresh = () => setDataTick((x) => x + 1);
```

`dataTick` идёт в `refreshKey`, который ключует ре-mount компонентов:
```jsx
<PvlTaskDetailView key={`${studentId}-${taskId}-${refreshKey}`} … />
```

`forceRefresh` **не дёргает sync с БД** — он только **пере-mount'ит компонент с теми же in-memory данными**. То есть менти-side `forceRefresh` после своих собственных action'ов (submit, draft, reply) показывает её _локальные_ изменения, но не подгружает действия Юли.

### 3.3. Cache

[services/pvlMockApi.js:1061-1072](../../services/pvlMockApi.js#L1061-L1072):
```js
export function syncPvlRuntimeFromCache() {
    if (!pvlPostgrestApi.isEnabled()) return false;
    const { ts, d } = JSON.parse(localStorage.getItem('pvl_swr_v1') || 'null');
    if (!d || Date.now() - ts > 24 * 60 * 60 * 1000) return false;
    applyRuntimeSnapshot(d);
    return true;
}
```

`applyRuntimeSnapshot(d)` ([:1041-1058](../../services/pvlMockApi.js#L1041-L1058)) применяет **только CMS** (`contentItems`, `contentPlacements`, `calendarEvents`, `faqItems`) — **не submissions, не studentTaskStates, не statusHistory**. То есть TTL 24ч на этот key никак не вмешивается в state submission'а Ирины.

Submissions грузятся **всегда из БД** через `processStudentTrackerAndHomework` → fresh PostgREST GET для каждого студента.

### 3.4. Ключевой пробел

После того как **в момент T0 = 17:38** Ирина отправила v2 и её state стал `in_review`:
- `forceRefresh()` сработал на её клиенте → её UI показал «на проверке» (тот самый плейсхолдер из § 2.2)
- Дальше **ничего**.

Когда **в T1 = 18:48** Юля на своей стороне записала revision в БД:
- Юлин клиент → её state → её UI обновился, она видит revision.
- Ирин клиент **не знает об этом**. Полингов нет. Иринин TG получил Q3 (с обрезанным comment'ом — § 6) только в 18:48:34 → но это TG, а не triggers refresh страницы.

Когда **в T2 = 20:46** Юля accept'нула → БД accepted. Ирин клиент **всё ещё** показывает «на проверке».

Если Ирина **не нажала reload и не ушла-вернулась через SPA-навигацию** → её state.taskDetail.status застрял в `'на проверке'` до самого конца сессии. canEditStudentSubmission → false → плейсхолдер вместо textarea.

---

## 4. Проверка гипотез H1-H6

| Гипотеза | Вердикт | Обоснование |
|---|---|---|
| **H1 — Stale cache snapshot** | ⚠️ Частично, но не корень | `RUNTIME_SWR_KEY` хранит только CMS (§ 3.3). На submission state не влияет. У Ирины не было кэшированного `'на проверке'` — он пришёл из БД в момент первого sync. |
| **H2 — Stale bundle (XTevhYBM vs ChQK4w6a)** | 🤷 Не подтверждено / не опровергнуто | На сервере `liga.skrebeyko.ru` сейчас `index-ChQK4w6a.js` (`Last-Modified: Mon, 25 May 2026 12:00:23 GMT` = 15:00 MSK 25.05). Если Ирина обновила страницу ПОСЛЕ 15:00 MSK 25.05 — у неё новый bundle. До — старый, но мы не знаем точно. Нужен `localStorage.app-version` или client log. См. § 7. |
| **H3 — Race condition useMemo / no refresh after mentor write** | ✅ **Корень** | См. § 3.4. Архитектурно подтверждено: путь от mentor write до menti UI прерывается. Никаких механизмов оповещения / poll'а / re-sync. |
| **H4 — state.taskDetail null/undefined → false** | ❌ Отвергнута | `PvlTaskDetailView` всегда получает `initialData` из `buildTaskDetailStateFromApi`, который возвращает заполненный объект. Если state пуст — status='не начато' (в whitelist'е, **canEdit=true**, окошко **должно** быть). |
| **H5 — threadLocked** | ❌ Отвергнута | `threadLocked` ([PvlTaskDetailView.jsx:1186](../../views/PvlTaskDetailView.jsx#L1186)) = `(isAcceptedWork || status === 'принято') && !disputeOpen`. Не влияет на `canEditStudentSubmission` напрямую — это про блокировку отправки thread-message, а не на render textarea. |
| **H6 — revisionCycles >= maxCycles** | ❌ Отвергнута | В коде нет проверки на max revisions внутри `canEditStudentSubmission`. Есть только warning `detectTooManyRevisions` для UI-предупреждения ментора. revision_cycles=2 у Ирины — не блокирует ничего. |

### Дополнительная H7 — может ли status быть DB enum

Проверил: `mapStudentHomeworkDisplayStatus` корректно мапит `revision_requested` → `'на доработке'`. Невозможно получить сырой DB enum `'revision'` в `state.taskDetail.status` без бага в pipeline. Отвергнута.

---

## 5. Связанные areas в коде

### 5.1. applyRuntimeSnapshot vs syncTrackerAndHomeworkFromDb

[services/pvlMockApi.js:1041-1058](../../services/pvlMockApi.js#L1041-L1058):
```js
function applyRuntimeSnapshot(snapshot) {
    db.contentItems = mappedItems;
    db.contentPlacements = mappedPlacements;
    // calendarEvents merge
    db.faqItems = mappedFaq;
}
```

Никакого `db.studentTaskStates = …` или `db.submissions = …`. Это значит даже если в snapshot'е было бы поле с submissions — оно игнорируется. Кэш SWR для submissions **не существует** на frontend'е PVL.

### 5.2. Источник дубликации pvl_homework_status_history

[services/pvlMockApi.js:2199-2210](../../services/pvlMockApi.js#L2199-L2210) — **корень регрессии actorsSyncReady-v2 (но фактически отдельная архитектурная проблема)**:
```js
const historyRows = db.statusHistory.filter((h) => h.studentId === studentId && h.taskId === taskId);
for (const h of historyRows.slice(-3)) {
    await pvlPostgrestApi.appendHomeworkStatusHistory({
        submission_id: row.id,
        from_status: h.fromStatus || null,
        to_status: h.toStatus || null,
        comment: h.comment || '',
        changed_by: changedBy,                       // ← всегда текущий authed user
        changed_at: h.changed_at || nowIso(),        // ← старый timestamp передаётся явно
        payload: { studentId, taskId },
    });
}
```

Каждый `persistSubmissionToDb` шлёт **последние 3** локальных status_history-записи, **даже уже отправленные**. Сервер пишет их с **новыми UUID** через `gen_random_uuid()`, но с старыми `changed_at` (передан явно). Trigger `trg_tg_enqueue_homework_event` (DB) видит INSERT и плодит дубль-TG-event.

**Системная статистика (БД на 26.05):**
- 329 строк в `pvl_homework_status_history` vs 82 submissions = avg ~4 записи на 1 submission
- Top duplicator: submission `7d413edc-…` — 27 строк, ~23 дубля
- Submission Ирины `437c513b-…` — 9 строк, 5 дубль
- Среди дубль-записей `distinct_actors=2` встречается часто: одна с changed_by=Ирина, другая с changed_by=Юля для одного и того же changed_at → ментор-write плодит копию с актером-студентом и наоборот (потому что и тот, и другой делают persistSubmissionToDb, когда они оба заходят на страницу).

**Этот bug не блокирует edit-окошко напрямую**, но:
1. Размножает TG-нотификации
2. Mistribut'ит actor'а
3. Создаёт parse-error'ы (см. § 6)

### 5.3. revision flow от menti — нет ничего специального

[services/pvlMockApi.js:2903-…](../../services/pvlMockApi.js#L2903) `submitStudentTask` — стандартно: меняет status на `PENDING_REVIEW`, добавляет status_history, persist. Никакой отдельной мутации для menti при reload submission'а в revision не нужно — окошко должно открыться автоматически если state.status уже revision_requested.

---

## 6. Подтверждение HTML latent bug (§ 4.5 в _130)

### 6.1. Дубль вокруг записи 18.05

Из БД (recon _130 § 3.2):

| # | id | actor | comment | changed_at |
|---|---|---|---|---|
| a | `75198002-…` | Юля | «Ответочка на проверку» | 2026-05-18 21:18 |
| b | `5c779646-…` (insert 25.05) | Юля | «Ответочка на проверку» | 2026-05-18 21:18 (с переданным `changed_at`) |
| c | `21e0e6a5-…` (insert 25.05) | Ирина | «Ответочка на проверку» | 2026-05-18 21:18 |

Записи b и c **созданы 25.05** (через slice(-3) в `persistSubmissionToDb`) — то есть когда Юля или Ирина 25.05 заходили на страницу submission'а, история перетекла из in-memory db в БД с **новыми** id и actor'ами, но **тем же** timestamp'ом 18.05.

DB-trigger `tg_enqueue_homework_event` сработал на каждой INSERT → создались Q3 (sent OK для дубль-b или c со старым comment'ом) и Q4 (dead-letter HTML parse error).

### 6.2. Что увидела Ирина в TG 25.05 18:48-19:30

В TG в push пришёл **Q3** (event id `3e21f7a0-6e22-409a-80bb-6b030a7d72a0` из _130 § 4.3):
```
🔄 Просьба доработать ДЗ
«Задание к уроку „Как создать безопасное пространство на встрече"»

Ответочка на проверку       ← старый comment от 18.05
```

Реальный комм Юли «Финальное фото с жестами — огонь!..» — в Q4 — упал в **dead_letter** с `bad_request: can't parse entities: Unsupported start tag "p"`. Никакого retry (terminal: true для 400), никакого fallback в plain text.

То есть Ирина получила _signal что есть доработка_, но без context'а. Если она открыла приложение и увидела state.taskDetail.status='на проверке' (in_review, по race condition § 3) — она бы могла подумать, что бот ошибается. Решила писать Юле в чат «у меня нет окошка для доработки».

### 6.3. Связь с дубль-регрессией

Дубль-INSERT в `pvl_homework_status_history` (см. § 5.2) — **прямой источник** того, что:
1. Одна и та же status-change плодит N TG-сообщений
2. Если хоть один из дублей содержит HTML → dead_letter
3. Если другой дубль содержит уже **обрезанный** comment («Ответочка на проверку» вместо настоящего «Финальное фото…») — отправляется он, и Ирина видит неправильный текст

---

## Наиболее вероятная корневая причина

**H3 — Race condition / отсутствие auto-refresh у menti.**

**Доказательная цепочка:**

1. UI menti — `state.taskDetail.status` маппится из `db.studentTaskStates[…].status` через `mapStudentHomeworkDisplayStatus`.
2. `db.studentTaskStates` обновляется ТОЛЬКО через `syncTrackerAndHomeworkFromDb`.
3. `syncTrackerAndHomeworkFromDb` вызывается из `syncPvlActorsFromGarden`.
4. `syncPvlActorsFromGarden` вызывается: на mount + ОДИН раз через 30s + при некоторых явных навигациях.
5. Никакого polling/visibility/focus/realtime для PVL submission state.
6. Ирина 25.05 17:38 отправила v2 → её state=in_review → UI=«на проверке».
7. Ирина оставалась на странице задания.
8. Юля 25.05 18:48 → БД=revision (Ирина не знает).
9. Ирин state остаётся in_review → UI «на проверке» → `canEditStudentSubmission=false` → **плейсхолдер «Ответ уже отправлен и ожидает решения ментора»** вместо textarea.
10. Ирина пишет Юле «у меня нет окошка для доработки» — **буквально потому что у неё UI заморожен на in_review**.

Усугубляющие факторы:
- HTML parse error в TG (§ 6) → Ирина не получила нормальную push «доработай», только дубль со старым comment'ом → не отреагировала reload'ом.
- Юлин workaround «accept чтобы как-то закрыть» (20:46) → в БД зафиксировался accepted → даже после reload Ирина 26.05 утром увидит «принято», тоже без окошка (но это уже другой статус-сценарий).

---

## Что ещё нужно для подтверждения

1. **Localstorage Ирины (если доступ к её устройству есть):**
   - `pvl_swr_v1` — что в snapshot'е и какой ts. Скорее не повлияет на submission (см. § 3.3), но даёт точку отсчёта по `Date.now()`.
   - `appVersion` или `__VITE_ASSET_HASH__` — узнать hash bundle'а.
   - Console errors: были ли `ChunkLoadError`, `Failed to fetch`, или unhandled rejection.
2. **Сетевая активность Ирины 25.05 18:00-21:00:**
   - В Network: запрашивала ли она `/pvl_student_homework_submissions?…` снова после 17:38? (Если нет — H3 confirmed.) Доступ к её dev tools тут единственный путь — или попросить её tomorrow.
3. **Подтверждение от Юли:** ровно что она делала «утром 26.05» — переключила статус через `MentorTaskSlim`, написала в чат, или что-то ещё. И были ли error-toaster'ы / `db_save_error` уведомления.
4. **Реальный bundle hash у Ирины 25.05 вечером:** на проде сейчас `ChQK4w6a` (Last-Modified 25.05 15:00 MSK). Если у Ирины был ChunkLoadError 19:36 → она перезагрузила страницу → новый bundle. До 19:36 — мог быть прежний. Это влияет ТОЛЬКО на H2 (стейл bundle), не на H3.

---

## Предлагаемые fix'ы

### Fix A — Polling syncPvlActorsFromGarden каждые 30 секунд (минимальный, recommend)

Заменить `setTimeout(30s)` на `setInterval(30s)` в [PvlPrototypeApp.jsx:8170-8177](../../views/PvlPrototypeApp.jsx#L8170-L8177).

**Pros:** 1 файл, ~3 LOC; чинит сценарий menti-видит-mentor-action в worst-case ~30s; полезен и для других UI (admin students etc.).
**Cons:** трафик +1 PostgREST query per 30s per opened tab; нагрузка на /pvl_student_homework_submissions может вырасти (всё-таки full re-fetch для всех students). Для menti роли только её собственные данные — небольшой объём; для admin/mentor роли могут быть тяжелее.
**Размер:** S (1 файл, ~5 LOC).

### Fix B — visibilitychange + focus listener (smart refresh при возврате во вкладку)

Добавить `document.addEventListener('visibilitychange', () => { if (!document.hidden) syncPvlActorsFromGarden(); })` плюс `window.addEventListener('focus', …)`.

**Pros:** обновление ровно когда нужно (menti вернулась во вкладку); минимум фоновых запросов когда таб не активен; стандартная практика SWR/React Query.
**Cons:** на устаревших мобильных браузерах visibilitychange может срабатывать throttle'ом; если menti не _уходит_ из вкладки (просто сидит и ждёт) — никогда не сработает.
**Размер:** S (1 useEffect, ~10 LOC).

### Fix C — BroadcastChannel между табами (best для multi-tab) + B

Если у Юли/Ирины есть второй таб, BroadcastChannel позволит одному табу триггерить sync в другом по событию.

**Pros:** мгновенный sync между табами одного пользователя.
**Cons:** не помогает если у Юли и Ирины разные браузеры/устройства — а это типичный случай.
**Размер:** M (~30 LOC).

### Fix D — Реальный polling submissions конкретного task'а (а не всех студентов)

Для PvlTaskDetailView добавить `setInterval` который дёргает только `pvlPostgrestApi.listStudentHomeworkSubmissions(studentId)` (даже только эту одну submission).

**Pros:** легковесный, точечный.
**Cons:** ещё один путь sync, который нужно стыковать с `db.studentTaskStates` (можно ошибиться).
**Размер:** M.

### Fix E — Realtime через Supabase/PostgREST websocket

**Pros:** мгновенный sync, no polling.
**Cons:** мы НЕ используем Supabase realtime; PostgREST realtime требует pg_listen + WS. Большой кусок работы.
**Размер:** XL.

### Fix F (комплементарный) — расширить whitelist?

❌ **НЕ рекомендую.** Whitelist логически корректен — если status=in_review/accepted, edit не должен быть открыт. Если расширить — сломаем семантику. Корень не в whitelist'е.

---

### Рекомендация Ольге

**A + B вместе** (одним PR):
- A — гарантирует обновление raz na 30s даже если menti не уходит из вкладки;
- B — даёт мгновенную реакцию при возврате во вкладку (что и было кейсом Ирины утром 26.05 — она зашла после ночи, увидела что-то, дополнила).

Размер: S+S = малый PR, 1-2 файла, ~15 LOC. Бенчмарк трафика — отдельно (`pvl_student_homework_submissions` для роли student под её JWT возвращает только её собственные строки, RLS `student_id = auth.uid()`). Безопасно.

**Дополнительный задачи (отдельные тикеты, не блокер):**

1. **TG-HTML-PARSE — стрипать HTML до plain в `tg_enqueue_homework_event`** (SQL миграция):
   ```sql
   substring(regexp_replace(NEW.comment, '<[^>]+>', '', 'g'), 1, 200)
   ```
2. **STATUS-HISTORY-DUP-REGRESSION — починить `doPersistSubmissionToDb` slice(-3)**: либо вообще не слать прошлые записи (только последнюю), либо dedup по `(submission_id, from_status, to_status, changed_at, changed_by)` через ON CONFLICT в PostgREST. **Это уберёт и дубль-актеров, и дубль-TG, и дубль-history.**

---

## Что НЕ делалось в этой разведке

- Никаких write / UPDATE / INSERT / migrations / commits — read-only psql + git log.
- Никаких изменений в коде / схеме / данных.
- Не правил статус submission Ирины — это отдельная задача (см. _130 § 5.4 вариант E).
