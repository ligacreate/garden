# Pre-flight Сессии 3: угробит ли авто-sync ввод в wizard сертификации

**Дата:** 2026-05-30 · **Кто:** codeexec · **Режим:** READ-ONLY (правок нет)
**Контекст:** BUG-PVL-AUTOREFRESH-BREAKS-MENTOR-INPUT (откат `46cc058` → вернулся `setTimeout(30s)`). Перед монтированием cert-wizard в `PvlPeerProfileView`.

---

## ВЕРДИКТ: ДА (безопасно) — при текущем механизме, если Сессия 3 строит wizard как существующий прецедент

Текущий sync **сам по себе ввод не угробит**: он даёт re-render, НЕ remount, и не перезаписывает локальный стейт. Опасность не в механизме, а в потенциальных анти-паттернах Сессии 3 (controlled-from-refetch / key на данных). Рекомендованная митигация — ниже, она же «как не наступить».

---

## 1. Текущий механизм авто-sync

| Что | Факт |
|---|---|
| **Mount-эффект** | [PvlPrototypeApp.jsx:8175-8224](../../views/PvlPrototypeApp.jsx#L8175-L8224), deps `[embeddedInGarden]` — один раз на mount: SWR-кэш → `syncPvlRuntimeFromDb` → `syncPvlActorsFromGarden` (+повтор через 600мс если embedded), несколько `forceRefresh()` в первые ~600мс. |
| **«Периодический» sync** | [PvlPrototypeApp.jsx:8227-8234](../../views/PvlPrototypeApp.jsx#L8227-L8234): `setTimeout(async()=>{ syncPvlActorsFromGarden(); forceRefresh(); }, 30000)`, **deps `[]`**. |
| **setInterval / focus / visibilitychange?** | **НЕТ.** Это и был откат `46cc058`. Грепом по App: только `addEventListener('resize')` в MentorKanbanBoard. |
| **Что обновляет** | `forceRefresh = () => setDataTick(x=>x+1)` ([:8148](../../views/PvlPrototypeApp.jsx#L8148)). `dataTick` → проп `refreshKey={dataTick}` в Student/Mentor/AdminPage ([:8322,8329,8340](../../views/PvlPrototypeApp.jsx#L8322)) через `content` useMemo (deps включают `dataTick`). |

**Ключевой факт:** `setTimeout` + deps `[]` ⇒ срабатывает **РОВНО ОДИН РАЗ** на +30с после mount кабинета (не перевзводится; навигация — internal route-state, `PvlPrototypeApp` не ремаунтится). После +30с авто-sync'а больше нет вообще. Это НЕ `setInterval`.

## 2. Цепочка ре-рендера: remount или re-render?

`forceRefresh()` → `dataTick++` → `content` useMemo → новый `<StudentPage refreshKey={dataTick} …/>` (или Mentor/Admin).

- `StudentPage`/`MentorPage` рендерят `<PvlPeerProfileView peerId=… viewerRole=… viewerId=… />` **БЕЗ `key` и БЕЗ `refreshKey`** ([:3439](../../views/PvlPrototypeApp.jsx#L3439), [:4152](../../views/PvlPrototypeApp.jsx#L4152), [:7741](../../views/PvlPrototypeApp.jsx#L7741)). Пропсы (`peerId`, `navigate`-useCallback, `viewerId`, `viewerRole`) **не зависят от `dataTick`**.
- [PvlPeerProfileView.jsx](../../views/PvlPeerProfileView.jsx) — **stateless**: ни `useState`, ни `useEffect`, ни fetch, не `React.memo`. Просто рендерит `PvlTrainingSessionBlock`.

⇒ Бамп `dataTick` = **RE-RENDER поддерева, НЕ REMOUNT.** Нет `key`, завязанного на `dataTick`/данные, нет условного unmount. **React сохраняет локальный `useState` при re-render** — значит textarea-стейт wizard'а выживет.

**Прецедент (живёт в проде рядом, туда же встанет cert-блок):** [PvlTrainingSessionBlock.jsx](../../components/PvlTrainingSessionBlock.jsx) — локальный `useState` (sessions, форма в модалке: `topic`/`conductedAt`), fetch на `[studentId]` (НЕ `refreshKey`), `key={s.id}` (стабильный, не на данных/тике). Уже сосуществует с +30с sync **без потери ввода**. То же делает текущий осиротевший [PvlSzAssessmentFlow.jsx](../../views/PvlSzAssessmentFlow.jsx): textarea `value={reflections[i]}` от **локального** `useState` + localStorage-draft.

## 3. Механизм оригинального бага (источник: revert-коммит `46cc058`)

Откаченный хотфикс `9a6192f` добавлял `setInterval(30s)` **+ `visibilitychange`/`focus` re-fetch**, который **переписывал `state.taskDetail` каждые 30с** (и при каждом возврате фокуса на вкладку). RichEditor ментора в проверке ДЗ читает значение из `state.taskDetail` → перезапись стейта-источника сбрасывала редактор → набранный текст исчезал (Юля Габрух, Василина Лузина, 27.05 11:24). Т.е. баг = **refetch перезаписывал данные, от которых controlled-редактор брал value, прямо во время набора** (+ агрессивные триггеры focus/visibility).

## 4. Почему сейчас безопасно и где НЕ наступить

Текущий механизм отличается от баг-версии по всем трём осям: (а) one-shot `setTimeout`, не `setInterval`; (б) нет `focus`/`visibilitychange`; (в) cert-поддерево не ремаунтится и не controlled от refetch (PvlPeerProfileView без `refreshKey`/`key`). Единственное окно совпадения: пользователь открыл wizard в первые ~30с после загрузки кабинета **и** печатает дольше 30с — тогда один `forceRefresh` бампнёт `dataTick`, но это лишь re-render → локальный стейт цел.

**Рекомендованная митигация (она же — правила Сессии 3, самое чистое — повторить паттерн `PvlTrainingSessionBlock`):**

1. **Главное:** textarea/критерии wizard'а держать в **локальном `useState`** (или `ref`), инициализировать из fetched-данных/localStorage **один раз**, и НИКОГДА не пере-синкать значение из server-данных во время редактирования. Не делать `value={self.reflections[key]}` напрямую от рефетченного `self`.
2. **Не вешать `key`** на `PvlCertificationBlock`/`PvlSzAssessmentFlow`, завязанный на `refreshKey`/`dataTick` или на fetched-данные (`self.updated_at`, `status` и т.п.). Key — только на стабильное (`studentId`/`mode`).
3. `PvlCertificationBlock` грузит self/mentor на **`[studentId]`** (как `PvlTrainingSessionBlock`), а НЕ на `refreshKey` — тогда +30с бамп не дёргает даже его fetch. Refetch (`getCertificationCompare`) — только по явному действию (после submit/onCommitted), не во время набора.
4. Belt-and-suspenders (опц.): debounce-autosave черновика (`upsertCertificationSelfDraft`) + сохранять localStorage-draft как защиту от network-fail (уже есть в текущем компоненте).

Глобальный +30с sync править/гасить под wizard **не требуется** — пп. 1-3 закрывают класс бага локально. (Полноценный «sync, не трогающий focused-input» — отдельный тикет BUG-PVL-AUTOREFRESH-BREAKS-MENTOR-INPUT, для cert-wizard не блокер.)

---
**Файл:** `garden/docs/_session/2026-05-30_167_codeexec_preflight_autorefresh_wizard_focus.md`
