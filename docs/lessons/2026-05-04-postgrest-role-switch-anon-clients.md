---
title: При role-switch в PostgREST GRANT-слой должен покрывать ВСЕХ клиентов API, не только основной фронт
type: lesson
created: 2026-05-04
related_incident: Meetings-блокер 2026-05-04 (запросы 42501 на 4 публичных таблицы)
related_migrations:
  - migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
  - migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql
related_lessons:
  - docs/lessons/2026-05-03-rls-returning-implies-select-policy.md
---

# При role-switch в PostgREST GRANT-слой должен покрывать ВСЕХ клиентов API

## Симптом

После применения phase 16 (bulk GRANT для роли `authenticated` на 40 таблиц) приложение Meetings (отдельный сервис на meetings.skrebeyko.ru, ходит к api.skrebeyko.ru) перестало подгружать свежие данные. Юзеры видели сообщение «Не удалось загрузить свежие данные, показаны старые». Garden frontend при этом работал нормально.

## Корневая причина

PostgREST после SEC-001 переключён на role-switch через JWT:
- Запрос с валидным JWT → role = `authenticated`
- Запрос без JWT → role = `web_anon`

Phase 16 выдала GRANT'ы только для `authenticated`. У `web_anon` GRANT'ов на public-таблицы было 0. Это было **сознательное решение** на основе разведки фронта Garden: «Garden anon-context (до login) НЕ делает PostgREST-запросов» — Q5b показала, что AuthScreen и flow регистрации идут через auth-сервис, не через PostgREST.

**Но разведка покрывала только Garden frontend.** Приложение Meetings — это **отдельный, независимый клиент** того же API-gateway (PostgREST на api.skrebeyko.ru). Его архитектура другая: Meetings полностью анонимный, никакого JWT не использует, читает 4 публичных таблицы (events, cities, notebooks, questions) под `web_anon`.

Когда `web_anon` имел 0 GRANT'ов, каждый запрос Meetings возвращался с 42501 «permission denied for table». Приложение делало 3 retry'я на каждый из 4 endpoints (12 проваленных запросов на загрузку), потом отдавало юзеру старый localStorage-кэш с пометкой «не удалось загрузить».

До SEC-001 phase 3 (когда PostgREST не переключал роли и шёл под owner-ролью `gen_user`) это работало — owner обходит RLS и table-GRANT'ы. После phase 3 + phase 16 проблема обнажилась: Garden работает, Meetings ломается.

## Паттерн

При смене auth-модели в shared API-gateway (PostgREST, Supabase, Hasura и подобные):

1. **Разведка клиентов должна охватывать ВСЕ приложения и сервисы**, использующие этот API, не только тот, в репо которого вы сидите.
2. **Каждый клиент имеет свою auth-модель** (анонимный / JWT / service-account / mixed). Все они должны быть учтены в плане GRANT'ов.
3. **Анонимные клиенты — отдельная категория**. Если есть хоть один клиент, который ходит без JWT, роль `web_anon` (или эквивалент) должна получить нужные SELECT'ы. Иначе deny-by-default ломает функционал.

## Как могло проявиться по-другому

Этот же паттерн мог бы скрываться в:
- Webhook-обработчиках, которые читают БД анонимно для подсчёта/уведомлений
- SSR-слоях (Next.js, Nuxt) с анонимными запросами
- Внешних интеграциях (Telegram-боты, Zapier, custom webhooks)
- Лендингах и публичных страницах сайта (если они есть отдельно от основного frontend'а)
- Service-workers и offline-кэшах, которые делают bootstrap-запросы без auth

## Как предотвратить

**Чек-лист перед миграцией auth-модели в PostgREST-style API:**

1. **Перечислить все клиенты API.** Не только основной frontend. Включая:
   - Web-приложения (sub-domains, lendings, статические страницы)
   - Mobile-приложения
   - Backend-сервисы (auth, push, рассылки, аналитика, billing)
   - Webhook-обработчики и cron-задачи
   - Admin-панели (часто отдельные от продуктового UI)
   - Тесты и dev-инструменты, которые могут забивать staging-данные

2. **Для каждого клиента — какую роль он использует?**
   - Гарантирует ли он наличие JWT в каждом запросе?
   - Есть ли у него service-account / отдельная роль?
   - Делает ли он bootstrap-запросы до login?

3. **Сопоставить роли с GRANT'ами.** Любая роль, у которой 0 GRANT'ов, но которая используется хотя бы одним клиентом → 42501 после миграции.

4. **Smoke-тест каждого клиента**, не только основного. После миграции — refresh каждого приложения с DevTools Network открытым, проверить, что нет 401/403 на api-endpoint'ах.

5. **Если клиент анонимный** — узкий whitelist: GRANT SELECT для `web_anon` ровно на те таблицы, которые он реально читает, не больше. RLS должна продолжать гейтить чувствительные таблицы.

## Garden-specific повторяющийся риск

В Garden одно общее `default_db` обслуживает несколько приложений: Garden (liga.skrebeyko.ru), Meetings (meetings.skrebeyko.ru), потенциально другие. Это значит:

- Любая будущая миграция, меняющая auth-модель PostgREST → проверять обе/все системы.
- Любое новое приложение, подключающееся к api.skrebeyko.ru → audit его auth-модели + соответствующие GRANT'ы.
- AUDIT-001 (code review meetings) в backlog'е должен включать enumeration этих точек, чтобы будущие миграции их не забывали.

## Что было сделано

- Phase 18 миграция: `GRANT SELECT TO web_anon` на events, cities, notebooks, questions; параллельно `REVOKE INSERT/UPDATE/DELETE ON events FROM authenticated` (закрыта побочная дыра ANOM-002/SEC-011, появившаяся когда phase 16 GRANT встретила слишком открытые RLS-policies на events).
- Заведён ANOM-004 — проверить тот же паттерн writes wide-open на cities/notebooks/questions.
- Заведён AUDIT-001 — code review репо meetings, в т.ч. полный enumerate auth-точек.
