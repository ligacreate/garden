# DB-аудит v5, 2026-05-02 (read-only)

Сессия только на чтение: чтение локальных файлов репо и публичный download прод-бандла. Никаких изменений.

Цель: закрыть последние два блокера перед SQL — статус `VITE_POSTGREST_SKIP_JWT` на проде и накопленный анализ RLS для синхронизации PVL ↔ profiles.

---

## Краткое резюме

1. **`VITE_POSTGREST_SKIP_JWT` на проде НЕ активен.** Прямого доступа к GitHub Secrets без токена нет (gh CLI не установлен, REST API на `/actions/secrets` возвращает 401), но переменная **физически не передаётся в `.env`** на этапе сборки (см. `deploy.yml`), а Vite инлайнит `import.meta.env.VITE_*` только из тех переменных, что есть в env при `npm run build`. Дополнительно: в прод-бандле присутствуют строки `"Authorization"` и `"Bearer "` — то есть код отправки Bearer не вырезан tree-shaking'ом, что означает `POSTGREST_SKIP_JWT` компилировался в `false`.
2. **Файл `database/pvl/notes/garden-profiles-rls-for-pvl-sync.md` существует и читается за минуту.** В нём зафиксирована ровно та архитектурная развилка, к которой мы пришли независимо: текущая политика `profiles_select_authenticated` (`USING (auth.uid() IS NOT NULL)`) даёт **любому** залогиненному право читать **все** профили. Если её сузить до «своей» строки (`auth.uid() = id`) — `getUsers()` сломает учительскую/админку. Автор предлагает 3 пути решения: (a) добавить отдельный SELECT для админов через `is_admin()`, (b) RPC/представление, (c) сервис-роль на бекенде.
3. **Это меняет наш план чистки.** Только удалить 3 дубля `qual=true` — недостаточно. Останется `profiles_select_authenticated`, и абитуриент продолжит видеть всех 59 пользователей. Чистка убирает «утечку анонимам», но не «утечку залогиненным». Финальный SQL должен включать **либо** новый предикат («свои + админу всё»), **либо** оставить текущее поведение и зафиксировать как сознательное решение.

---

## Задача 1 — статус `VITE_POSTGREST_SKIP_JWT` на проде

### Прямая проверка через `gh` / GitHub API

```
gh CLI: not installed (which gh → not found)
GH_TOKEN/GITHUB_TOKEN env: empty
~/.config/gh/: doesn't exist
~/.netrc: no github entry

curl https://api.github.com/repos/ligacreate/garden/actions/secrets    → 401
curl https://api.github.com/repos/ligacreate/garden/actions/variables  → 401
```

Доступа к самому списку секретов нет. Но это не нужно.

### Косвенные доказательства (достаточные)

**1. Workflow не передаёт переменную в `.env` сборки.**

Из `.github/workflows/deploy.yml`, шаг `Create env file`:
```yaml
echo "VITE_SUPABASE_URL=${{ secrets.VITE_SUPABASE_URL }}" > .env
echo "VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}" >> .env
echo "VITE_PUSH_URL=${{ secrets.VITE_PUSH_URL }}" >> .env
echo "VITE_WEB_PUSH_PUBLIC_KEY=${{ secrets.VITE_WEB_PUSH_PUBLIC_KEY }}" >> .env
echo "VITE_POSTGREST_URL=${{ secrets.VITE_POSTGREST_URL }}" >> .env
```

`VITE_POSTGREST_SKIP_JWT` тут отсутствует. Vite во время `npm run build` читает только переменные с префиксом `VITE_*`, которые либо в `.env`-файлах в корне репо, либо в `process.env` процесса сборки. Даже если такой секрет существует в GitHub Secrets — без явной строки `echo` он не попадает ни в `.env`, ни в `process.env` runner'a. **Значит для бандла прода `import.meta.env.VITE_POSTGREST_SKIP_JWT === undefined`, и `POSTGREST_SKIP_JWT === ('undefined' === 'true') === false`.**

**2. В `dataService.js`:**
```js
const POSTGREST_SKIP_JWT = import.meta.env.VITE_POSTGREST_SKIP_JWT === 'true';
```
Сравнение строго со строкой `'true'`. Любое другое значение (включая `undefined`) даёт `false`.

**3. В прод-бандле сохранён код отправки Bearer:**

