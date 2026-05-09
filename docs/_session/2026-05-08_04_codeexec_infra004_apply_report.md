# INFRA-004 — отчёт по applies (Путь B, `.htaccess` через FTP-deploy)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_03_strategist_infra004_apply_path_b.md`](2026-05-08_03_strategist_infra004_apply_path_b.md)
**Итог:** ❌ Путь B не сработал. Хостинг — чистый nginx без Apache,
`.htaccess` игнорируется. Рекомендация — Путь C (Timeweb-панель,
nginx user-config).
`.htaccess` **не откатывал** (по протоколу — лежит безвредно).

---

## 1. Содержимое `public/.htaccess`

Закоммичено как есть (один файл, в корне `public/`):

```apache
# INFRA-004 — cache-headers fix (2026-05-08)
#
# Why: после каждого deploy юзеры с закэшированным index.html
# обращались к старым bundle hash'ам (которых уже нет на сервере) и
# падали с "Failed to fetch dynamically imported module"
# (инцидент 2026-05-07). Решение — index.html всегда no-cache,
# /assets/* всегда immutable (имена файлов и так с хэшами).
#
# Если этот .htaccess не подхватывается хостингом (чистый nginx без
# Apache-проксирования), header `X-Htaccess-Active` ниже не появится в
# ответах. Тогда переключаемся на путь C — nginx user-config через
# панель Timeweb.

<IfModule mod_headers.c>
    Header set X-Htaccess-Active "yes"
</IfModule>

# index.html и любой другой .html — no-cache, чтобы юзер всегда получал
# свежий entrypoint со ссылками на актуальные bundle hash'и.
<FilesMatch "\.html$">
    <IfModule mod_headers.c>
        Header set Cache-Control "no-cache"
    </IfModule>
</FilesMatch>

# Hashed assets от Vite: <name>-<hash 8+>.<ext>. Имя меняется при каждом
# билде, поэтому безопасно кэшировать на год + immutable.
# Hash может содержать [A-Za-z0-9_-]; Vite default — ровно 8 символов,
# {8,} оставлен на случай roll-up'овской смены длины в будущем.
<FilesMatch "-[A-Za-z0-9_-]{8,}\.(js|mjs|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|map)$">
    <IfModule mod_headers.c>
        Header set Cache-Control "public, immutable, max-age=31536000"
    </IfModule>
</FilesMatch>
```

**Заметки по реализации:**

- Один файл вместо двух. Strategist в prompt'е оставил вариант на
  усмотрение; я выбрал single-file с FilesMatch по basename
  (`-XXXXXXXX.ext`), чтобы не плодить `public/assets/.htaccess`. Vite
  кладёт в `dist/assets/` файлы с 8-символьным хэшем (проверено по
  `dist/assets/`: `index-CMr9ofWh.js`, `CourseLibraryView-DHET2MkU.js`,
  `index.es-CIfVeCUG.js` и т.д. — все 8 символов).
- Sentinel-header `X-Htaccess-Active: yes` — обязательный signal,
  именно по нему диагностировал результат.
- Side-fix `/sw.js` → `no-cache` **не включал** — не критичный, лучше
  отдельным проходом после успешного raw fix. (Сейчас всё равно
  ничего из этого не работает.)

---

## 2. Commit + push + deploy

### Commit

```
aa6770c infra: cache-headers через .htaccess (INFRA-004)
```

Полный текст:

```
infra: cache-headers через .htaccess (INFRA-004)

index.html → no-cache, /assets/* hashed → immutable, max-age=31536000.
Test header X-Htaccess-Active для проверки, что .htaccess подхватился
на хостинге Timeweb (shared, без SSH-доступа). Если не поддерживается
.htaccess — переключаемся на Путь C (Timeweb-панель).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### Push

```
$ git push origin main
To https://github.com/ligacreate/garden.git
   64413fc..aa6770c  main -> main
```

Push успешен в 06:39:xx UTC (точное время push не записал, но deploy
триггерится с него).

### GitHub Actions run

`gh` CLI на машине нет, прямой ссылки на run не получил. Косвенное
подтверждение, что deploy прошёл — `Last-Modified` на bundle:
- **до push:** `Thu, 07 May 2026 15:03:59 GMT` (из recon'а в плане 02)
- **после push:** `Fri, 08 May 2026 06:39:36 GMT` (см. секцию 3)

Это значит, FTP-deploy успешно загрузил свежий `dist/` на сервер
(по `dangerous-clean-slate: true` он сначала чистит server-dir, потом
заливает). Время заливки — около 06:39:36 UTC.

Список runs можно посмотреть тут (если нужно стратегу для review):
https://github.com/ligacreate/garden/actions

---

## 3. Verify через curl — до и после

### До (baseline из плана 02, 2026-05-08 06:19 UTC)

```
$ curl -sI https://liga.skrebeyko.ru/
HTTP/1.1 200 OK
Server: nginx
Date: Fri, 08 May 2026 06:19:48 GMT
Content-Type: text/html
Connection: keep-alive

