# DB-аудит v2, 2026-05-02 (read-only)

Сессия только на чтение: `gh` через GitHub REST API без токена (публичный репо `ligacreate/garden`), `psql` под `gen_user` через `/opt/garden-auth/.env` на `5.129.251.56`. Никаких изменений.

Цель: закрыть три блокера перед написанием SQL для следующих этапов — (1) подтвердить SHA на проде, (2) проверить состояние `messages`/`push_subscriptions` перед включением RLS-без-политик, (3) выписать blast radius задачи «RLS везде».

---

## Краткое резюме

1. **SHA на проде = `8bb03bfb` = локальный HEAD `8bb03bf`** (последний успешный run `Deploy to FTP` от 2026-05-01 16:28 UTC, GitHub Actions). Расхождение хешей бандлов из вчерашнего отчёта объясняется средой сборки (Linux GitHub Actions vs локальный macOS), а не разным коммитом. Кодовая база в репо = задеплоенный код, **подтверждено**.
2. **`messages` — 4 строки, `push_subscriptions` — 0 строк**, FK нет ни там, ни там. Включение RLS без политик безболезненно для `push_subscriptions`; для `messages` — заблокирует чтение 4 существующих сообщений до появления политик (если фронт читает их под `web_anon`/`authenticated`).
3. **28 таблиц в `public` без RLS**, из них только 2 — явный archive (`events_archive` 72 строки, `to_archive` 63 строки, без PK). Остальные 26 — живые: 22 PVL-таблицы (включая `pvl_audit_log` 2204 строки) + `users_auth` (61 строка, **содержит password_hash**) + `birthday_templates` (2 строки) + `messages`/`push_subscriptions`.
4. **Найдено отдельно опасное: `users_auth` (RLS=off, 61 строка с `password_hash`, `email`, `reset_token`).** Это таблица garden-auth-сервиса — после выдачи grants на `web_anon`/`authenticated` без RLS она будет читаемой через PostgREST.

---

## Задача 1 — SHA на проде через GitHub Actions

**Способ:** `gh` CLI на машине не установлен, но репо `ligacreate/garden` публичный — REST API GitHub отдаёт `/actions/runs` без авторизации. Логи отдельных runs требуют токен (403 без него), поэтому env-переменные `Build`-шага восстановлены из локального `.github/workflows/deploy.yml`.

### Последние 10 workflow runs

```
2026-05-01T16:28:54Z   success  8bb03bfb  Deploy to FTP  id=25222659938  branch=main
2026-05-01T16:12:38Z   success  e1c5aa9e  Deploy to FTP  id=25222040975  branch=main
2026-05-01T16:10:10Z   success  cd42f6b5  Deploy to FTP  id=25221949410  branch=main
2026-04-30T09:59:29Z   success  31a27f28  Deploy to FTP  id=25159308391  branch=main
2026-04-30T09:43:34Z   success  bc0407b0  Deploy to FTP  id=25158633580  branch=main
2026-04-30T09:34:35Z   success  fa077fec  Deploy to FTP  id=25158250233  branch=main
2026-04-30T08:57:40Z   success  fdf755b1  Deploy to FTP  id=25156677689  branch=main
2026-04-30T08:47:38Z   success  6feee471  Deploy to FTP  id=25156246061  branch=main
2026-04-30T08:28:46Z   success  777efe57  Deploy to FTP  id=25155466242  branch=main
2026-04-30T08:24:17Z   success  28a39d69  Deploy to FTP  id=25155280577  branch=main
```

Все 10 — `Deploy to FTP` на `main`, статус `success`. Других workflow в репо нет (`.github/workflows/` содержит только `deploy.yml`).

### Последний успешный deploy

| Параметр | Значение |
|---|---|
| Дата | 2026-05-01T16:28:54Z (вчера, ~21 час назад) |
| SHA | `8bb03bfb` |
| Workflow | `Deploy to FTP` (`.github/workflows/deploy.yml`) |
| Run ID | 25222659938 |
| Ссылка | https://github.com/ligacreate/garden/actions/runs/25222659938 |
| Коммит | https://github.com/ligacreate/garden/commit/8bb03bf |

