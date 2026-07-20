# Канальные новости → платформа (по тегу #новость) — RECON + DIFF-ON-REVIEW

Дата: 2026-07-19 · Статус: **ждёт 🟢** (ничего не применено)
Решение Ольги: только по тегу `#новость`, БЕЗ картинок (текст), публикация сразу (без подтверждения).

---

## Часть 1. RECON (read-only, факты из кода + прод-БД)

### 1.1 Таблица `public.news` (проверено на проде, `\d` + выборки)

| колонка | тип | null | default |
|---|---|---|---|
| `id` | bigint | NO | auto (identity; INSERT без id работает — админка так и пишет) |
| `created_at` | timestamptz | NO | `now()` (utc) |
| `title` | text | NO | — |
| `body` | text | NO | — |
| `image_url` | text | YES | — |
| `author_id` | uuid | YES | — (FK→profiles, **ON DELETE SET NULL**) |
| `type` | text | YES | `'general'` |

- **`type`** — в проде у ВСЕХ 10 строк значение `'general'` (дефолт). **Фронт эту колонку не читает вообще**: `NewsView`, `UserApp.dashboardNews`, `StatsDashboardView` — все принудительно ставят строкам из БД `type: 'manual'` (или синтетический `'birthday'`). Значит DB-`type` — чисто внутренний провенанс, на UI не влияет. → **Для канальных ставлю `type='channel'`** (чтобы отличать источник в БД/аналитике; UI не затрагивается — проверено во всех трёх потребителях).
- **`author_id`** — у ВСЕХ существующих новостей `NULL` (админка автора не проставляет; FK = SET NULL, «публикация переживает автора»). → **Для канальных `author_id = NULL`** — полностью консистентно с ручными.
- **`image_url`** — у всех NULL. → канальные: `NULL`.
- **Колонки `timestamp` НЕТ.** А `NewsView`/`UserApp` читают `n.timestamp` → всегда падает в `Date.now()`. Т.е. дата в ленте у ВСЕХ новостей = момент рендера (предсуществующий баг отображения, **не наш scope**). Порядок ленты держится на `getNews()` → `order=created_at.desc` (стабильная сортировка при равных датах). Канальные с `created_at=now()` встанут сверху — как и ожидается.
- **Нет колонки под идемпотентность** (message_id негде хранить) → см. дизайн.

### 1.2 NewsView — рендер и создание

- Рендерит `news` (из БД) + синтетические «дни рождения». Тело — `formatNewsBody`: если есть HTML-теги → DOMPurify; иначе plain-текст, `\n → <br/>`. **Значит сырой текст поста с переносами строк отрендерится корректно.**
- **Создание из админки УЖЕ есть:** `AdminPanel` вкладка `news` → `onAddNews` → `api.addNews` → `POST /news`. Пишет только `{title, body, created_at}` (id стрипается, `type/author_id/image_url` не трогает → дефолты/NULL). Опциональный push по галочке «Отправить push-уведомление».

### 1.3 Поллер (`push-server/tgAccessJoinPoller.mjs`) — критично

- **Единственный потребитель `getUpdates`** во всём push-сервере (grep: только `tgAccessClient` (дефиниция) + этот поллер). **Второй long-poll заводить НЕЛЬЗЯ** — Telegram отдаст `409 Conflict` и сломает впуск. → расширяем ТОТ ЖЕ вызов, не плодим цикл.
- Сейчас: `getUpdates({ offset, timeout:30, allowed_updates:['chat_join_request'] })`, один общий `offset`, `offset = u.update_id+1` инкрементится в НАЧАЛЕ обработки каждого апдейта (до разбора типа) → добавление второго типа апдейтов не ломает подтверждение оффсета.
- Стартует только при `mode∈{admit,live}` (сейчас live). Весь мутирующий TG — только оттуда.
- **Предусловие:** бот получает `channel_post` только будучи админом канала. Бот аппрувит заявки в канал (`approveChatJoinRequest` для `TG_CHANNEL_ID`) → он админ канала → посты придут. (Стоит подтвердить операционно, но по факту доступа — да.)

