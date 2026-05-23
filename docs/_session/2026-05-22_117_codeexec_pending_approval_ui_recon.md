# pending_approval в админ-UI — recon

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** «Ольга не видит Суроватскую в админ-списке»
**Тип:** Read-only recon. **Без apply / commit / push / SQL DELETE.**

---

## TL;DR

- 🔎 **Суроватская В списке ЕСТЬ**, не скрыта. RLS пропускает (admin's `has_platform_access()` → true → видит всех 57 профилей). `getUsers()` делает `SELECT * FROM profiles` без фильтра. AdminPanel рендерит **весь** массив без `.filter()` ([line 1213](../../views/AdminPanel.jsx#L1213)).
- 🕳 **UI gap:** pending_approval визуально **не отличается** от paused_manual / paused_expired. У всех 7 suspended-юзеров одинаковая ⛔️-кнопка с tooltip'ом «Вернуть доступ». Никакого badge «PENDING» / «НОВАЯ ЗАЯВКА» / «📥 На одобрение».
- 🕳 **Нет отдельной вкладки / фильтра / сортировки** для pending_approval. Ольга прокручивает список 57 юзеров.
- 🕳 **Latent UI bug:** isNew-бейдж ([line 1214](../../views/AdminPanel.jsx#L1214)) `(Date.now() - u.id) < 24h` рассчитан на числовые id, для UUID-строк выдаёт NaN → бейдж **никогда** не загорается. Поэтому свежие регистрации даже не подсвечены «New».
- 🛠 **Workaround сейчас (smoke):** Ctrl+F → `asurovatskaya` в админке → нажать ⛔ на её строке → «Вернуть доступ». Trigger phase37 подхватит.
- 📝 **Новый тикет:** UI-PENDING-APPROVAL-LIST (P2 — improvement, not blocker; admin can find via Ctrl+F).

---

## 1. Где должна быть pending_approval, если бы UI это поддерживал

В коде вообще **нет** упоминания «pending», «approval», «заявка», «moderation», «approve» в UI-слое. Только два места:
- [App.jsx:229-235](../../App.jsx#L229) — handler после login'а: если новый юзер `access_status='pending_approval'` → alert «Заявка отправлена, ожидайте одобрения» + logout. То есть пользователь-applicant **сам не входит** до одобрения.
- [dataService.js:1304](../../services/dataService.js#L1304) — register flow: возвращает `created` без `_ensurePostgrestUser` если pending.

И всё. Никакого admin-side UI для одобрения регистрации.

---

## 2. Что Ольга видит в админке tab='users'

### 2.1 Источник данных — без фильтра

[App.jsx:108](../../App.jsx#L108) → `api.getUsers()` → [dataService.js:1568](../../services/dataService.js#L1568):
```js
async getUsers() {
    return this._cachedFetch('users', async () => {
        const { data } = await postgrestFetch('profiles', { select: '*' });
        return (data || []).map((profile) => this._normalizeProfile(profile));
    });
}
```
`SELECT *` — без WHERE. Возвращает **все 57 профилей** (включая pending_approval, suspended, paused, archived — что угодно).

### 2.2 RLS — admin видит всех

```
profiles_select_authenticated  PERMISSIVE  USING (auth.uid() IS NOT NULL)
profiles_active_access_guard_select  RESTRICTIVE  USING ((id = auth.uid()) OR has_platform_access(auth.uid()))
```

`has_platform_access(admin.uid())` для админа → проверяет `admin.role='admin'` → TRUE → пропускает все строки. **Суроватская В response'е**, гарантированно.

### 2.3 Render — без фильтра, без сортировки UI

[views/AdminPanel.jsx:1213](../../views/AdminPanel.jsx#L1213):
```jsx
{[...(users || [])].sort((a, b) => b.id - a.id).map(u => {
    const isNew = (Date.now() - u.id) < 24 * 60 * 60 * 1000 && u.id > 1000;
    ...
```

- `.sort((a, b) => b.id - a.id)` — id это UUID-строка, `b.id - a.id` = `NaN` → sort нестабилен / неупорядочен.
- `isNew = (Date.now() - u.id) < 24h && u.id > 1000` — `Date.now() - "uuid-string"` = NaN → `NaN < число` = false → isNew **никогда не true** для UUID-юзеров. Latent UI bug.
- Никаких `.filter(...)`. Все 57 рендерятся.

### 2.4 Row UI для Суроватской

В её tr:
- Аватар-блок: имя «Суроватская …», email «asurovatskaya26@gmail.com», без бейджа «New» (см. § 2.3 bug).
- Role-dropdown: «Абитуриент» (selected).
- Visibility-кнопка: «Виден» / «Скрыт» (обычное).
- Action-кнопки:
  - ⛔️ (status=suspended). Tooltip: «Вернуть доступ». Click → `toggleUserStatus(id, 'active')` → PATCH /profiles `{status:'active', access_status:'active'}`.
  - 🛡 (auto_pause_exempt off).
  - 🗑️ delete.

**Никакого визуального отличия** от 6 других suspended-юзеров (5 leader'ов + 1 mentor с `access_status='active'` но `status='suspended'` — например, `jylia.psycholog@gmail.com`).

### 2.5 Как сейчас выглядят 7 suspended-row'ов

| email | role | status | access_status | visual |
|-------|------|--------|---------------|--------|
| happy7anny@gmail.com | mentor | suspended | active | ⛔ «Вернуть доступ» |
| jylia.psycholog@gmail.com | leader | suspended | active | ⛔ «Вернуть доступ» |
| kolotilovasvetlana@gmail.com | mentor | suspended | active | ⛔ «Вернуть доступ» |
| odeta.post@gmail.com | leader | suspended | active | ⛔ «Вернуть доступ» |
| sharm_anele@bk.ru | leader | suspended | active | ⛔ «Вернуть доступ» |
| vek129@rambler.ru | leader | suspended | active | ⛔ «Вернуть доступ» |
| **asurovatskaya26@gmail.com** | **applicant** | suspended | **pending_approval** | **⛔ «Вернуть доступ»** ← НЕ отличается |

Единственный визуальный маркер — role-dropdown показывает «Абитуриент» (а у остальных «Ведущая» / «Ментор»). Это можно заметить, но не подсвечено.

---

## 3. Есть ли отдельная вкладка / тоггл / фильтр

Tabs в AdminPanel ([line 753](../../views/AdminPanel.jsx#L753)):
```js
['stats', 'users', 'access', 'content', 'pvl-progress', 'news', 'events', 'shop']
```
Никаких `pending` / `approval` / `moderation`.

Внутри tab='users':
- Поле «Email всех пользователей» (textarea).
- Таблица 57 row'ов.
- **Никаких фильтров, поисковика, sort-controls.**

Внутри tab='access' (не открывала глубоко, но название интригует) — возможно там есть фильтр? Проверила grep'ом — никаких упоминаний pending.

---

## 4. Как админ сейчас одобряет (де-факто)

**Текущий workflow Ольги** (выведено из кода — нет документации):
1. Применик регистрируется → попадает в `pending_approval`, status='suspended'.
2. Ольга открывает /admin → /users → видит ⛔ у каждого suspended → может только догадаться по email или role-dropdown что это новая заявка.
3. Нажимает ⛔ → confirm → `toggleUserStatus(id, 'active')`.
   - Это PATCH `{status:'active', access_status:'active'}`.
   - После phase37 — это triggerит `trg_profiles_pvl_student_on_approval` → создаёт pvl_students row.

Альтернатива в коде (но **НЕ привязана к UI**):
- RPC `admin_approve_registration(uuid, text)` (phase31) — делает то же + audit-log + явное переключение role. Не используется UI (grep = 0 callsite'ов).

**Если Ольга не знает что pending у конкретного email'а — она не одобрит** ровно потому что не отличает её от suspended-by-другой-причине. Текущая Суроватская — пример: висит с 2026-05-19 (4 дня) без одобрения, потому что Ольга не видит «нового» индикатора.

---

## 5. Workaround для smoke сейчас

### 5.1 Через UI (рекомендую — это и smoke phase37)

1. Открыть https://liga.skrebeyko.ru/admin под Ольгой.
2. Tab «Пользователи».
3. **Ctrl+F (Cmd+F) в браузере** → `asurovatskaya`.
4. Браузер подсветит её row.
5. Нажать ⛔ → confirm «Вернуть доступ?» → подтвердить.
6. UI должен показать «Доступ возвращён».
7. Проверка в SQL (paste в терминал):
   ```bash
   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
   SELECT p.email, p.role, p.access_status, p.status,
          ps.id IS NOT NULL AS has_pvl_row,
          ps.cohort_id IS NOT NULL AS has_cohort
     FROM profiles p
     LEFT JOIN pvl_students ps ON ps.id = p.id
    WHERE p.email = '"'"'asurovatskaya26@gmail.com'"'"';"'
   ```
   Ожидание: `applicant | active | active | t | t` — trigger создал row, cohort_id = Поток 1.

### 5.2 Через psql (если UI не работает / нет авторизации)

```sql
-- Direct UPDATE под gen_user (owner-bypass на RLS).
-- Имитирует toggleUserStatus(id, 'active') — Phase37 trigger подхватит.
UPDATE public.profiles
   SET access_status = 'active', status = 'active'
 WHERE email = 'asurovatskaya26@gmail.com';
```
Trigger phase37 fire'ит на `OLD.access_status='pending_approval' AND NEW.access_status='active'` AND `NEW.role='applicant'` → создаёт pvl_students row.

⚠ **Это не smoke phase37 fully (минует UI flow), но проверяет триггер.**

### 5.3 Через RPC admin_approve_registration

Не работает напрямую под gen_user (auth.uid()=NULL → is_admin()=false). Не предлагаю.

---

## 6. Предлагаемый новый тикет (фиксировать в BACKLOG)

### UI-PENDING-APPROVAL-LIST: админ не видит новых регистраций как «на одобрение»

**Приоритет:** P2 (admin UX gap, не data-loss).

**Проблема:** новые регистрации `access_status='pending_approval'` визуально не отличаются от других suspended-юзеров в админ-UI. Админ не знает, кого нужно одобрить → новые applicant'ы зависают (Суроватская висела 4 дня после регистрации).

**Acceptance:**
- В админ-UI должна быть либо отдельная секция «📥 На одобрение» в начале списка, либо фильтр / тоггл «Только pending», либо явный бейдж «PENDING» / «НОВАЯ ЗАЯВКА» на row'ах с `access_status='pending_approval'`.
- Опционально: счётчик «3 на одобрение» в шапке tab'а.

**Связанное:**
- Возможно стоит подключить RPC `admin_approve_registration(uuid, text)` (phase31) к новой кнопке «Одобрить» вместо текущего split-PATCH (toggleUserStatus + onUpdateUserRole). Будет atomicity + audit-log + RPC уже существует, надо только UI-кнопку.
- Latent UI bug: isNew-бейдж не работает для UUID-юзеров (`Date.now() - u.id` = NaN). Fix copy-paste — заменить на `created_at` / `join_date` сравнение, или просто использовать UI-индикатор `access_status='pending_approval'` (что было целью isNew изначально, но провалилось).

**Why:** без этой UI-фичи admin вынужден вручную искать pending через Ctrl+F или SQL. Это создаёт regression-risk (забыл одобрить → applicant зависает) и нагружает Ольгу cognitive overhead'ом каждый раз когда регается новый юзер.

**Estimate:** ~30-60 минут на фронт. Trigger phase37 уже на месте, поэтому back-end ничего не нужен.

---

## 7. Что я НЕ сделала

- ❌ Не правила UI (это новый PR/тикет, не часть phase37 scope).
- ❌ Не одобряла Суроватскую (это решение Ольги — через UI или через psql workaround в § 5).
- ❌ Не создавала тикет в BACKLOG.md (это твоя работа стратега — оформи как считаешь нужно).
- ❌ Не commit / push.

---

## 8. Эффорт

- Trace AdminPanel filter + RLS analysis: ~8 мин
- has_platform_access + RLS recon на проде: ~3 мин
- Проверка counts (57 / 7 / 1): ~2 мин
- _117 отчёт: ~15 мин

Итого ~28 мин.
