# HANDOVER из сессии 2026-05-02

Привет! Я продолжаю работу по восстановлению безопасности
платформы Garden (liga.skrebeyko.ru). Прочитай этот handover,
чтобы войти в курс дела.

═══════════════════════════════════════════════════════════
КОНТЕКСТ ПРОЕКТА
═══════════════════════════════════════════════════════════

Платформа "Сад ведущих" (liga.skrebeyko.ru) — обучающая
платформа для ведущих письменных практик с курсом ПВЛ
("Пиши, Веди, Люби") внутри.

Я — владелец платформы (Ольга Скребейко). Не разработчик.
Раньше работала с помощницей Настей. Сейчас параллельно
работаю с двумя AI:
- Claude Code в VS Code — для работы с кодом и БД через SSH
- Ты (веб-чат Claude.ai) — для стратегии, промптов, проверки

Архитектура:
- 4 GitHub-репо под аккаунтом ligacreate:
  garden, garden-auth, garden-db, meetings
- Раньше код был под аккаунтом lupita-create (помощница),
  сейчас перенесли на ligacreate
- Сервер: Mysterious Bittern на Timeweb Cloud (5.129.251.56)
- БД: Postgres + PostgREST (api.skrebeyko.ru)
- Auth: свой Express-сервис (auth.skrebeyko.ru)
- Frontend: Vite + React, хостится отдельно (185.215.4.44)

═══════════════════════════════════════════════════════════
ЧТО ПРОИЗОШЛО В ПРЕДЫДУЩЕЙ СЕССИИ (2026-05-02)
═══════════════════════════════════════════════════════════

ОБНАРУЖЕНА КРИТИЧЕСКАЯ ДЫРА БЕЗОПАСНОСТИ:
- PostgREST на api.skrebeyko.ru отвечал на анонимные запросы
  без авторизации
- Любой человек в интернете мог через curl получить полные
  профили всех пользователей (email, ФИО, телефон, дата
  рождения)
- Дыра существовала минимум 2.5 месяца (с миграции на Timeweb
  16 февраля 2026)

ПРИЧИНА:
- PostgREST ходит в БД как роль gen_user (владелец таблиц)
- Postgres по умолчанию даёт владельцу обходить RLS (owner
  bypass)
- 60 RLS-политик существуют, но не применялись из-за owner
  bypass
- Также было GRANT ALL TO PUBLIC на messages и
  push_subscriptions

═══════════════════════════════════════════════════════════
ЧТО СДЕЛАНО (статус БД)
═══════════════════════════════════════════════════════════