$ curl -sI https://liga.skrebeyko.ru/assets/index-3qncH8UD.js
HTTP/1.1 200 OK
Last-Modified: Thu, 07 May 2026 15:03:59 GMT
ETag: "69fca9df-1409a9"
Expires: Sat, 09 May 2026 06:19:50 GMT
Cache-Control: max-age=86400
```

### После (06:47 UTC, через ~7 минут после push)

**Index:**

```
$ curl -sI https://liga.skrebeyko.ru/
HTTP/1.1 200 OK
Server: nginx
Date: Fri, 08 May 2026 06:47:13 GMT
Content-Type: text/html
Connection: keep-alive
```

`X-Htaccess-Active`: ❌ отсутствует.
`Cache-Control`: ❌ отсутствует.

**Bundle:**

```
$ curl -sI https://liga.skrebeyko.ru/assets/index-3qncH8UD.js
HTTP/1.1 200 OK
Server: nginx
Last-Modified: Fri, 08 May 2026 06:39:36 GMT     ← deploy прошёл!
ETag: "69fd8528-1409a9"
Expires: Sat, 09 May 2026 06:47:15 GMT
Cache-Control: max-age=86400                      ← всё ещё старый
```

`Last-Modified` сменился → deploy физически прошёл и переписал файлы.
Cache-Control не изменился → `.htaccess` не парсится сервером.

**Прямой fetch `/.htaccess`:**

```
$ curl -sI https://liga.skrebeyko.ru/.htaccess
HTTP/1.1 404 Not Found
Server: nginx
```

404, не 403. Это **не** decisive — может означать как «файл не залит»,
так и «nginx скрывает dotfiles за 404». Решающий signal — отсутствие
`X-Htaccess-Active`, см. ниже.

**Polling-лог** (5 минут, каждые 15 сек, начиная с 06:40:21 UTC,
сразу после push):

```
[06:40:21] iter=1 htaccess=[] cache-control=[]
[06:40:39] iter=2 htaccess=[] cache-control=[]
... (всё пусто) ...
[06:45:32] iter=20 htaccess=[] cache-control=[]
Polling ended at 06:45:49
```

20 итераций × 15 сек = 5 минут. Headers ни разу не появились.

---

## 4. Вывод

❌ **Путь B не работает на этом хостинге.**

Доказательная цепочка:
1. Deploy физически прошёл (`Last-Modified` на bundle обновился на
   06:39:36 UTC, ровно после push).
2. Sentinel-header `X-Htaccess-Active` за 5 минут polling'а после
   deploy так и не появился.
3. `Server: nginx` без `X-Powered-By` или Apache-фингерпринтов.
4. Cache-Control headers не изменились — остались nginx-defaults
   (`max-age=86400` на assets, ничего на index.html).

Это значит — хостинг работает на чистом nginx (без Apache-реверс-
проксирования и без панельной обработки `.htaccess`). На таком хостинге
`.htaccess` файл лежит на диске, но никто его не читает.

Это ровно «Сценарий B» из твоего prompt'а (`2026-05-08_03`):

> `X-Htaccess-Active` отсутствует. Хостинг — чистый nginx без Apache-
> проксирования. Тогда:
> - **Не откатывать** `public/.htaccess` сразу — пусть лежит,
>   безвреден (просто игнорируется на чистом nginx).
> - Стратегу — переключаемся на Путь C.

Действия по протоколу:
- ✅ `.htaccess` оставлен в коде (`public/.htaccess`, коммит `aa6770c`).
  В каждом следующем deploy он будет повторно заливаться, но не мешает.
- ✅ Сайт не сломался (curl возвращает 200, body нормальный, bundle
  отдаётся).
- 🟡 Cache-headers всё ещё неправильные → INFRA-004 **не закрыт**.

---

## 5. Что предлагаем — Путь C (Timeweb-панель)

### Почему именно Путь C, а не Путь A (SSH)

Параллельный поиск SSH-доступа Ольгой может сработать, но даже если
сработает — это лишь альтернативный способ применить тот же набор
nginx-директив. Через панель Timeweb можно сделать то же самое прямо
сейчас, без ожидания провайдер-саппорта.

Если SSH найдётся раньше — отлично, можно применить через ssh, но
рекомендую не блокироваться на этом.

### Что нужно вставить в Timeweb-панель

В панели Timeweb для домена `liga.skrebeyko.ru` обычно есть раздел типа
«Дополнительные настройки nginx» / «User include» / «nginx custom
directives». Точное название зависит от версии панели.

Вставить туда:

```nginx
# INFRA-004 — cache-headers fix (2026-05-08)
# Sentinel — чтобы по curl можно было диагностировать, что блок
# применился именно этот.
add_header X-Nginx-Custom-Active "yes" always;

