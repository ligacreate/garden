# INFRA-004 — план фикса cache-headers на liga.skrebeyko.ru

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Статус:** план готов, **apply заблокирован доступом** — нужно решение
стратега по пути apply (см. секцию 0).

---

## 0. БЛОКЕР: SSH-доступа к фронт-хосту нет

### Что выяснилось на recon'е

1. **IP в твоём prompt'е был неверный.** `185.215.4.44` — это посторонний
   хост (banner closed). DNS:

   ```
   liga.skrebeyko.ru → 185.162.93.61   ← фронт (FTP-only)
   api.skrebeyko.ru  → 5.129.251.56    ← наш сервер (PostgREST/Auth)
   auth.skrebeyko.ru → 5.129.251.56
   ```

2. **На `185.162.93.61` SSH-ключ executor'а не пускают.** Порт 22 открыт,
   но `Connection closed by 185.162.93.61` — auth fail. Попытки:
   - `ssh root@185.162.93.61` — closed.
   - `ssh -p 2222 root@185.162.93.61` — closed.

3. **Деплой идёт по FTP**, а не SSH. Из `.github/workflows/deploy.yml`:
   ```yaml
   - name: Deploy via FTP
     uses: SamKirkland/FTP-Deploy-Action@v4.3.5
     with:
       server: ${{ secrets.FTP_SERVER }}
       protocol: ftp
       server-dir: /   # FTP user home is already /www/liga.skrebeyko.ru
       dangerous-clean-slate: true
   ```
   Это типичный shared-хостинг (вероятно Timeweb — путь `/www/<домен>`,
   `Server: nginx` без `X-Powered-By`).

4. **Сценарий, который ты сам описывал в prompt'е, сработал:**
   > nginx-конфиг через Timeweb-панель (не доступен через ssh-edit) →
   > стоп, сообщить, придётся менять через Timeweb UI или их support.

### Что это значит для apply

Раздел «команды reload nginx» в этом плане применим **только если у нас
будет SSH-доступ**. Без него — три альтернативных пути (см. секцию 6
«Решения для стратега»).

### Что я смог выяснить без SSH

Через `curl -I` восстановлены текущие cache-headers — этого достаточно,
чтобы зафиксировать diff. Реальный конфиг nginx не цитирую (не было
доступа), вместо этого секция 1 — реверс-инжиниринг по observed headers.

---

## 1. Текущее состояние cache-headers (из curl)

### 1.1 `index.html` (главная)

```
$ curl -sI https://liga.skrebeyko.ru/
HTTP/1.1 200 OK
Server: nginx
Date: Fri, 08 May 2026 06:19:48 GMT
Content-Type: text/html
Connection: keep-alive
```

**Cache-Control: ОТСУТСТВУЕТ.** Также нет `Expires`, `ETag`,
`Last-Modified`. Это значит:
- Браузер применяет heuristic caching (~10% от возраста файла, может
  доходить до часов).
- Service Worker / CDN могут кэшировать без явных инструкций.
- Это и есть **корневая причина бага 2026-05-07**: после deploy у юзеров
  оставался старый `index.html`, который ссылался на старые
  `assets/index-<hash>.js`, а тех файлов на сервере уже нет → `Failed to
  fetch dynamically imported module`.

### 1.2 `/assets/*.js`, `/assets/*.css`

```
$ curl -sI https://liga.skrebeyko.ru/assets/index-3qncH8UD.js
HTTP/1.1 200 OK
Content-Type: application/javascript
Last-Modified: Thu, 07 May 2026 15:03:59 GMT
ETag: "69fca9df-1409a9"
Expires: Sat, 09 May 2026 06:19:50 GMT
Cache-Control: max-age=86400
```

**Cache-Control: `max-age=86400` (1 день).** Не `immutable`, не `public`.
Не критичный баг (имя файла содержит хэш → новый билд = новый URL =
безопасно), но недоиспользуем долгий кэш. Должно быть
`public, immutable, max-age=31536000` (год — стандарт для hashed
assets).

Похоже, в конфиге стоит default для всего сайта вроде `expires 1d;` (или
аналогичное правило только на assets). Без чтения файла — гипотеза.

### 1.3 Side-finding: `/sw.js` тоже кэшируется на сутки

```
Cache-Control: max-age=86400
```

Service Worker по спеке обновляется через сравнение байтов независимо от
HTTP-кэша (если SW старше 24ч), но 24ч задержка — много для срочных
фиксов. Хорошая практика: `no-cache` для `/sw.js` явно. **Out of scope
INFRA-004**, но стоит зафиксировать как side-багу.

### 1.4 Side-finding: SPA-fallback не настроен

```
$ curl -sI https://liga.skrebeyko.ru/some-spa-route
HTTP/1.1 404 Not Found
```

Любой не-existing path возвращает 404, а не `index.html`. Это значит:
- Прямой переход по deep-link (например, `/pvl/lesson/3`) ломается, если
  SPA использует BrowserRouter.
