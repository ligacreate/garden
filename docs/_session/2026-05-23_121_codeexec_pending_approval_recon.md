# UI-PENDING-APPROVAL-LIST — implementation recon

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** «mini-recon под UI-PENDING-APPROVAL-LIST (P2, ~30-60 мин фронт)»
**Тип:** Read-only recon. **Без apply / commit / push.**

---

## TL;DR

- 🎨 **UI стек:** Tailwind CSS 4 + lucide-react icons + 5 custom components (`Button`, `Input`, `RichEditor`, `ConfirmationModal`, `ModalShell`). Никаких CSS modules / inline styles. Класс-словарь устоявшийся: `surface-card`, `bg-slate-*`, `border-slate-*`, `rounded-2xl/3xl`, `text-xs/sm`.
- 🪪 **Бейджи / секции / dropdown'ы — всё уже есть в файле.** Не нужно заводить новые компоненты:
  - Badge-pattern: [line 1221](../../views/AdminPanel.jsx#L1221) `<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">New</span>`.
  - Section-card: [line 1172](../../views/AdminPanel.jsx#L1172) `bg-slate-50 border border-slate-100 rounded-2xl p-4` (используется для «Email всех пользователей» блока — точный паттерн).
  - Role-dropdown: [line 1226](../../views/AdminPanel.jsx#L1226) `<select value={u.role} onChange={...}>` с 6 опциями ROLES. Один-в-один копия для нового UI.
  - `confirmAction(title, message, onConfirm, variant)` helper [line 724](../../views/AdminPanel.jsx#L724) — стандартный путь для подтверждения действий.
- 📍 **Insertion point** — [AdminPanel.jsx:1170-1171](../../views/AdminPanel.jsx#L1170), сразу после `{tab === 'users' ? (`, перед существующим email-блоком. Новая секция «📥 На одобрение» рендерится **вверху** tab='users', только если есть `pending`-юзеры.
- 🔌 **RPC `admin_approve_registration(uuid, text)`** уже существует (phase31) + GRANT EXECUTE for authenticated. Возвращает `public.profiles` row. Вызывается **точно как `api.deleteUser`** — `postgrestFetch('rpc/admin_approve_registration', {}, {method:'POST', body:{p_user_id, p_new_role}})`.
- ⚠ **RPC требует `access_status='pending_approval'`** — иначе RAISE. Это значит фича работает только для свежих регистраций, что и нужно. Для re-promote leader → applicant (другой кейс) RPC не подходит — используется split-PATCH через существующий `api.updateUser`.

---

## 1. UI стек

### 1.1 Импорты в AdminPanel.jsx (top-of-file)

```js
import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, LogOut, Edit2, RotateCw, BarChart, MapPin, Users,
         TrendingUp, Calendar, ArrowUpRight, GripVertical, ChevronDown,
         ChevronUp, Archive, Eye, EyeOff, Shield, ShieldOff } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import RichEditor from '../components/RichEditor';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/ModalShell';
import AdminPvlProgress from './AdminPvlProgress';
import AdminPracticesView from './AdminPracticesView';
import { api } from '../services/dataService';
```

**Стек:** React 19 + Tailwind 4 + lucide icons + кастомные `Button` / `ConfirmationModal` / `ModalShell`. Никаких CSS modules. Никаких inline `style={}` (кроме редких single-rule случаев). Всё через Tailwind.

### 1.2 Дополнительные icons (нужны для новой фичи)

Нужно добавить в импорт `Mail` (для email иконки в pending-секции — опционально) и `Check` или `UserCheck` (для кнопки «Одобрить»). Все есть в lucide-react.

---

## 2. Existing UI patterns — что переиспользовать

### 2.1 Badge — точный пример для «PENDING» / «НОВАЯ ЗАЯВКА»

[AdminPanel.jsx:1221](../../views/AdminPanel.jsx#L1221):
```jsx
{isNew && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">New</span>}
```

Готовый паттерн. Для pending можно использовать тот же стиль с заменой цвета (например, `bg-amber-100 text-amber-700` чтобы отличать визуально):

```jsx
{u.access_status === 'pending_approval' && (
    <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
        На одобрение
    </span>
)}
```

### 2.2 Section-card — для нового блока

[AdminPanel.jsx:1172](../../views/AdminPanel.jsx#L1172):
```jsx
<div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
    <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-sm font-semibold text-slate-700">Email всех пользователей</div>
        <Button variant="ghost" className="!py-1 !px-3 text-xs" onClick={...}>Скопировать</Button>
    </div>
    ...
</div>
```

Этот блок «Email всех пользователей» — уже в начале tab='users'. Точный паттерн для нашей новой секции. Можно даже использовать более «активный» фон типа `bg-amber-50 border-amber-100` чтобы visually привлекало внимание (паттерн из памяти codeexec'а — banner-стиль использован в `_100..102` BUG-PVL-SLOW-MATERIALS-LOAD).

### 2.3 Role-dropdown — для «одобрить как [роль]»

[AdminPanel.jsx:1226-1233](../../views/AdminPanel.jsx#L1226):
```jsx
<select value={u.role}
        onChange={(e) => onUpdateUserRole(u.id, e.target.value)}
        className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
    <option value="applicant">Абитуриент</option>
    <option value="intern">Стажер</option>
    <option value="leader">Ведущая</option>
    <option value="mentor">Ментор</option>
    <option value="curator">Куратор</option>
    <option value="admin">Администратор</option>
</select>
```

Готовый паттерн для нашего «выбор роли при одобрении». В новой фиче использовать **только 4 опции** из контракта RPC: `applicant`, `intern`, `leader`, `mentor` (admin/curator RPC отвергает, см. § 5).

### 2.4 confirmAction helper

[AdminPanel.jsx:724-732](../../views/AdminPanel.jsx#L724):
```jsx
const confirmAction = (title, message, onConfirm, variant = 'primary') => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, variant });
};
```

Использовать для подтверждения approve. Example callsite: [line 1256](../../views/AdminPanel.jsx#L1256) (toggleUserStatus suspend/resume):
```jsx
confirmAction(
    "Одобрить как Абитуриент?",
    `Александа Суроватская получит доступ к платформе с ролью «Абитуриент».`,
    async () => {
        try {
            await api.approveUserRegistration(u.id, selectedRole);
            onNotify("Заявка одобрена");
            if (onRefreshUsers) await onRefreshUsers();
        } catch (e) { alert(e.message); }
    },
    'primary'
);
```

### 2.5 Button component

[components/Button.jsx] — поддерживает `variant`, `icon`, `className` override через `!` prefix (Tailwind `!important`). Уже широко используется.

---

## 3. Insertion point

### 3.1 Где именно встроить новую секцию

[AdminPanel.jsx:1170-1202](../../views/AdminPanel.jsx#L1170) — текущее начало tab='users':

```jsx
1170  {tab === 'users' ? (
1171      <div className="surface-card p-8 overflow-hidden space-y-6">
1172          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">  ← Email block
1173              ...
1202          </div>
1203          <table className="w-full text-left">                              ← User table
```

**Новая секция вставляется между line 1171 и line 1172.** Структура:

```jsx
{tab === 'users' ? (
    <div className="surface-card p-8 overflow-hidden space-y-6">
        {/* NEW: Pending approvals section — top of tab */}
        {pendingApprovals.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="text-sm font-semibold text-amber-900 mb-3">
                    📥 На одобрение ({pendingApprovals.length})
                </div>
                <div className="space-y-3">
                    {pendingApprovals.map(u => (
                        <PendingApprovalRow
                            key={u.id}
                            user={u}
                            onApprove={async (role) => { ... }}
                        />
                    ))}
                </div>
            </div>
        )}

        {/* Existing: Email block — unchanged */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            ...
        </div>

        {/* Existing: User table — unchanged. Optionally скрыть pending'ов
            из основного списка чтобы не дублировать. */}
        <table className="w-full text-left">
            ...
        </table>
    </div>
)}
```

Где `pendingApprovals` рассчитывается через `useMemo`:
```jsx
const pendingApprovals = useMemo(
    () => (users || []).filter(u => u.access_status === 'pending_approval'),
    [users]
);
```

### 3.2 Опция — фильтровать pending'ов из основной таблицы

Дублирование Суроватской в секции «На одобрение» И в общем списке — не критично, но cleaner UI без дубля. В таком случае [line 1213](../../views/AdminPanel.jsx#L1213):

```jsx
{[...(users || [])]
    .filter(u => u.access_status !== 'pending_approval')  // ← NEW filter
    .sort(...).map(u => { ... })}
```

Decision Ольги. Я бы убирала из общего списка — фокус на одной точке действия.

### 3.3 Counter в шапке tab

Опционально — счётчик «📥 N» в самой кнопке tab='users' (на случай если Ольга на другом tab'е):

[AdminPanel.jsx:762](../../views/AdminPanel.jsx#L762):
```jsx
: t === 'users' ? (
    <>
      Пользователи
      {pendingApprovals.length > 0 && (
        <span className="ml-1 inline-flex items-center justify-center bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
          {pendingApprovals.length}
        </span>
      )}
    </>
)
```

⚠ Проблема: `pendingApprovals` calculated inside AdminPanel, а tab-кнопки рендерятся раньше (parent scope) — нужно либо вычислять сразу после `users || []`, либо передавать count через prop. Это +5-10 мин work.

---

## 4. Row structure (для PendingApprovalRow component)

Текущая user-row в основной таблице ([AdminPanel.jsx:1217-1320](../../views/AdminPanel.jsx#L1217)):

```jsx
<tr key={u.id} className={isNew ? "bg-blue-50/30" : ""}>
    <td className="py-4 pl-2">
        <div className="flex items-center gap-2">
            <div className="font-medium text-slate-800">{u.name}</div>
            {isNew && <span className="...">New</span>}
        </div>
        <div className="text-xs text-slate-400">{u.email}</div>
    </td>
    <td className="py-4">
        <select value={u.role} onChange={...}>...</select>
    </td>
    <td className="py-4">
        <button>Виден / Скрыт</button>
    </td>
    <td className="py-4">
        <div className="flex items-center gap-2">
            <button>⛔/⏸</button>
            <button>🛡 exempt</button>
            <button>🗑 delete</button>
        </div>
    </td>
</tr>
```

Для **PendingApprovalRow** — упрощённая версия (без visibility / exempt / delete, потому что фокус — одобрение):

```jsx
const PendingApprovalRow = ({ user, onApprove }) => {
    const [selectedRole, setSelectedRole] = useState('applicant');
    return (
        <div className="flex items-center justify-between gap-3 bg-white border border-amber-100 rounded-xl p-3">
            <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{user.name || '—'}</div>
                <div className="text-xs text-slate-500 truncate">{user.email}</div>
                {user.city && <div className="text-xs text-slate-400">{user.city}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <select value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 outline-none">
                    <option value="applicant">Абитуриент</option>
                    <option value="intern">Стажер</option>
                    <option value="leader">Ведущая</option>
                    <option value="mentor">Ментор</option>
                </select>
                <Button variant="primary" className="!py-2 !px-3 text-xs" onClick={() => onApprove(selectedRole)}>
                    Одобрить
                </Button>
            </div>
        </div>
    );
};
```

Default `selectedRole = 'applicant'` потому что 90%+ кейсов — это applicant'ы с самой регистрации. Если Ольга хочет сразу промоутить — выбирает intern/leader/mentor.

---

## 5. RPC admin_approve_registration — сигнатура + вызов

### 5.1 Сигнатура (из phase31)

```sql
CREATE OR REPLACE FUNCTION public.admin_approve_registration(
    p_user_id  uuid,
    p_new_role text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

**Параметры:**
- `p_user_id` (uuid, NOT NULL) — id профиля.
- `p_new_role` (text, NOT NULL) — должно быть **одно из** `'applicant', 'intern', 'leader', 'mentor'`. **admin / curator не пускает.**

**Проверки внутри:**
- `p_user_id is null` → ERRCODE 22023.
- `p_new_role NOT IN (...)` → ERRCODE 22023.
- `NOT public.is_admin()` → ERRCODE 42501 («forbidden»).
- profile not found → ERRCODE P0002.
- `v_old_access IS DISTINCT FROM 'pending_approval'` → ERRCODE 22023 («profile X is not pending_approval»).

**Эффект:**
- `UPDATE profiles SET access_status='active', role=p_new_role WHERE id=p_user_id RETURNING *`.
- `INSERT INTO pvl_audit_log` с `action='approve_registration'`, `actor_user_id`, `payload={old_role, new_role, approved_by, summary}`.
- RETURNS — обновлённый row profiles.

**GRANT EXECUTE для `authenticated`** — frontend admin может вызвать через PostgREST `/rpc/admin_approve_registration`.

### 5.2 Как вызвать из dataService

Точный паттерн `api.deleteUser` ([dataService.js:1672-1679](../../services/dataService.js#L1672)):

```js
async deleteUser(userId) {
    await postgrestFetch('rpc/admin_delete_user_full', {}, {
        method: 'POST',
        body: { p_user_id: userId }
    });
    this._invalidateCache('users');
    return true;
}
```

Новый метод — копия:

```js
/** FEAT-023 Phase 3: одобрение через RPC. Atomic UPDATE + audit-log. */
async approveUserRegistration(userId, newRole) {
    const { data } = await postgrestFetch('rpc/admin_approve_registration', {}, {
        method: 'POST',
        body: { p_user_id: userId, p_new_role: newRole },
        returnRepresentation: true
    });
    this._invalidateCache('users');
    return Array.isArray(data) ? data[0] : data;  // PostgREST RETURN single row
}
```

⚠ Опция `returnRepresentation: true` — чтобы получить обновлённый profile в ответе и обновить state оптимистично без перезапроса.

### 5.3 Trigger phase37 сработает

Когда RPC делает `UPDATE profiles SET access_status='active', role='applicant'`:
- Trigger `trg_profiles_pvl_student_on_approval` подхватит — `OLD.access_status='pending_approval' AND NEW='active' AND NEW.role IN ('applicant','intern')`.
- INSERT в pvl_students с правильным cohort_id (по дате).

То есть **RPC + trigger** дают полный flow одним admin-кликом: одобрение → роль → доступ → pvl_students row → cohort. Atomically.

---

## 6. Edge cases / open questions для импла

### 6.1 «Одобрить как admin / curator»

RPC не пускает. Если Ольга хочет одобрить кого-то СРАЗУ как admin — должна использовать существующий flow (toggleUserStatus + onUpdateUserRole). Это редкий кейс, не блокер.

### 6.2 Pending без email

В DB схема позволяет email=null (он nullable). UI должен покрыть `{user.email || '—'}`. Сейчас 1 pending (Суроватская) — email есть. Защита через `||` достаточна.

### 6.3 Concurrent approval

Если два админа одновременно нажмут approve — второй получит `RAISE EXCEPTION 'profile X is not pending_approval'` (потому что первый уже flip'нул access_status). Frontend должен показать понятное error'ное сообщение, не raw error. Простой `try { ... } catch (e) { onNotify("Заявка уже одобрена другим админом"); if (onRefreshUsers) await onRefreshUsers(); }`.

### 6.4 Что если pending'ов нет

Секция не рендерится (`{pendingApprovals.length > 0 && ...}`). UI остаётся как было.

### 6.5 BUG-ADMIN-ISNEW-BADGE-UUID связка

После этого фикса pending'и подсвечены в новой секции — поэтому isNew badge на основной таблице становится менее важным. Но **не закрывает** BUG-ADMIN-ISNEW-BADGE-UUID полностью — там speaks про подсветку recently-registered (даже не pending'ов). Лечить отдельным action'ом. Recommendation в моём _117 § 6 — заменить условие на `access_status === 'pending_approval'`, что закрывает оба тикета. Но это уже implementation decision.

---

## 7. Estimate split

| подзадача | время |
|-----------|-------|
| `api.approveUserRegistration` в dataService.js (~10 строк) | 5 мин |
| `useMemo` для `pendingApprovals` + опциональный filter в основной таблице | 5 мин |
| `PendingApprovalRow` компонент (~25 строк JSX) | 10 мин |
| Section-block с заголовком + map (~10 строк) | 5 мин |
| Опционально: counter в tab-button | 10 мин |
| Опционально: бейдж «На одобрение» в основной таблице (если не filter'им) | 5 мин |
| Testing в dev + smoke в Chrome через Ольгу | 10-15 мин |
| **Итого** | **~30-60 мин** ✓ |

Совпадает с estimate из бэклога.

---

## 8. Файлы для diff'а (когда дойдём до импла)

- `services/dataService.js` — добавить `approveUserRegistration(userId, role)` method (~10 строк около [line 1679](../../services/dataService.js#L1679)).
- `views/AdminPanel.jsx` — 4 правки:
  1. Import `Check` или `UserCheck` icon (+1 строка).
  2. `useMemo` для `pendingApprovals` рядом с другими useMemo (~5 строк).
  3. JSX секция «📥 На одобрение» перед email-блоком (~30 строк включая компонент).
  4. (Опционально) filter'ить `access_status !== 'pending_approval'` в [line 1213](../../views/AdminPanel.jsx#L1213) sort.map.
- ZERO миграций, zero backend. RPC уже на проде с phase31.

---

## 9. Decision points для Ольги (до начала импла)

1. **Где новые pending'и:** новая секция вверху tab='users' / inline-бейдж в общем списке / отдельная вкладка «📥 Заявки»?
   - **Recommend:** новая секция вверху. Visual prominence + не плодит новый tab + scales.
2. **Filter'ить pending'ов из общего списка?**
   - **Recommend:** да, чтобы не дублировать. Они уже видны в секции.
3. **Default role в dropdown'е?**
   - **Recommend:** `'applicant'` (90%+ кейсов — applicant с регистрации). Promote — manual choice.
4. **Counter в tab-button?** «📥 1» рядом с «Пользователи»?
   - **Recommend:** да, +10 мин. Полезно когда на другом tab'е.
5. **Закрыть BUG-ADMIN-ISNEW-BADGE-UUID той же миграцией?**
   - **Recommend:** да, +5 мин. Замена `(Date.now() - u.id) < 24h` на `u.access_status === 'pending_approval'`. Тот же файл, та же строка. Один PR.

После Ольгиных решений — пишу implementation diff в `_122`.

---

## 10. Что я НЕ сделала

- ❌ Не правила код (read-only).
- ❌ Не делала apply / commit / push.
- ❌ Не создавала plans/ файл — это новый функционал, по правилу CLAUDE.md «один план = одна функция» нужен `plans/2026-05-23-pending-approval-list.md`. Сделаю на этапе импла, не раньше.

---

## 11. Эффорт

- Чтение AdminPanel.jsx (top + tab='users' + row structure): ~5 мин
- Поиск badge/section/dropdown patterns: ~3 мин
- dataService.deleteUser precedent + RPC phase31 source: ~5 мин
- _121 отчёт: ~10 мин

Итого ~23 мин (в estimate 15-20 мин был оптимистичен).
