# DIFF-ON-REVIEW · Напоминалка «внести результат встречи»

**Дата:** 2026-07-11 · **Автор:** codeexec · **№** 261
**Статус:** ожидает 🟢 · **Тип:** фронт (окно 403, можно батчить с другими фронт-правками)
**Основано на recon** этой сессии.

## Суть

На входе в кабинет ловим встречи ведущей, которые уже прошли, но остались
`planned` (итог не внесён), и показываем всплывашку с CTA «Внести результат».
Форму не строим — она уже есть (`MeetingsView` → модалка «Итоги встречи»); всплывашка
лишь приводит к ней.

**Единый источник derive:** выносим `isMeetingPending` / `getPendingMeetings` в
`utils/meetingTime.js` и рефакторим 3 существующих места на него — не плодим 4-й.

### Ограничения (осознанные, v1)
- **Co-hosted встречи, где ведущая не владелец (`user_id`), — вне scope.**
  `api.getMeetings(user.id)` отдаёт только её строки; напоминалка их не увидит.
  Итог по такой встрече вносит владелец — корректно.
- CTA ведёт на вкладку встреч целиком (вариант «б»): карточки прошедших встреч
  уже подсвечены амбер «Ждёт результата». **Не** добавляем `openMeetingId`-проп —
  работает и когда встреч несколько.
- Показ — один раз за сессию (dismiss в `sessionStorage`), обе кнопки закрывают
  на сессию, чтобы модалка не всплывала повторно после сохранения одного итога.

---

## Файл 1 — `utils/meetingTime.js` (добавить после `isMeetingPast`)

```js
// «Ждёт результата»: встреча запланирована, но её момент уже в прошлом —
// ведущей нужно внести итог (перевести в completed). ЕДИНЫЙ derive-источник,
// используется в MeetingCard, календаре-точках и сортировке MeetingsView,
// а также в напоминалке на входе в кабинет (UserApp). Не дублировать условие.
export const isMeetingPending = (meeting, now = new Date()) =>
    meeting?.status === 'planned' && isMeetingPast(meeting, now);

export const getPendingMeetings = (meetings = [], now = new Date()) =>
    (Array.isArray(meetings) ? meetings : []).filter(m => isMeetingPending(m, now));
```

---

## Файл 2 — `components/MeetingCard.jsx`

**Импорт (стр. 4):** `isMeetingPast` больше не нужен в этом файле → меняем на `isMeetingPending`.

```diff
-import { getMeetingInstant, getMeetingTimezone, isMeetingPast, isMeetingDeletable } from '../utils/meetingTime';
+import { getMeetingInstant, getMeetingTimezone, isMeetingPending, isMeetingDeletable } from '../utils/meetingTime';
```

**Тело (стр. 20-27):** `isPast`/`isPlanned` использовались только для `isPending` — схлопываем.

```diff
-    // Helpers
-    const isPast = isMeetingPast(meeting);
-    const isPlanned = meeting.status === 'planned';
-
-    // Auto-detect "Pending" state for UI: Planned but date passed
-    const isPending = isPlanned && isPast;
-
-    // Effective status for UI rendering
+    // «Ждёт результата»: прошла, но осталась planned (единый derive)
+    const isPending = isMeetingPending(meeting);
+
+    // Effective status for UI rendering
     const status = isPending ? 'pending' : (meeting.status || 'planned');
```

---

## Файл 3 — `views/MeetingsView.jsx`

**Импорт (стр. 7):** `isMeetingPast` больше не используется напрямую (обе точки уходят на pending).

```diff
-import { isMeetingPast } from '../utils/meetingTime';
+import { isMeetingPending } from '../utils/meetingTime';
```

**Место A — календарь-точки, `getDayStatusColor` (стр. 63-66):**

```diff
-        const hasPending = dayMeetings.some(m => {
-            const isPast = isMeetingPast(m);
-            return (m.status === 'planned' && isPast) || m.status === 'pending';
-        });
+        const hasPending = dayMeetings.some(m => isMeetingPending(m) || m.status === 'pending');
```