```
$ curl -s https://liga.skrebeyko.ru/assets/index-CTuO4hEU.js | wc -c
1308613

$ grep -oE "Bearer|Authorization|Bearer \\$" prod.js | sort -u
Authorization
Bearer $
```

Строка `"Bearer $"` (фрагмент шаблонной строки `` `Bearer ${token}` ``) и `"Authorization"` физически присутствуют в бандле. Vite + esbuild делает dead-code elimination: если бы условие `if (!POSTGREST_SKIP_JWT && ...)` свелось к `if (false && ...)`, ветка с `headers.Authorization = ...` была бы устранена. Тот факт, что строки выжили — **это сильный косвенный признак, что `POSTGREST_SKIP_JWT === false` в проде**.

**4. Поиск `POSTGREST_SKIP_JWT`/`SKIP_JWT` в бандле — пусто.** Это нормально: Vite инлайнит `import.meta.env.*` на этапе компиляции, имя переменной в финальном бандле не сохраняется. Не противоречит выводу.

### Вердикт

**`VITE_POSTGREST_SKIP_JWT` на проде неактивна.** Прямой доступ к секретам недоступен, но три косвенных доказательства согласованы:
- workflow не пишет переменную в env сборки → даже если секрет существует, до Vite он не доходит;
- код отправки Bearer выжил в бандле → флаг компилировался в `false`;
- в коде сравнение строго с `'true'` → любое отсутствие = `false`.

**Чистка 3 SELECT-политик `qual=true` на `profiles` не сломает залогиненных** — Bearer уйдёт, новая политика `profiles_select_authenticated` сработает.

### Что бы окончательно поставило точку (вне scope read-only)

- В DevTools → Network → любой запрос на `/profiles` → проверить заголовок `Authorization: Bearer ...`.
- Установить `gh` (`brew install gh`) и сделать `gh secret list -R ligacreate/garden`.

Ни то, ни другое сейчас не нужно — текущих доказательств достаточно.

---

## Задача 2 — `database/pvl/notes/garden-profiles-rls-for-pvl-sync.md`

### Файл найден

```
/Users/user/vibecoding/garden_claude/garden/database/pvl/notes/garden-profiles-rls-for-pvl-sync.md
```

В папке `database/pvl/notes/` лежит только один файл.

### Полное содержимое (18 строк)

```markdown
# PostgREST / profiles и синхронизация ПВЛ

`syncPvlActorsFromGarden()` вызывает `GET /profiles?select=*` с JWT пользователя
из `localStorage` (`garden_auth_token`).

## Политика из репозитория (`migrations/05_profiles_rls.sql`)

- `profiles_select_authenticated` — `USING (auth.uid() IS NOT NULL)` для роли
  `authenticated`: при такой формулировке **любой** залогиненный пользователь
  теоретически может читать **все** строки `profiles` (если нет более узкой
  политики и политики объединяются через OR).

На продакшене схема может отличаться. Если SELECT разрешён только для «своей»
строки (`auth.uid() = id`), то `getUsers()` вернёт **одну** запись (текущего
пользователя), и в учительской не появятся абитуриенты.

## Что сделать на стороне БД (варианты)

1. Для пользователей с `profiles.role = 'admin'` добавить отдельную политику
   `SELECT` на все строки `profiles` (через `is_admin()` уже есть для UPDATE).
2. Либо выделить RPC/представление только для админов с списком абитуриентов.
3. Либо синк через service role на бэкенде (не из браузера).

Источник истины роли абитуриента в Саду: колонка **`public.profiles.role`**
(значение `applicant` и пустое/null после миграции
`22_profiles_default_applicant_role.sql`).
```

### Что нового даёт эта записка

