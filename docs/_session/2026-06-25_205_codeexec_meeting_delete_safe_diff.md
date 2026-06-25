# 205 · Безопасное удаление встречи ведущей — RECON + DIFF (ждёт 🟢)

**Дата:** 2026-06-25
**Агент:** codeexec
**Источник:** ведущая Маша Бочкарёва через Ольгу — «дать удалять ошибочно/тестово внесённую встречу, вкл. прошедшую дату».
**Статус:** разведка завершена, diff предложен, **код НЕ применён** — жду 🟢.

---

## TL;DR (что важно знать до чтения)

1. **Премиса задачи частично устарела.** Удаление встречи у ведущих **уже есть и задеплоено** (cfb740d, 2026-06-19) — кнопка «Удалить» в `MeetingCard` для всех статусов (planned/pending/completed/cancelled), полная обвязка с confirm-модалкой. Это не «wire-up отсутствующей фичи», а **починка существующего небезопасного удаления**.
2. **Осиротевших `events` НЕ возникает.** Зеркало в публичную таблицу `events` снимает **живой триггер БД** `on_meeting_change_sync_event` (AFTER DELETE → `DELETE FROM events WHERE garden_id=OLD.id`). Проверено на проде: 0 осиротевших строк. Концерн (1) из задачи уже закрыт триггером.
3. **Реальные дыры существующего удаления** (то, что чинить):
   - нет гарда — ведущая может hard-delete **завершённую** встречу (+25 семян себе и со-ведущим уже начислены, отката нет). На проде таких 145.
   - латентный баг: два FK `ON DELETE NO ACTION` (`goals.linked_meeting_id`, self-ref `meetings.rescheduled_to`) могут уронить DELETE в 409 → ведущая видит «Ошибка при удалении».
   - откат семян не делается (для no-consequence встреч это только +5 за создание).

---

## 1. Разведка по живой схеме (psql на проде, под gen_user, read-only)

### 1.1 Зеркало meetings → events — ТРИГГЕР, не код
`migrations/03_enable_public_schedule.sql` + `2026-06-15_phase44_event_cohosts_sync.sql`:
триггер `on_meeting_change_sync_event` AFTER INSERT/UPDATE/DELETE ON meetings, `SECURITY DEFINER`.
Ветка DELETE: `DELETE FROM public.events WHERE garden_id = OLD.id`.

**Проверка прода:**
```
Q1: on_meeting_change_sync_event | enabled=O | has_delete_branch=t | security_definer=t
Q4: orphaned_events = 0
```
→ Сырой `DELETE /meetings` **сам по себе НЕ осиротит** публичное расписание. `updateEvent`-ветка `garden_id` (~2159) — это обратная синхронизация при апдейте, к удалению отношения не имеет.

### 1.2 Семена за встречу — клиентская логика, ledger'а НЕТ
`migrations/09_meeting_seeds_awarded.sql`: `seeds_awarded boolean default false` (НЕ массив/счётчик — задача предполагала «пуст/0»).
Начисление целиком в `views/UserApp.jsx`, не в БД:
- **+5 при создании** (`handleAddMeeting`, всегда) — хосту (через `onUpdateUser`) и со-ведущим (`incrementUserSeeds(co_hosts, 5)`).
- **+25 при завершении** (`handleUpdateMeeting`, переход в `status='completed'`, `!alreadyAwarded`) — хосту и со-ведущим, выставляет `seeds_awarded=true`.
- `profiles.seeds` — **бегущий баланс**. Нет per-meeting ledger → чистый автооткат невозможен в общем случае.

**Проверка прода (Q5, распределение):**
```
cancelled / false : 50
completed / false :  2
completed / true  : 145
planned   / false : 77
```
Вывод: `seeds_awarded=true` встречается **только** на completed. На no-consequence встречах (planned/cancelled) единственный начисленный бонус — **+5 за создание**, и он откатывается симметрично (одно начисление).

