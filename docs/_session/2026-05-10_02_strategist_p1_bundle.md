---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-10
тема: P1-связка — MON-001 (frontend error reporter) + INFRA-005 (SW recon)
ответ на: docs/_session/2026-05-10_01_codeexec_session_report.md
---

# P1-связка: MON-001 первым, INFRA-005 — recon после

Привет. Хороший отчёт — спасибо за честную хронологию 8 фиксов
FEAT-016. Закрываю сначала твои открытые вопросы, потом
формулирую план на сегодня.

---

## 1. Ответы на твои 3 вопроса

### 1.1 Критерий «в ритме» в `pvl_admin_progress_summary`

**Ответ: ждём фидбэк менторов.**

Без понимания, как менторы работают с гугл-доками (приём задним
числом, ссылка-комментарий, отдельный submission), формула «прошло
N недель → должно быть N принятых» всё равно будет неполной.
Сейчас не трогаем `state_line`. Когда фидбэк придёт — соберём
полное ТЗ FEAT-PVL-RHYTHM-CRITERION в отдельный заход.

### 1.2 Серверная видимость пользователей в саду (`is_hidden_in_garden`)

**Ответ: после P1 + FEAT-015 Prodamus, не сейчас.**

`localStorage` костыль работает у Ольги одной — это раздражает,
но не блокирует прод. Ольга предпочла последовательность:

1. P1: MON-001 + INFRA-005 (это сообщение).
2. FEAT-015 Prodamus auto-pause (план в `_session/2026-05-09_00_PLAN_handover.md`).
3. Серверная видимость + бонус «удалить из курса» — отдельным заходом.

Заведи запись в backlog как **FEAT-USER-VISIBILITY-SERVER**
(P1, ETA после Prodamus).

### 1.3 Slow PostgREST (176-192 сек на read-heavy admin-запросы)

**Ответ: отдельный тикет, лечим точечно по факту.**

Заведи **PERF-001-ADMIN-API** (P2) с краткой фиксацией наблюдений
из твоего отчёта (раздел 3.1):
- `pvl_content_items` 176с
- `pvl_student_homework_submissions` per-student 192с
- `knowledge_base` 43с

Гипотеза: тяжёлые RLS-политики + jsonb без индексов. Не лечим
оптом — каждая read-heavy админ-фича пусть получает свой
RPC-агрегатор (как `pvl_admin_progress_summary` для phase 25).
В backlog зафиксируй гипотезу — для будущей сессии профайлинга
когда станет блокером.

### 1.4 Уроки в `docs/lessons/`

**Все три темы согласованы, пиши.**

- `2026-05-10-vite-immutable-cache-trap.md` — про hash collision
  и `Cache-Control: immutable`. **Особенно важный** урок, потому
  что эта ловушка убила час дебага и могла убить намного больше.
- `2026-05-10-batch-fetch-for-admin-views.md` — про N
  последовательных await-запросов; для админ-bulk сразу
  `in.(...)`.
- `2026-05-10-denormalized-fk-fallback-chain.md` — про порядок
  фолбэков от наиболее достоверного источника данных.

**Когда писать:** отдельным коммитом **после** P1-связки,
не смешивать с MON-001/INFRA-005.

---

## 2. Задача дня — P1: MON-001 + INFRA-005

### 2.1 Почему MON-001 раньше INFRA-005 (важно)

Текущий `public/sw.js` уже выглядит корректно: `skipWaiting`,
`caches.delete` всех ключей на `activate`, `clients.claim`,
network-first для `navigate`. Перехвата bundle-запросов нет.

Гипотеза, что Маринин ChunkLoadError = SW-проблема, **не
проверена**. Возможно реальная причина — тот же Vite
hash-collision из бага 3 FEAT-016 (immutable cache), а SW тут
ни при чём. Или у Марины зомби-версия `sw.js` из дальнего
прошлого, которая агрессивно кэшировала. Без stack-trace и
bundle-hash от живой жертвы — лечим вслепую.

**Поэтому:**
- MON-001 — **основная работа** (запиливаем end-to-end).
- INFRA-005 — **только recon + минимальное hardening**, если
  recon найдёт конкретную причину. Если не найдёт — оставляем
  текущий `sw.js` как есть и ждём первого MON-001-инцидента.

Принцип «один раз, не возвращаться»: лучше один раз сделать
правильный мониторинг, чем три раза переписывать SW по
гипотезам.

### 2.2 MON-001 — план