---

## Часть 2. ДИЗАЙН

Пост в канале Лиги (`TG_CHANNEL_ID`) с `#новость` → строка в `public.news`:
`title` = первая непустая строка (тег вырезан), `body` = остальное, `image_url=NULL`, `type='channel'`, `author_id=NULL`, видна сразу.

**Идемпотентность:** новая колонка `news.tg_message_id bigint` + частичный уникальный индекс; вставка `ON CONFLICT DO NOTHING`. Повторная доставка того же поста (рестарт поллера обнуляет in-memory offset → Telegram передоставляет апдейты за ~сутки) дубль не создаёт.

**Тег `#новость` вырезаем** из текста (служебный, в новости торчать не должен).

**Только текстовые посты:** обрабатываем `channel_post.text`. Пост с фото (текст в `caption`) → `text` пуст → **пропуск целиком** (см. открытый вопрос A). `edited_channel_post` НЕ слушаем → правки не синкаются (by design).

---

## Часть 3. DIFF

### Файл 1 (новый): `migrations/2026-07-19_news_tg_channel_ingest.sql`

```sql
-- Канальные новости: идемпотентность впуска постов канала Лиги в public.news.
-- Храним Telegram message_id поста-источника; повторная обработка (рестарт
-- поллера / передоставка getUpdates) не плодит дубли.

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS tg_message_id bigint;

-- Частичный уникальный индекс: одна новость на один пост канала.
-- Только для канальных строк (tg_message_id IS NOT NULL); ручные админ-новости
-- (tg_message_id IS NULL) не затронуты — их может быть много с NULL.
CREATE UNIQUE INDEX IF NOT EXISTS news_tg_message_id_uidx
  ON public.news (tg_message_id)
  WHERE tg_message_id IS NOT NULL;

COMMENT ON COLUMN public.news.tg_message_id IS
  'Telegram message_id поста-источника из канала Лиги (type=channel). NULL у ручных новостей. Единственный ключ идемпотентности впуска (канал один — TG_CHANNEL_ID).';
```

### Файл 2: `push-server/tgAccessJoinPoller.mjs`

**(a) лог старта (стр. 53) — упомянуть channel_post:**
```diff
-  logger.info?.('[join-poller] старт (allowed_updates=chat_join_request)');
+  logger.info?.('[join-poller] старт (allowed_updates=chat_join_request,channel_post)');
```

**(b) allowed_updates (стр. 58) — расширить ТОТ ЖЕ вызов:**
```diff
-        const upd = await tg.getUpdates({ offset, timeout: 30, allowed_updates: ['chat_join_request'] });
+        const upd = await tg.getUpdates({ offset, timeout: 30, allowed_updates: ['chat_join_request', 'channel_post'] });
```

**(c) в цикле, сразу после `offset = u.update_id + 1;` (стр. 61) — ветка channel_post ДО разбора заявки. Join-request-логика ниже не меняется ни на байт:**
```diff
         for (const u of upd.result) {
           offset = u.update_id + 1;
+          // ── Канальный пост из канала Лиги с #новость → новость на платформе ──
+          // Изолировано в свой try/catch: сбой разбора поста НЕ должен мешать впуску заявок.
+          const post = u.channel_post;
+          if (post) {
+            try {
+              if (String(post.chat?.id) === String(TG_CHANNEL_ID)) {
+                const parsed = parseChannelNews(post.text); // только текстовые посты; фото/caption не переносим (v1)
+                if (parsed) {
+                  const newsId = await insertChannelNews(pool, { messageId: post.message_id, ...parsed });
+                  logger.info?.(newsId
+                    ? `[join-poller] news+ msg=${post.message_id} → news#${newsId} "${parsed.title.slice(0, 40)}"`
+                    : `[join-poller] news dup msg=${post.message_id} — пропуск (уже был)`);
+                }
+              }
+            } catch (e) {
+              logger.error?.('[join-poller] channel_post error', e?.message);
+            }
+            continue; // channel_post — не заявка, дальше не идём
+          }
           const req = u.chat_join_request;
           if (!req) continue;