### 1.3 RLS и GRANT — ведущая может удалить свою
```
Q2 (RLS DELETE на meetings): "Users can delete own meetings"  USING (auth.uid() = user_id)
    → админской политики delete-any в проде НЕТ (миграция 08 определяла meetings_delete_admin,
      но в проде её нет — есть только own-delete).
Q3 (table GRANT для authenticated): meetings = SELECT/INSERT/UPDATE/DELETE; events = то же.
```
→ Ведущая удаляет **только свою** (RLS). **Админ удалить чужую через клиент сейчас НЕ может** (нет политики и нет admin-UI удаления — см. §4). `co_hosts` — `uuid[]` колонка на meetings, удаляется вместе со строкой; label в `events.co_hosts` чистится триггером.

### 1.4 FK на meetings — два `NO ACTION`, оба могут уронить DELETE
```
Q7: goals.linked_meeting_id  → meetings.id   ON DELETE NO ACTION   (сейчас ссылаются 2 цели, 1 активная)
    meetings.rescheduled_to  → meetings.id   ON DELETE NO ACTION   (self-ref)
```
→ Удаление встречи, на которую ссылается цель или «перенос», **падает 409 FK violation**. Текущий `deleteMeeting` это не обрабатывает.
`increment_user_seeds(uuid[],int)` — `authenticated` имеет EXECUTE (Q6=t) → откат семян технически возможен.

---

## 2. Существующая обвязка удаления (что уже в коде, задеплоено)

`components/MeetingCard.jsx`: кнопка «Удалить» (Trash2) в развёрнутой карточке в трёх ветках — planned/pending (стр. 240), completed (стр. 299), cancelled (стр. 323) → `onDelete(meeting.id)`.
Поток: `MeetingCard.onDelete` → `MeetingsView.handleDeleteMeeting` (стр. 1015) → confirm `ModalShell` (стр. 1669, «Удалить встречу? Это действие нельзя будет отменить») → `handleConfirmDelete` → `UserApp.handleDeleteMeeting` (стр. 402) → `api.deleteMeeting` → **сырой** `DELETE /meetings?id=eq.X`.

**Почему Маша считает, что удаления нет** (гипотеза): кнопка только в **развёрнутой** карточке, а для прошедшей planned-встречи (UI-статус `pending`) на виду крупные CTA «Внести результат» / «Не состоялась» (стр. 194-199) — Delete спрятан под «шеврон». Это discoverability, не отсутствие. (Опциональный follow-up в §5.)

---

## 3. Предлагаемый подход

**Hard-delete только для no-consequence встреч; завершённые не удаляем вообще (они и есть аудит/история).**

**Удаляемо (hard-delete) ⇔** `status !== 'completed'` И `seeds_awarded !== true`.
Покрывает: planned (будущие и прошедшие-pending) + cancelled. Это ровно кейс Маши (тестовая/ошибочная встреча, которую никогда не «завершали»). Единственный начисленный бонус — +5 за создание.

**НЕ удаляемо:** `completed` ИЛИ `seeds_awarded===true` → кнопку прячем, показываем подпись-почему. Для прошедшей-несостоявшейся правильный путь: «Не состоялась» (→ `cancelled`, а cancelled уже удаляемо).

**Почему hard, а не soft (hidden):** для мусорных/тестовых строк аудит не нужен, а триггер держит публичное зеркало чистым автоматически. Soft-delete потребовал бы колонку + фильтры везде + усложнение триггера (`is_public`/`status`). Завершённые встречи мы и так **не трогаем** — они остаются полной историей. Итог: мусор удаляется начисто, реальная история сохраняется целиком. Совпадает с твоим уклоном «hard-delete только для no-consequence, иначе cancel».

### Слои (owner-layer fix по CLAUDE.md)