- Если используется только HashRouter (`#/...`) — не задевает.

**Out of scope INFRA-004**, но потенциально серьёзная side-bug.

### 1.5 Side-finding: `manifest.webmanifest` MIME-type

```
Content-Type: application/octet-stream
```

Должно быть `application/manifest+json`. PWA-инсталляция может работать,
но Lighthouse/спека предупреждает. **Out of scope INFRA-004**.

---

## 2. Предлагаемый diff (целевая спецификация)

Так как реальный nginx-конфиг недоступен, фиксирую **спецификацию
поведения**, не текстовый diff. Точный синтаксис зависит от того, есть
ли уже `location` блоки в конфиге и какая структура у host'а.

### 2.1 Целевые headers

| URL                      | Cache-Control                                  | Why                            |
|--------------------------|------------------------------------------------|--------------------------------|
| `/`                      | `no-cache`                                     | Чтобы юзер всегда подтягивал свежий index.html → актуальные ссылки на assets |
| `/index.html`            | `no-cache`                                     | То же самое (на случай прямого запроса) |
| `/assets/*`              | `public, immutable, max-age=31536000`          | Hashed имена → можно кэшировать год безопасно |
| `/sw.js` (опционально)   | `no-cache`                                     | Side-fix, согласовать со стратегом |

`no-cache` = «всегда ходи проверять с условным GET (If-None-Match)»; это
**не** `no-store`. Сервер вернёт 304 Not Modified если не изменилось —
дёшево по трафику.

### 2.2 Канонический фрагмент (если у нас будет прямой ssh+nginx)

```nginx
# В пределах server { ... } для liga.skrebeyko.ru:

# 1) Hashed assets — кэшируем агрессивно (год + immutable)
location ^~ /assets/ {
    add_header Cache-Control "public, immutable, max-age=31536000" always;
    expires off;     # не даём nginx'у выставить старый Expires
    try_files $uri =404;
}

# 2) index.html — никакого кэша поверх условного GET
location = / {
    add_header Cache-Control "no-cache" always;
    expires off;
    try_files /index.html =404;
}
location = /index.html {
    add_header Cache-Control "no-cache" always;
    expires off;
}

# (опционально, side-fix)
# location = /sw.js {
#     add_header Cache-Control "no-cache" always;
#     expires off;
# }
```

**Замечания:**
- `^~` для `/assets/` — чтобы префиксный matcher выиграл у regex-блоков.
- `expires off;` обязателен — иначе глобальный `expires 1d;` (если он
  есть) пересилит и подмешает свой `Cache-Control: max-age=...`.
- `always` в `add_header` — чтобы хедер появлялся и для не-2xx ответов
  (304 от условного GET).
- `try_files` в `location = /` я оставил, чтобы не сломать SPA-роутинг,
  но это нужно сверить с реальным конфигом — может уже быть отдельный
  `try_files $uri /index.html;` в `location /`.

### 2.3 Альтернатива через `.htaccess` (если хостинг — Apache + nginx
proxy или поддерживает .htaccess поверх nginx, как Timeweb)

Положить `.htaccess` в webroot:

```apache
<FilesMatch "\.html$">
    Header set Cache-Control "no-cache"
</FilesMatch>

<IfModule mod_expires.c>
    ExpiresActive On
    <FilesMatch "^(index)\.html$">
        Header set Cache-Control "no-cache"
        ExpiresDefault "access plus 0 seconds"
    </FilesMatch>
</IfModule>

# Hashed assets — год immutable
<IfModule mod_headers.c>
    <FilesMatch "^assets/.*\.(js|css|woff2?|png|svg|jpg)$">
        Header set Cache-Control "public, immutable, max-age=31536000"
    </FilesMatch>
</IfModule>
```

Этот вариант **доступен через FTP** (executor может загрузить файл сам,
если стратег даст 🟢). Минус: FTP-deploy с
`dangerous-clean-slate: true` снесёт `.htaccess` при следующем деплое,
если он не в `dist/`. Решение — положить шаблон в репо
(`public/.htaccess` → Vite автоматически копирует в `dist/`).

---

## 3. Команды reload nginx (только при наличии SSH)

```bash
# 1. Проверить синтаксис
sudo nginx -t

# 2. Применить (если nginx через systemd)
sudo systemctl reload nginx

# Альтернатива (если без systemd)
sudo nginx -s reload
```

`reload` (не `restart`) — graceful, без drop'а активных коннектов.

---

## 4. Verify-блок (до и после)

### До (фиксируем baseline сейчас)

```
$ curl -sI https://liga.skrebeyko.ru/ | grep -iE 'cache-control|expires'
(пусто)

$ curl -sI https://liga.skrebeyko.ru/assets/index-3qncH8UD.js | grep -iE 'cache-control|expires'
Expires: Sat, 09 May 2026 06:19:50 GMT
Cache-Control: max-age=86400
```

