# Урок: pending-юзер при входе ловил «Не удалось создать пользователя в новой базе»

**Дата:** 2026-06-09 · **Связано:** FEAT-023 (pending_approval), [_session/183](../_session/2026-06-09_183_codeexec_registration_pending_message_diff.md)

## Симптом

Новый юзер регистрируется (заявка корректно уходит на одобрение админу), затем пытается войти — и видит пугающий `alert` «Не удалось создать пользователя в новой базе. Напишите администратору». Выглядит как поломка, хотя всё штатно: заявка на одобрении.

## Корневая причина

Сообщение кидается из **одного** места — `services/dataService.js` `_ensurePostgrestUser` (`POST /profiles`). Для pending-юзера phase31 restrictive **write** guard режет POST → `catch` → `throw`.

`register()` это уже обработал (ранний `return` при `access_status === 'pending_approval'`, Phase 2.5). А `login()` — нет: для pending `_fetchProfile` возвращает `null` (guard режет чтение своей строки) → срабатывает safety-net `if (!profile && authUser?.id)` → `_ensurePostgrestUser` → throw. Owner-слой `login()` не знал про pending.

## Почему так получилось

Login-path для pending'а **сознательно отложили на Phase 3** ([_session/44 §2.2](../_session/2026-05-16_44_codeexec_phase2_25_applied.md), [_43 §5](../_session/2026-05-16_43_codeexec_phase25_frontend_diff.md)). Но спрогнозировали мягкий симптом («пустые экраны»), а по факту `_ensurePostgrestUser` кидает **раньше** — отсюда пугающий alert, а не пустой UI. Прогноз последствий дыры был неполным: не дотрассировали, что safety-net упрётся в write guard и бросит.

## Как починили

- **Owner-слой `login()`**: ранний `return authUser` при `access_status === 'pending_approval'` — зеркало `register()`. Не лезем в PostgREST для pending (там по дизайну закрыто). `_ensurePostgrestUser` общий — глушить его нельзя (спрячет реальные сбои активных юзеров), поэтому решаем в вызывающем слое.
- **`App.jsx#handleLogin`**: спокойный `showNotification` (тост, не alert) с единым текстом и для register-, и для login-ветки + `logout` + `return false`.

## Что проверить в будущем

- **Сигнал:** появилась проверка `access_status === 'pending_approval'` в одной точке входа (register) — проверь, что **все** параллельные точки (login, getCurrentUser, refresh) тоже её уважают. Один класс бага = «pending упирается в PostgREST-guard» — чини все точки сразу.
- **Паттерн:** когда осознанно откладываешь закрытие дыры — дотрассируй фактический worst-case (что именно бросит/покажет), а не только «в целом сломается». Прогноз «пустые экраны» скрыл пугающий alert.
- Generic `throw new Error('...')` в shared-хелпере (`_ensurePostgrestUser`) — кандидат на ложную тревогу: один и тот же текст для «реальный сбой» и «ожидаемый guard». Различай на вызывающем слое по контракту (`access_status`), не в хелпере.
