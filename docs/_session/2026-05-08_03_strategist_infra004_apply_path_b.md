# INFRA-004 — apply Путь B (`.htaccess` через FTP-deploy)

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_02_codeexec_infra004_plan.md`](2026-05-08_02_codeexec_infra004_plan.md)
выбран Путь B (Ольга 🟢 2026-05-08).

## Логика

`.htaccess` через FTP-deploy → reproducible, в git, автоматически
накатывается. Если хостинг поддерживает `.htaccess` поверх nginx —
работает. Если не поддерживает — Путь C (Ольга через Timeweb-панель).
**Risk нулевой**: если не сработает, ничего не ломается, просто
игнорируется.

## Шаги

### 1. Создать `public/.htaccess`

Vite автоматически копирует `public/*` в `dist/` без хэширования и
прочих преобразований. FTP-deploy-action возьмёт `dist/` целиком
и положит на сервер.

Контент `.htaccess` — спецификация ниже. Подбери точные regex'ы под
реальный bundle layout (`ls dist/assets/` после билда → паттерн
имён). Базовые требования:

#### Обязательно

1. **Тестовый header** для проверки «.htaccess подхватился» отдельно
   от cache-control логики:
   ```apache
   <IfModule mod_headers.c>
       Header set X-Htaccess-Active "yes"
   </IfModule>
   ```
2. **Все `.html` → `Cache-Control: no-cache`** (минимум `index.html`,
   но проще через FilesMatch на расширении):
   ```apache
   <FilesMatch "\.html$">
       <IfModule mod_headers.c>
           Header set Cache-Control "no-cache"
       </IfModule>
   </FilesMatch>
   ```
3. **Hashed assets → `Cache-Control: public, immutable, max-age=31536000`.**
   Vite кладёт в `dist/assets/` файлы вида `index-XXXXXXXX.js` /
   `index-XXXXXXXX.css` (хэш в имени = безопасно кэшировать на год).
   Подбери regex точно по реальным именам в `dist/assets/`.

#### Опционально (side-fix, на твоё усмотрение)

- `/sw.js` → `no-cache` (для быстрого раската фиксов SW). Можно
  включить или оставить на следующий заход. Если включаешь — отдельным
  `<FilesMatch "^sw\.js$">` блоком.

#### НЕ включать

- SPA-fallback (`Rewrite` rules для `index.html`) — это другой тикет
  (`BUG-FRONT-SPA-FALLBACK`), не in scope.
- `manifest.webmanifest` MIME — тоже отдельный тикет.

### 2. Commit + push (запускает FTP-deploy)

Один commit, простое сообщение:

```
infra: cache-headers через .htaccess (INFRA-004)

index.html → no-cache, /assets/* hashed → immutable, max-age=31536000.
Test header X-Htaccess-Active для проверки, что .htaccess подхватился
на хостинге Timeweb (shared, без SSH-доступа). Если не поддерживается
.htaccess — переключаемся на Путь C (Timeweb-панель).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Push в main → GitHub Actions FTP-deploy запустится автоматически.

### 3. Дождаться завершения deploy

Обычно 1-2 минуты. Можно через `gh run list` или просто подождать
+ curl.

### 4. Verify через curl

```bash
# 1. Тестовый header — это решающий сигнал
curl -sI https://liga.skrebeyko.ru/ | grep -i 'x-htaccess-active'
# ожидание: X-Htaccess-Active: yes
# Если пусто → .htaccess не работает на этом хостинге, СТОП и переключение.

# 2. Cache-Control для index.html
curl -sI https://liga.skrebeyko.ru/ | grep -i cache-control
# ожидание: Cache-Control: no-cache

# 3. Cache-Control для bundle (вытащить актуальный bundle hash)
ASSET=$(curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "Found asset: $ASSET"
curl -sI "https://liga.skrebeyko.ru/$ASSET" | grep -i cache-control
# ожидание: Cache-Control: public, immutable, max-age=31536000
```

### 5. Записать отчёт в файл

Положи отчёт в:
```
docs/_session/2026-05-08_04_codeexec_infra004_apply_report.md
```

Структура:
- Section 1: содержимое создаваемого `public/.htaccess` (полностью).
- Section 2: commit hash + push результат + ссылка на GitHub Actions
  run.
- Section 3: verify curl до и после (raw output).
- Section 4: вывод — работает / не работает.
- Section 5: если **не работает** — что предлагаем (Путь C).

## Сценарии исхода

### Сценарий A: `.htaccess` работает

`X-Htaccess-Active: yes` появился, `Cache-Control: no-cache` на
index.html, `immutable, max-age=31536000` на /assets/.
**INFRA-004 закрыт.** Стратег обновит BACKLOG.

### Сценарий B: `.htaccess` не работает

`X-Htaccess-Active` отсутствует. Хостинг — чистый nginx без Apache-
проксирования. Тогда:
- **Не откатывать** `public/.htaccess` сразу — пусть лежит,
  безвреден (просто игнорируется на чистом nginx).
- Стратегу — переключаемся на Путь C.

### Сценарий C: что-то сломалось

`.htaccess` подхватился, но возвращает 500 / странные headers / сайт
ломается. Откат: следующий commit удаляет `public/.htaccess`, push,
deploy.

## Что НЕ делаем

- Не редактируем `dist/` напрямую — Vite его пересобирает каждый
  билд, изменения слетят. Только `public/.htaccess`.
- Не правим vite.config.js (Vite сам копирует public).
- Не подключаем SPA-fallback / SW-fix / manifest-MIME — отдельные
  тикеты.

## Готов идти

После твоего отчёта стратег обновит BACKLOG: либо INFRA-004 → DONE,
либо переключение на Путь C. Apply закрыт твоим уровнем (commit/push
+ verify) — стратег только ревьюит результат.
