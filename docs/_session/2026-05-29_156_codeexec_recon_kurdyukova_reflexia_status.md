# Track E — recon неверного статуса «Рефлексия по модулю» у Курдюковой

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Жалоба:** Курдюкова видит в UI задание «Рефлексия по модулю» в разделе «Подготовка к сертификационному завтраку» со статусом «Принято». Утверждает что НЕ писала это задание.
**Курдюкова id:** `5aa62776-6229-4270-9886-33316ff035c6`, когорта 1 `…101`.
**Режим:** read-only. psql под `gen_user`, JWT-impersonation через `SET LOCAL ROLE authenticated`. Все запросы в `BEGIN; … ROLLBACK;`.

---

## TL;DR — Вердикт **(a) с двумя уточнениями**

**В БД действительно `status='accepted'` — frontend показывает правду** в строгом смысле. НО:

1. **Курдюкова НЕ уникальна** — 13 из 29 menti когорты 1 имеют ту же submission на этот item, **все со status=accepted, все с пустым `payload.versions[0].content` (length 0).** Это **массовый паттерн**, не индивидуальная аномалия.
2. **В БД ДВА item'а с title «Рефлексия по модулю» — один создан 2026-05-01 (где её submission), второй создан СЕГОДНЯ в 15:22:52 МСК (0 submissions у кого-либо).** Если frontend на UI matches submissions к items **по title** (а не по homework_item_id) — Курдюкова видит «Принято» на новой пустой item-карточке. Это была бы **frontend-bug**, не data-issue.

**Чтобы развести (a)-pure и frontend-by-title:** Ольга-связной просит Курдюкову прислать скриншот её UI-раздела «Подготовка к сертификационному завтраку». Если там **одна** карточка «Рефлексия по модулю» — это сценарий (b)-frontend-by-title. Если **две** (одна Принято, одна пусто) — это (a)-pure.

---

## Раздел 1. «Рефлексия по модулю» в schema

### 1.1. Items по title

```sql
SELECT id, title, item_type, module_number, is_module_feedback,
       is_control_point, external_key, created_at
FROM pvl_homework_items
WHERE title ILIKE '%рефлекс%' OR title ILIKE '%модул%'
   OR is_module_feedback IS TRUE
ORDER BY created_at;
```

**Найдено 8 items.** Релевантны три:

| id | title | module_number | is_module_feedback | external_key | created_at |
|---|---|---|---|---|---|
| `af4d0eb1-…` | Рефлексия по модулю 1 | 1 | **t** | `task-4` | 2026-04-16 19:47:44 |
| `2138eb7f-…` | **Рефлексия по модулю** | NULL | **t** | `task-ci-a1bb1513-…` | 2026-05-01 19:09:35 |
| `de64aa54-…` | **Рефлексия по модулю** | NULL | **f** | `task-ci-5067b49b-…` | **2026-05-29 15:22:52** ⚡ |

- `task-4` — Этап 1, легаси (раздел «Курс» / модуль 1), уникальное название с номером модуля.
- `task-ci-*` (CI = Certification Item) — Этап 2 «Подготовка к сертификационному завтраку», 21 item-ов в пуле (см. §1.2).
- **Два task-ci-* items с одинаковым title «Рефлексия по модулю»** — это и есть стержень Track E. Один (`2138eb7f-…`) — реальный target с `is_module_feedback=t`. Второй (`de64aa54-…`) — **сегодняшний дубликат** с `is_module_feedback=f`, 0 submissions у всех 29 menti когорты.

### 1.2. Сегодня в task-ci-* пул добавлено 4 новых items

```sql
SELECT id, title, external_key, created_at
FROM pvl_homework_items
WHERE external_key LIKE 'task-ci-%'
  AND created_at::date = '2026-05-29'
ORDER BY created_at;
```

| id | title | created_at |
|---|---|---|
| `ea11deca-…` | Тест к уроку «Подготовка к сертификационному завтраку» | 2026-05-29 12:15:35 |
| `04f730b2-…` | Задание к уроку «Подготовка к сертификационному завтраку» | 2026-05-29 12:15:35 |
| `0bafbde1-…` | Задание к уроку «Подготовка к сертификационному завтраку» | 2026-05-29 12:35:00 (дубль) |
| `de64aa54-…` | **Рефлексия по модулю** | **2026-05-29 15:22:52** |

