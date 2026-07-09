# DIFF-on-review — убрать «Коммуникации» из меню (keep-as-fallback)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 НЕ применён. Фронт → **батчим в следующее окно 403** вместе с обязательным
`@username`-полем и UX-полировкой 1d. Жду 🟢.
**Скоуп:** только видимость пункта меню. Вью-компонент, роут-хендлер, бэкенд — НЕ трогаю.

---

## Что нашёл

Пункт «Коммуникации» рендерится в [`views/UserApp.jsx`](../../views/UserApp.jsx) в **двух** местах
(десктоп + мобильный сайдбар), оба уже под `{isAdmin && …}` (виден только админам):
- десктоп-nav: строка **820–827**
- мобайл-nav: строка **974–976**

Рендер самого вью — строка **1080** (`view === 'communications' && isAdmin`). Роут-хендлер —
`handleViewChange('communications')`. Компонент — `views/CommunicationsView.jsx` (lazy).

## Фоновое поведение — проверил, планового слать НЕЧЕГО

- Единственный таймер — `setInterval(loadMessages, CHAT_POLL_INTERVAL_MS)` в
  `CommunicationsView.jsx:140`, внутри `useEffect` с гардом `if (tab !== 'chat') return`.
  `loadMessages` — **чтение** истории чата (GET), не отправка. Плюс realtime-подписка
  `subscribeToMessages` (тоже только на чтение).
- Оба живут **внутри смонтированного вью** и глохнут на unmount. Пока пункт меню скрыт, вью не
  монтируется UI-путём → поллинг/подписка не работают. **Ни расписания, ни фоновой рассылки,
  ни бэкенд-cron, привязанного к разделу, нет.** Скрытие пункта меню ни на что в фоне не влияет.

## Дифф (одна строка на возврат)

Вводим модульный флаг и гейтим им оба nav-пункта. Возврат раздела = флаг в `true` (одна строка).
Рендер вью (1080) и хендлер оставляем как есть → функция полностью запасная.

```diff
@@ views/UserApp.jsx — после импортов (≈ строка 31), перед `const SidebarItem` @@
 import { api } from '../services/dataService';

+// keep-as-fallback: пункт меню «Коммуникации» скрыт (Фаза 3, 2026-07-10).
+// Вернуть раздел в меню = поставить true. Вью/роут/бэкенд не удалялись.
+const SHOW_COMMUNICATIONS_NAV = false;
+
 // Sidebar Item Component
 const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) => (
```

```diff
@@ views/UserApp.jsx:820 — десктоп-nav @@
-                                    {isAdmin && (
+                                    {SHOW_COMMUNICATIONS_NAV && isAdmin && (
                                         <SidebarItem
                                             icon={MessagesSquare}
                                             label="Коммуникации"
                                             active={view === 'communications'}
                                             onClick={() => handleViewChange('communications')}
                                         />
                                     )}
```

```diff
@@ views/UserApp.jsx:974 — мобайл-nav @@
-                                {isAdmin && (
+                                {SHOW_COMMUNICATIONS_NAV && isAdmin && (
                                     <SidebarItem icon={MessagesSquare} label="Коммуникации" active={view === 'communications'} onClick={() => handleViewChange('communications')} />
                                 )}
```

## НЕ трогаю (fallback остаётся рабочим)
- `views/UserApp.jsx:1080` — рендер `<CommunicationsView …>` (по `view === 'communications'`).
- `handleViewChange('communications')` — хендлер.
- `views/CommunicationsView.jsx`, `migrations/17_create_messages_chat.sql`, бэкенд — без изменений.

## Возврат
Флаг `SHOW_COMMUNICATIONS_NAV = true` → оба пункта снова видны админам. Одна строка.

## Мелочь на заметку
Рядом (строки 838, 981) под тем же `{isAdmin && …}` идёт пункт «Админка» (`onSwitchToAdmin`) —
его НЕ трогаю, флаг только на «Коммуникации».

**Не применяю до 🟢. В общий фронт-батч следующего окна 403.**
