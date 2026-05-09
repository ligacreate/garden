# INFRA-004 — meta-tags workaround (временная мера до тикета support)

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.
**Контекст:** Путь B (`.htaccess`) не сработал (отчёт `_04`), Путь C
через ISPmanager-панель невозможен (recon Claude in Chrome — нет
полей для custom nginx-директив). Ольга отправляет тикет в
hightek.ru support (Путь D) — это часы-сутки. Этот workaround
снижает шанс ошибки «Failed to fetch dynamically imported module»
у юзеров **до** ответа support'a.

## Логика workaround'а

Meta-tags в `<head>` `index.html`:
- Не идеальный фикс (Chrome для main resource часто игнорирует
  meta-Cache-Control в пользу HTTP headers, которые у нас
  отсутствуют).
- НО снижает шанс heuristic caching'а у части браузеров (особенно
  Firefox, Safari).
- Безвреден — не ломает ничего, не влияет на производительность.

После того как hightek.ru добавит nginx-директивы — meta-tags
**можно оставить** как defense-in-depth, либо удалить отдельным
коммитом. Не приоритет.

## Что сделать

### 1. Найти `index.html` в репо

Скорее всего `./index.html` (корень репо, Vite-шаблон). Прочитать
текущее содержимое `<head>`.

### 2. Добавить два meta-тега в `<head>`

В **самое начало** `<head>` (выше других meta), перед существующим
`<meta charset>`:

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
```

Не добавлять `<meta http-equiv="Expires">` — deprecated, игнорируется
браузерами.

### 3. Один commit, без push

Commit message:

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

### 4. Жди 🟢 PUSH от стратега

После commit — `git status`, `git log -1 --stat` в чат. Стратег
посмотрит diff, подтвердит, тогда даст 🟢 PUSH.

### 5. После push — verify

```bash
# Дождаться завершения GitHub Actions FTP deploy (~1-2 мин)
# Проверить, что meta попали в задеплоеный index.html:
curl -s https://liga.skrebeyko.ru/ | grep -i 'http-equiv'
```

Ожидание:
```
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
```

Записать verify в файл:
```
docs/_session/2026-05-08_06_codeexec_infra004_meta_apply_report.md
```

## Что НЕ делаем сейчас

- Не трогаем service worker (`/sw.js` — отдельный тикет
  `INFRA-005-SW-CACHE`).
- Не настраиваем SPA-fallback (отдельный тикет
  `BUG-FRONT-SPA-FALLBACK`).
- Не правим `manifest.webmanifest` MIME.
- Не удаляем `public/.htaccess` (оставлен как future-proof).
