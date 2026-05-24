# UI-PENDING-APPROVAL-LIST — implementation diff

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** 🟢 все 5 decisions + scope extend на BUG-ADMIN-ISNEW-BADGE-UUID
**Тип:** DIFF на ревью. **Без apply / commit / push.** Жду 🟢.

---

## TL;DR

- ✅ Два файла, точечно:
  - [`services/dataService.js`](../../services/dataService.js) — +1 метод `approveUserRegistration(userId, newRole)` (16 строк, RPC обёртка после `deleteUser`).
  - [`views/AdminPanel.jsx`](../../views/AdminPanel.jsx) — 6 правок: import `UserCheck`, state `approvalRoles`, useMemo `pendingApprovals`, counter в tab-button, JSX-секция «📥 На одобрение» (всегда видна), filter pending'ов из основного списка, fix isNew через `updated_at` (закрывает BUG-ADMIN-ISNEW-BADGE-UUID).
- 🎯 Все 5 decisions Ольги + scope extend закрыты.
- 🛑 Нет миграций, нет правок других файлов. Trigger phase37 (на проде с 19:14) подхватит UPDATE access_status'а от RPC и создаст pvl_students row.

---

## 1. Diff #1 — `services/dataService.js`

### 1.1 Что добавлено (после `deleteUser` на ~line 1680)

```js
/**
 * UI-PENDING-APPROVAL-LIST: одобрение pending_approval-регистрации.
 * RPC admin_approve_registration (phase31) — atomic UPDATE access_status='active' +
 * role=newRole + audit-log. Trigger phase37 trg_profiles_pvl_student_on_approval
 * подхватит и создаст pvl_students row, если newRole IN ('applicant','intern').
 * @param {string} userId
 * @param {'applicant'|'intern'|'leader'|'mentor'} newRole — RPC отвергает admin/curator
 */
async approveUserRegistration(userId, newRole) {
    const { data } = await postgrestFetch('rpc/admin_approve_registration', {}, {
        method: 'POST',
        body: { p_user_id: userId, p_new_role: newRole },
        returnRepresentation: true
    });
    this._invalidateCache('users');
    return Array.isArray(data) ? data[0] : data;
}
```