### Сравнение SHA с локальным репо

```
local HEAD: 8bb03bfbdddc97ee17deac6cbfa319398aa2388c
prod SHA :  8bb03bfb...
match:      ✓
```

**Вывод:** прод собран из того же коммита, что и локальный HEAD. Утверждение «код в репо = задеплоенный код» подтверждено.

### Job steps последнего успешного run

```
build-and-deploy [success]
  1. Set up job
  2. Checkout
  3. Use Node           (node-version: 20, cache: npm)
  4. Install deps       (npm ci)
  5. Create env file
  6. Build              (npm run build)
  7. Prepare deploy bundle
  8. Deploy via FTP     (SamKirkland/FTP-Deploy-Action@v4.3.5, dangerous-clean-slate: true)
```

### Env-переменные в `Build`-шаге (из `.github/workflows/deploy.yml`)

Pre-Build шаг `Create env file` записывает в `.env`:

```
VITE_SUPABASE_URL=${{ secrets.VITE_SUPABASE_URL }}
VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}
VITE_PUSH_URL=${{ secrets.VITE_PUSH_URL }}
VITE_WEB_PUSH_PUBLIC_KEY=${{ secrets.VITE_WEB_PUSH_PUBLIC_KEY }}
VITE_POSTGREST_URL=${{ secrets.VITE_POSTGREST_URL }}
```

### Чего НЕТ в env прода

- **`VITE_POSTGREST_SKIP_JWT`** — отсутствует. Значит JWT-проверка в фронте не выключена при сборке прода, поведение по умолчанию.
- **`VITE_USE_LOCAL_DB`** — отсутствует. Прод не использует локальный mock.
- **`VITE_AUTH_URL`** — отсутствует. Если фронт его ждёт — берёт fallback из кода.

### Почему хеши бандлов в предыдущем отчёте расходились

Прод: `index-CTuO4hEU.js`, локальная сборка: `index-CyrNAtkj.js`. SHA коммита тот же, env-переменные при сборке те же (см. выше). Различие почти наверняка от среды сборки:

- GitHub Actions: Linux ubuntu-latest, Node 20.x, `npm ci` с lockfile (cache: "npm").
- Локальная сборка: macOS Darwin 25, возможна другая minor-версия Node, возможен `npm install` (а не `npm ci`).

Vite/Rollup детерминирован по содержимому, но фактические байты бандла зависят от: версий зависимостей в `node_modules` (если lockfile разъезжается с локальным `package-lock.json`), normalized line endings (LF vs CRLF в каких-то промежуточных файлах), порядка проходов на разных платформах. Расхождение хешей **не означает** разный код — означает разную сборку из одного коммита.

**Чтобы поставить точку:** скачать прод-html и `index-CTuO4hEU.js`, локально сделать `npm ci && npm run build` в чистой папке (без node_modules от других веток) и сравнить — должны совпасть. Если не совпадут — диффом по содержанию (не по хешу) проверить, отличается ли логика. Это вне scope сегодняшней сессии.

---

## Задача 2 — состояние `messages` и `push_subscriptions`

### Количество строк

```
messages           = 4
push_subscriptions = 0
```

### Схема `public.messages`

```
   Column    |           Type           | Nullable |    Default
-------------+--------------------------+----------+----------------
 id          | bigint                   | not null | identity
 author_id   | uuid                     |          |
 author_name | text                     | not null | 'Участник'
 text        | text                     | not null |
 created_at  | timestamp with time zone | not null | now()
 edited_at   | timestamp with time zone |          |
 deleted_at  | timestamp with time zone |          |
 image_url   | text                     |          |

Indexes:
  messages_pkey            (id)
  messages_author_id_idx   (author_id)
  messages_created_at_idx  (created_at DESC)

Publications:
  supabase_realtime
```

**Foreign keys:** нет. `author_id` — uuid, NULLable, без FK на `profiles(id)`. Целостность не гарантируется на уровне БД.

**Realtime:** таблица в publication `supabase_realtime`. Если фронт уже не использует Supabase Realtime (`@supabase/supabase-js` подключение), publication холостая, но не мешает.

