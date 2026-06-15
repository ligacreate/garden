# Урок: нормализуй identity-поле во ВСЕХ точках входа, а не в одной

**Дата:** 2026-06-15 · **Сервис:** garden-auth (`/auth/login`, `/auth/register`)

## Симптом
Инна с адресом `Kulish-inn@yandex.ru` не могла войти при верном пароле —
«Invalid credentials». В БД её email хранился строчным (`kulish-inn@yandex.ru`),
а `/auth/login` делал `where email = $1` сырым вводом → побайтовое сравнение
PostgreSQL не матчило заглавную `K`.

## Корневая причина
Email — identity-ключ, но нормализовался непоследовательно. `/auth/request-reset`
уже приводил к `lower()`, а `/auth/login` и `/auth/register` — нет. Источник
истины (строчный email) задавался только частью endpoint'ов. Слой: входные
контракты handler'ов (data/contracts), не БД.

## Почему так получилось
Нормализацию добавляли точечно, под конкретный баг (reset), без аудита всех
путей. «Identity-поле» не имело единого инварианта «строчный с момента входа».
Каждый endpoint трактовал регистр сам.

## Как починили
Ввели единый `normalizedEmail = String(email).trim().toLowerCase()` в начале
обоих handler'ов и провели его через ВСЕ стоки:
- login: лукап `users_auth`, JWT, ответ (вкл. fallback).
- register: existence-check, INSERT `users_auth`, INSERT `profiles`, JWT, ответ,
  TG-уведомление.
Предварительно проверили прод: `users_auth` — 0/62 mixed-case, поэтому
нормализация ввода никого не лочит.

## Что проверить в будущем
- **Identity-поле (email/phone/username) нормализуй на КАЖДОЙ точке входа** —
  и на write (register), и на read (login/reset). Один источник истины.
- Внутри одного handler'а проверь ВСЕ стоки поля: обе таблицы, токен, ответ,
  уведомления. Иначе регистрозависимость «переезжает» в соседний слой.
- Перед нормализацией read-пути убедись, что хранимые значения уже в каноне
  (запрос `count(*) FILTER (WHERE x <> lower(x))`) — иначе залочишь существующих.
- Дешёвый системный вариант на будущее: `citext` или CHECK/normalize на уровне
  колонки — тогда инвариант не зависит от дисциплины каждого endpoint'а.

## Связанный дата-дебт
`profiles` — 1 строка с mixed-case email (рассинхрон с `users_auth`). Кандидат
на backfill `UPDATE profiles SET email=lower(email) WHERE email<>lower(email)`.
