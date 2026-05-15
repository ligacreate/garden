# Phase C6 — Admin UI diff на ревью

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** [`docs/_session/2026-05-16_07_strategist_c3_ack_c4_handoff.md`](2026-05-16_07_strategist_c3_ack_c4_handoff.md)
**Дата:** 2026-05-16
**Статус:** код написан локально, **не закоммичен** — ждёт 🟢 на commit + push.

---

## TL;DR

Phase C6 готов целиком (карточка + 2 списка + фикс toggleUserStatus +
backlog). Build зелёный, 4 файла, +369 / −17.

| Файл | Что | LOC |
|---|---|---|
| `services/dataService.js` | `toggleUserStatus` пишет в **оба** поля; новый метод `setProfileAutoPauseExempt`; defaults для `auto_pause_exempt*` в `_normalizeProfile` | +49 / −4 |
| `views/AdminPanel.jsx` | импорт `Shield/ShieldOff`; state модалки; tab `'access'` со счётчиком в шапке; кнопка-шилд в строке таблицы users; раздел tab «Без автопаузы» с двумя списками; модалка «Не паузить автоматически» | +236 / −5 |
| `App.jsx` | новый prop `onUserPatched={...}` для оптимистичного merge state после toggle/exempt save | +7 / 0 |
| `plans/BACKLOG.md` | TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM → DONE; новый TECH-DEBT-PUSH-SERVER-STDERR-ALERTING (P3) | +33 / −8 |

Build: `vite build` — 6.10s, без ошибок.

---

## Что в Phase C6

### C6.1 — `services/dataService.js` (+49 / −4)

**Правка 1: `toggleUserStatus` пишет оба поля (FEAT-015 Path C, исправление BUG-TOGGLE-USER-STATUS-GHOST-COLUMN).**

Старая запись писала только `status` (комментарий: «access_status удалён,
колонки нет в схеме»). После phase29 колонка есть → пишем оба поля
явно, чтобы admin-pause семантика была чёткая (`paused_manual` ≠
`paused_expired`).

```diff
 async toggleUserStatus(userId, newStatus) {
-    // access_status удалён: колонки нет в схеме (BUG-TOGGLE-USER-STATUS-GHOST-COLUMN).
-    // PostgREST раньше игнорировал поле молча; чистим body для ясности.
+    // FEAT-015 Path C: пишем оба поля сразу. После phase29 колонка
+    // access_status существует. Bridge-trigger одностороннний
+    // (access_status → status), но toggleUserStatus идёт «снизу»
+    // (status, без access_status), что давало бы рассинхрон. Пишем
+    // оба явно — admin-pause = 'paused_manual' (не путать с
+    // 'paused_expired' от webhook).
+    const body = newStatus === 'suspended'
+        ? { status: 'suspended', access_status: 'paused_manual' }
+        : { status: 'active',    access_status: 'active' };
     await postgrestFetch('profiles', { id: `eq.${userId}` }, {
         method: 'PATCH',
-        body: { status: newStatus },
+        body,
         returnRepresentation: true
     });
     return true;
 }
```

**Правка 2: новый метод `setProfileAutoPauseExempt`.**

```js
async setProfileAutoPauseExempt(userId, { enabled, until = null, note = null } = {}) {
    const body = enabled
        ? {
            auto_pause_exempt: true,
            auto_pause_exempt_until: until || null,
            auto_pause_exempt_note: this._sanitizeIfString(note) || null
        }
        : {
            auto_pause_exempt: false,
            auto_pause_exempt_until: null,
            auto_pause_exempt_note: null
        };
    const { data } = await postgrestFetch('profiles', { id: `eq.${userId}` }, {
        method: 'PATCH',
        body,
        returnRepresentation: true
    });
    const row = Array.isArray(data) ? data[0] : data;
    return row ? this._normalizeProfile(row) : null;
}
```

Возвращает уже нормализованный профиль (для merge в App.users state без
рассинхрона типов).

**Правка 3: defaults в `_normalizeProfile` (для legacy/cache).**

```diff
     bot_renew_url: data.bot_renew_url || null,
-    session_version: Number.isFinite(Number(data.session_version)) ? Number(data.session_version) : 1
+    session_version: Number.isFinite(Number(data.session_version)) ? Number(data.session_version) : 1,
+    auto_pause_exempt: data.auto_pause_exempt === true,
+    auto_pause_exempt_until: data.auto_pause_exempt_until || null,
+    auto_pause_exempt_note: data.auto_pause_exempt_note || null
 };
```

`select: '*'` уже подтягивает новые колонки автоматом — это страховка от
legacy-объектов и кэша.

### C6.2 — `views/AdminPanel.jsx` (+236 / −5)

**Изменения:**
1. Импорты — `Shield`, `ShieldOff` из lucide-react.
2. State — `editingExemptUser` (объект user или null), `exemptForm`
   (`{enabled, mode, until, note}`), `savingExempt`.
