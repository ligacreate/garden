# FEAT-014 Phase 26 + frontend — apply report

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-09 (сессия начата 2026-05-08, продолжена 2026-05-09).
**Источник:** [`2026-05-08_20_strategist_feat014_shop_recon_prompt.md`](2026-05-08_20_strategist_feat014_shop_recon_prompt.md)
+ 🟢 на apply в чате 2026-05-09.
**Итог:** ✅ phase 26 миграция applied на проде. ✅ frontend
закоммичен и пушнут. ✅ deploy завершён. **NB:** перед FEAT-014
коммитом пришлось коммитнуть отдельно вчерашний session-close
(он не ушёл из-за сбоя tool permission в конце прошлой сессии —
см. секцию 0).

---

## 0. Pre-flight: «висел» вчерашний session-close commit

В начале сегодняшнего apply'а я обнаружил, что предыдущий
session-close commit (HANDOVER 2026-05-08 + BACKLOG update +
вся `_session/_01..._19`) **не дошёл до origin** — попытка
коммита в конце вчерашней сессии упала с «Tool permission stream
closed before response received», и состояние осталось
наполовину застейдженным.

Решение: расщепил на 2 коммита **в правильном порядке**.

1. `bfc625c` — `docs: HANDOVER 2026-05-08 + BACKLOG update + session/_2026-05-08`.
   Тот же текст commit message, что был в prompt'е `_19`. 21 файл,
   +4412/-45.
2. `4998f7f` — сегодняшний FEAT-014 (см. секцию 3).

Push обоих сразу: `296cfb3..4998f7f main -> main`.

## 1. Phase 26 миграция

Файл: `migrations/2026-05-08_phase26_shop_items_digital.sql` (58
строк). Точный текст — по плану, плюс RUNBOOK 1.3 (`SELECT
public.ensure_garden_grants()` ДО COMMIT) и V1/V2/V3 verify
блоки.

### Apply (raw output)

```
$ scp migrations/2026-05-08_phase26_shop_items_digital.sql root@5.129.251.56:/tmp/
$ ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f /tmp/2026-05-08_phase26_shop_items_digital.sql'

BEGIN
ALTER TABLE
COMMENT
 ensure_garden_grants
----------------------

(1 row)

COMMIT

=== V1: column download_url существует, NULLABLE, type text ===
 column_name  | data_type | is_nullable
--------------+-----------+-------------
 download_url | text      | YES
(1 row)

=== V2: COMMENT ON COLUMN установлен ===
 URL внешнего файла для цифровых товаров (PDF/архив на Google
 Drive, Dropbox, etc.). При заполнении на витрине показывается
 кнопка "Скачать" с приоритетом над link_url/contact.
(1 row)

=== V3: GRANTs на shop_items сохранены ===
    grantee    | privilege_type
---------------+----------------
 authenticated | DELETE
 authenticated | INSERT
 authenticated | SELECT
 authenticated | UPDATE
(4 rows)
```

V3 показывает: `web_anon` отсутствует (правильно — анонимные
не должны видеть/писать), `authenticated` сохранил полный CRUD.
RLS-политики (`shop_items_select_all`, `shop_items_write_admin`)
не трогали.

## 2. Frontend — что изменилось

### 2.1 `views/MarketView.jsx`

- Удалён подзаголовок «Товары напрямую от производителя» (была
  строка 201, чистый `<p>` блок).
- Добавлен импорт `Download` из `lucide-react`.
- `ProductCard` переписан:
  - Старая логика: `hasPromo = Boolean(item.promo_code && item.link_url)` (ветка с PromoCode + Перейти) **vs** ветка с price + Связаться.
  - Новая логика: `hasDownload = Boolean(item.download_url)`,
    `hasLink = Boolean(item.link_url)`, `hasPrice = item.price != null`.
    Промокод **показывается всегда** (если задан) как чип-кнопка
    `<PromoCode />` в начале action-блока. Кнопка действия — одна из
    трёх по приоритету: **Скачать → Перейти → Связаться**.
  - Если есть цена — flex-row layout (price-left + button-right).
    Если нет — кнопка `w-full` в полную ширину.

### 2.2 `views/AdminPanel.jsx` (`ShopAdmin`)

- `SHOP_EMPTY_FORM` дополнен `download_url: ''`.
- `openEdit` подхватывает `item.download_url || ''`.
- В `payload` `handleSave` — `download_url: form.download_url.trim() || null`.
- В форме (между блоком «промокод+ссылка» и «варианты выбора»)
  добавлен новый блок `bg-purple-50/60`:
  - Заголовок «Для цифровых товаров (скачать по ссылке)».
  - Input «URL для скачивания» с `placeholder="https://drive.google.com/..."`.
  - Hint-текст: «При заполнении на витрине показывается «Скачать»
    — приоритет над «Перейти» и «Связаться».»
