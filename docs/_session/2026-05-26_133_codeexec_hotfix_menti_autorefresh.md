# Hotfix P0: auto-refresh у клиента menti после mentor write

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега → Ольга
**Дата:** 2026-05-26
**Тикет:** BUG-PVL-MENTI-NO-AUTOREFRESH
**Связано:** [_131](2026-05-26_131_codeexec_recon_petrunya_edit_window_at_revision.md) recon (корень H3), [_132](2026-05-26_132_codeexec_manual_unblock_petrunya.md) manual unblock Ирины (разовый).

---

## Корень

Recon _131: у клиента menti **нет механизма auto-refresh после mentor write** — ни polling, ни visibilitychange, ни focus, ни websocket. После первичного init-sync state застывает до reload/SPA-навигации. У Ирины 25.05: Юля 18:48 написала revision в БД, но Иринин UI оставался на `'на проверке'` → `canEditStudentSubmission=false` → плейсхолдер вместо textarea. Манифест: «У меня нет окошка для доработки».

Manual unblock _132 разблокировал submission Ирины разово; baseline bug остался.

---

## Recon (read-only) перед apply

### Точные строки

`views/PvlPrototypeApp.jsx:8169-8177` (старый блок):

```jsx
// Повторный синк через 30 сек: подхватывает изменения в БД от других устройств
useEffect(() => {
    const id = setTimeout(async () => {
        try { await syncPvlActorsFromGarden(); } catch { /* ignore */ }
        forceRefresh();
    }, 30 * 1000);
    return () => clearTimeout(id);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

### Grep на конкурентов

```
visibilitychange / focus addEventListener / setInterval для PVL — нигде.
Только не-PVL:
- views/CommunicationsView.jsx:140  — чат-poll (CHAT_POLL_INTERVAL_MS)
- views/ProfileView.jsx:387         — 5s-счётчик
```

Подтверждено _131 § 3.1: никаких listener'ов / poll'ов для PVL submission/tracker/state. Конфликтов с уже существующими механизмами нет.

---

## Применённый diff

`views/PvlPrototypeApp.jsx`, `+32 / −6` LOC (net +26).

```diff
-    // Повторный синк через 30 сек: подхватывает изменения в БД от других устройств
+    // BUG-PVL-MENTI-NO-AUTOREFRESH (recon _131 H3): у menti не было механизма
+    // подхватить mentor-write — state застывал на in_review, edit-окошко
+    // не открывалось. Manual unblock Ирины — _132.
+    //
+    // [A] setInterval(30s) вместо setTimeout(30s) — фоновое обновление пока
+    //     menti на странице (worst case ~30s до подхвата revision от ментора).
+    // [B] visibilitychange + focus — мгновенный sync при возврате во вкладку.
+    //
+    // RLS student_id=auth.uid() ограничивает трафик — menti тянет только свои
+    // submissions; для mentor/admin объём больше, но это их штатный сценарий.
     useEffect(() => {
-        const id = setTimeout(async () => {
-            try { await syncPvlActorsFromGarden(); } catch { /* ignore */ }
-            forceRefresh();
-        }, 30 * 1000);
-        return () => clearTimeout(id);
+        let cancelled = false;
+        let syncing = false;
+        const triggerSync = async () => {
+            if (cancelled || syncing || document.hidden) return;
+            syncing = true;
+            try {
+                await syncPvlActorsFromGarden();
+            } catch { /* ignore */ }
+            syncing = false;
+            if (!cancelled) forceRefresh();
+        };
+        const intervalId = setInterval(triggerSync, 30 * 1000);
+        const onVisibility = () => { if (!document.hidden) triggerSync(); };
+        const onFocus = () => triggerSync();
+        document.addEventListener('visibilitychange', onVisibility);
+        window.addEventListener('focus', onFocus);
+        return () => {
+            cancelled = true;
+            clearInterval(intervalId);
+            document.removeEventListener('visibilitychange', onVisibility);
+            window.removeEventListener('focus', onFocus);
+        };
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, []);
```

### Что внутри

**Блок A — setInterval(30s):** фоновое обновление, чинит baseline кейс «menti на странице, mentor write на сервере». Worst case до подхвата ~30s.

**Блок B — visibilitychange + focus listener'ы:** мгновенный sync при возврате во вкладку. Оба нужны: visibilitychange покрывает табы/вкладки, focus добавляет надёжности для iframe (embeddedInGarden) и мобильного Safari.

**Защиты:**
- `cancelled` — никаких setState после unmount;
- `syncing` — если PostgREST query в полёте, новый не стартует (защита от дублей при быстрых focus/blur);
- `document.hidden` guard в `triggerSync` — таб скрыт ⇒ не нагружаем API/батарею, дождёмся visibilitychange.

**Чего не трогал:**
- Первичный init-sync `useEffect` (строки 8118-8167) — без изменений; новый interval начинает с задержки 30s как и было.
- `syncPvlActorsFromGarden` сама — без изменений, её внутренний `try/catch` и top-level обработка ошибок остаются.
- Никаких других listener'ов / polls / refactor — точечный fix.

**Sanity:** JSX parse OK через `@babel/parser`.

---

## Rationale (ссылкой на _131)

См. [_131 § 5: Предлагаемые fix'ы](2026-05-26_131_codeexec_recon_petrunya_edit_window_at_revision.md#предлагаемые-fixы):
- Fix A (setInterval) — closes baseline race.
- Fix B (visibilitychange + focus) — closes case «menti открыла таб после паузы».
- Рекомендация была «A+B одним PR». Применено.

Не применено сейчас (см. _131): Fix C (BroadcastChannel), Fix E (realtime websocket) — отложены, не блокер.

---

## Smoke план для Claude in Chrome

**Сценарий 1 — baseline polling (30s):**
1. Зайти как menti (любая активная, проще всего тестовая).
2. Открыть страницу задания (любое submission в статусе `in_review`).
3. Через psql под gen_user изменить `pvl_student_homework_submissions.status = 'revision'` для этого submission + INSERT в `pvl_homework_status_history` (или сделать revision через mentor-UI в другой вкладке от лица ментора).
4. Не делать reload, не уходить из вкладки. Подождать ≤30 секунд.
5. **Ожидание:** placeholder «Ответ уже отправлен и ожидает решения ментора» исчезает, на его месте появляются RichEditor + кнопки «Сохранить черновик» / «Отправить на проверку».

**Сценарий 2 — visibilitychange (instant):**
1. Зайти как menti на страницу задания в `in_review`.
2. Открыть другой таб (или Cmd+Tab на другое окно) → menti таб становится hidden.
3. В другой вкладке/как ментор сменить статус на `revision`.
4. Вернуться в menti таб (visibilitychange срабатывает).
5. **Ожидание:** в течение 1-2 секунд (время на async PostgREST query) edit-окошко появляется.

**Сценарий 3 — focus (instant):**
1. Зайти как menti на страницу задания в `in_review`.
2. Кликнуть в адресную строку или другой раз окно браузера → menti window теряет focus (но таб остаётся visible).
3. Через psql сменить статус на `revision`.
4. Кликнуть обратно в menti window → focus event срабатывает.
5. **Ожидание:** edit-окошко появляется.

**Сценарий 4 — anti-regression (нет двойного sync):**
1. Зайти как menti на страницу задания.
2. Быстро Cmd+Tab между табами 5 раз подряд за секунду.
3. Открыть DevTools → Network → отфильтровать `pvl_student_homework_submissions`.
4. **Ожидание:** не больше 1 в полёте одновременно (`syncing` guard работает).

**Сценарий 5 — cleanup (нет утечки timer'ов):**
1. Открыть DevTools → Console → набрать `setInterval`-watcher или просто посмотреть Performance.
2. Несколько раз перейти `/student/dashboard` ↔ `/student/results/...` (SPA-навигация).
3. **Ожидание:** при unmount PvlPrototypeApp interval/listener'ы освобождаются (нет двойных вызовов syncPvlActorsFromGarden).

**Сценарий 6 — battery / hidden tab:**
1. Открыть menti таб → перейти в другой таб надолго (5+ минут).
2. DevTools Network → filter PVL fetch.
3. **Ожидание:** в фоновом (hidden) состоянии никаких новых fetch'ей `pvl_student_homework_submissions` каждые 30s. Только при возврате (visibilitychange) — 1 fetch.

---

## Risk / откат

- **Risk:** ноль catastrophic — изменение чисто client-side, без миграций / DB schema / API contract changes.
- **Возможный side effect:** если у пользователя десятки menti (admin/mentor view) — нагрузка на API +1 request каждые 30s. PostgREST под RLS auth-юзера выдержит спокойно. Если станет шумно — можно сузить interval до 60s или включить guard «только когда route на task detail».
- **Откат:** `git revert <hash>` — снова setTimeout 1×. Никаких side-effects по DB.

---

## Commit / push

- **Commit:** жду 🟢 от Ольги (отдельно).
- **Push:** жду отдельного 🟢 ключевого слова PUSH.

Файл этой записи будет финализирован после commit (добавлю хеш + post-commit состояние).

---

## Что НЕ сделано (по инструкции)

- Не push'ил без отдельного PUSH-разрешения.
- Не трогал DB / схему / RLS.
- Не добавлял global state / context / refactor.
- Не лез в чужие listener'ы (Communications/Profile).
- Не менял `syncPvlActorsFromGarden` (внутрянка остаётся как была).