**Будущие политики:** возможны по `author_id = auth.uid()` для UPDATE/DELETE и по `auth.uid() IS NOT NULL` или `true` для SELECT (если чат публичный). Денормализованный `author_name` усложняет: при смене имени в `profiles` сообщения остаются со старым именем — это не bug-RLS-вопрос, но стоит зафиксировать.

### Схема `public.push_subscriptions`

```
   Column   |           Type           | Nullable | Default
------------+--------------------------+----------+----------
 id         | bigint                   | not null | identity
 user_id    | uuid                     |          |
 endpoint   | text                     | not null |
 keys       | jsonb                    | not null | '{}'
 user_agent | text                     |          |
 is_active  | boolean                  | not null | true
 created_at | timestamp with time zone | not null | now()
 updated_at | timestamp with time zone | not null | now()

Indexes:
  push_subscriptions_pkey         (id)
  push_subscriptions_endpoint_key UNIQUE (endpoint)
  push_subscriptions_active_idx   (is_active)
  push_subscriptions_user_id_idx  (user_id)
```

**Foreign keys:** нет. `user_id` — uuid, NULLable, без FK на `profiles(id)`.

**Будущие политики:** при включении web-push — фильтрация по `user_id = auth.uid()` для всех CRUD. SELECT на свои строки, INSERT с `user_id = auth.uid()`, DELETE/UPDATE — по тому же предикату.

### Безопасность включения RLS-без-политик

| Таблица | Строк | Кто пишет/читает сейчас | Эффект `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` |
|---|---|---|---|
| `push_subscriptions` | 0 | push-сервер пишет, фронт пишет. Сейчас фича не активна (0 строк). | Безболезненно. Owner (`gen_user`) и так bypass. После выдачи grants `web_anon`/`authenticated` без политик — все запросы под этими ролями вернут 0 строк или 403. |
| `messages` | 4 | Если чат активен — фронт читает под `gen_user` (через JWT). 4 строки указывают на тестовые данные либо реальный, но мёртвый чат. | Аккуратно: если фронт сейчас использует `web_anon` или `authenticated` для чтения — после ENABLE без политик чтение пропадёт. Под `gen_user` (owner) — bypass, продолжит читать. |

Перед `ENABLE` для `messages` стоит:
- Проверить, какой ролью фронт ходит за `messages` (через `pvlPostgrestApi`/`dataService`).
- Проверить активность фичи (UI видим? endpoint вызывается?).
- Если 4 строки — тестовые, можно ENABLE+REVOKE FROM web_anon,authenticated без сожалений.

---

## Задача 3 — полный список таблиц без RLS

В `public` всего 45 таблиц, RLS включён на 17, выключен на **28**. Точные `count(*)` (а не `reltuples`) на 2026-05-02 ~21:30 MSK:

| # | Таблица | Строк | Категория |
|---:|---|---:|---|
| 1 | `birthday_templates` | 2 | конфиг/шаблон |
| 2 | `events_archive` | 72 | **archive** (по имени) |
| 3 | `messages` | 4 | живая фича (чат) |
| 4 | `push_subscriptions` | 0 | живая фича (web-push, не активна) |
| 5 | `pvl_audit_log` | 2204 | PVL |
| 6 | `pvl_calendar_events` | 24 | PVL |
| 7 | `pvl_cohorts` | 1 | PVL |
| 8 | `pvl_content_items` | 29 | PVL |
| 9 | `pvl_content_placements` | 23 | PVL |
| 10 | `pvl_course_lessons` | 2 | PVL |
| 11 | `pvl_course_weeks` | 13 | PVL |
| 12 | `pvl_direct_messages` | 25 | PVL |
| 13 | `pvl_faq_items` | 6 | PVL |
| 14 | `pvl_garden_mentor_links` | 19 | PVL |
| 15 | `pvl_homework_items` | 19 | PVL |
| 16 | `pvl_homework_status_history` | 110 | PVL |
| 17 | `pvl_mentors` | 1 | PVL |
| 18 | `pvl_notifications` | 0 | PVL |
| 19 | `pvl_student_certification_criteria_scores` | 0 | PVL |
| 20 | `pvl_student_certification_scores` | 0 | PVL |
| 21 | `pvl_student_course_points` | 0 | PVL |
| 22 | `pvl_student_course_progress` | 13 | PVL |
| 23 | `pvl_student_disputes` | 0 | PVL |
| 24 | `pvl_student_homework_submissions` | 45 | PVL |
| 25 | `pvl_student_questions` | 5 | PVL |
| 26 | `pvl_students` | 23 | PVL |
| 27 | `to_archive` | 63 | **archive** (по имени, без PK) |
| 28 | `users_auth` | 61 | **критическая** (содержит `password_hash`) |