**Цель:** клиентские ошибки (JS exceptions, ChunkLoadError,
unhandled rejections, ErrorBoundary catches) попадают в
`@garden_grants_monitor_bot`.

**Архитектура:**

```
Browser (garden frontend)
  └─ window.onerror / onunhandledrejection / ErrorBoundary
        └─ POST https://auth.skrebeyko.ru/api/client-error
              └─ rate-limit (per IP+message hash)
                    └─ curl https://api.telegram.org/bot.../sendMessage
                          └─ TG-канал @garden_grants_monitor_bot
```

**Frontend (`main.jsx` + `components/ErrorBoundary.jsx`):**

1. Создать `utils/clientErrorReporter.js`:
   - `reportClientError({ message, stack, source, url, userAgent, userId?, bundleHash? })`.
   - POST на `${AUTH_BASE_URL}/api/client-error` с JSON.
   - **Защита от шторма:** локальный rate-limit — не отправлять
     один и тот же `message+stack`-hash чаще раза в 60 секунд
     (через `sessionStorage`). Сервер тоже рейт-лимитит, но это
     не повод бомбить.
   - Catch + console.warn если репорт-эндпоинт недоступен (не
     рекурсивно репортить ошибку репортера).

2. В `main.jsx` повесить:
   - `window.addEventListener('error', e => reportClientError({...}))`.
   - `window.addEventListener('unhandledrejection', e => reportClientError({...}))`.
   - Сделать **ДО** `createRoot.render`, чтобы поймать ошибки
     самого React init.

3. В `ErrorBoundary.componentDidCatch` добавить вызов
   `reportClientError({ source: 'ErrorBoundary', ... })`.

4. **Bundle hash в payload:** прокинуть `import.meta.env`
   или хардкодить через `__VITE_BUNDLE_ID__` в `vite.config.js`
   (если уже есть переменная — переиспользуй; если нет —
   `define: { __BUILD_ID__: JSON.stringify(Date.now()) }` в
   build, далее читать в reporter). Без этого MON-001 не даст
   нам различать «новая ли ошибка после деплоя или зомби».

5. **User identification:** если `JWT` есть — добавить
   `userId` (sub claim) и `userEmail` в payload. Если нет —
   только `userAgent + ip` (ip определит сервер).

**Backend (`/opt/garden-auth/server.js`):**

1. Новый POST endpoint `/api/client-error`:
   - Парсит JSON body (валидация: message обязателен, остальные
     опциональны).
   - Rate-limit: in-memory Map<`ip+messageHash`, lastSentTs>.
     Окно 60 сек, потолок 50 уникальных ошибок/час
     (защита от выкручивания TG-API).
   - Формирует TG-сообщение в Markdown:
     ```
     🚨 *Garden client error*
     `message`
     user: olga@... (uid)
     ua: Mozilla/...
     bundle: index-T_WhJoLY.js
     url: /pvl/...
     stack:
     ```first 1000 chars```
     ```
   - `curl POST` на `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
     с `chat_id=${TELEGRAM_CHAT_ID}`. Те же креды, что в
     check_grants.sh — переиспользуем.
   - Ответ клиенту: всегда `204 No Content` (даже если TG
     упал — клиенту знать незачем).
   - **Лог в файл** `/var/log/garden-client-errors.log`
     (JSON-line формат) — на случай если TG зальётся, останется
     audit-trail.

2. **CORS:** убедиться что `liga.skrebeyko.ru` в списке
   разрешённых origin'ов для нового endpoint'а (там уже
   должен быть для других routes, но проверь).

3. **Healthcheck для деплоя:** добавить GET `/api/health` (если
   ещё нет) — возвращает `{ ok: true, version: "...", time: "..." }`.
   Понадобится для пункта 2.4.

### 2.3 INFRA-005 — recon + опциональное hardening

**Чек-лист recon (15-20 минут):**

1. **Зафиксируй текущий sw.js.** Скриншот / cat в отчёт. Что
   делает на install/activate/fetch.

2. **Проверь диагностически на проде:**
   - В DevTools Application → Service Workers — есть ли
     waiting / redundant.
   - Какая версия sw.js активна (по `cache.match` или
     `clients.claim` поведению).
   - В Network — делает ли SW что-то с bundle-запросами
     (`assets/index-*.js`).

3. **Проверь, не было ли в истории `git log -- public/sw.js`
   агрессивной версии**, которая кэшировала bundles. Если
   была — это объясняет зомби у Марины. Если не было — гипотеза
   «старый зомби-SW» отпадает.

4. **Опциональное hardening** (только если нашёл проблему):
   - Версионировать sw.js: `register('/sw.js?v=2026-05-10')`
     в `main.jsx` — заставит браузер перекачать sw.js
     при изменении query.
   - ИЛИ kill-switch: в `main.jsx` перед register'ом —
     `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`,
     один раз. **Это ядерный вариант, применяем только если
     recon нашёл зомби-SW.**

5. **Если recon ничего не нашёл** — закрываем INFRA-005 как
   «текущий sw.js корректен, ждём первого MON-001-инцидента
   для предметного фикса». Зафиксируй это решение в отчёте,
   чтобы через месяц не возвращались.

### 2.4 Post-deploy healthcheck (бонус, ~10 минут)

GitHub Actions workflow для FTP-деплоя — добавь после `lftp`
шаг:

```yaml
- name: Smoke check after deploy
  run: |
    sleep 5
    curl -fsS https://liga.skrebeyko.ru/ -o /tmp/index.html
    grep -q "<title>Сад ведущих" /tmp/index.html
    BUNDLE=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' /tmp/index.html | head -1)
    curl -fsS "https://liga.skrebeyko.ru/$BUNDLE" -o /dev/null
    curl -fsS https://auth.skrebeyko.ru/api/health -o /dev/null
    echo "Deploy smoke OK: $BUNDLE"
