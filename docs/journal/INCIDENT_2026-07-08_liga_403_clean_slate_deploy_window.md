# INCIDENT 2026-07-08 — liga.skrebeyko.ru 403 во время деплоя (clean-slate window)

## Симптом
~17:08 UTC `https://liga.skrebeyko.ru/` отдавал **403 nginx** всем. Утром был 200. Совпало с FTP-деплоями Diff #3/#4.

## Сырые факты (собраны 17:10–17:17 UTC)
- `/` → 403, `/index.html` → **404** (файла нет в вебруте). 403 = nginx без index-файла.
- CI **#3 (28960408588)** — `build-and-deploy: success`.
- CI **#4 (28960706750)** — на момент 403 шаг **«Deploy via FTP» in_progress ~9 мин**.
- `.github/workflows/deploy.yml`: `SamKirkland/FTP-Deploy-Action@v4.3.5`, `server-dir: /` (= `/www/liga.skrebeyko.ru`), **`dangerous-clean-slate: true`**.

## Корневая причина
`dangerous-clean-slate: true` **удаляет весь вебрут ПЕРЕД загрузкой**. Пока идёт FTP-аплоад Diff #4 (clean-slate перезаливает ВСЕ ассеты целиком, не инкрементом → долго), index.html отсутствует → nginx 403/404. Это **штатное окно даунтайма деплоя**, не порча прав/владельца и не «залилось не туда».

## Разрешение
Не вмешивался в идущий аплоад (прерывание посреди clean-slate → хуже). Дождался завершения.
- **17:16:56 UTC index.html → 200**, `/` → 200.
- Целостность бандла подтверждена: `index-OZEXs7w0.js` → 200, `index-nX9og09f.css` → 200, `sw.js` → 200.
- CI **#4 — conclusion: success**.
Итого downtime ≈ 17:0x–17:17 UTC (окно clean-slate + аплоад полного бандла).

## Что проверить в будущем / follow-up
- **Mid-deploy 403 на liga = ожидаемо**, пока `dangerous-clean-slate` включён. Не паниковать: сверить, идёт ли `Deploy via FTP` шаг; дождаться или перезапустить джоб.
- **Два деплоя подряд (#3→#4) = два окна даунтайма.** Батчить деплои, не пушить фичи по одной (перекликается с backlog-батчами).
- **Фикс (предложить Ольге, diff-on-review):** уйти на атомарный деплой — заливать в temp-папку и swap (rename), либо `dangerous-clean-slate: false` + ретенция старых чанков (prefetch-шаг уже есть). Тогда index.html никогда не пропадает.
- FTP-кредов локально нет (GH-секреты) → ручная перезаливка отсюда невозможна; рычаг восстановления = `gh run rerun <deploy-job>`.