Это похоже на сегодняшнюю миграцию/импорт curriculum для урока «Подготовка к сертификационному завтраку» (Этап 2). Среди них есть **два** «Задание к уроку…» (тоже дубликат) и **наш** «Рефлексия по модулю» — последний по времени. Возможно, импорт curriculum-template создал items, не сверившись с уже существующими по `external_key`/title.

---

## Раздел 2. Submissions Курдюковой — что реально в БД

### 2.1. Одна submission на ПЕРВЫЙ (`2138eb7f-…`) item

```sql
SELECT s.id, s.homework_item_id, h.title, s.status, s.score,
       s.submitted_at, s.checked_at, s.accepted_at,
       s.created_at, s.updated_at, length(s.payload::text) AS payload_len
FROM pvl_student_homework_submissions s
JOIN pvl_homework_items h ON h.id = s.homework_item_id
WHERE s.student_id = '5aa62776-…' AND h.title ILIKE '%рефлекс%';
```

| field | value |
|---|---|
| submission_id | `ee4f8784-7d3d-488b-8de4-a4b871b69391` |
| homework_item_id | `2138eb7f-…` (первая «Рефлексия по модулю», created 2026-05-01) |
| status | **accepted** |
| score | 0 |
| submitted_at | **2026-05-04 03:00:00+03** (= 00:00 UTC, **полночь UTC — backfill pattern**) |
| checked_at | 2026-05-05 03:00:00+03 (полночь UTC) |
| accepted_at | 2026-05-05 03:00:00+03 (полночь UTC) |
| created_at | 2026-05-04 09:29:20.910910+03 (**precise — реальное событие**) |
| updated_at | 2026-05-05 11:42:18.497855+03 (precise) |
| payload_len | 2895 bytes |
| revision_cycles | 0 |

### 2.2. payload — что внутри (thread + versions)

`thread` (3 сообщения):

| createdAt (UTC) | role | author_id | msg_type | text |
|---|---|---|---|---|
| 2026-05-04T06:29:20.767Z | student | `5aa62776-…` (Курдюкова) | version_submitted | «Отправлена работа» |
| 2026-05-04T06:29:20.767Z | system | system | status | «Статус: отправлено» |
| 2026-05-05T08:42:12.926Z | mentor | `6cf385c3-…` (**Василина Лузина**) | mentor_review | «Елена, спасибо за обратную связь. Очень надеюсь, что сбоев с платформой в дальнейшем не будет. Всегда можно прийти ко мне в личку в тг и написать, что задания сданы.» |

`versions` (1 версия):

| version_id | createdAt | author_id | **content_len** |
|---|---|---|---|
| `ver-1777876160767-24` | 2026-05-04T06:29:20.767Z | (нет ключа authorUserId) | **0** |

🎯 **Курдюкова реально нажала Submit 4 мая 09:29:20 МСК, но `content` пустой.** Через сутки Василина (тогда её ментор, см. §5) приняла со словами «спасибо за обратную связь / можно прийти в личку в тг и написать что задания сданы». То есть **acceptance из доверия по TG-сообщению**, не на основе текста рефлексии — это явно workaround в начале мая на фоне UI-сбоев.

### 2.3. status_history — кто менял статус

```sql
SELECT from_status, to_status, comment, changed_by, changed_at
FROM pvl_homework_status_history
WHERE submission_id = 'ee4f8784-…';
```

| from | to | comment | changed_by | changed_at |
|---|---|---|---|---|
| in_review | **accepted** | (тот же текст что в thread) | **`6cf385c3-…` Василина Лузина** | 2026-05-05 11:42:12.926+03 |