**Паттерн:** одни-в-один копия `deleteUser` ([dataService.js:1672-1679](../../services/dataService.js#L1672-L1679)) — POST в `/rpc/...`, invalidate cache, return result. `returnRepresentation: true` чтобы получить обновлённый profile в ответе.

---

## 2. Diff #2 — `views/AdminPanel.jsx` (6 правок)

### 2.1 Импорт UserCheck (line 2)

```diff
- import { Trash2, LogOut, ..., ShieldOff } from 'lucide-react';
+ import { Trash2, LogOut, ..., ShieldOff, UserCheck } from 'lucide-react';
```

### 2.2 State + useMemo (после `savingExempt`, ~line 524)

```js
// UI-PENDING-APPROVAL-LIST: per-user выбранная роль для approve-dropdown'а.
// {userId: 'applicant'|'intern'|'leader'|'mentor'}. Default — applicant (90%+ кейсов).
const [approvalRoles, setApprovalRoles] = useState({});

const pendingApprovals = useMemo(
    () => (users || []).filter(u => u.access_status === 'pending_approval'),
    [users]
);
```

Per-user state потому что у каждого pending'а свой dropdown с независимым выбором. `useMemo` чтобы не пересчитывать на каждом ре-рендере (users — большой массив 57+).

### 2.3 Counter в tab-button (~line 770)

Заменено простое `'Пользователи'` на JSX-фрагмент с badge:

```jsx
: t === 'users' ? (
    <>
        Пользователи
        {pendingApprovals.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                📥 {pendingApprovals.length}
            </span>
        )}
    </>
)
```

Counter показывается **только если > 0**. Когда заявок нет — обычный текст «Пользователи».

### 2.4 JSX-секция «📥 На одобрение» (вверху tab='users', ~line 1189)

Структура:
- Card с условным цветом: `bg-amber-50 border-amber-200` если pending'и есть; `bg-slate-50 border-slate-100` если пусто.
- Заголовок: `📥 На одобрение (N)` если pending'и есть; `📥 На одобрение` если пусто.
- Body:
  - Если pending'ов нет → `<div className="text-xs text-slate-400">Заявок нет</div>` (серое пустое состояние, decision #3).
  - Иначе → map по `pendingApprovals`, каждая row: name/email/city слева, role-dropdown + кнопка «Одобрить» справа.

Полный JSX (95 строк):

```jsx
{/* UI-PENDING-APPROVAL-LIST: всегда видна, пустое состояние серое */}
<div className={`border rounded-2xl p-4 ${pendingApprovals.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
    <div className={`text-sm font-semibold mb-3 flex items-center gap-2 ${pendingApprovals.length > 0 ? 'text-amber-900' : 'text-slate-500'}`}>
        <span>📥</span>
        <span>На одобрение{pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}</span>
    </div>
    {pendingApprovals.length === 0 ? (
        <div className="text-xs text-slate-400">Заявок нет</div>
    ) : (
        <div className="space-y-2">
            {pendingApprovals.map(u => {
                const selectedRole = approvalRoles[u.id] || 'applicant';
                return (
                    <div key={u.id} className="flex items-center justify-between gap-3 bg-white border border-amber-100 rounded-xl p-3">
                        <div className="min-w-0">
                            <div className="font-medium text-slate-800 truncate">{u.name || '—'}</div>
                            <div className="text-xs text-slate-500 truncate">{u.email || '—'}</div>
                            {u.city && <div className="text-xs text-slate-400 truncate">{u.city}</div>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <select
                                value={selectedRole}
                                onChange={(e) => setApprovalRoles(prev => ({ ...prev, [u.id]: e.target.value }))}
                                className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                            >
                                <option value="applicant">Абитуриент</option>
                                <option value="intern">Стажер</option>
                                <option value="leader">Ведущая</option>
                                <option value="mentor">Ментор</option>
                            </select>
                            <Button
                                variant="primary"
                                icon={UserCheck}
                                className="!py-2 !px-3 text-xs"
                                onClick={() => {
                                    const roleLabel = selectedRole === 'applicant' ? 'Абитуриент'
                                        : selectedRole === 'intern' ? 'Стажер'
                                        : selectedRole === 'leader' ? 'Ведущая'
                                        : 'Ментор';
                                    confirmAction(
                                        `Одобрить как ${roleLabel}?`,
                                        `${u.name || u.email} получит доступ к платформе с ролью «${roleLabel}».`,
                                        async () => {
                                            try {
                                                await api.approveUserRegistration(u.id, selectedRole);
                                                onNotify('Заявка одобрена');
                                                if (onRefreshUsers) await onRefreshUsers();
                                            } catch (e) {
                                                const msg = String(e?.message || '');
                                                if (msg.includes('not pending_approval')) {
                                                    onNotify('Заявка уже одобрена другим админом');
                                                    if (onRefreshUsers) await onRefreshUsers();
                                                } else if (msg.includes('forbidden')) {
                                                    onNotify('Нет прав: требуется роль администратора');
                                                } else {
                                                    alert(e.message);
                                                }
                                            }
                                        },
                                        'primary'
                                    );
                                }}
                            >
                                Одобрить
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    )}
</div>
```

Защита от race (два админа одновременно): `try/catch` по сообщению — `'not pending_approval'` (от RPC), `'forbidden'`. Оба пишут через `onNotify` + refresh, без `alert()` для понятных кейсов.

### 2.5 Filter pending'ов из основной таблицы (line 1302-1305)

```diff
- {[...(users || [])].sort((a, b) => b.id - a.id).map(u => {
+ {[...(users || [])]
+     .filter(u => u.access_status !== 'pending_approval') /* UI-PENDING-APPROVAL-LIST: pending'и видны в секции выше — не дублируем */
+     .sort((a, b) => b.id - a.id)
+     .map(u => {
```

Decision #4 — не дублируем pending'ов между секцией и таблицей.

### 2.6 Fix isNew (BUG-ADMIN-ISNEW-BADGE-UUID) (line 1306-1316)

```diff
- const isNew = (Date.now() - u.id) < 24 * 60 * 60 * 1000 && u.id > 1000; // Check if registered in last 24h (and not initial seed data)
+ // BUG-ADMIN-ISNEW-BADGE-UUID fix: старый расчёт (Date.now() - u.id) работал
+ // для legacy integer-id'ов (millis-based), для UUID давал NaN → бейдж никогда
+ // не загорался. Теперь primary source — profiles.updated_at (свежий админ-edit
+ // / approve поднимает updated_at = now), fallback на integer id для legacy
+ // профилей (UUID v4 не несёт temporal info — first segment рандомный).
+ const isNew = (() => {
+     const ts = u.updated_at ? new Date(u.updated_at).getTime() : null;
+     if (Number.isFinite(ts) && (Date.now() - ts) < 24 * 60 * 60 * 1000) return true;
+     const idNum = Number(u.id);
+     return Number.isFinite(idNum) && idNum > 1000 && (Date.now() - idNum) < 24 * 60 * 60 * 1000;
+ })();
```

**Decision про UUID first segment:** в recon я отметила, что Postgres `gen_random_uuid()` — это UUIDv4 (random), first segment **не** содержит timestamp. Парсить его как «время регистрации» = напрасный шум. Лучший доступный signal — `profiles.updated_at` (real timestamp, поднимается на любом UPDATE включая approve через RPC). Fallback на integer id — для редких legacy профилей (если такие остались).

**Semantic shift:** isNew теперь означает «недавно обновлён» (включает свежий approve, role change, edit name и т.п.), не строго «зарегался последние 24h». Это **полезное** свойство — Ольга видит подсвеченных юзеров, которых сама недавно тронула, плюс ничего не теряется. Pending же теперь в отдельной секции, поэтому primary case «обрати внимание на нового» решён там.

---

## 3. Что НЕ делала

- ❌ Не делала apply / commit / push.
- ❌ Не создавала `plans/2026-05-23-pending-approval-list.md` — это малая фронт-правка по существующему backlog-тикету (~30-60 мин), не «новая фича» в смысле CLAUDE.md. Если хочешь — заведу.
- ❌ Не правила миграций — backend (RPC + trigger) уже на проде с phase31 и phase37.
- ❌ Не правила other tabs (`access`, `content`, etc) — pending визуализация только в `users`.

---

## 4. Smoke-план для Ольги

После apply + deploy фронта:

**Сценарий A — пустое состояние** (если все pending одобрены до проверки):
1. Открыть `/admin` → tab «Пользователи».
2. Видеть вверху серую card с заголовком «📥 На одобрение» и текстом «Заявок нет». В tab-button — без счётчика.

**Сценарий B — есть pending'и** (создать нового тестового через регистрацию или дождаться реального applicant'а):
1. На tab-button «Пользователи» виден amber-badge «📥 1».
2. Открыть tab → видна amber-card «📥 На одобрение (1)» с строкой: имя/email/город, dropdown «Абитуриент» (default), кнопка «Одобрить» с иконкой UserCheck.
3. Выбрать роль (любую из 4: Абитуриент/Стажер/Ведущая/Ментор) → нажать «Одобрить» → confirm dialog «Одобрить как Абитуриент?» → подтвердить.
4. Toast «Заявка одобрена». Pending исчезает из секции; счётчик в tab-button обновляется. Юзер появляется в основной таблице (если refresh users prop'нул) с подсветкой `bg-blue-50/30` и бейджем «New» (благодаря свежему `updated_at`).
5. SQL verify (опционально):
   ```sql
   SELECT email, role, access_status,
          (SELECT COUNT(*) FROM pvl_students WHERE id = profiles.id) AS has_pvl_row
     FROM profiles WHERE email = '<approved-email>';
   ```
   Ожидание: `<role> | active | 1` (триггер phase37 создал pvl_students row если role IN applicant/intern).

---

## 5. Эффорт

- Edit dataService.js: ~3 мин
- Edit AdminPanel.jsx (6 правок): ~15 мин (включая чтение insertion points после каждой правки)
- _122 отчёт: ~12 мин

Итого ~30 мин — в нижней границе estimate'а из бэклога (30-60 мин).