**A. Сервис `dataService.js` → `RemoteApiService.deleteMeeting` (~2106) — источник правды:**
```js
async deleteMeeting(meetingId) {
    // 1) Гард: не hard-delete'им встречу с последствиями (completed / начислены семена).
    const { data: rows } = await postgrestFetch('meetings', {
        id: `eq.${meetingId}`, select: 'id,status,seeds_awarded'
    });
    const m = Array.isArray(rows) ? rows[0] : rows;
    if (m && (m.status === 'completed' || m.seeds_awarded === true)) {
        const err = new Error('Завершённую встречу нельзя удалить — она учтена в вашей статистике и семенах.');
        err.userFacing = true;
        throw err;
    }
    // 2) Снять NO ACTION-ссылки, иначе DELETE упадёт 409 (цель / перенос).
    try {
        await postgrestFetch('goals', { linked_meeting_id: `eq.${meetingId}` },
            { method: 'PATCH', body: { linked_meeting_id: null }, returnRepresentation: false });
    } catch (e) { console.warn('clear goal link before meeting delete failed', e); }
    try {
        await postgrestFetch('meetings', { rescheduled_to: `eq.${meetingId}` },
            { method: 'PATCH', body: { rescheduled_to: null }, returnRepresentation: false });
    } catch (e) { console.warn('clear reschedule ref before meeting delete failed', e); }
    // 3) Зеркало в events снимет триггер on_meeting_change_sync_event автоматически.
    await postgrestFetch('meetings', { id: `eq.${meetingId}` },
        { method: 'DELETE', returnRepresentation: true });
    return true;
}
```
RLS: PATCH `goals`/`meetings` идёт под JWT ведущей и затронет только её строки (чужие no-op'нутся политикой — безопасно).
Параллельно выровнять `LocalStorageService.deleteMeeting` (~757): тот же гард + удалить локальное зеркало `garden_events` (где `garden_id===meetingId`) — в моке триггера нет.

**B. UI `components/MeetingCard.jsx` — рендерить «Удалить» только когда удаляемо.**
Новый чистый предикат (предлагаю в `utils/meetingTime.js`, рядом с `isMeetingPast`):
```js
export const isMeetingDeletable = (meeting) =>
    !!meeting && meeting.status !== 'completed' && meeting.seeds_awarded !== true;
```
- planned/pending и cancelled ветки: обернуть существующую кнопку в `{isMeetingDeletable(meeting) && (…)}` (по сути всегда true там, но защита на будущее).
- **completed ветка: убрать кнопку «Удалить»** (стр. 299-304) и добавить тихую подпись:
  `Завершённую встречу удалить нельзя — она в вашей статистике и семенах. Если встреча не состоялась, отметьте её через «Не состоялась».`
- Confirm-модалку оставляем существующую (`ModalShell`, стр. 1669) — копию можно чуть смягчить. (Задача упоминала `ConfirmationModal`; цели используют именно его, встречи — bespoke `ModalShell`. Унификация — опционально, не блокер.)

**C. Откат +5 за создание — ОТКРЫТОЕ РЕШЕНИЕ (см. §6, реш. 1).** Рекомендую делать (симметрично `handleAddMeeting`), т.к. для no-consequence удаления это единственные семена и откат корректен:
```js
// UserApp.handleDeleteMeeting, после успешного api.deleteMeeting:
const m = meetings.find(x => String(x.id) === String(meetingId));
onUpdateUser({ ...user, seeds: Math.max(0, (user.seeds || 0) - 5) });
const coHosts = Array.isArray(m?.co_hosts) ? m.co_hosts : [];
if (coHosts.length) { try { await api.incrementUserSeeds(coHosts, -5); } catch (e) { console.warn(e); } }
// + показывать e.userFacing ? e.message : 'Ошибка удаления встречи' в catch
```

---

## 4. Что НЕ делаю в этом изменении (флагаю)

- **Админ удаляет любую** — в проде нет ни RLS-политики delete-any, ни admin-UI удаления встреч. Потребность Маши = self-delete ведущей, она RLS-обеспечена. Admin-any — отдельная задача (новая политика `meetings_delete_admin` + UI). Делать?  → реш. 3.
- **Discoverability** (Delete спрятан в развёрнутой карточке) — отдельный UX-твик, не трогаю без отдельного 🟢.

---

## 5. Edge-кейсы (что будет)

| Кейс | Поведение после фикса |
|---|---|
| Прошедшая `planned` (pending), не «завершалась», тест/ошибка | **Удаляемо** (seeds_awarded=false). Кейс Маши. ✅ |
| `completed/true` (145 на проде) | Кнопки нет, подпись-почему. +25 себе/со-ведущим остаются (отката нет). |
| `completed/false` (2 на проде) | Кнопки нет (гард по `status==='completed'`). Это реальная история (гости/доход в аналитике) — сохраняем. |
| `cancelled` (50) | Удаляемо (на cancelled `seeds_awarded` всегда false). +5 за создание откатывается (если реш.1=да). |
| Встречу удаляют, на неё ссылается цель | `goals.linked_meeting_id` → null перед DELETE; цель остаётся, просто отвязана. Без 409. |
| Встреча в публичном расписании (is_public, будущая) | Триггер снимает строку `events` → исчезает из публичного. Намеренно. ✅ |
| Со-ведущие | Их +5 откатывается (реш.1=да); +25 на completed не трогаем (completed не удаляем). |

---

## 6. Открытые решения (нужен твой выбор)

1. **Откат +5 за создание при удалении?**
   - **(рек.) Да** — симметрично начислению; делает удаление по-настоящему «без следа». Риск: `incrementUserSeeds(co_hosts, -5)` — неизвестно, клампит ли RPC до 0 (свой баланс клампим `Math.max(0,…)` на клиенте).
   - Нет — принять утечку +5 за тестовую встречу (проще, нулевой риск по балансам).
2. **Подпись на completed-карточке** — мой текст ок, или свой?
3. **Admin-delete-any сейчас или отдельно?** (рек.: отдельно — вне scope потребности Маши).
4. **Унифицировать confirm на `ConfirmationModal`** (как у целей) или оставить `ModalShell`? (рек.: оставить — меньше диффа).

---

## 7. План проверки (после 🟢, перед деплоем)

1. Локально (mock): создать planned → удалить → исчезла, +5 откатился (если реш.1). Завершить встречу → кнопки «Удалить» нет, видна подпись.
2. Cancelled → удалить ок. Pending (прошлая planned) → удалить ок.
3. Привязать цель к planned-встрече → удалить встречу → нет 409, цель отвязана.
4. Real-режим smoke на тест-аккаунте ведущей (если доступен): удалить свою будущую публичную встречу → проверить, что строка в `events` ушла (через публичное расписание).
5. Сборку и деплой — CI сам (`npm run build`), dist не коммитим.

**Файлы под изменение:** `services/dataService.js` (2 метода), `components/MeetingCard.jsx`, `utils/meetingTime.js` (+предикат), `views/UserApp.jsx` (откат +5, если реш.1). Деструктивно + публичный фронт → жду 🟢.

---

## 8. ФИНАЛ — что реализовано (🟢 получен, на ревью перед деплоем)

Все решения §6 применены по твоим уточнениям. Build ✓, eslint: 0 новых ошибок (19=19, все pre-existing).

### Находимость (pending) — корень жалобы Маши
В **свёрнутую** строку действий pending-карточки (рядом с «Внести результат / Не состоялась») добавлена компактная иконка-корзина (Trash2, touch-target 44×44, `aria-label`/`title`, красный hover). Видна **без раскрытия карточки**. → ведущая находит удаление прошедшей встречи сразу.
- planned-будущие и cancelled: «Удалить» осталась в раскрытом ряду действий, но теперь под `{deletable && …}`.
- completed: кнопки нигде нет + подпись (см. ниже).
Итог когерентный: удаляемая → «Удалить» очевидна; completed → кнопки нет + объяснение.

### Откат семян
- **Хосту +5 за создание — откат сделан** (`UserApp.handleDeleteMeeting`): `seeds = Math.max(0, seeds-5)` на своём профиле (PATCH own, RLS ок). Клампится в 0.
- **Со-ведущим +5 — НЕ откатываю, остановился и показываю (как просила).** Причина однозначна: `increment_user_seeds` = `set seeds = coalesce(seeds,0) + amount` — **не клампит** и применяет одну сумму ко всем `user_ids` сразу → у со-ведущего с балансом < 5 уведёт в минус. Per-user клампить нельзя: ведущая не может PATCH'ить чужой профиль (RLS profiles=own-only), а единственный обходной путь — этот самый RPC. → завёл **BACKLOG MEETING-COHOST-SEED-REFUND (P3)**: нужен RPC с `greatest(0, seeds-amount)` либо отдельная definer-функция отката. **Решение за тобой:** оставить так (мелкая утечка, у тестовых встреч со-ведущих обычно нет) или поднять приоритет.

### Enforcement: RLS + сервис + UI (3 слоя)
- **RLS (продавлено, дёшево):** миграция `migrations/2026-06-25_phase45_meeting_delete_safe_rls.sql` — `ALTER POLICY "Users can delete own meetings."` → `USING (auth.uid()=user_id AND status<>'completed' AND COALESCE(seeds_awarded,false)=false)`. Один statement, без миграции данных. Прямой PostgREST-DELETE под JWT ведущей по completed-встрече теперь отклоняется БД.
- **Сервис (`dataService.deleteMeeting`):** тот же гард до DELETE — даёт **понятную ошибку** («Завершённую встречу нельзя удалить…», `userFacing`) вместо немого RLS-отказа; плюс снимает NO ACTION-FK (goals.linked_meeting_id, meetings.rescheduled_to) перед DELETE — чинит латентный 409.
- **UI:** кнопка не рендерится для completed.
- **Остаточный риск:** RLS обходит только `gen_user`/owner (бэкенд/админ-скрипты) — для клиентских JWT (ведущие) обход закрыт. Admin-UI удаления нет (BACKLOG MEETING-ADMIN-DELETE-ANY P3).

### Подпись на completed-карточке (дословно, NBSP + ёлочки)
«Завершённую встречу удалить нельзя — по&nbsp;ней уже начислены семена.»
- Обрезано до одного предложения по твоему уточнению (убрал «Если встречи не было, отметьте «Не состоялась»» — у completed этой кнопки нет, совет вёл в тупик). NBSP+ёлочки сохранены.

### Файлы (для ревью)
- `utils/meetingTime.js` — `isMeetingDeletable()`.
- `services/dataService.js` — `RemoteApiService.deleteMeeting` (гард+FK+delete), `LocalStorageService.deleteMeeting` (гард + ручное зеркало events для мока).
- `components/MeetingCard.jsx` — находимость pending, гейтинг кнопок, подпись completed.
- `views/UserApp.jsx` — откат +5 хосту + `userFacing`-ошибка.
- `migrations/2026-06-25_phase45_meeting_delete_safe_rls.sql` — RLS-гард (НОВЫЙ).
- `plans/BACKLOG.md` — MEETING-ADMIN-DELETE-ANY, MEETING-COHOST-SEED-REFUND (P3).

### Порядок деплоя (после финального 🟢)
1. Применить миграцию phase45 на проде (scp + psql под gen_user, как в RUNBOOK). Smoke: V1 покажет новый USING.
2. Фронт — git push, CI (`npm run build`) сам. dist НЕ коммитим.
3. Пост-деплой smoke (если route ляжет — Ольга сменит ноду VPN):
   - тест-аккаунт ведущей: pending-встреча → корзина видна в свёрнутой карточке → удалить → ушла, баланс −5 (кламп).
   - completed-встреча → кнопки нет, видна подпись; прямой DELETE под её JWT по completed → 4xx (RLS).
   - привязать цель к planned → удалить встречу → нет 409, цель отвязана.
   - публичная будущая встреча → удалить → исчезла из публичного расписания (триггер).
