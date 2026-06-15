# Email регистронезависимость (login + register) — задеплоено

**Роль:** codeexec · **Дата:** 2026-06-15 · **Статус:** ✅ задеплоено + smoke зелёный
**Закрывает:** `_195` (diff на ревью). 🟢 «Полный» получен от Ольги.

## Что сделано
Репо `ligacreate/garden-auth` (`~/code/garden-auth`), деплой на prod
`/opt/garden-auth/server.js` через scp + `systemctl restart garden-auth`.

- **`/auth/register`** — `email → normalizedEmail` (`trim().toLowerCase()`) во ВСЕХ
  ссылках: existence-check, INSERT `users_auth`, INSERT `profiles`, `signToken`,
  ответ, `notifyNewRegistration` (TG). Коммит `0c8fbd8`.
- **`/auth/login`** — `normalizedEmail` в лукапе `users_auth`, JWT и ответе
  (включая fallback-ветку). Это и был основной баг Инны. Коммит `0b22303`.

> ℹ️ Один отступ от буквы `_195`: в login-ответе нормализовал и fallback-ветку
> `profile.rows[0] || { id, email }` — для «одного источника истины» ответ
> всегда строчный. Правка того же класса, безопасна.

## Pre-deploy база (как просили)
- `md5` локального `~/code/garden-auth/server.js` == прод-копии **до** правок →
  база идентична, дрейфа нет. Деплоил из `/code/garden-auth` (не из старого
  `/vibecoding/garden-auth`).
- Перед каждой выкаткой `diff prod vs local` показывал **только наши правки**.

## Smoke (prod, выполнено мной)
| Кейс | Ожидание | Факт |
|---|---|---|
| register `MixedCase@example.com` → `users_auth.email` | строчный | `mixedcase@example.com` ✅ |
| register `MixedCase@example.com` → `profiles.email` | строчный | `mixedcase@example.com` ✅ |
| register `LoginSmoke@…` → login `LOGINSMOKE@…` + верный пароль | 200 | **200** ✅ |
| login + неверный пароль | 401 | **401** ✅ |

Регистронезависимый вход доказан end-to-end (верхний регистр → 200). Кейс Инны
`Kulish-inn@yandex.ru`: в БД хранится строчным (`is_lower=t`), механика та же →
вход с заглавной K теперь матчится. **Вход Инны под её реальным паролем — за
Ольгой в браузере** (пароля у меня нет).

Оба тестовых юзера (`mixedcase@`, `loginsmoke@`) удалены из прода (users_auth +
profiles), pending-очередь админа не засорена.

## ⚠️ Найденный дата-дебт (не блокер, на решение стратега)
`profiles` содержит **1 строку с mixed-case email** (в `users_auth` — 0 из 62).
То есть один профиль разошёлся по регистру со своим users_auth-двойником.
Логин по нему не ломается (login матчит users_auth, profiles берётся по id), но
это рассинхрон одного email в двух таблицах. Предлагаю отдельный backfill-фикс
(`UPDATE profiles SET email=lower(email) WHERE email<>lower(email)`) — могу
оформить дифом на ревью, если нужно.

## Что проверить Ольге
Вход Инны `Kulish-inn@yandex.ru` под её паролем в браузере → должен пустить.