```

Если это «не бесплатно» по твоей оценке (например workflow
устроен сложно или у нас не github actions, а другой CI) —
напиши в отчёте, обсудим отдельно.

---

## 3. Workflow на этот заход

1. **Apply MON-001** (frontend + backend) — локальное preview
   через Vite dev server, проверь что reporter ловит тестовую
   ошибку (брось `throw new Error('test')` в console после
   load) и попадает на endpoint (можешь временно подменить
   target на `http://localhost:3000/api/client-error` или
   читать в логах `auth.skrebeyko.ru`).

2. **Recon INFRA-005** — отчёт в этом же документе (раздел
   «Recon INFRA-005»).

3. **Опционально hardening sw.js** — если recon нашёл
   причину.

4. **Post-deploy healthcheck** — добавить в workflow.

5. **Коммиты:**
   - `feat(monitoring): client-side error reporter (MON-001)` —
     frontend.
   - `feat(garden-auth): /api/client-error endpoint` — backend
     (+ deploy на сервер через ssh).
   - `chore(ci): post-deploy smoke check` — workflow.
   - **Если** делал hardening: `fix(sw): <конкретный фикс>
     (INFRA-005)`.

6. **🟢 PUSH** — **жди от меня отдельным словом**, не пушь
   автоматически после commit'а.

7. **Отчёт** в `_session/2026-05-10_03_codeexec_p1_apply_report.md`:
   - Что закоммичено (commits + файлы).
   - Recon INFRA-005 (выводы + что-то нашлось / не нашлось).
   - Test plan: как проверить MON-001 на проде после push.
   - Открытые вопросы, если есть.

8. **После моего 🟢 PUSH:**
   - Push всех коммитов.
   - **Smoke на проде:** через `Claude in Chrome` (Ольга
     запустит) — открыть liga.skrebeyko.ru, в DevTools console
     вызвать `throw new Error('MON-001 smoke ' + Date.now())`,
     проверить что прилетело в TG.
   - Финальный коммит `_04_codeexec_p1_smoke_done.md` с
     подтверждением.

9. **Lessons (3 шт)** — отдельным заходом, после P1. Не
   смешивай с этим коммит-блоком.

---

## 4. Что не делаешь в этом заходе

- НЕ трогаешь Prodamus (FEAT-015) — следующая большая работа.
- НЕ трогаешь TG-бота для менторов (FEAT-N) — отдельный заход.
- НЕ трогаешь `is_hidden_in_garden` — после Prodamus.
- НЕ пишешь lessons в этом коммит-блоке — отдельным заходом.
- НЕ делаешь bundle-optimization — после
  `is_hidden_in_garden`.

---

## 5. Открытые вопросы ко мне (если что-то непонятно — пиши до apply)

- TG-формат сообщения — устраивает или хочешь другой?
- Rate-limit пороги (60 сек на ошибку, 50/час на IP) —
  адекватно для нашего масштаба или урежем?
- `bundle hash` в payload — есть ли уже переменная или
  заводить через `define`?
- Healthcheck workflow — у нас github actions или другой
  CI? (если ты в курсе, я не уточняла).

---

Жду отчёт. После него — Ольгино 🟢 PUSH.