1. **Подтверждена развилка, к которой мы и пришли.** Автор записки чётко формулирует: «`profiles_select_authenticated` = все видят всех; сузишь до своей — учительская сломается». Это та же самая дилемма, что мы выписали в v4 (открытый вопрос #3).
2. **Указана функция, которой нужны все профили: `syncPvlActorsFromGarden()`.** Ранее мы видели только `api.getUsers()` в `App.jsx`. Эта функция в `services/pvlMockApi.js:1045`, вызывается боевыми view'ами:
   - `views/PvlStudentTrackerView.jsx:528` — после монтирования трекера студента.
   - Внутри pvlMockApi: цепочки `syncTrackerAndHomeworkFromDb`, `syncPvlRuntimeFromDb` — это синк PVL state из боевой `profiles`.
3. **Источник истины для роли абитуриента — `profiles.role`.** Не `pvl_students.status`, не `users_auth.status`. Это важно: после RLS чистки роль не должна закрываться от записи самим пользователем (иначе `_ensureDefaultApplicantRoleInDb` в `dataService.js:1472` сломается).
4. **Записка ссылается на `migrations/05_profiles_rls.sql`** — то есть текущий комплект политик описан в репо как миграция. Стоит её прочитать перед написанием SQL: возможно, наш «новый набор» окажется тем же, что 05, плюс упомянутые админские добавки.
5. **Три варианта решения** в записке и есть наш план RLS:
   - вариант (1) — наш шаблон C для админа (`is_admin()` SELECT на всё);
   - вариант (2) — RPC/view, более тяжёлый рефакторинг;
   - вариант (3) — service-role на бекенде, потребует архитектурных изменений (нынешний `getUsers()` идёт из браузера).

### Использовать ли в плане RLS — да

- Принять **вариант 1** (admin SELECT через `is_admin()`) для `profiles` — он минимально инвазивный.
- Финальный SET политик SELECT на `profiles`:
  - `profiles_select_own` — `auth.uid() = id` (свой профиль всегда виден)
  - `profiles_select_admin` — `is_admin()` (админ видит всё)
  - **DROP** `profiles_select_authenticated` — слишком широкая, прямая утечка ПД для всех залогиненных.
- В сторону: для карты ведущих/учительской/PvlStudentTrackerView нужен какой-то «общественный список» — иначе студент не увидит других студентов своей когорты, не увидит ментора, и т. д. Нужен **четвёртый шаблон** (не в нашей пятёрке): `profiles_select_active_users` — `USING (status = 'active' AND role IN ('applicant','active','certified'))` или подобное. Это решение бизнес-уровня, нужно подтверждение владельца.

---

## Вывод для финального SQL

### Что добавить к ранее утверждённому плану

**Поверх 5 PVL-шаблонов (A–E) и чистки `profiles`-дублей** добавить отдельную задачу:

> **F. Сужение SELECT на `profiles`.**
> DROP `profiles_select_authenticated` (`auth.uid() IS NOT NULL` — слишком широкая).
> CREATE `profiles_select_own` (`auth.uid() = id`) и `profiles_select_admin` (`is_admin()`).
> Если бизнесу нужен «общественный список ведущих» (для карты, для учительской) — добавить ещё одну политику с явным предикатом видимости (например, по `status='active'`). Это решение нужно от владельца.

### Что проверить ДО финального SQL

1. **`migrations/05_profiles_rls.sql`** — какой комплект политик задокументирован в репо. Возможно, расхождение прод vs репо для `profiles` будет ещё одним сюрпризом.
2. **Поведение `syncPvlActorsFromGarden()` если `getUsers` вернёт только одну строку** — упадёт ли PvlStudentTrackerView, или есть graceful degradation. Нужно прочитать `views/PvlStudentTrackerView.jsx:179..188` и `services/pvlMockApi.js:1045..` (вне scope текущей сессии, но перед SQL).
3. **Решение владельца про «общественный список профилей»**: нужен ли он, и по каким полям/условиям.

### Что готово к написанию SQL

- 5 шаблонов RLS (A–E) — все предикаты определены, типы (UUID/TEXT) выписаны.
- Чистка `profiles` от 9 дублей (3 SELECT `qual=true`, 3 UPDATE по `auth.uid()=id`, 2 INSERT по `auth.uid()=id`, плюс 2 hardcoded-Olga) — точные имена в v3.
- Связь `pvl_students.id ↔ profiles.id` подтверждена для 22/23 (тестовая «Участница» 33333…01 — отдельным правилом «не трогать»).
- `users_auth` — отдельный режим (RLS без политик или REVOKE FROM web_anon, authenticated).
- `events_archive`, `to_archive` — RLS-on без политик.
- `messages` — 4 тестовые строки от 2026-03-17, безопасно ENABLE без политик.
- `push_subscriptions` — 0 строк, безопасно ENABLE без политик.
- `birthday_templates` — нужна простая SELECT-политика для всех залогиненных.

### Финальный gating — единственный остающийся блокер

**Решение владельца по «общественному списку profiles»** — без него `profiles` чистка либо ломает учительскую (узко), либо сохраняет утечку (широко). Все остальные блокеры из v1–v4 закрыты.