# index.html — никакого кэша поверх условного GET. Без этого после
# deploy юзер с закэшированным index.html ссылается на старые bundle
# hash'и, которых на сервере уже нет (инцидент 2026-05-07).
location = / {
    add_header Cache-Control "no-cache" always;
    add_header X-Nginx-Custom-Active "yes" always;
    expires off;
    try_files /index.html =404;
}
location = /index.html {
    add_header Cache-Control "no-cache" always;
    add_header X-Nginx-Custom-Active "yes" always;
    expires off;
}

# Hashed assets — год immutable. Vite даёт каждому файлу хэш в имени,
# поэтому коллизий между билдами нет.
location ^~ /assets/ {
    add_header Cache-Control "public, immutable, max-age=31536000" always;
    add_header X-Nginx-Custom-Active "yes" always;
    expires off;
    try_files $uri =404;
}
```

**Замечания:**

- `^~` для `/assets/` — приоритет prefix-matcher'а над regex-блоками.
- `expires off;` обязателен — иначе глобальный `expires 1d;` (он у
  хостинга стоит по дефолту, видно по `Cache-Control: max-age=86400`)
  переопределит наш `add_header`.
- `always` на каждом `add_header` — чтобы header появлялся и в 304
  ответах от условного GET'а.
- `try_files /index.html =404;` в `location = /` — чтобы SPA-роутинг
  не сломался (если он там вообще работает; см. side-finding 1.4 в
  плане 02 — у нас вообще нет SPA-fallback).
- `X-Nginx-Custom-Active` — sentinel на всех трёх блоках. Если хоть
  один curl на изменённой странице покажет этот header, значит
  user-include подхватился панелью.

### Что Ольга / стратег делают руками

1. Логин в Timeweb-панель.
2. Найти раздел кастомных nginx-директив для `liga.skrebeyko.ru`.
3. Скопировать блок выше, сохранить.
4. Дождаться, когда Timeweb сам перезагрузит nginx (обычно ~30 секунд).
5. Verify через curl (см. ниже).

### Verify-команды для Пути C

```bash
# 1. Sentinel — главный signal что user-include подхватился
curl -sI https://liga.skrebeyko.ru/ | grep -i 'x-nginx-custom-active'
# expect: X-Nginx-Custom-Active: yes

# 2. Cache-Control на index.html
curl -sI https://liga.skrebeyko.ru/ | grep -i cache-control
# expect: Cache-Control: no-cache

# 3. Cache-Control на bundle
ASSET=$(curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -sI "https://liga.skrebeyko.ru/$ASSET" | grep -i cache-control
# expect: Cache-Control: public, immutable, max-age=31536000
```

### Если Путь C тоже не сработает

- Панель не позволяет добавлять custom-include → Путь D (тикет в
  саппорт Timeweb с просьбой «добавьте такие headers для домена»).
- Custom-include подхватился, но `expires off` не сработал и
  default `expires 1d` всё равно перешибает → возможно, нужен
  `more_clear_headers Expires;` (но это уже nginx с модулем headers-
  more, не во всех панелях есть). Запасной вариант — попросить
  саппорт убрать глобальный `expires` для домена.

### Что с public/.htaccess делать после успеха Пути C

Можно удалить отдельным коммитом — лежит мёртвым весом. Но не
обязательно: в случае миграции на хостинг с поддержкой `.htaccess`
он сразу заработает. Решение — на стратега.

---

## Итог одной строкой

Путь B не сработал (чистый nginx, `.htaccess` не парсится). Сайт цел,
`.htaccess` оставлен. Жду 🟢 на применение Пути C через Timeweb-панель —
nginx-блок и verify-команды готовы в секции 5.