### Legacy / archive по имени или схеме

Прямые подсказки в имени или метаданных:

- **`events_archive`** (72 строки) — суффикс `_archive`. Схема — копия `events` (id, date, title, category, time, speaker, location, city, description, image_*, registration_link, garden_id, co_hosts, image_focus_x, image_focus_y, created_at, price). PK есть (`events_archive_pkey`). Кандидат на «RLS включить, политики не писать», или вовсе DROP, если нигде не читается.
- **`to_archive`** (63 строки) — имя «to_archive» подсказывает «класть сюда то, что надо архивировать». **PK нет вообще** (на схеме нет ни pkey, ни UNIQUE), все колонки nullable. Это явный staging-table. Структура совпадает с `events_archive` минус NOT NULL и DEFAULT'ы. Кандидат на DROP после проверки, что никто не пишет.

### НЕ архив, но могло выглядеть как legacy

- **`birthday_templates`** (2 строки) — имя похоже на templates/конфиг, но по структуре (id, text, created_at) — это просто список текстов поздравлений для дней рождения. Скорее всего активная фича, читается фронтом. Нужны политики (как минимум SELECT для всех).
- **`users_auth`** (61 строка) — звучит как «вспомогательная», но это **главная таблица аутентификации garden-auth-сервиса** (uuid, email, password_hash, status, reset_token, reset_expires, created_at, UNIQUE по email). Пишется и читается auth-сервисом под `gen_user`. **Под `web_anon`/`authenticated` ни читать, ни писать нельзя ни при каких условиях** — она хранит хеши паролей. Здесь либо RLS+DENY-политики, либо `REVOKE ALL FROM web_anon, authenticated` без RLS, либо обе меры.

### Итог по blast radius задачи «RLS везде»

Из 28 RLS-off таблиц:

- **2** можно включить RLS без политик и забыть навсегда — `events_archive`, `to_archive` (legacy/архив, неактивны для пользователей).
- **22** PVL-таблицы — нужны политики (см. отдельную PVL-эпопею). Из них 4 пустые (`pvl_notifications`, `pvl_student_certification_*`, `pvl_student_course_points`, `pvl_student_disputes`) — для них можно ENABLE+минимальные политики «без злости».
- **2** «фичевые без активности» — `messages` (4 строки), `push_subscriptions` (0). RLS-on-без-политик безболезненно если фронт читает под owner.
- **1** «фичевая активная» — `birthday_templates` (2 строки) — нужна минимум SELECT-политика.
- **1** «критическая, не должна быть в API» — `users_auth` — отдельный режим (deny-все или REVOKE).

То есть из 28 — реально политики надо писать на ~23, причём для 22 PVL-шников они должны быть унифицированы по 3-4 шаблонам (own/mentor/admin/all-read).

---

## Что неожиданно