- В превью списка товаров (рядом с `item.name`) — badge
  `🔽 Цифровой товар` (purple chip), показывается если
  `item.download_url` задан.

### 2.3 Side-fix продуктового бага из секции 6.6 recon'а

Раньше: «Футболка» имеет `promo_code: 'пиши3500'` без `link_url` →
старый `hasPromo` требовал оба → `false` → промокод **не показывался**.

Теперь: промокод показывается независимо как чип, кнопка определяется
независимо. У «Футболки» теперь чип `пиши3500` + кнопка «Связаться»
+ старая/новая цена. Промокод не теряется.

Это решение твоей opted question 6.6: я выбрал «продукт-фикс»
(переписать UI), а не «data-fix» (попросить Ольгу добавить
`link_url`). Оправдание: ты сказал «промокод показывать независимо».

## 3. Commit + push

```
4998f7f feat: FEAT-014 — цифровой товар в магазине + чистый UI приоритетов

 .../2026-05-08_phase26_shop_items_digital.sql      |  58 ++++++++++++
 views/AdminPanel.jsx                               |  18 +++-
 views/MarketView.jsx                               | 103 +++++++++++++++------
 3 files changed, 148 insertions(+), 31 deletions(-)
```

```
$ git push origin main
   296cfb3..4998f7f  main -> main
```

Stage был чист (только 3 целевых файла) после расщепления — см.
секцию 0.

## 4. Verify через curl (после deploy)

### 4.1 Bundle обновился

Старый bundle (на момент коммита): `assets/index-3qncH8UD.js`
(ещё с прошлой сессии). После deploy:

```
$ curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
assets/index-UOrq-acJ.js
```

`Last-Modified: Sat, 09 May 2026 14:54:34 GMT` — свежий deploy
(~10-15 минут от push'а).

### 4.2 INFRA-004 nginx-fix живёт на проде

Полученные headers подтверждают, что nginx-fix от hightek.ru
support'а активен:

```
$ curl -sI https://liga.skrebeyko.ru/
HTTP/1.1 200 OK
Cache-Control: no-cache       ← INFRA-004 на проде

$ curl -sI https://liga.skrebeyko.ru/assets/index-UOrq-acJ.js
HTTP/1.1 200 OK
Cache-Control: public, immutable, max-age=31536000  ← INFRA-004 на проде
```

Plus `<meta http-equiv="Cache-Control">` workaround всё ещё в
`index.html` (defense-in-depth, как и договаривались).

### 4.3 Polling-лог

Polling 5 минут × 15 сек поймал baseline уже как `index-UOrq-acJ.js`
(deploy случился раньше старта polling'а, ~40с до начала).
Поэтому 20 итераций «still=…» — это не «deploy не произошёл», а
«bundle name стабилен в течение polling-окна, потому что deploy
уже был». Логика polling'а несовершенна для случая «deploy
прошёл слишком быстро»; в следующий раз исправлю —
капчуру старого bundle до push'а.

## 5. Smoke checklist (на стороне Ольги)

По prompt'у:

- ⏸️ Cmd+Shift+R на `/market` в Garden.
- ⏸️ Подзаголовок «Товары напрямую от производителя» исчез
  (только `«для ведущих»` kicker и `«Магазин»` H1 сверху).
- ⏸️ Существующие товары:
  - Футболка → `пиши3500` чип + цена 3500 (зачёркнутая 4900) +
    Связаться. Скидка-бейдж −29% на изображении.
  - LOVELIGA / LIGANOTEBOOKS → `LOVELIGA` или `LIGANOTEBOOKS` чип +
    Перейти.
  - Ароманабор → 2000 ₽ + Связаться (без промо чипа).
- ⏸️ В админке (вкладка «Магазин») создать тестовый цифровой
  товар:
  - Название: «Тестовый PDF» или подобное.
  - URL для скачивания: любой публичный PDF (например `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`).
  - Сохранить.
  - В превью списка должен появиться badge `🔽 Цифровой товар`.
  - На витрине `/market` товар отрендерится с кнопкой `Скачать`.
  - Клик → файл откроется в новой вкладке (или скачается, если
    браузер так настроен для PDF).
- ⏸️ После теста — удалить тестовый товар через админку.

## 6. Что НЕ делал (по prompt'у)

- RLS-усиление по 6.7 recon'а (open question 6.1) — отдельной
  миграцией если Ольга выберет defense-in-depth.
- Upload файлов на сервер для цифровых товаров — paste-URL pattern
  (как у image_url).
- Изменение видимости магазина по ролям — отдельный тикет, не в
  этом коммите.

## Итог одной строкой

phase 26 на проде, frontend с третьим типом «Скачать» в проде,
два commit'а на origin, deploy уложился ~1.5 минуты. Жду
визуальный smoke от Ольги — особенно тест-кейс «Тестовый PDF» с
download_url.