Одно change-event. До этого статуса `pending → in_review` не записаны в history — возможно legacy submissions создавались с `status=in_review` напрямую (видимо, на этапе создания submission'а статус автоматически = `in_review`).

### 2.4. content_progress пустой

```sql
SELECT * FROM pvl_student_content_progress
WHERE student_id = '5aa62776-…'
  AND content_item_id IN ('2138eb7f-…', 'de64aa54-…', 'af4d0eb1-…');
```

→ **0 rows.** Прогресс по контент-items не задействован для этого симптома.

### 2.5. Все 7 её submissions (общая картина)

Все 7 = **status=accepted**, все `submitted_at`/`accepted_at` ровно полночь UTC, все task-ci-*. Полный список в первичных раскладках recon'а. Это значит — **она 7 раз нажимала Submit на task-ci-* items, ВСЕ были приняты (большинство — Василиной, до перевода к Федотовой)**, причём `payload_len` варьируется (2895 — наш кейс, 98869 — task «Дизайн и архитектура встречи», где, видимо, был реальный контент).

---

## Раздел 3. Peer comparison — норма или аномалия

### 3.1. По item `2138eb7f-…` (первое «Рефлексия по модулю», `is_module_feedback=t`)

29 menti когорты 1, **13 имеют submission**, все одинаково:

| name | status | submitted_at | accepted_at | v0_content_len |
|---|---|---|---|---|
| Александра Титова | accepted | 2026-05-11 03:00 | 2026-05-12 03:00 | 0 |
| Анжелика Тарасова | accepted | 2026-05-05 03:00 | 2026-05-09 03:00 | 0 |
| Дарья Зотова | accepted | 2026-05-11 03:00 | 2026-05-12 03:00 | 0 |
| Дарья Старостина | accepted | 2026-05-12 03:00 | 2026-05-16 03:00 | 0 |
| Диана Зернова | accepted | 2026-05-09 03:00 | 2026-05-10 03:00 | 0 |
| **Елена Курдюкова** | **accepted** | **2026-05-04 03:00** | **2026-05-05 03:00** | **0** |
| Ирина Петруня | accepted | 2026-05-09 03:00 | 2026-05-09 03:00 | 0 |
| Лилия Мaлонг | accepted | 2026-05-01 03:00 | 2026-05-07 03:00 | 0 |
| Марина Шульга | accepted | 2026-05-28 03:00 | 2026-05-29 03:00 | 0 |
| Наталья Махнёва | accepted | 2026-05-17 03:00 | 2026-05-18 03:00 | 0 |
| Ольга Коняхина | accepted | 2026-05-07 03:00 | 2026-05-08 03:00 | 0 |
| Ольга Разжигаева | accepted | 2026-05-24 03:00 | 2026-05-25 03:00 | 0 |
| Ольга Садовникова | accepted | null | 2026-05-09 03:00 | 0 |

🎯 **Все 13 имеют v0_content_len = 0** — пустой контент version. И **все** `submitted_at`/`accepted_at` ровно полночь UTC.

Остальные 16 menti — **0 строк submission на этот item** (не нажимали Submit).

**Вывод:** Курдюкова — **НЕ уникальна.** Это **массовый паттерн доверие-acceptance** по item «Рефлексия по модулю». Если у Курдюковой это аномалия — то такая же аномалия у 12 других menti.

### 3.2. По item `de64aa54-…` (второе «Рефлексия по модулю», создан сегодня)

```sql
SELECT count(*) FROM pvl_student_homework_submissions
WHERE homework_item_id = 'de64aa54-…';
```

→ **0** submissions. Никто не отправлял на новый item, что ожидаемо — он создан **сегодня в 15:22:52 МСК**, через ~7 часов после жалобы Курдюковой (~14:10 МСК) — *wait*, жалоба Track C про отзыв была в 14:10. Track E — это, по-видимому, новая жалоба, **после** SW bump _155 в 17:00 МСК и после создания дубликата item'а. То есть тайминг: 15:22 создан дубликат → 17:00 SW bump инвалидировал кеш Курдюковой → она обновила страницу → увидела дубликат и привязанный к нему «Принято».

### 3.3. Подтверждение «midnight UTC» — это паттерн всей таблицы

```sql
SELECT
  count(*) FILTER (WHERE submitted_at::time = '03:00:00') AS midnight_utc,
  count(*) FILTER (WHERE submitted_at IS NOT NULL AND submitted_at::time <> '03:00:00') AS precise_time,
  count(*) AS total
FROM pvl_student_homework_submissions;
```

| | submitted_at | accepted_at |
|---|---|---|
| midnight UTC (`03:00:00+03`) | **89 / 90** | 86 / 90 |
| precise time | **0** / 90 | 0 / 90 |
| null | 1 / 90 | 4 / 90 |

🎯 **Ни одна submission во всей таблице не имеет precise `submitted_at`/`accepted_at`.** Эти поля семантически — **«дата» (UTC), а не «timestamp»**. Реальное время событий лежит в `created_at`/`updated_at` (precise) и в `payload.thread[*].createdAt` (precise ISO UTC). Это либо UI urезает время до даты при INSERT, либо backfill из старой системы.

Это не root cause Track E, но **важный системный факт** — отчёты/UI, опирающиеся на `submitted_at`/`accepted_at`, видят даты, а не «когда реально». Стратегу на заметку (потенциальный backlog REPORT-PRECISION-TS).

---

## Раздел 4. JWT-impersonation Курдюковой — server-side state

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"5aa62776-6229-4270-9886-33316ff035c6","role":"authenticated"}';