✅ Этап 0: Caddy 503 на api.skrebeyko.ru/* (кроме /auth/*
   и /storage/*) — дыра закрыта временно
✅ Шаг 2.1: Backup всех RLS политик скачан на мак
   (~/Desktop/policies_backup_2026-05-02.txt)
✅ Шаг 2.2: Созданы роли web_anon (NOLOGIN) и authenticated
   (NOLOGIN), gen_user добавлен в обе. Был incident с
   Timeweb-панелью, починили GRANT ALL ... TO gen_user.
✅ Шаг 2.3: REVOKE ALL ON public.messages FROM PUBLIC +
   REVOKE ALL ON public.push_subscriptions FROM PUBLIC

❌ Шаг 2.4: GRANT для authenticated и web_anon — НЕ СДЕЛАН
❌ Шаг 2.5: Переписать 4 hardcoded email-policies на
   role-based — НЕ СДЕЛАН
❌ Шаг 2.6: ALTER TABLE ... FORCE ROW LEVEL SECURITY —
   НЕ СДЕЛАН
❌ Этап 3: PostgREST на JWT validation, переключение
   PGRST_DB_ANON_ROLE на web_anon — НЕ СДЕЛАН
❌ Этап 4: Изменения фронтенда (Bearer в postgrestFetch) —
   НЕ СДЕЛАН
❌ Этап 5: Открыть Caddy обратно и тестировать — НЕ СДЕЛАН

ПЛАТФОРМА ВСЁ ЕЩЁ ЗАКРЫТА для пользователей через Caddy 503.

═══════════════════════════════════════════════════════════
КРИТИЧЕСКИЕ НАХОДКИ ДНЯ
═══════════════════════════════════════════════════════════

1. ПЕРЕЕХАЛИ НА НОВЫЙ РЕПО
Раньше работали с lupita-create/garden (Настин). Сейчас
правильный prod-репо — ligacreate/garden (мой). Старый
лежит в /Users/user/vibecoding/garden_claude/garden_lupita_backup_2026-05-02/
В новом репо последний коммит: 8bb03bf 2026-05-01 19:28:39
Файл services/pvlPostgrestApi.js в новом репо есть, в
старом не было — возможно, реализация PVL обновилась.

2. УЧИТЕЛЬСКАЯ НАЙДЕНА
PVL-админка ("учительская") живёт в основном репо garden,
файл views/PvlPrototypeApp.jsx (8382 строк).
Цепочка назначения ментора:
UI (PvlPrototypeApp.jsx:7043-7105 select onChange)
  → assignStudentMentor (PvlPrototypeApp.jsx:6942)
  → adminApi.assignStudentMentor (pvlMockApi.js:3689)
  → persistGardenMentorLink (pvlMockApi.js:1000)
  → upsertGardenMentorLink (pvlPostgrestApi.js:564)
  → POST /pvl_garden_mentor_links через PostgREST с JWT

3. PVL-ФРОНТ АКТИВНО ХОДИТ В PostgREST
18 PVL-таблиц используются через PostgREST с Bearer-токеном:
pvl_audit_log, pvl_calendar_events, pvl_checklist_items,
pvl_content_items, pvl_content_placements, pvl_course_lessons,
pvl_course_weeks, pvl_direct_messages, pvl_faq_items,
pvl_garden_mentor_links, pvl_homework_items,
pvl_homework_status_history, pvl_notifications,
pvl_student_content_progress, pvl_student_course_progress,
pvl_student_homework_submissions, pvl_student_questions,
pvl_students

Это значит: при открытии Caddy без grants на PVL для
authenticated — учительская и весь курс ПВЛ сломаются.

4. JWT FALLBACK — КРИТИЧЕСКАЯ ОПАСНОСТЬ
В services/pvlPostgrestApi.js при ошибках PGRST300/PGRST302
("Server lacks JWT secret") код устанавливает
pvlJwtDisabledAfterError=true и все последующие запросы
идут БЕЗ Authorization. То есть если включить JWT в
PostgREST некорректно, фронт сам отключит авторизацию.

5. SPLIT-BRAIN AUTH (умеренный риск)
- profiles: 59 записей
- users_auth: 61 запись (split-brain — 2 зомби-аккаунта
  без профилей)
- auth.users: 32 записи (legacy от Supabase, не
  используется)

6. ZERO-SCALE АДМИНОВ
Платформа имеет 3 реальных админов:
- Ольга Скребейко (olga@skrebeyko.com) — владелец
- Анастасия Зобнина (ilchukanastasi@yandex.ru) —
  ассистент
- Ирина Одинцова (odintsova.irina.ig@gmail.com) —
  куратор Лиги, ментор курса
Все трое имеют role='admin' и должны иметь полные права.

═══════════════════════════════════════════════════════════
ДОКУМЕНТЫ
═══════════════════════════════════════════════════════════

В /Users/user/vibecoding/garden_claude/garden/
лежат документы из вчерашней сессии:
- docs/PROJECT_PASSPORT.md — паспорт проекта
- docs/PRD.md — продуктовые требования (reverse-engineered)
- docs/FEATURES.md — реестр фич
- docs/SUPABASE_LEGACY_AUDIT.md — что осталось от Supabase
- docs/PVL_RECONNAISSANCE.md — разведка PVL
- docs/API_OUTAGE_IMPACT_ANALYSIS.md — что сломается при
  закрытии API
- docs/DB_SECURITY_AUDIT.md — аудит безопасности БД (v1.1)
- docs/ROLES_AND_ACCESS.md — матрица доступа
- docs/HANDOVER_2026-05-02_session1.md — handover вчерашний
- docs/lessons/2026-05-02-revoke-public-strips-owner-grant-on-timeweb.md
- plans/BACKLOG.md — единый трекер задач (P0-P3)


═══════════════════════════════════════════════════════════
ЧТО НУЖНО СДЕЛАТЬ ДАЛЬШЕ
═══════════════════════════════════════════════════════════

ПРИОРИТЕТ 1: ВЕРИФИКАЦИЯ КОДОВОЙ БАЗЫ

Прежде чем продолжать менять БД, нужно:
1. Подтвердить, что в новом репо ligacreate/garden код
   совпадает с тем, что реально задеплоено на
   liga.skrebeyko.ru
2. Перенести нужные документы из garden_lupita_backup в
   новый garden/docs/ — но только то, что верно для нового
   репо
3. Перепроверить аудит DB_SECURITY_AUDIT.md в свете того,
   что pvlPostgrestApi.js существует и активно используется

ПРИОРИТЕТ 2: ШАГ 2.4 — GRANTS

Дать grants с учётом обновлённой картины:

web_anon (анонимные запросы — минимум):
- USAGE на схему public (есть автоматически через
  PUBLIC-наследование)
- SELECT на таблицы для формы регистрации/логина:
  cities, app_settings (только справочники)
- НИЧЕГО больше — на платформе нет анонимного UX

authenticated (залогиненные):
- SELECT на все основные таблицы (профили, события, KB,
  встречи, сообщения, цели, практики, сценарии, и т.д.)
- INSERT/UPDATE на свои данные (RLS отфильтрует)
- ВКЛЮЧАЯ все 18 PVL-таблиц — фронт активно их использует
- НЕ давать на users_auth (password hashes) и legacy-таблицы
  (to_archive, events_archive)

Перед выполнением — Claude Code должен составить полную
таблицу "таблица × роль × CRUD" и согласовать с владельцем.

ПРИОРИТЕТ 3: ШАГ 2.5 — PEПИСАТЬ HARDCODED POLICIES

4 политики в БД жёстко проверяют
auth.jwt() ->> 'email' = 'olga@skrebeyko.com'.
Переписать на role-based:
EXISTS (SELECT 1 FROM profiles
WHERE id = auth.uid() AND role = 'admin')

Это даст полные права всем трём админам, не только Ольге.

Также: в knowledge_base есть RLS-политика, разрешающая
запись любому залогиненному. Переписать — только для
admin.

ПРИОРИТЕТ 4: ШАГ 2.6 — FORCE ROW LEVEL SECURITY

ALTER TABLE ... FORCE ROW LEVEL SECURITY на всех 17+
таблицах с включённым RLS.

ВАЖНО: после этого даже gen_user (владелец) подчиняется
RLS. Если PostgREST продолжит ходить как gen_user без
JWT — большинство запросов будут блокированы. Поэтому
сразу после 2.6 нужно идти в Этап 3.

ПРИОРИТЕТ 5: ЭТАП 3 — POSTGREST НА JWT

Настроить PostgREST на проверку JWT от garden-auth:
1. Получить jwt-secret из garden-auth (.env на сервере
   /opt/garden-auth/)
2. Прописать в PostgREST конфиг
3. Изменить PGRST_DB_ANON_ROLE с gen_user на web_anon
4. Перезапустить PostgREST

ВАЖНО про JWT-fallback в pvlPostgrestApi.js:
Код фронта при ошибках JWT отключает Authorization. Это
значит, неправильно настроенный JWT в PostgREST приведёт
к молчаливой деградации PVL до анонимных запросов.
Нужно:
1. Перед применением — проверить формат JWT от garden-auth
   (claims, алгоритм, секрет)
2. Тщательно протестировать одним запросом перед открытием
   Caddy
3. Возможно, потребуется патч pvlPostgrestApi.js — убрать
   fallback или сделать его явной ошибкой

ПРИОРИТЕТ 6: ЭТАП 4 — ФРОНТЕНД

В services/dataService.js функция postgrestFetch не передаёт
Authorization header (известно из старого аудита). После
Этапа 3 PostgREST начнёт требовать JWT — нужно добавить
передачу токена.

Конкретно:
1. В postgrestFetch добавить Authorization: Bearer <token>
2. Проверить App.jsx init() — добавить graceful degradation
   при ошибках профиля (сейчас любая ошибка ломает вход)
3. Пересборка и деплой

ПРИОРИТЕТ 7: ЭТАП 5 — ОТКРЫТИЕ И ТЕСТИРОВАНИЕ

1. Изменить /etc/caddy/Caddyfile — вернуть reverse_proxy
   на 127.0.0.1:3000 для PostgREST-путей
2. systemctl reload caddy
3. Тестирование: curl с Bearer-токеном должен возвращать
   данные, без токена — ошибку
4. Полное тестирование UI: логин, регистрация, профиль,
   PVL-учительская, сдача ДЗ, проверка ментором

═══════════════════════════════════════════════════════════
ИНФРАСТРУКТУРА ДОСТУПА
═══════════════════════════════════════════════════════════

SSH-ключ настроен на маке (~/.ssh/id_ed25519).
Подключение: ssh root@5.129.251.56 (без пароля).

Доступ к Postgres как gen_user — стандартный путь через
auth-сервис. Для суперюзерских команд (CREATE ROLE, и т.п.) —
открыт тикет в Timeweb support, ждём ответа.

Альтернативно — через консоль Timeweb напрямую SQL
выполнять в админ-режиме.

═══════════════════════════════════════════════════════════
ПРАВИЛА РАБОТЫ
═══════════════════════════════════════════════════════════

1. Все изменения в БД — только через Claude Code в VS Code,
   с подключением по SSH к серверу
2. Между шагами — обязательная пауза, показ результата,
   подтверждение от меня
3. Перед каждым изменяющим SQL — backup или транзакция
   с возможностью ROLLBACK
4. Платформа закрыта (Caddy 503) — пользователи об этом
   предупреждены, можно работать
5. Цель — открыть платформу с нормальной защитой к концу
   сегодняшнего дня

═══════════════════════════════════════════════════════════
ЗАДАЧА НА СЕЙЧАС
═══════════════════════════════════════════════════════════

Прочитай этот handover, скажи что понял. Затем подскажи,
с какого шага продолжать. Я думаю — ПРИОРИТЕТ 1 (верификация
кодовой базы), потом ПРИОРИТЕТ 2 (Шаг 2.4 grants).

Дополнительно: есть ли что-то в моём handover, что выглядит
странно или требует уточнения?
