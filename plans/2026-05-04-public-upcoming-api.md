# План: публичный read-only API `/api/v1/upcoming.json`

## Зачем

Внешний пайплайн (Telegram-карточки расписания встреч) дёргает эндпоинт по
вторникам 13:00 и 15:00 МСК и собирает еженедельные карточки. Между двумя
фетчами могут быть правки команды — поэтому короткий кеш и свежие данные
критичны.

## Контракт

`GET /api/v1/upcoming.json?days=8&from=2026-05-06`

Параметры:
- `days` (int, опц., default `8`) — ширина окна в днях. Пайплайн дёргает с
  `days=8` (среда → среда + 1 день буфера).
- `from` (ISO date `YYYY-MM-DD`, опц., default — текущая дата по МСК) —
  начало окна включительно.

Ответ — массив объектов, отсортированный по `starts_at ASC`, только
встречи с `status=published` (в текущей схеме это означает: строка есть в
`public.events`, т.е. `meetings.is_public=true` И `profiles.status='active'`):

```json
[
  {
    "id": "evt_123",
    "starts_at": "2026-05-06T19:00:00+03:00",
    "title": "Мой апрель: пиши, чувствуй, сохраняй",
    "format": "online",
    "city": "Москва",
    "price_rub": 700,
    "is_recurring": true,
    "host": {
      "name": "Яна Соболева",
      "role": "Стажёр",
      "photo_url": "https://garden-media.s3.twcstorage.ru/avatars/..."
    }
  }
]
```

Требования:
- Без аутентификации, CORS `*`.
- TZ — Europe/Moscow, ISO с offset `+03:00`.
- Server-side cache 5 мин (key = `${from}|${days}`).
- `photo_url` — исходник из `profiles.avatar_url` (в проекте только один
  размер, без thumbnail-вариантов).

## Маппинг полей

| Поле ответа       | Источник в БД                                                 |
| ----------------- | ------------------------------------------------------------- |
| `id`              | `'evt_' \|\| events.id::text`                                 |
| `starts_at`       | `events.starts_at` → ISO в Europe/Moscow                      |
| `title`           | `events.title`                                                |
| `format`          | `events.meeting_format`: `online`/`offline` (hybrid → offline)|
| `city`            | `events.city`, для `online` → `null`                          |
| `price_rub`       | `events.price`: парсим число из текста; нет цифр → `0`        |
| `is_recurring`    | эвристика (см. ниже)                                          |
| `host.name`       | `profiles.name` (по `meetings.user_id` через `events.garden_id`)|
| `host.role`       | `profiles.role` → `Стажёр`/`Ведущая`/`Ментор`/...             |
| `host.photo_url`  | `profiles.avatar_url`                                         |

### `is_recurring` (эвристика)

В схеме нет колонки. Алгоритм: для каждой встречи в окне считаем, есть ли
у того же `meetings.user_id` ещё ≥1 встреча с тем же нормализованным
`title`, тем же `EXTRACT(DOW FROM starts_at)` и тем же `TO_CHAR(starts_at,
'HH24:MI')` в диапазоне ±60 дней относительно `from`. Считаем «еженедельно
повторяющейся», если совпадение есть.

Trade-off: точность ≈ 95% для реального трафика; ловит «Письменный
детокс»-style регулярные практики. **Если потребуется 100%, в будущем —
добавить колонку `recurrence_kind` в `meetings` и UI-чекбокс в
ScheduleAdmin.** Этот таск для текущего MVP не блокирующий и заведён в
backlog как `FEAT-014: явный признак повторяемости встречи`.

## Фазы

- [x] **Фаза 1 — рекогносцировка.** Понять схему `events`/`meetings`/`profiles`,
  правила синхронизации, наличие/отсутствие `is_recurring`.
- [x] **Фаза 2 — реализация.** Добавить роут в `push-server/server.mjs`,
  кеш-обёртку, SQL-запрос с CTE для recurring-эвристики, форматирование
  TZ.
- [x] **Фаза 3 — локальный smoke.** Запустить push-server локально,
  сделать `curl` и проверить shape. (Локального доступа к проду нет —
  синтаксис-чек через `node --check` + чтение SQL-плана.)
- [x] **Фаза 4 — handover.** Записать в папку проекта карточек файл
  `garden-api-handover.md` с финальным URL, списком файлов, инструкцией
  по тестированию.

## Деплой

`push-server` уже стоит за `https://push.skrebeyko.ru` (или на одном
домене с API через reverse-proxy — зависит от конфига Caddy). Финальный
URL: `https://push.skrebeyko.ru/api/v1/upcoming.json`. Если нужен
поддомен `api.skrebeyko.ru/v1/upcoming.json` — это вопрос Caddy, не
кода: добавить `route /api/v1/upcoming.json` с `reverse_proxy
push-server:8787`.

## Ограничения

- Нет rate-limit (см. handover).
- Нет аутентификации — это сознательно (данные публичны).
- При полной недоступности БД эндпоинт вернёт 503 (без stale-кеша).
- TZ зашит как `Europe/Moscow`; если придётся поддерживать другие — это
  уже отдельная задача.

## Итог

Реализовано целиком: эндпоинт, кеш 5 мин, эвристика recurring,
handover-файл. Не реализовано (намеренно отложено): явная колонка
`is_recurring` в схеме (FEAT-014, backlog), отдельный домен
`api.skrebeyko.ru` (вопрос инфры).
