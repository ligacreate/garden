# Канальные новости → платформа — APPLY REPORT

Дата: 2026-07-20 · Статус: **применено на прод** (git commit/push — жду отмашку)
Решения Ольги: A=брать текст подписи, B=без пуша, C=`type='channel'`.
Диф-на-ревью: [2026-07-19_codeexec_channel_news_ingest_diff.md](2026-07-19_codeexec_channel_news_ingest_diff.md)

## Что сделано

1. **Миграция** `migrations/2026-07-19_news_tg_channel_ingest.sql` — применена на прод-БД:
   - `ALTER TABLE public.news ADD COLUMN tg_message_id bigint` → `ALTER TABLE` ✓
   - `CREATE UNIQUE INDEX news_tg_message_id_uidx … WHERE tg_message_id IS NOT NULL` → `CREATE INDEX` ✓
   - `COMMENT ON COLUMN` ✓
2. **Поллер** `push-server/tgAccessJoinPoller.mjs`:
   - `allowed_updates: ['chat_join_request', 'channel_post']` (тот же единственный getUpdates-цикл, второй long-poll не заводили).
   - Ветка `channel_post` в **отдельном try/catch** до разбора заявки; **join-request-логика не изменена ни на байт**.
   - Гвард `post.chat.id === TG_CHANNEL_ID`; текст = `post.text || post.caption` (A: подпись медиа берём, картинку — нет); тег `#новость` вырезается; title = первая строка, body = остальное.
   - Хелперы `parseChannelNews` / `insertChannelNews` (INSERT `type='channel'`, `author_id=null`, `image_url=null`, `ON CONFLICT (tg_message_id) DO NOTHING`).
   - Rsync на `/opt/push-server/` (передан 1 файл) → `systemctl restart push-server.service`.

## Verify

- **Парсер** — 13/13 кейсов зелёные, включая ложноположительные `#новостью`/`#новости` → `null`, «только тег» → `null`, подпись медиа, регистр `#Новость`, пустые строки до заголовка.
- **Идемпотентность (прод, в BEGIN…ROLLBACK)** — два INSERT одного `message_id`: 1-й → `id`, 2-й → `INSERT 0 0`, итог `count=1`. Роллбэк → 0 тестовых строк осталось.
- **Схема (прод)** — колонка `tg_message_id bigint NULL` ✓; индекс `news_tg_message_id_uidx` partial unique ✓.
- **Сервис** — `node --check` OK; после рестарта `ActiveState=active, SubState=running, NRestarts=0`; лог старта `[join-poller] старт (allowed_updates=chat_join_request,channel_post)`; `tg-access[live,autokick]`; внешний `GET /health` → `200`. Ошибок в channel_post-пути после рестарта нет.
- **Впуск не сломан** — код одобрения заявок не тронут; поллер жив, крашей нет.

## Не сделано (осознанно)

- **git commit/push** — Ольга перечислила только «миграция + поллер + рестарт». Прод сейчас крутит рабочее дерево, ещё не закоммиченное. Файлы к коммиту: `migrations/2026-07-19_news_tg_channel_ingest.sql`, `push-server/tgAccessJoinPoller.mjs`, два `docs/_session/*`. → жду «коммить».
- **Живой end-to-end пост** — не гонял: пост в канал виден всем участникам. Нужен реальный `#новость`-пост (см. ниже).

## Как проверить вживую (безопасно)

Кинь в канал Лиги короткий пост, например:
```
#новость Тест интеграции
проверяем, что залетает на платформу
```
Появится новость на платформе (при следующей загрузке приложения). Лог: `[join-poller] news+ msg=… → news#…`. Повторная доставка того же поста → `news dup … пропуск`. Тестовую новость потом удали в админке (вкладка «Новости»); пост в канале — как хочешь (правка/удаление поста на платформу не влияют, см. ограничения v1).

## Ограничения v1 (в силе)

Правки/удаления поста в канале **не** синкаются; медиа-картинки не переносим (текст подписи — да); TG-форматирование → сырой текст; один канал (`TG_CHANNEL_ID`); «сразу» = при загрузке приложения; при рестарте возможна разовая передоставка постов за ~сутки (дубли отсекает `message_id`).

Примечание: web-push на push-server сейчас `push=off` — так что B (без пуша) совпадает и с фактическим состоянием сервера.