3. Tab list — добавлен `'access'` с лейблом «Без автопаузы».
4. Кнопка-шилд в строке таблицы users (рядом с ⏸/🗑) — открывает модалку:
   - Зелёный shield если уже exempt.
   - Серый shieldOff если нет.
   - Title показывает срок до даты или «всегда».
5. Tab `'access'` — два списка:
   - **Всегда бесплатно** (без until) — описание «не требуют ревизии».
   - **Бесплатно до даты** (с until, ASC по дате — ближайшие сверху) — описание «cron автоматически снимет».
   - У каждой записи: имя, email/role, причина (если есть), дата (если есть), Edit-кнопка.
   - Empty state «Пока никого».
6. Модалка «Иммунитет к автопаузе»:
   - Чекбокс «Не паузить автоматически».
   - Если включён: радио «Всегда» / «До даты» + date-picker (min=today).
   - Поле «Почему» (textarea).
   - Save → `api.setProfileAutoPauseExempt` → `onUserPatched(updated)` → notify.
   - Cancel — закрывает модалку.
   - Validation: если «До даты» выбрано но дата пустая — notify «Укажите дату или выберите Всегда».

**Дополнительно — фикс UX в `toggleUserStatus`-кнопке** (строка ~1242):
оптимистичный апдейт state через `onUserPatched` — больше не нужно
ручное «обновите страницу» в notify, статус кнопки меняется сразу.

### C6.3 — `App.jsx` (+7)

```diff
 onRefreshUsers={async () => {
     const allUsers = await api.getUsers();
     setUsers(allUsers || []);
     showNotification("Список пользователей обновлен");
+}} onUserPatched={(updated) => {
+    // FEAT-015 Path C — оптимистичный merge после toggle/exempt save.
+    // updated может быть либо partial (status toggle), либо полным
+    // профилем из api.setProfileAutoPauseExempt; в обоих случаях
+    // мерджим через id, не теряя остальные поля.
+    if (!updated?.id) return;
+    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
 }}
```

### C6.4 — `plans/BACKLOG.md` (+33 / −8)

- TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM → 🟢 **DONE 2026-05-16**
  (закрыто apply phase29). Cross-link на новый STDERR-ALERTING.
- Новый **TECH-DEBT-PUSH-SERVER-STDERR-ALERTING (P3)** — детальное описание
  observability gap (5 дней тихого крэша reconcile до apply phase29 не
  было видно), 3 предложения скопа (журнал-стрим в TG, аналог для
  garden-auth/monitor, daily health-check sum). Связан с MON-001/MON-002.

---

## Что НЕ затронуто

- Bridge-trigger в БД — без изменений (он в phase29 уже).
- push-server — без изменений (Phase C2 деплой стоит).
- `getUsers` в dataService — без изменений (`select: '*'` уже подтягивает новые колонки).
- `updateUser` — НЕ трогает `auto_pause_exempt*` (специальный канал через `setProfileAutoPauseExempt`).

---

## Готов к commit + push

Предлагаемый commit message (один коммит на всё):

```
feat(admin): FEAT-015 Path C C6 — auto_pause_exempt UI + toggleUserStatus две колонки

- dataService.toggleUserStatus теперь пишет оба поля (status +
  access_status='paused_manual') чтобы admin-pause семантика
  была явная. Закрывает старый комментарий BUG-TOGGLE-USER-
  STATUS-GHOST-COLUMN (после phase29 колонка существует).
- dataService.setProfileAutoPauseExempt — новый метод для
  включения/снятия иммунитета к webhook-автопаузе с опциональной
  датой автоснятия и причиной.
- dataService._normalizeProfile — defaults для auto_pause_exempt*
  (страховка от legacy и cache).
- AdminPanel: новая кнопка-шилд в строке users открывает модалку
  «Иммунитет к автопаузе» (чекбокс + Всегда/До даты + причина).
  Модалка использует setProfileAutoPauseExempt + onUserPatched для
  оптимистичного апдейта state.
- AdminPanel: новый tab 'access' «Без автопаузы» с двумя списками —
  «Всегда бесплатно» (бессрочно) и «Бесплатно до даты»
  (ASC по дате истечения, ревью-лист).
- App.jsx: новый prop onUserPatched для merge обновлённых юзеров
  в state без полного рефетча.
- BACKLOG: TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM → DONE
  (apply phase29 закрыло симптом); новый
  TECH-DEBT-PUSH-SERVER-STDERR-ALERTING (P3) на широкую observability.

Build: vite build OK (6.10s).
План: plans/2026-05-15-feat015-prodamus-c.md (Phase C6).
Diff: docs/_session/2026-05-16_08_codeexec_phase_c6_diff.md
```

---

## Что осталось в FEAT-015 после C6

- Phase C4 (Ольга в Prodamus dashboard + .env update + restart) — независимый канал, ждёт её действий.
- Phase C5 (E2E smoke по replay-scenarios) — после C4.
- Phase C7 (lesson + завершить FEAT-015 в BACKLOG) — после C5.

C6 **не блокирует** C4. После твоего 🟢 — commit + push, далее ждём ход Ольги по C4.