1. **SHA prod = SHA локального HEAD.** Вчерашняя тревога «прод собран из другого коммита» опровергнута. Расхождение хешей бандлов — артефакт разной среды сборки, а не разных коммитов. ПРИОРИТЕТ 1 предыдущего отчёта снимается.
2. **`users_auth` без RLS, 61 строка с password_hash.** Это не было выписано в предыдущем отчёте отдельно — таблица пряталась в общем списке «28 без RLS». Самая чувствительная таблица БД, и её нет среди защищённых.
3. **`to_archive` без primary key.** Совсем без PK и без NOT NULL. Это либо черновой staging, либо забытый artefact миграции событий. 63 строки лежат, никто не следит.
4. **22 PVL-таблицы без RLS, не 18.** Владелец сказал «18 PVL-таблиц» — фактически их 22 в `public` без RLS, плюс ещё 2 (`pvl_checklist_items`, `pvl_student_content_progress`) с RLS-on, но `qual=true` (no-op). Итого PVL-сущностей в БД — 24, не 18. Цифра «18», вероятно, из плана (активные таблицы), а 4 «лишние» — пока пустые таблицы сертификации/споров/баллов/нотификаций (готовые под фичи, но без данных).
5. **`messages.author_id` без FK на `profiles`** + денормализованный `author_name`. После рассинхронизации (смены имени или удаления профиля) сообщения остаются с устаревшим именем — отдельный data-quality долг, не RLS-вопрос, но всплыло.
6. **`push_subscriptions.user_id` без FK на `profiles`.** При удалении профиля повисшие подписки не очищаются автоматически.
7. **`messages` в publication `supabase_realtime`.** Указывает на ранее использованный Supabase Realtime. Если сейчас фронт не подписан через `@supabase/supabase-js` — publication лежит без потребителя.
8. **deploy.yml пишет `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`** в env прода. Значит код во фронте всё ещё ссылается на эти переменные хотя бы на чтение env — иначе их не передавали бы. Возможно legacy-страховка, возможно фактически читается. Прямого риска RLS не несёт, но достойно проверки в `services/`.
9. **На GitHub Actions нет ни одного зафейленного run** за последние 10. Кодовая база со стороны CI — здоровая.

---

## Открытые вопросы

1. **`users_auth` — какой режим защиты?** Варианты:
   - (a) `ALTER TABLE ENABLE ROW LEVEL SECURITY` без политик → все non-owner-роли получают 0 строк / 403. Самое строгое.
   - (b) `REVOKE ALL ON users_auth FROM web_anon, authenticated` (если grants случайно или в будущем выдадутся всем подряд через `GRANT ... ON ALL TABLES`) — defense-in-depth.
   - (c) Оба пункта одновременно — recommended.
   Решение нужно явное от владельца.

2. **`to_archive` — DROP или сохранить?** Без PK, 63 строки, дубликат структуры `events_archive`. Кто-то писал туда вручную при миграции старого `events`? Перед DROP — хорошо бы `git log --all --diff-filter=A migrations/ | grep -i archive` посмотреть историю и спросить владельца.

3. **`messages` — какая роль читает фронт?** Если `gen_user` — RLS-on без политик безопасно (owner bypass). Если фронт ходит под `web_anon`/`authenticated` (а так должно быть в правильной модели) — после ENABLE без политик чат сломается. Нужно сначала прочитать `services/dataService.js` или `chatApi.js`/`messagesApi.js`, потом писать SQL.

4. **`birthday_templates` — кто читает и какие требования к видимости?** 2 строки, текст поздравлений. Скорее всего читать может «любой залогиненный» или «все». Уточнить перед политиками.

5. **PVL: 22 таблицы — какие 4 шаблона политик владелец готов утвердить?** До утверждения шаблонов SQL не пишется. Грубый набросок:
   - own: `student_id = auth.uid()` или `mentor_id = auth.uid()`
   - mentor-of-student: через `pvl_garden_mentor_links` или `pvl_mentors`
   - admin: через `is_admin()`
   - read-all: `auth.uid() IS NOT NULL`
   Каждой из 22 таблиц приклеить шаблон.

6. **Расхождение хешей бандлов — не критично, но если хочется поставить точку:** локальный `npm ci && npm run build` в чистой папке должен дать тот же хеш, что прод. Это вне scope аудита, но если интересно — отдельный 5-минутный эксперимент.

7. **`Deploy to FTP` workflow с `dangerous-clean-slate: true`.** Значит при каждом деплое FTP-папка `/www/liga.skrebeyko.ru/` чистится перед заливкой. Если на проде что-то докладывалось руками — оно стирается. Не RLS-вопрос, но стоит запомнить как факт.
