# INFRA-004 — отчёт по meta-tags workaround

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_05_strategist_infra004_meta_workaround.md`](2026-05-08_05_strategist_infra004_meta_workaround.md)
**Статус:** ✅ commit + push выполнены, ✅ deploy прошёл, ✅ verify OK.
Meta-tags появились в задеплоенном `index.html` через ~1.5 мин после
push'а. INFRA-004 в части workaround'а — закрыто; полный фикс ждёт
ответа hightek.ru support'а.

---

## 1. Что сделано

В [`index.html`](../../index.html) в самое начало `<head>`, перед
`<meta charset>`, добавлены два meta-тега:

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
```

`<meta http-equiv="Expires">` **не добавлял** — по prompt'у (deprecated,
игнорируется браузерами).

## 2. Diff

```diff
diff --git a/index.html b/index.html
index 08cc594..515b9b7 100644
--- a/index.html
+++ b/index.html
@@ -2,6 +2,8 @@
 <html lang="ru" translate="no">

 <head>
+  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
+  <meta http-equiv="Pragma" content="no-cache" />
   <meta charset="UTF-8" />
   <meta name="google" content="notranslate" />
   <link rel="manifest" href="/manifest.webmanifest" />
```

Два insert'а, ничего не удалено и не сдвинуто.

## 3. Commit

```
2228f70 infra: meta-tags Cache-Control в index.html (INFRA-004 workaround)
```

Полный текст commit message (как в prompt'е):

```
infra: meta-tags Cache-Control в index.html (INFRA-004 workaround)

Временная мера до настройки nginx headers через тикет в hightek.ru
support. Снижает шанс ошибки "Failed to fetch dynamically imported
module" у части браузеров (Firefox, Safari) при deploy. Chrome для
main resource часто игнорирует meta-Cache-Control, но workaround
безвреден.

После решения тикета support'ом — meta-tags можно оставить как
defense-in-depth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

`git log -1 --stat`:

```
commit 2228f70e105263051ba025648b2cfb5b4a1a36a3
Author: olgaskrebeyko <olga.skrebeyko@gmail.com>
Date:   Fri May 8 09:53:14 2026 +0300

    infra: meta-tags Cache-Control в index.html (INFRA-004 workaround)
    ...

 index.html | 2 ++
 1 file changed, 2 insertions(+)
```

`git rev-list --left-right --count origin/main...HEAD` → `0  1`
(локально впереди origin на 1 коммит, не запушен).

## 4. Что в стейдже / рабочем дереве (что пойдёт / не пойдёт в push)

В коммите **только** `index.html` (1 файл, +2 строки). Прочая «грязь» в
рабочем дереве (модификация `.claude/settings.json`, `CLAUDE.md`, куча
deleted `docs/*.md` после переезда в `docs/journal/`, плюс новые
session-документы) — **не закоммичена и не пойдёт в push**. Стейдж
чист.

Если стратег захочет, чтобы перенос docs тоже ушёл — это **отдельный**
коммит, с полным разбором что куда переехало. Сейчас не трогал.

## 5. Push

Стратег дал 🟢 после ревью diff'а в чате. Push:

```
$ git push origin main
To https://github.com/ligacreate/garden.git
   aa6770c..2228f70  main -> main
```

Push в ~06:57 UTC, FTP-deploy через GitHub Actions триггернулся
автоматически.

## 6. Verify

### Polling-лог (фоновая проверка, каждые 15 сек, exit при появлении `http-equiv`)

```
Polling started at 06:57:25
[06:57:25] iter=1 no http-equiv yet
[06:57:42] iter=2 no http-equiv yet
[06:57:58] iter=3 no http-equiv yet
[06:58:14] iter=4 no http-equiv yet
[06:58:31] iter=5 no http-equiv yet
[06:58:47] iter=6 no http-equiv yet
[06:59:03] iter=7 FOUND http-equiv:
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
Polling ended at 06:59:05
```

Deploy уложился примерно в **1м 38с** от push'а до появления изменений
на prod (06:57:25 → 06:59:03).

### Финальная curl-проверка (07:03 UTC)

```
$ curl -s https://liga.skrebeyko.ru/ | grep -i 'http-equiv'
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
```

Оба тега на месте, в правильном порядке, ровно как в локальном
`index.html`.

### Sanity (сайт живой)

```
$ curl -sI https://liga.skrebeyko.ru/
HTTP/1.1 200 OK
Server: nginx
Content-Type: text/html

$ curl -sI https://liga.skrebeyko.ru/assets/index-3qncH8UD.js
HTTP/1.1 200 OK
Content-Type: application/javascript
Content-Length: 1313193
```

200 на root, 200 на bundle, размер тот же. Ничего не сломано.

### Что НЕ изменилось (ожидаемо)

HTTP-headers по-прежнему без `Cache-Control` на index.html и с
`max-age=86400` на assets. Это и есть точный смысл workaround'а:
**meta-tags никак не влияют на HTTP-ответ сервера**, они смягчают только
браузерное heuristic caching'е. Полный фикс по-прежнему ждёт hightek.ru
support'а (Путь D).

---

## 7. Что НЕ делал (намеренно)

- Push в origin/main — по инструкции.
- `<meta http-equiv="Expires">` — по prompt'у (deprecated).
- service worker `sw.js`, SPA-fallback, `manifest.webmanifest` MIME —
  отдельные тикеты.
- Удаление `public/.htaccess` — оставлен как future-proof по
  предыдущему отчёту `_04`.

## Итог одной строкой

Коммит `2228f70` запушен, deploy за ~1м 38с, оба meta-тега на prod,
сайт живой. Workaround активен; полный nginx-фикс остаётся за
hightek.ru support'ом.