### После apply — ожидаемое

```
$ curl -sI https://liga.skrebeyko.ru/ | grep -iE 'cache-control|expires'
Cache-Control: no-cache

# либо при наличии expires off без add_header expires:
# Cache-Control: no-cache

$ curl -sI https://liga.skrebeyko.ru/assets/index-XXXXXXXX.js | grep -iE 'cache-control|expires'
Cache-Control: public, immutable, max-age=31536000
```

`Expires` должен либо исчезнуть, либо быть в прошлом — но это
второстепенно, так как Cache-Control его всегда переопределяет.

### Команды для regression-проверки

```bash
# 1. index.html
curl -sI https://liga.skrebeyko.ru/ | grep -i cache-control
# expect: Cache-Control: no-cache

# 2. Hash bundle
ASSET=$(curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -sI "https://liga.skrebeyko.ru/$ASSET" | grep -i cache-control
# expect: Cache-Control: public, immutable, max-age=31536000

# 3. Smoke: всё ещё 200, контент тот же
curl -s https://liga.skrebeyko.ru/ | head -1
curl -sI "https://liga.skrebeyko.ru/$ASSET" | head -1
```

### Browser-side (вручную, после apply)

1. Hard reload текущей вкладки → должна загрузиться без ошибок.
2. DevTools → Network → `index.html` → Response Headers → видно
   `cache-control: no-cache`.
3. Bundle-asset → видно `cache-control: public, immutable, ...`.
4. Закрыть вкладку, открыть → второй запрос на `index.html` должен идти
   с `If-None-Match` и получать 304.

---

## 5. Rollback

### Если apply через SSH+nginx

```bash
# Перед изменением — backup
sudo cp /etc/nginx/sites-available/<name>.conf /etc/nginx/sites-available/<name>.conf.bak.2026-05-08

# Rollback
sudo cp /etc/nginx/sites-available/<name>.conf.bak.2026-05-08 /etc/nginx/sites-available/<name>.conf
sudo nginx -t && sudo systemctl reload nginx
```

### Если apply через `.htaccess`

```bash
# .htaccess попадает в репо как public/.htaccess
# Rollback = git revert этого коммита + redeploy
git revert <sha>
git push origin main   # триггерит FTP-deploy
```

### Если apply через панель Timeweb

Удалить добавленный блок в UI «Дополнительные настройки nginx» → Save.
Провайдер сам сделает reload.

---

## 6. Решения для стратега (нужны перед apply)

Перед 🟢 на apply нужно выбрать путь, потому что без SSH варианта «как в
prompt'е» нет. Варианты по убыванию приоритета:

### Путь A — раздобыть SSH-доступ к 185.162.93.61

Спросить у владельца хостинга (Ольги? саппорт Timeweb?) про SSH.
Плюсы: точный контроль, любая `nginx.conf` правка возможна.
Минусы: shared-хостинги обычно не дают root SSH.

### Путь B — `.htaccess` через FTP-deploy

Положить `public/.htaccess` в репо → Vite положит в `dist/` → FTP-deploy
загрузит. Плюсы: повторяемо, в git, никакого ручного клика.
**Риск:** работает только если хостинг поддерживает `.htaccess` поверх
nginx. На чистом nginx без proxy-Apache — не сработает. Можно проверить:
залить тестовый `.htaccess` с одним `Header set X-Test: hello` →
посмотреть, появится ли header в curl.

### Путь C — панель хостинга (Timeweb-style UI)

Войти в admin-панель (нужны креды), найти раздел «Дополнительные
настройки nginx» / «User include» → вставить блок из секции 2.2.
Плюсы: точный контроль над nginx. Минусы: ручная операция, не в git, при
смене хостинга потеряется.

### Путь D — тикет в саппорт хостинга

Если ни SSH, ни панель не доступны. Долго (часы-сутки), но работает.

**Рекомендация executor'а:** сначала путь B (быстрая FTP-проверка
.htaccess через тестовый header). Если не работает — путь C.

---

## 7. Out-of-scope, но обнаружено на recon'е

Стоит завести отдельные тикеты:

1. **SPA-fallback не настроен** — `/some-deep-link` возвращает 404
   вместо `index.html`. Если приложение использует BrowserRouter, это
   ломает прямые ссылки. (См. 1.4.)
2. **`/sw.js` кэшируется на сутки** — мешает быстрому раскату фиксов
   service-worker'а. (См. 1.3.)
3. **`manifest.webmanifest` отдаётся как `application/octet-stream`** —
   Lighthouse warning, мелочь. (См. 1.5.)

---

## Что НЕ сделано (по prompt'у — намеренно)

- Apply (`nginx -s reload`) — заблокирован доступом + статусом «recon».
- Backup — только при apply, не сейчас.
- Editing файлов на сервере — нет доступа, не пытался.

Жду 🟢 от стратега + выбор пути из секции 6.
