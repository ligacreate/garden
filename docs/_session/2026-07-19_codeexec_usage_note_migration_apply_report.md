# usage_note — миграция + фил id 26 — apply report

**Дата:** 2026-07-19
**Автор:** codeexec (VS Code)
**Адресат:** стратег (claude.ai) / Ольга
**Тип:** DDL + data (DB-only, до фронта — как sharing_prompt)
**Статус:** ✅ ПРИМЕНЕНО на прод (🟢 «вариант 1»)

## Что сделано (одно ssh-подключение, fail2ban-safe)
1. **Миграция** `migrations/2026-07-19_scenarios_usage_note.sql` — `ADD COLUMN IF NOT EXISTS usage_note text` на `public.scenarios`. Зеркало sharing_prompt: idempotent, DO-guard на существование колонки, `ensure_garden_grants()` в конце транзакции (RUNBOOK 1.3 — Timeweb GRANT-wipe после DDL).
2. **Data** `migrations/data/2026-07-19_scenario_26_usage_note.sql` — `usage_note` для id 26 «День больших планов на бумаге» (Ольга Скребейко).

## Сырой вывод apply
```
BEGIN
ALTER TABLE
DO
NOTICE:  usage_note: OK — колонка scenarios.usage_note на месте
 ensure_garden_grants (1 row)
COMMIT
BEGIN
UPDATE 1        ← id 26
COMMIT
```

## Verify (отдельное чистое подключение)
| Проверка | Результат |
|---|---|
| Колонка | `usage_note | text | nullable YES` ✅ |
| id 26 usage_note | «Эту механику можно смело брать и проводить полностью по моему сценарию — добавляй свои фирменные фишечки, опыт и истории.» ✅ |
| id 26 author_name | Ольга Скребейко ✅ |
| Прочие is_public с note | 0 (только id 26) ✅ |
| GRANT counts (auth/anon) | 171 / 0 |

## ⚠️ Наблюдение по GRANT (не блокер)
`anon`-грантов на `public.*` теперь **0** (в старой памяти было 158/4 от 2026-05-07). Это НЕ регресс от моей DDL: `ensure_garden_grants()` — канонический источник грантов проекта — отработал, `auth` вырос 158→171 (добавились таблицы), а `anon`-table-grants по текущей схеме = 0. Идентичная миграция sharing_prompt (2026-07-18) отработала так же, прод жив (логин/автокик активны). Если стратег хочет — отдельной read-only recon глянуть определение `ensure_garden_grants()` по anon; сам не трогаю.

## Слои / фронт
`getPublicScenarios()` = `select:'*'` → `usage_note` уже приезжает в объектах сценариев без правок сериализатора. Рендер (карточка + просмотр) — в отдельном фронт-диффе, ждёт 🟢, катим одним окном с инфоблоком.