-- 4.1 her submissions for both reflexia items
SELECT s.id, s.homework_item_id, h.title, s.status, length(s.payload::text) AS payload_len
FROM pvl_student_homework_submissions s
LEFT JOIN pvl_homework_items h ON h.id = s.homework_item_id
WHERE s.student_id = '5aa62776-…'
  AND s.homework_item_id IN ('2138eb7f-…', 'de64aa54-…');

-- 4.2 both items visibility
SELECT id, title, external_key, is_module_feedback, created_at
FROM pvl_homework_items
WHERE id IN ('2138eb7f-…', 'de64aa54-…');

ROLLBACK;
```

### 4.1. Submissions под её JWT

| submission_id | homework_item_id | title | status | payload_len |
|---|---|---|---|---|
| `ee4f8784-…` | `2138eb7f-…` | Рефлексия по модулю | accepted | 2895 |

**Только одна строка** — на первый item. RLS пропускает (own student_id). На второй item `de64aa54-…` submissions у неё нет.

### 4.2. Items под её JWT

| id | title | is_module_feedback | created_at |
|---|---|---|---|
| `2138eb7f-…` | Рефлексия по модулю | t | 2026-05-01 19:09:35 |
| `de64aa54-…` | Рефлексия по модулю | f | 2026-05-29 15:22:52 |

**Оба item'а видны.** Если frontend рендерит UI-раздел через список items с этим title — он покажет **две** карточки «Рефлексия по модулю». На первой будет status='accepted' (её ee4f8784), на второй — пусто. Тогда жалоба «вижу Принято на задании которое не писала» = **она смотрит на первую карточку (старая, пустой контент) и не помнит что нажимала Submit 25 дней назад**.

Если же frontend дедуплицирует items по title и показывает только одну карточку (любую из двух) — то submission матчится по title и она видит «Принято» на новой пустой item-карточке, к которой submission не привязана в БД. Это **frontend-bug-by-title**.

---

## ВЕРДИКТЫ — два сценария, развести через скриншот UI

### Сценарий A: pure (a) — В БД accepted, UI правду показывает

**Если в её UI две карточки** «Рефлексия по модулю» (одна Принято, одна пусто) — тогда **в БД действительно accepted на старой**, и frontend честно отрисовал. Симптом — это amnesia + сюрприз от дубликата сегодня.

Что произошло (для неё нужны 2 факта):
- 4 мая в 09:29 МСК она нажала Submit на «Рефлексия по модулю» (item `2138eb7f-…`), но текст рефлексии был пустой (`content_len=0`).
- 5 мая в 11:42 её тогдашняя ментор Василина Лузина приняла со словами «спасибо за обратную связь / можно прийти в личку в тг и написать что задания сданы» — это acceptance из доверия по TG, не на основе текста.
- Сегодня в 15:22 в curriculum-import появился второй item с тем же title (баг импорта/миграции) — пусто, никто не сдал.
- 17:00 SW bump _155 инвалидировал её кеш → при перезагрузке она увидела всё в свежем виде → удивилась.

В этом сценарии нет bug'а текущего: данные исторически валидные. Можно (если стратег захочет):
- Удалить дубликат item `de64aa54-…` (0 submissions, безопасно).
- В audit-журнале зафиксировать что в начале мая были acceptance из доверия на пустой контент (info, не fix).

### Сценарий B: frontend-by-title — UI лжёт

**Если в её UI одна карточка** «Рефлексия по модулю» с «Принято» — тогда:
- Frontend, видимо, либо группирует submissions по title (теряя homework_item_id), либо показывает только новые/активные items + матчит submission'ы по title.
- Курдюкова смотрит на новую карточку (de64aa54) — там нет её submission в БД, но UI вытащил статус из старой через title-match. Тогда **симптом честный — UI лжёт, она реально не отправляла на этот item-id**.
- Чинить — на стороне рендеринга homework-card: матч строго по `homework_item_id`, без title-fallback.

### Дополнительно (system-finding, для стратега, не root cause)

1. **Item `de64aa54-…` создан сегодня в 15:22:52** — дубликат по title. Возможно, импорт curriculum-template не проверил existence по `external_key` или title перед INSERT. Стоит проверить trail: какая миграция/скрипт сегодня в 15:22:52 запускался. Заодно в logs Bittern. Аналогично — два «Задание к уроку Подготовка к сертификационному завтраку» в 12:15 и 12:35 (тоже дубликат).
2. **`submitted_at`/`accepted_at` во ВСЕЙ таблице = midnight UTC.** Реального времени там нет — это «дата». Если UI/отчёты опираются на них для «когда», они врут с точностью до 24 часов. (Backlog candidate: HW-SUBMITTED-AT-PRECISION или зафиксировать в lessons.)
3. **Курдюкова + 12 peers** имеют v0_content_len=0 + accepted. Это исторически — workaround на UI-сбои в начале мая (Василина писала «спасибо за обратную связь / можно в личку в тг»). Не bug сейчас. Но если когда-то будет проверка «реально ли студент написал рефлексию» — эти 13 не пройдут.

---

## Что я НЕ делал

- ⛔ Не модифицировал данные (всё в `BEGIN; … ROLLBACK;`).
- ⛔ Не удалял дубликат item `de64aa54-…` — read-only recon.
- ⛔ Не лез в код frontend (нет инструкции, и DevTools-сигнал у Курдюковой нужен сначала).
- ⛔ Не пересматривал mentor link Курдюкова ↔ Василина — он был раньше, сейчас Курдюкова → Федотова (см. `_153`). Василина приняла submission в роли «тогдашнего ментора», что согласуется с _153.

---

## Артефакты — uuid для стратега

| Имя | id |
|---|---|
| Курдюкова | `5aa62776-6229-4270-9886-33316ff035c6` |
| Курдюкова submission на «Рефлексия по модулю» | `ee4f8784-7d3d-488b-8de4-a4b871b69391` |
| **item «Рефлексия по модулю» (старый, 2026-05-01, is_module_feedback=t)** | **`2138eb7f-a8ad-459a-8b08-552d3926020f`** |
| item «Рефлексия по модулю» (новый, 2026-05-29 15:22, is_module_feedback=f) | `de64aa54-df66-483c-b162-d8eb94e174ee` |
| status_history event (Василина accepted) | `b1d5e0ce-02f3-4f10-88f6-6b78f2e32d83` |
| Василина Лузина (changed_by) | `6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7` |
| Когорта 1 | `11111111-1111-1111-1111-111111111101` |
| external_key старый item | `task-ci-a1bb1513-97ab-4411-90a5-9857e16fd4a0` |
| external_key новый item | `task-ci-5067b49b-38b9-466d-8286-7c0b8786088a` |

---

## Что попросить у Курдюковой (DevTools) — чтобы развести (a) vs (b)

1. **Скриншот раздела** «Подготовка к сертификационному завтраку». Сколько карточек «Рефлексия по модулю» там — одна или две?
2. **Если одна** — что в ней статус и пустая ли она при попытке открыть.
3. **Network tab** (фильтр `pvl_student_homework_submissions` или `homework`) — какие запросы и какие в ответе `homework_item_id` (свежий `de64aa54` или старый `2138eb7f`).
4. **Application → Local Storage** ключ типа `pvl_homework_*` — есть ли там кешированный список (может быть stale до SW bump _155).