```

**(d) новые хелперы (рядом с `backfillUid`, до `startJoinPoller`):**
```js
// Тег-триггер. Unicode-aware: НЕ ловим #новостью/#новости — только ровно #новость.
const NEWS_TAG_RE = /#новость(?![\p{L}\p{N}_])/iu;

// Текст поста канала с #новость → { title, body }. Тег вырезаем (служебный).
// title = первая непустая строка остатка, body = остальное. Картинки не переносим.
function parseChannelNews(text) {
  const raw = String(text || '');
  if (!NEWS_TAG_RE.test(raw)) return null;                 // нет тега → не новость
  const stripped = raw.replace(NEWS_TAG_RE, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!stripped) return null;                              // пост состоял только из тега
  const lines = stripped.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;        // пропустить пустые строки до заголовка
  const title = (lines[i] || '').trim();
  if (!title) return null;
  const body = lines.slice(i + 1).join('\n').trim();       // может быть пустым (пост в одну строку)
  return { title, body };
}

// Идемпотентная запись канальной новости. ON CONFLICT по частичному uidx (см. миграцию).
// Вернёт id новой строки либо null, если такой message_id уже был (дубль).
async function insertChannelNews(pool, { messageId, title, body }) {
  const r = await pool.query(
    `insert into public.news (title, body, type, tg_message_id, image_url, author_id)
     values ($1, $2, 'channel', $3, null, null)
     on conflict (tg_message_id) where tg_message_id is not null do nothing
     returning id`,
    [title, body || '', messageId]
  );
  return r.rows[0]?.id || null;
}
```

`TG_CHANNEL_ID` уже импортирован (стр. 8). Больше файлов не трогаем — фронт (NewsView/UserApp/StatsDashboard) уже рендерит любые строки `news` и `type='channel'` игнорирует.

---

## Часть 4. Ограничения v1 (задокументировать)

1. **Правки поста в канале НЕ синхронизируются** — `edited_channel_post` не слушаем. Отредактировал пост → новость на платформе осталась старой.
2. **Удаление поста в канале не удаляет новость** — Telegram событий об удалении постов ботам не шлёт в принципе.
3. **Картинки/медиа не переносим.** Обрабатываем только `post.text`. Пост фото+подпись `#новость` **пропускается целиком** (даже текст подписи). `image_url` всегда NULL.
4. **Форматирование Telegram** (bold/курсив/ссылки-entities) в HTML не переносится — только сырой текст с переносами (`NewsView` сам делает `\n → <br>`).
5. **Один канал** (`TG_CHANNEL_ID`). Идемпотентность по `message_id` завязана на единственность источника.
6. **«Сразу»** = появляется в ленте при следующей загрузке/refresh приложения (realtime-ленты нет — как и у ручных новостей).
7. **Бэклог при рестарте:** Telegram может передоставить посты за ~сутки; `#новость` среди них создаст новость. Дубли отсекаются идемпотентностью, но исторический пост с тегом может «всплыть».

---

## Часть 5. Открытые вопросы (мои дефолты — жду подтверждения)

- **A. Медиа-пост с `#новость` в подписи.** Дефолт v1: **пропускаем целиком** (строго «текст»). Альтернатива: брать текст подписи (`post.caption`), `image_url` всё равно NULL. → оставляю пропуск?
- **B. Push-уведомление на канальную новость.** Дефолт v1: **нет** (новость просто появляется в ленте). Ручные новости шлют push по галочке; канальные — молча. Включить легко (в процессе переиспользовать broadcast из `/push/news`). → без push?
- **C. `type='channel'`.** Завожу для провенанса (UI не влияет, проверено). Если хочешь — оставлю `'general'` как у ручных. → 'channel' ок?

**Применяю (миграция на прод + правку поллера + рестарт push-сервера) только после 🟢.**
Рестарт поллера обнулит offset — на старте возможна разовая передоставка заявок/постов за сутки (заявки идемпотентны по dedup_key, посты — по message_id).
