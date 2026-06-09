# DIFF INFRA-005 — additive-деплой assets/ + самосброс loop-guard

**Дата:** 2026-06-09
**Тип:** diff-on-review, НЕ применён — жду 🟢
**Основание:** recon [182](2026-06-08_182_codeexec_recon_infra005_chunk_flap.md) + поправка стратега
**Затронуто:** `.github/workflows/deploy.yml`, `components/ErrorBoundary.jsx`

---

## Что и почему (кратко)

Корень INFRA-005 — `dangerous-clean-slate: true` сносит весь server-dir при
каждом деплое → старые хеш-чанки мгновенно → 404 → ChunkLoadError у долгих
вкладок. Фикс — **additive**-выкладка `assets/`: старое не удаляем, новое
добавляем. Хеш-имена не конфликтуют, старое и новое сосуществуют.

Ключевая поправка стратега учтена: **источник для lftp = `deploy/assets/`**
(там Vite-чанки из `dist/assets` И статика из корневого `assets/` уже смержены
шагом «Prepare deploy bundle»), а **не** `dist/assets/`. Подтверждено локально:
оба каталога плоские, мержатся в `deploy/assets/`.

Разделение ответственности:
- **SamKirkland action** — заливает index.html / sw.js / goroscop / trees /
  favicon и чистит ИХ орфаны через diff-синхронизацию; `assets/` выведен из-под
  него через `exclude` → action его не трогает.
- **lftp-шаг** — заливает `deploy/assets/` с `--no-delete` → новые чанки+статика
  добавляются, старое выживает → 404 уходит.

---

## Файл 1 — `.github/workflows/deploy.yml`

### Изменение A — шаг «Deploy via FTP»: снять clean-slate, добавить exclude

**Было** (строки 58‑68):
```yaml
      - name: Deploy via FTP
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ${{ secrets.FTP_SERVER }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          port: ${{ secrets.FTP_PORT }}
          protocol: ftp
          local-dir: deploy/
          server-dir: /   # FTP user home is already /www/liga.skrebeyko.ru
          dangerous-clean-slate: true
```

**Стало:**
```yaml
      - name: Deploy via FTP (всё, кроме assets/)
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ${{ secrets.FTP_SERVER }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          port: ${{ secrets.FTP_PORT }}
          protocol: ftp
          local-dir: deploy/
          server-dir: /   # FTP user home is already /www/liga.skrebeyko.ru
          # INFRA-005: убрали dangerous-clean-slate — каталог больше не сносится,
          # старые хеш-чанки в assets/ переживают деплой. exclude выводит assets/
          # из-под diff-синхронизации action'а; его доставляет отдельный
          # additive lftp-шаг ниже (--no-delete). Остальное (index.html, sw.js,
          # goroscop, trees, favicon) action синхронизирует и чистит их орфаны.
          exclude: |
            assets/**
```

> Примечание: `exclude` в этом action **заменяет** дефолтные исключения
> (`node_modules`, `.git*`). Для нас безопасно — `deploy/` собирается с нуля из
> `dist` + статики, ни `.git`, ни `node_modules` там нет.

### Изменение B — новый шаг lftp между «Deploy via FTP» и «Smoke check»

**Вставить** после шага Deploy via FTP, перед Smoke check:
```yaml
      - name: Upload assets additively (lftp --no-delete)
        env:
          FTP_SERVER: ${{ secrets.FTP_SERVER }}
          FTP_USERNAME: ${{ secrets.FTP_USERNAME }}
          FTP_PASSWORD: ${{ secrets.FTP_PASSWORD }}
          FTP_PORT: ${{ secrets.FTP_PORT }}
        run: |
          set -euo pipefail
          sudo apt-get update -qq
          sudo apt-get install -y -qq lftp
          # Источник = deploy/assets/ (Vite-чанки + статика, уже смержены в
          # шаге Prepare deploy bundle), НЕ dist/assets/. --no-delete: старые
          # хеш-чанки на сервере не трогаем → стейл-вкладки догрузят свои модули.
          lftp -c "
            set ftp:ssl-allow false;
            set net:max-retries 2;
            open -u \"$FTP_USERNAME\",\"$FTP_PASSWORD\" -p \"$FTP_PORT\" \"$FTP_SERVER\";
            mirror -R --no-delete --parallel=4 --verbose deploy/assets/ assets/;
            bye;
          "
```

