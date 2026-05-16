---
title: FEAT-024 Phase 2b — diff frontend UI «Привязать Telegram» в карточке профиля
date: 2026-05-16
from: VS Code Claude Code (codeexec)
to: стратег (claude.ai) + Ольга
reply_to: phase2 closed (_46 v2, garden-auth fffebcb, garden 0b763ed)
type: diff-on-review BEFORE правок (никаких файлов не отредактировано)
status: 🛑 wait for green
---

# Phase 2b — UI «Привязать Telegram» в ProfileView

## 0. TL;DR

- Все 4 правки чисто **additive** (новый Card в ProfileView, 2 новых метода в `api`, 1 новый callback `onProfileRefresh` через 2 prop'а в цепочке App→UserApp→ProfileView).
- Никаких изменений в существующих секциях профиля, login/registration flow, password update, аватарах.
- Polling простой: `setInterval(5000)` после показа кода → `api.getCurrentUser()` → если `telegram_user_id !== null` → закрыть modal + тост + `onProfileRefresh(fresh)` без БД-PATCH'а.
- Reuse существующих компонентов: `ModalShell`, `Button`, `Card`, `ConfirmationModal`, `Toast` (через `onNotify`). Никаких новых dep'ов.
- 3 файла правки + 1 файл новых API-методов = всего **4 файла**.

## 1. Recon (что нашёл)

| Что | Где | Зачем |
|---|---|---|
| `ProfileView` | `views/ProfileView.jsx` (709 строк) | Три Card-секции (Личные / Профессиональный / Страница ведущей) + Безопасность. Куда вставлю секцию «Telegram-уведомления». |
| `authFetch(path, opts)` | `services/dataService.js:100-118` | wrapper для garden-auth endpoint'ов: автоматически добавляет `Authorization: Bearer ${token}` из `localStorage.garden_auth_token`, кидает Error при non-200. |
| `api.getCurrentUser()` | `services/dataService.js:1448` | `/auth/me` + `_fetchProfile` через PostgREST. Для polling: возвращает свежий профиль с актуальным `telegram_user_id`. |
| `_normalizeProfile` | `services/dataService.js:2687` | spread `{...data}` сохраняет все исходные колонки без явного перечисления — `telegram_user_id`, `telegram_linked_at`, `telegram_notifications_enabled` пройдут автоматически, **правка не нужна**. |
| `handleUpdateUser` (App) | `App.jsx:323-334` | делает `api.updateUser(updatedUser)` (БД PATCH) + `setCurrentUser`. **Не подходит** для refresh после polling — лишний PATCH'нёт `telegram_user_id` с фронта. |
| `handleUpdateProfile` (UserApp) | `views/UserApp.jsx:308-320` | то же самое +`onNotify("Профиль сохранен")`. Используется для редактирования формы. |
| `Toast` | `components/Toast.jsx` | `onNotify(text)` показывает на 3с с зелёной чекмаркой. |
| `ModalShell` | `components/ModalShell.jsx` | `isOpen, onClose, title, description, children, footer, size='md'`. Закрытие по X-кнопке в правом верхнем углу. |
| `ConfirmationModal` | `components/ConfirmationModal.jsx` | для confirm-dialog при unlink («Точно отвязать?»). |
| `handlePasswordUpdate` | `views/ProfileView.jsx:294-313` | паттерн loading+try/catch+`onNotify` — копирую для `generateTelegramLinkCode` и `unlinkTelegram`. |

## 2. UX и состояния секции

Новая Card «Telegram-уведомления» с двумя ветками:

**Состояние A — `user.telegram_user_id === null`** (не привязан):
```
┌─ Telegram-уведомления ──────────────┐
│ Получайте пуш в Telegram, когда     │
│ студентка сдаст ДЗ или ментор       │
│ проверит вашу работу. Тихие часы:   │
│ 23:00–08:00 МСК.                    │
│                                     │
│ [📱 Привязать Telegram]             │
└─────────────────────────────────────┘
```

Клик «Привязать Telegram» → fetch `POST /api/profile/generate-tg-link-code` → открывается `ModalShell`:
```
┌─ Привязка Telegram ─────────────  X ┐
│                                     │
│ Шаг 1. Откройте бота:               │
│                                     │
│  [🤖 Открыть @garden_pvl_bot]       │
│  (deep-link на https://t.me/        │
│   garden_pvl_bot?start=LINK-A3F7K9) │
│                                     │
│ Шаг 2. Если бот не открылся —       │
│ скопируйте код и вставьте в чат с   │
│ ботом командой /start LINK-A3F7K9:  │
│                                     │
│  ┌────────────────────────────┐ 📋  │
│  │ LINK-A3F7K9                │     │
│  └────────────────────────────┘     │
│                                     │
│ Код активен 15 минут.               │
│ Бот пришлёт подтверждение, когда    │
│ привяжется — а здесь сразу появится │
│ галочка.                            │
└─────────────────────────────────────┘
```

Параллельно — polling каждые 5 секунд на `api.getCurrentUser()`. Когда `telegram_user_id !== null` → закрыть modal, `onNotify('Привязано! Теперь будем слать уведомления в TG')`, `onProfileRefresh(fresh)`.

**Состояние B — `user.telegram_user_id !== null`** (привязан):
```
┌─ Telegram-уведомления ──────────────┐
│ ✅ Привязан к Telegram               │
│ Привязка от 14.05.2026               │
│                                     │
│ [Отвязать]                          │
└─────────────────────────────────────┘
```

Клик «Отвязать» → `ConfirmationModal`:
```
┌─ Отвязать Telegram? ─────────────  X ┐
│ После отвязки уведомления о ДЗ       │
│ перестанут приходить в Telegram.     │
│ Привязать обратно можно в любой      │
│ момент.                              │
│                                      │
│      [Отмена]   [Отвязать]           │
└──────────────────────────────────────┘
```

Confirm → `POST /api/profile/unlink-telegram` → `onNotify('Telegram отвязан')` → `onProfileRefresh(fresh)`.

## 3. Файлы — точные правки

### 3.1 `services/dataService.js` — добавить 2 метода в класс `RemoteApiService`

Вставить **перед** строкой `async logout() {` (l1444):

```js
    // FEAT-024 — TG linking flow (garden-auth backend, не PostgREST).
    async generateTelegramLinkCode() {
        const data = await authFetch('/api/profile/generate-tg-link-code', {
            method: 'POST',
            body: {}
        });
        return data; // { code, deep_link, expires_in_seconds }
    }

    async unlinkTelegram() {
        const data = await authFetch('/api/profile/unlink-telegram', {
            method: 'POST',
            body: {}
        });
        return data; // { ok: true }
    }

```

> `_normalizeProfile` править не надо — `{...data}` spread в l2691 уже сохраняет `telegram_user_id`, `telegram_linked_at`, `telegram_notifications_enabled` из PostgREST `select=*`.

### 3.2 `App.jsx` — добавить `handleProfileRefresh` + проброс в UserApp

**Вставить** после `handleUpdateUser` (после l334):

```jsx
    // FEAT-024 Phase 2b — refresh профиля БЕЗ БД-PATCH'а.
    // Используется после polling-detect привязки TG и после unlink:
    // данные уже корректны в БД (webhook handler garden-auth их выставил),
    // фронт просто читает свежее и обновляет state.
    const handleProfileRefresh = (freshProfile) => {
        if (!freshProfile?.id) return;
        setUsers(prev => prev.map(u => u.id === freshProfile.id ? freshProfile : u));
        if (currentUser && currentUser.id === freshProfile.id) {
            setCurrentUser(freshProfile);
        }
    };
```

**Заменить** строку l583 (где `<UserApp ... onUpdateUser={handleUpdateUser} ...>`):

```jsx
// БЫЛО:
: <UserApp user={currentUser} users={gardenUsers} ... onUpdateUser={handleUpdateUser} onSendRay={handleSendRay} onMarkAsRead={handleMarkAsRead} />
// СТАЛО (добавляю onProfileRefresh):
: <UserApp user={currentUser} users={gardenUsers} ... onUpdateUser={handleUpdateUser} onProfileRefresh={handleProfileRefresh} onSendRay={handleSendRay} onMarkAsRead={handleMarkAsRead} />
```

### 3.3 `views/UserApp.jsx` — accept `onProfileRefresh` + проброс в ProfileView

**Изменить** l54 (сигнатура UserApp):
```jsx
// БЫЛО:
const UserApp = ({ user, users, knowledgeBase, news, librarySettings, onLogout, onNotify, onSwitchToAdmin, onUpdateUser, onSendRay, onMarkAsRead }) => {
// СТАЛО:
const UserApp = ({ user, users, knowledgeBase, news, librarySettings, onLogout, onNotify, onSwitchToAdmin, onUpdateUser, onProfileRefresh, onSendRay, onMarkAsRead }) => {
```

**В двух местах** где рендерится ProfileView (l1057, l1076) — добавить prop `onProfileRefresh={onProfileRefresh}`:
```jsx
<ProfileView
    user={user}
    onUpdateProfile={handleUpdateProfile}
    onProfileRefresh={onProfileRefresh}   // ← новая строка
    onNotify={onNotify}
    onLogout={onLogout}
    ...
/>
```

### 3.4 `views/ProfileView.jsx` — accept `onProfileRefresh` + новая Card-секция

**3.4.1 — добавить импорты (после l2):**

```jsx
import React, { useState, useRef, useEffect } from 'react';
import { Camera, LogOut, Trash2, X, Plus, MapPin, Briefcase, Send, Copy, CheckCircle2 } from 'lucide-react';
//                                                                  ─── добавлено: Send, Copy, CheckCircle2
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import UserAvatar from '../components/UserAvatar';
import ModalShell from '../components/ModalShell';  // ← новый
import { getRoleLabel } from '../data/data';
import { getDruidTree } from '../utils/druidHoroscope';
import { normalizeSkills } from '../utils/skills';
import ConfirmationModal from '../components/ConfirmationModal';
import { api } from '../services/dataService';
```

**3.4.2 — изменить сигнатуру компонента** (l~150, точно посмотрю при apply):

```jsx
const ProfileView = ({ user, onUpdateProfile, onProfileRefresh, onNotify, onLogout, onDeleteAccount, onOpenLeaderPage, ... }) => {
//                                            ─────────────── добавлено
```

**3.4.3 — добавить state + handlers (рядом с `handlePasswordUpdate`, перед `return`):**

```jsx
    // FEAT-024 — TG linking state.
    const [tgLinkModal, setTgLinkModal] = useState(null); // { code, deep_link } | null
    const [tgLinkLoading, setTgLinkLoading] = useState(false);
    const [tgUnlinkConfirm, setTgUnlinkConfirm] = useState(false);
    const [tgUnlinkLoading, setTgUnlinkLoading] = useState(false);
    const [tgCodeCopied, setTgCodeCopied] = useState(false);

    const handleGenerateTgLinkCode = async () => {
        try {
            setTgLinkLoading(true);
            const data = await api.generateTelegramLinkCode();
            setTgLinkModal({ code: data.code, deep_link: data.deep_link });
            setTgCodeCopied(false);
        } catch (e) {
            console.error(e);
            onNotify(e?.message || 'Не удалось сгенерировать код привязки');
        } finally {
            setTgLinkLoading(false);
        }
    };

    const handleUnlinkTelegram = async () => {
        setTgUnlinkConfirm(false);
        try {
            setTgUnlinkLoading(true);
            await api.unlinkTelegram();
            onNotify('Telegram отвязан');
            try {
                const fresh = await api.getCurrentUser();
                if (fresh && onProfileRefresh) onProfileRefresh(fresh);
            } catch (refreshErr) {
                console.warn('refresh после unlink не удался', refreshErr);
            }
        } catch (e) {
            console.error(e);
            onNotify(e?.message || 'Не удалось отвязать Telegram');
        } finally {
            setTgUnlinkLoading(false);
        }
    };

    const handleCopyTgCode = async () => {
        if (!tgLinkModal?.code) return;
        try {
            await navigator.clipboard.writeText(tgLinkModal.code);
            setTgCodeCopied(true);
            setTimeout(() => setTgCodeCopied(false), 2000);
        } catch (e) {
            // clipboard может быть закрыт (insecure context) — fallback на manual copy
            console.warn('clipboard write failed', e);
        }
    };

    // Polling каждые 5с пока открыт modal линка — проверяем привязался ли TG.
    useEffect(() => {
        if (!tgLinkModal) return;
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            try {
                const fresh = await api.getCurrentUser();
                if (cancelled) return;
                if (fresh?.telegram_user_id) {
                    setTgLinkModal(null);
                    onNotify('Привязано! Теперь будем слать уведомления в TG');
                    if (onProfileRefresh) onProfileRefresh(fresh);
                }
            } catch (e) {
                // тихо игнорим — на следующем тике попробуем ещё раз
            }
        };
        const id = setInterval(tick, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, [tgLinkModal, onNotify, onProfileRefresh]);
```

**3.4.4 — вставить новую Card-секцию** между «Профессиональный профиль» (закрытие l564) и «Страница ведущей» (l566):

```jsx
                        <Card title="Telegram-уведомления" className="!rounded-[2rem]">
                            <div className="space-y-4">
                                {user.telegram_user_id ? (
                                    <>
                                        <div className="flex items-center gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                            <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={22} />
                                            <div className="flex-1">
                                                <p className="text-emerald-900 text-sm font-medium">Привязан к Telegram</p>
                                                {user.telegram_linked_at && (
                                                    <p className="text-emerald-700 text-xs mt-0.5">
                                                        с {new Date(user.telegram_linked_at).toLocaleDateString('ru-RU')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-slate-500 text-sm">
                                            Будем писать в TG, когда студентка сдаст ДЗ или ментор проверит вашу работу. Тихие часы: 23:00–08:00 МСК.
                                        </p>
                                        <Button
                                            variant="secondary"
                                            onClick={() => setTgUnlinkConfirm(true)}
                                            disabled={tgUnlinkLoading}
                                            className="!rounded-xl"
                                        >
                                            {tgUnlinkLoading ? 'Отвязываем…' : 'Отвязать Telegram'}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-slate-600 text-sm leading-relaxed">
                                            Получайте уведомления в Telegram, когда студентка сдаст ДЗ или ментор проверит вашу работу. Тихие часы: 23:00–08:00 МСК.
                                        </p>
                                        <Button
                                            variant="primary"
                                            icon={Send}
                                            onClick={handleGenerateTgLinkCode}
                                            disabled={tgLinkLoading}
                                            className="!rounded-xl"
                                        >
                                            {tgLinkLoading ? 'Готовим код…' : 'Привязать Telegram'}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </Card>
```

**3.4.5 — вставить модалку и confirm-диалог** рядом с существующим `<ConfirmationModal isOpen={isDeleteOpen} ...>` (после l692, перед закрывающим `</div>` родителя):

```jsx
            <ModalShell
                isOpen={Boolean(tgLinkModal)}
                onClose={() => setTgLinkModal(null)}
                title="Привязка Telegram"
                description="Откройте бота — он привяжет ваш профиль автоматически."
                size="md"
            >
                <div className="space-y-6">
                    <div>
                        <p className="text-sm text-slate-600 mb-3">Шаг 1. Откройте бота:</p>
                        <a
                            href={tgLinkModal?.deep_link || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 w-full justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
                        >
                            <Send size={18} />
                            Открыть @garden_pvl_bot
                        </a>
                    </div>
                    <div>
                        <p className="text-sm text-slate-600 mb-3">
                            Шаг 2. Если бот не открылся автоматически — скопируйте код и отправьте боту командой <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">/start &lt;код&gt;</code>:
                        </p>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-lg text-slate-800 tracking-wider text-center">
                                {tgLinkModal?.code || ''}
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyTgCode}
                                aria-label="Скопировать код"
                                className="p-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                            >
                                {tgCodeCopied ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Copy size={18} />}
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Код активен 15 минут. Когда бот привяжет ваш профиль — здесь появится подтверждение, а у бота — приветственное сообщение.
                    </p>
                </div>
            </ModalShell>

            <ConfirmationModal
                isOpen={tgUnlinkConfirm}
                onClose={() => setTgUnlinkConfirm(false)}
                onConfirm={handleUnlinkTelegram}
                title="Отвязать Telegram?"
                message="Уведомления о ДЗ перестанут приходить в Telegram. Привязать обратно можно в любой момент."
                confirmText="Отвязать"
                confirmVariant="secondary"
            />
```

## 4. Smoke план (после deploy)

1. Залогиниться под тестовым юзером (или под Ольгой) в браузере на `https://liga.skrebeyko.ru`.
2. Открыть Профиль.
3. Убедиться что секция «Telegram-уведомления» отображается в состоянии «не привязан» (если у юзера ещё нет TG).
4. Кликнуть «Привязать Telegram» → должна открыться модалка с кодом `LINK-XXXXXX` и кнопкой «Открыть @garden_pvl_bot».
5. Кликнуть кнопку deep-link → откроется TG → жмёт «Start» в боте → бот привязывает и отвечает «✅ Готово!...».
6. На вкладке Сада в течение 5 секунд (один тик polling'а) modal закроется автоматически, появится тост «Привязано! Теперь будем слать уведомления в TG», секция перерисуется в состояние «Привязан к Telegram c <дата>».
7. Кликнуть «Отвязать Telegram» → ConfirmationModal → подтвердить → тост «Telegram отвязан», секция вернётся в «не привязан».
8. Повторно «Привязать Telegram» → новый код → ввести руками `/start LINK-XXXXXX` в боте (тест на manual entry) → polling поймает.

## 5. Что НЕ делаю в Phase 2b

- ❌ End-to-end smoke с реальной сдачей ДЗ → нотификацией ментору в TG — это **Phase 4** (отдельно).
- ❌ Тоггл `telegram_notifications_enabled` (выключатель «Заглушить уведомления») — пока не было в требованиях стратега, не добавляю. Если попросишь — отдельный микро-diff.
- ❌ Display TG-username привязанного аккаунта (типа «Привязан к @username»). У нас в БД только `telegram_user_id` (BIGINT), username юзера в TG нам неизвестен из webhook (можно достать через `getChat` API при привязке, но это лишний роундтрип). Показываю только факт «Привязан + дата». Если потребуется — apparate в Phase 4.
- ❌ Дополнительная защита от XSS в `LINK-XXXXXX` — код сгенерирован сервером из ограниченного алфавита `[A-Z2-9]`, опасности нет.
- ❌ Translation/i18n — фронт Сада весь на русском, follow project convention.

## 6. Точки риска / edge cases

| Риск | Митигация |
|---|---|
| Polling висит после ухода со страницы Профиль | `useEffect` cleanup `cancelled=true; clearInterval`. При unmount компонента — polling остановится. |
| Polling висит после закрытия modal | `useEffect` зависит от `tgLinkModal` — при `setTgLinkModal(null)` хук перезапустится с условием `!tgLinkModal → return`, interval не создастся, старый clearInterval отработает. |
| Polling делает 1 запрос каждые 5с к `/auth/me` — нагрузка | Polling только пока **открыт modal** (макс 15 мин до истечения кода + юзер сам закроет раньше при success). На один юзера = ~180 запросов max. Допустимо. |
| `navigator.clipboard.writeText` падает на insecure context | `try/catch` логит `console.warn`, юзер видит код в input'е и копирует вручную. Не блокирующая ошибка. |
| Юзер кликнул «Привязать», передумал, закрыл modal — код остался в БД | Не страшно: код будет помечен `consumed_at` следующий раз когда юзер сгенерирует новый код (endpoint гасит старые активные). Plus TTL 15 мин. |
| Юзер на mobile: deep-link `tg://` или `https://t.me/?start=` не открывает TG | Браузер сам решает. Если не сработало — есть код для manual entry (Шаг 2). |
| Юзер delete'нул свой profile в БД пока модалка открыта | `api.getCurrentUser()` в polling вернёт null/ошибку → `cancelled` либо `fresh?.telegram_user_id` будет undefined → modal остаётся открыта, тост не появляется. Не критично. |
| `currentUser.telegram_user_id` приходит как BIGINT из PostgREST | PostgREST возвращает BIGINT как строку (default), либо число в зависимости от настроек. `Boolean(value)` или `value != null` — оба работают. Используем truthy check `user.telegram_user_id ?` — оба варианта корректно дают false на `null`. |
| Race: пользователь и через PostgREST PATCH'ит свой `telegram_user_id` через DevTools | Возможно (UNIQUE constraint защищает от duplicate). Не security-issue Phase 2b — это его собственный профиль, он может вредить только себе. |

## 7. План apply после 🟢

1. 4 файла правки локально (точные тексты выше).
2. **Smoke в dev-окружении до commit:**
   - `cd garden/ && npm run dev` (если ещё не запущен)
   - Локально открыть профиль, проверить что UI рендерится (без backend-вызовов проверить только UI-часть).
   - Если есть локальный dev .env с `VITE_AUTH_URL=https://auth.skrebeyko.ru` — проверить linking flow вживую.
3. Commit + push:
   - `git add views/ProfileView.jsx views/UserApp.jsx App.jsx services/dataService.js docs/_session/2026-05-16_47_codeexec_feat024_phase2b_diff.md docs/_session/2026-05-16_48_codeexec_feat024_phase2b_applied.md`
   - Commit message: `feat(tg): FEAT-024 Phase 2b — UI «Привязать Telegram» в ProfileView`
   - `git push origin main` → **GitHub Actions сам задеплоит фронт на FTP** (по CI/CD проекта).
4. **Smoke на проде** (после Actions зелёный):
   - Открыть https://liga.skrebeyko.ru/ → залогиниться → Профиль → секция должна появиться.
   - Ольга или я с тестовым юзером проходим linking flow (как в §4).
   - Доложить в `_48` финальным разделом.

## 8. Что прошу

**🟢/🔴 на:**
- §2 UX и текст лейблов (особенно русский tone — «Привязать Telegram», «Привязан к Telegram», «Готовим код…», «Привязано! Теперь будем слать уведомления в TG», «Уведомления о ДЗ перестанут приходить...»).
- §3 точные правки в 4 файлах. Особенно:
  - **§3.1** — два метода в `api`. Body `{}` нужен потому что `authFetch` ожидает body для POST (иначе `Content-Length: 0`); если хочешь — могу убрать, garden-auth ничего из body не читает.
  - **§3.2** — новый callback `handleProfileRefresh` в App.jsx, отдельный от `handleUpdateUser` (тот PATCH'ит в БД). Согласна с разделением?
  - **§3.4.4** — позиционирование секции **между Проф. профилем и Страницей ведущей** (как ты предлагала в Phase 2b ТЗ).
- §6 edge cases. Особенно polling-нагрузка (180 req/15min на юзера в активной привязке).

Если 🟢 — иду по §7. Если 🔴 на чём-то — точечная правка.

## 9. Что НЕ сделано сейчас

- ❌ Никакие файлы не отредактированы.
- ❌ Локальный dev-сервер не запускался.
- ❌ Никаких commit'ов.
- ✅ Сделан только readonly recon (Read tool + Explore-agent).
