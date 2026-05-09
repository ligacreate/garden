# INFRA-004 — recon nginx + план фикса cache-headers

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

## Задача

Зафиксировать cache-headers для frontend Garden (nginx на 185.215.4.44),
чтобы каждый deploy не ломал PVL-учительскую у юзеров с кэшем.
Реальное проявление было 2026-05-07: Failed to fetch dynamically
imported module → старый chunk hash.

Стандарт фикса:
- `index.html` → `Cache-Control: no-cache` (или эквивалент через
  `add_header` + `expires off`).
- `/assets/*` → `Cache-Control: public, immutable, max-age=31536000`
  (assets с хэшем в имени, безопасно кэшировать год).
- Остальные локации не трогать.

Read-only ssh + план в файл. **НЕ apply, НЕ reload nginx.**

## Шаги

### 1. Найти nginx-конфиг для liga.skrebeyko.ru

```bash
ssh root@185.215.4.44 "find /etc/nginx -type f \( -name '*.conf' -o -name 'liga*' \) 2>/dev/null && echo '---' && ls -la /etc/nginx/sites-enabled/ 2>/dev/null && echo '---' && ls -la /etc/nginx/conf.d/ 2>/dev/null"
```

### 2. Прочитать релевантный server-блок

```bash
ssh root@185.215.4.44 "grep -l 'liga.skrebeyko.ru\|server_name' /etc/nginx/sites-available/* /etc/nginx/conf.d/* 2>/dev/null | head -5"
ssh root@185.215.4.44 "cat <найденный_файл>"
```

### 3. Понять структуру webroot

Откуда отдаётся index.html, где /assets/. Это нужно, чтобы location
блоки были точные.

```bash
ssh root@185.215.4.44 "ls -la <webroot>/ | head"
ssh root@185.215.4.44 "ls -la <webroot>/assets/ | head"
```

### 4. Проверить текущие Cache-Control headers (через curl)

```bash
curl -sI https://liga.skrebeyko.ru/ | grep -i 'cache-control\|expires\|etag\|last-modified'
curl -sI https://liga.skrebeyko.ru/assets/index-3qncH8UD.js | grep -i 'cache-control\|expires\|etag\|last-modified'
```

(Hash bundle'а от вчерашнего deploy — может смениться, тогда новый
обнаружишь через `curl https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'`.)

### 5. Подготовить точный diff для nginx-конфига

Положить план в файл:

```
docs/_session/2026-05-08_02_codeexec_infra004_plan.md
```

Структура:

- **Section 1:** Текущий nginx-конфиг — релевантный server-блок целиком
  как есть. Цитата.
- **Section 2:** Предлагаемый diff. Минимальный — только добавить два
  location блока (или модифицировать существующие, если есть). Не
  переписывать конфиг целиком, не трогать SSL/server_name/прочее.
- **Section 3:** Команда reload nginx после apply:
  - `nginx -t` (тест синтаксиса)
  - `systemctl reload nginx` (если systemd) ИЛИ `nginx -s reload`.
- **Section 4:** Verify-блок — curl до и после. Ожидаемые Cache-Control
  для index.html и для /assets/*.
- **Section 5:** Rollback — как вернуть оригинальный конфиг (backup
  файла перед изменением + тот же reload).

## Открытые вопросы (если возникнут на recon'е)

Если найдёшь что-то нестандартное:
- Несколько server-блоков для liga.skrebeyko.ru → стратег решит,
  какой основной.
- Уже есть Cache-Control в конфиге (просто неправильный) → diff будет
  заменой, не добавлением.
- nginx-конфиг через Timeweb-панель (не доступен через ssh-edit) →
  стоп, сообщить, придётся менять через Timeweb UI или их support.

## НЕ делаем сейчас

- Apply (`nginx -s reload`).
- Backup-копию делать **в момент apply**, не сейчас.
- Editing файлов — не редактировать ничего на сервере. Только read.

После твоего отчёта стратег ревьюит, даёт 🟢 на apply.
