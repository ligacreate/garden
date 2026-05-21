# BUG-PVL-SLOW-MATERIALS-LOAD — recon бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20 ~22:15 МСК
**Тип:** Read-only recon, БЕЗ apply/commit/push
**Зелёный:** Ольга 🟢

---

## Контекст

Админ ПВЛ-курса (Настя / Ирина / Ольга) жалуется в TG (вчерашний
скриншот в `_82..89` контексте + сегодняшнее уточнение):

> «Платформа "сад" как-то долго прогружается, мне приходится много
> раз обновлять, чтобы появились материалы курса»

**Свежий контекст от Ольги 2026-05-20 22:15 МСК:**

> «В этот момент площадку открывает админ. Насколько я поняла, из
> наших прошлых разговоров у админа нет доступа к урокам, такого же,
> как у студентов.»

**Это меняет фокус recon.** Возможно «долго грузит» — это **симптом**
двух разных причин:
1. **Performance** (slow batch-fetch / retry на 4xx / race condition)
2. **Product gap** — у админа нет proper preview-as-student режима, и
   она делает workaround через множественные обновления, который
   выглядит как «долго грузит»

Recon должен покрыть **обе** гипотезы.

**Real-time бонус:** админ открывает прямо сейчас → у тебя live data в
garden-auth journalctl + Caddy access log + БД query log за последние
5-10 минут. Это **точный** observability источник, лучше чем static
анализ.

---

## Что найти

### 1. Static анализ — какой view админ открывает для курса

Найди:
- `views/AdminPanel.jsx` (или похожий) — какие табы есть?
- `views/AdminPvl*.jsx` — есть ли admin-specific тaб для курса /
  материалов / уроков?
- В роутере (`App.jsx`) — какие admin-only routes есть?

Конкретно интересует:
- Когда админ нажимает «открыть курс» / «материалы» / «уроки» — куда
  попадает (какой компонент рендерится)?
- Этот компонент **отличается** от студенческого view (PvlPrototypeApp,
  PvlLesson*, etc) — да/нет, в чём отличие?
- Какие API-fetch'и происходят при mount этого view?

### 2. Static анализ — batch-fetch flow при init/open

Найди:
- `App.jsx` init() секцию — какие batch-fetch'и при load (`ensurePvlStudentInDb`,
  cohort fetch, lessons fetch, etc)
- `services/dataService.js` — есть ли retry-логика, exponential backoff,
  parallel vs sequential
- Существуют ли «свои» admin-fetch'и (например `AdminPvlProgress` —
  RPC `pvl_admin_progress_summary`), и сколько они занимают

Связь с `ARCH-003` (Graceful degradation в App.jsx init — есть в P3
backlog) — этот recon его уточняет.

### 3. Live telemetry — что реально шлёт фронт сейчас

**Это самая ценная часть.** Админ открывает прямо сейчас:

```bash
# garden-auth requests за последние 10 мин (auth flow)
ssh root@5.129.251.56 'journalctl -u garden-auth --since "10 min ago" | tail -100'
```

```bash
# Caddy access log — все API-запросы за 10 мин
ssh root@5.129.251.56 'tail -300 /var/log/caddy/access.log | grep -E "$(date -u +%Y-%m-%dT%H:%M | sed s/[0-9]$//)"'
```
(adjust grep по реальному формату времени в логе — если он не ISO-8601,
просто tail -500 за последние минуты)

Что искать:
- **Многократные** GET одних и тех же endpoint'ов (retry-loop)
- **4xx** responses (что-то не нашлось / нет permissions для админа)
- **Slow** queries — duration в логе если есть
- **Sequential vs parallel** pattern — батчируются ли запросы или
  идут один-за-другим

### 4. БД — есть ли что-то медленное для админ-роли

Через psql под `gen_user`:

```sql
-- Текущие запросы (если pg_stat_activity доступен)
SELECT pid, query_start, state,
       substring(query, 1, 100) AS query_preview
  FROM pg_stat_activity
 WHERE state != 'idle'
   AND query NOT LIKE '%pg_stat_activity%'
 ORDER BY query_start DESC LIMIT 10;

-- Slow queries за последний час (если log_min_duration_statement
-- настроен и журнал доступен)
-- ssh root@5.129.251.56 'tail -200 /var/log/postgresql/*.log | grep -i "duration"'
```

### 5. Product gap — есть ли preview-as-student для админа

Найди:
- В коде упоминания `preview` / `as_student` / `impersonate` /
  `view_as` / `admin_preview`
- В роутере — есть ли что-то вроде `/admin/preview/lesson/X`?
- В одном из admin tabs — кнопка «Посмотреть как студент» / «Preview»?

Если **нет** — это **product gap** который вынуждает админа делать
workaround. Отдельный тикет «FEAT-ADMIN-PREVIEW-AS-STUDENT» (P3).

### 6. Кэш / caching — что **должно** быть кэшировано но не

- Уроки, материалы, библиотека — типично read-heavy + редко меняются
- Есть ли in-memory cache на фронте (например React Query / SWR /
  собственный store)?
- Если каждый mount компонента делает свежий fetch — это **причина**
  медленной загрузки

---

## Формат отчёта

Файл: `docs/_session/2026-05-20_98_codeexec_pvl_slow_load_recon.md`

Структура (~80-120 строк):

1. **Какой view админ открывает** (компонент + route)
2. **Batch-fetch flow** при init/open (список fetch'ей в порядке, с
   line refs)
3. **Live telemetry** за 10 мин (анонимизированные результаты — не
   полный access log, только relevant паттерны):
   - Сколько requests
   - Каких endpoints
   - 4xx/5xx counts
   - Repeat patterns (retry loop?)
4. **БД findings** (если есть pg_stat snapshot)
5. **Cache state** — что cache'ируется, что нет
6. **Product gap analysis** — есть ли preview-as-student
7. **Гипотезы** (ранжированные по вероятности):
   - (a) Sequential batch fetch без parallelisation
   - (b) Retry loop на 4xx для admin-specific endpoint
   - (c) Нет preview-as-student → workaround через обновления
   - (d) Cache miss / нет cache в принципе
   - (e) Какая-то slow DB query
8. **Effort estimate для fix'a** — single-line, 30 мин, 2 часа?
9. **Open questions** для стратега (если нужны продуктовые решения)

---

## Что НЕ делать

- ❌ Не править ничего — только recon
- ❌ Не публиковать полные логи в отчёте — только relevant excerpts
  (PII / JWT могут быть в URL'ах)
- ❌ Не дёргать API endpoint'ы сам (чтобы не засорить telemetry —
  админ сейчас тестирует)
- ❌ Не делать UPDATE / DELETE в БД
- ❌ Не отправлять тестовые fetch'и от своего имени

---

## Timeline

~20-25 минут: live telemetry первое (пока админ открыта), потом static
анализ кода, потом отчёт.

---

## После recon

Стратег пишет fix-бриф `_99` (если гипотеза однозначна) или
дискуссионный документ Ольге (если нужно продуктовое решение типа
«добавляем preview-as-student»). **Не сегодня вечером** — recon вечером
ок, fix утром свежим темпом.