> - Секреты переданы через `env`, не инлайном в команду → не светятся в эхо лога
>   (плюс GH и так маскирует значения секретов).
> - Целевой путь `assets/` — относительный от FTP-home (того же, что
>   `server-dir: /` у action) → без неоднозначности абсолютного корня.
> - `protocol: ftp` у action = открытый FTP → `set ftp:ssl-allow false` форсит то
>   же у lftp (иначе lftp пытается AUTH TLS).

---

## Файл 2 — `components/ErrorBoundary.jsx` (самосброс loop-guard)

Вторичный баг: `garden_chunk_reloaded` ставится один раз за сессию вкладки и
никогда не сбрасывается → при втором деплое в той же долгой сессии guard уже
стоит → reload не срабатывает → красный экран. Делаем самосброс по времени.

**Было** (строки 18‑29):
```js
        if (isChunkLoadError) {
            reportClientError({
                message: 'ChunkLoadError → auto-reload',
                stack: error?.stack || msg,
                source: 'ErrorBoundary.chunkLoad',
            });
            // Защита от reload-loop
            if (!sessionStorage.getItem('garden_chunk_reloaded')) {
                sessionStorage.setItem('garden_chunk_reloaded', String(Date.now()));
                window.location.reload();
                return;
            }
        } else {
```

**Стало:**
```js
        if (isChunkLoadError) {
            reportClientError({
                message: 'ChunkLoadError → auto-reload',
                stack: error?.stack || msg,
                source: 'ErrorBoundary.chunkLoad',
            });
            // Защита от reload-loop с самосбросом по времени (INFRA-005):
            // свежая метка (< окна) = мы только что перезагрузились и снова упали
            // → это настоящая петля, не reload'им. Старая/отсутствующая метка =
            // новый деплой в той же долгой сессии → перезагружаемся и обновляем
            // метку. last=0 (нет метки) → now-0 заведомо > окна → reload.
            const RELOAD_GUARD_MS = 30000;
            const last = Number(sessionStorage.getItem('garden_chunk_reloaded')) || 0;
            const now = Date.now();
            if (now - last > RELOAD_GUARD_MS) {
                sessionStorage.setItem('garden_chunk_reloaded', String(now));
                window.location.reload();
                return;
            }
        } else {
```

> Окно 30 с: цикл reload→падение происходит за секунды (метка свежая → блок);
> новый деплой спустя минуты/дни → метка старая → reload. Это страховка, не
> замена главному фиксу — после additive-деплоя 404 не возникает и guard почти
> не срабатывает.

---

## Риски / на что смотреть

1. **Транзитивный первый деплой.** На сервере лежит state-файл action'а от
   clean-slate-эпохи. После добавления `exclude: assets/**` action перестаёт
   трекать `assets/` и не должен их удалять (excluded-пути игнорируются и в
   сравнении). Проверяем явно в чек-листе ниже (старый чанк → 200).
2. **Рост `assets/`.** Каталог теперь растёт. Ретенция (чистка старше ~30 д) —
   отдельной задачей потом, как договорились.
3. **lftp на раннере** не предустановлен → ставим apt-get'ом (≈ +10‑15 с к джобе).
4. **sw.js no-cache** — выкинут из scope (на проде nginx, не .htaccess; и после
   additive-фикса не нужен).

---

## ⚠️ Чек-лист первого деплоя (после применения)

- [ ] CI зелёный (включая новый lftp-шаг и smoke).
- [ ] Старый хеш-чанк, существовавший ДО этой выкладки, отдаёт **200** после неё
      (а не 404) — главный признак, что additive сработал и ничего не снесено.
- [ ] Новый чанк текущего билда залит и отдаёт 200.
- [ ] `goroscop/` и `trees/` на месте (action их не потерял).

---

## Статус

Изменения подготовлены, **не применены**. Жду 🟢 на применение
`deploy.yml` + `ErrorBoundary.jsx`.