> ✅ **CHECK проверен на проде (read-only):** на `meetings.status` CHECK-констрейнта
> НЕТ (есть только `meetings_format_check`, `meetings_online_visibility_check`).
> БД `'pending'` не запрещает → по ack **оставляю defensive** `|| m.status === 'pending'`.
> Прод-значения сейчас: `planned/completed/cancelled`.

**Место B — сортировка, `getStatus` (стр. 220-224):**

```diff
         const getStatus = (m) => {
-            const isPast = isMeetingPast(m);
-            if (m.status === 'planned' && isPast) return 'pending';
+            if (isMeetingPending(m)) return 'pending';
             return m.status || 'planned';
         };
```

---

## Файл 4 — `views/UserApp.jsx` (сама всплывашка)

Иконка `CalendarCheck2` уже импортирована (стр. 6). `Button` уже импортирован.

**Импорт (после стр. 30):**

```diff
 import { api } from '../services/dataService';
+import { getPendingMeetings } from '../utils/meetingTime';
```

**State (рядом с `notificationModal`, стр. 64):**

```diff
     const [notificationModal, setNotificationModal] = useState(null);
+    const [resultReminder, setResultReminder] = useState(null); // массив pending-встреч или null
```

**Эффект (рядом с блоком Notification handling, ~стр. 532):**

```js
    // Напоминание «внести результат»: на входе ловим прошедшие planned-встречи
    // (getPendingMeetings — единый derive). Один раз за сессию, чтобы не мешать
    // работе и не всплывать повторно после сохранения одного итога.
    useEffect(() => {
        if (!user?.id) return;
        const dismissKey = `garden_result_reminder_dismissed_${user.id}`;
        if (sessionStorage.getItem(dismissKey)) return;
        const pending = getPendingMeetings(meetings);
        if (pending.length > 0) setResultReminder(pending);
    }, [meetings, user?.id]);

    const dismissResultReminder = () => {
        if (user?.id) sessionStorage.setItem(`garden_result_reminder_dismissed_${user.id}`, '1');
        setResultReminder(null);
    };

    const handleGoToMeetingsFromReminder = () => {
        dismissResultReminder();
        setView('meetings');
    };
```

**JSX (сразу после блока `{notificationModal && (…)}`, ~стр. 1235):**

```jsx
            {/* Напоминание внести результат встречи */}
            {resultReminder && resultReminder.length > 0 && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="surface-card p-8 w-full max-w-sm text-center relative animate-in zoom-in-95 duration-300 ring-1 ring-black/5">
                        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CalendarCheck2 size={32} className="text-amber-500" />
                        </div>
                        <h3 className="text-xl font-display font-semibold text-slate-900 mb-2">
                            Пожалуйста, внеси результат встречи
                        </h3>
                        <p className="text-slate-500 mb-8">
                            Давай отпразднуем завтрак! Впиши итоги, сделай рефлексию, поставь цели. Ты великолепна!
                        </p>
                        <div className="flex flex-col gap-2">
                            <Button onClick={handleGoToMeetingsFromReminder} className="w-full py-4 text-base">Внести результат</Button>
                            <button onClick={dismissResultReminder} className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition">Позже</button>
                        </div>
                    </div>
                </div>
            )}
```

> Множественное число — без числа в тексте (обходим склонение «встреча/встречи/встреч»).
> Амбер-палитра и `CalendarCheck2` — под стать статусу «Ждёт результата» на карточках.

---

## Проверка после 🟢
- Прошедшая planned-встреча → на входе всплывашка; «Позже» → не появляется до перезахода; «Внести» → вкладка «Встречи», карточка амбер.
- Нет прошедших planned → тишина.
- Сохранил один итог при двух pending → модалка не всплывает повторно (dismiss-сессия).
- Карточки/календарь/сортировка после рефактора выглядят как раньше.
- `npm run build` зелёный, нет unused-import (eslint).

## Файлы
- `utils/meetingTime.js` (+2 функции)
- `components/MeetingCard.jsx` (импорт + 6→2 стр.)
- `views/MeetingsView.jsx` (импорт + 2 точки)
- `views/UserApp.jsx` (импорт + state + эффект + JSX)
