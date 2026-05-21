# BUG-PVL-SLOW-MATERIALS-LOAD — decisions

**От:** Ольга (продуктовое решение)
**Через:** codeexec (фиксация)
**Дата:** 2026-05-20 ночь
**В ответ на:** [_98](2026-05-20_98_codeexec_pvl_slow_load_recon.md)
(4 open questions)
**Статус:** Decisions only. **Fix утром** — отдельным брифом от
стратега.

---

## Ответы на 4 open questions

### Q1 — Preview-as-first-student или preview-as-new-applicant?

**Решение:** Оставляем **first-student** (админ хочет видеть реальное
состояние курса с настоящими данными, а не пустой stub).

**НО** + два UX-улучшения:
1. **Header «Вы видите курс как ученица: ИМЯ»** — поверх existing
   `StudentPage` в admin preview mode.
2. **Никогда не показывать stub-fallback** пользователю — пока
   `syncPvlActorsFromGarden` не finished, показываем **loader
   «загружается предпросмотр»** вместо пустого курса.

Это закрывает **главный** баг (race condition с
`ensurePvlPreviewStudentProfile` fallback).

→ **`BUG-PVL-SLOW-MATERIALS-LOAD`** (новый P1 тикет, fix утром).

### Q2 — `getAdminProgressSummary` RPC — что внутри?

**Решение:** оторвано от текущего бага. Отдельный P3 recon-тикет.

→ **`PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC`** (P3, не сейчас).
codeexec позже сделает `EXPLAIN ANALYZE` под `gen_user` и положит
результат.

### Q3 — Кэшировать AdminPvlProgress dashboard?

**Решение:** Да, **3-5 сек cache TTL** — компромисс между свежестью
и UX. Переключение табов внутри окна — instant; повторное открытие
через минуту — свежий fetch.

Часть scope основного **`BUG-PVL-SLOW-MATERIALS-LOAD`** тикета (P1).

### Q4 — Включить Caddy access log?

**Решение:** Да, ~10 минут. Config-change на VPS Bittern (Caddyfile +
restart), **не** frontend deploy. Безопасно, отдельным маленьким
тикетом.

→ **`OBS-001-CADDY-ACCESS-LOG`** (P3).

---

## Что дальше

1. **Сегодня вечером:** этот `_99` + backlog-коммит (3 новых
   тикета). Никакого apply. **Четвёртый natural verify paths-ignore.**
2. **Утром:** стратег пишет конкретный fix-бриф `_100..` для
   `BUG-PVL-SLOW-MATERIALS-LOAD` (P0 sub-scope из _98 §8: header +
   loader + 3-5s SWR cache на AdminPvlProgress). codeexec apply
   двухшаговый (diff `_101` → 🟢 → applied `_102`).
3. Side: `OBS-001-CADDY-ACCESS-LOG` — может в тот же утренний батч,
   может отдельно (10 мин, low risk).
