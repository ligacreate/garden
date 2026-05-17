# UX-батч: pushed

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-17
**В ответ на:** 🟢 PUSH от Ольги в чате
**Статус:** ✅ migration applied → ✅ commit pushed → ⏳ GH Actions деплоит.

---

## Финальный SHA

```
b8c2ab4297ff4ee510c216115a415635a7ca66a7
fix(ux-batch): PVL split status + meetings income required + Mastery width
2026-05-17 09:35:18 +0300
```

`git push origin main`:
```
   d8e56e9..b8c2ab4  main -> main
```

## Migration applied (re-cap)

```
NOTICE:  phase33 backfill: 11 completed meetings with NULL income will be set to 0
UPDATE 11
COMMIT
SELECT count(*) FROM meetings WHERE status='completed' AND income IS NULL;
→ 0
```

Все 11 старых completed-встреч получили `income=0`. Новая required-валидация не сломает их при следующем редактировании.

## GH Actions

- Все runs main: <https://github.com/ligacreate/garden/actions?query=branch%3Amain>
- Конкретный коммит: <https://github.com/ligacreate/garden/commit/b8c2ab4297ff4ee510c216115a415635a7ca66a7>

> `gh` CLI у меня без auth-token — статус run проверить из шелла не могу. Ольга, глянь по ссылке, что workflow «Deploy to FTP» зелёный (~2–5 мин на Vite build + FTP upload). Если красный — кинь логи фейла, починим.

## Smoke-чеклист (после deploy)

Из applied-doc [_52](2026-05-17_52_codeexec_ux_batch_applied.md), повторно:

1. **PVL ментор-дашборд** → студентка с pendingReview+inRevision → видны два pill «нужна проверка (N)» (амбер) + «ждём доработку (N)» (оранжевый).
2. **Закрытие встречи без income** → тост «Укажите доход (0 если бесплатная)», встреча не закрылась.
3. **Закрытие встречи с income=0** → сохраняется ОК.
4. **Редактирование старой completed-встречи** → income=0 в поле (бэкфилл сработал), можно поправить.
5. **Admin дашборд → Общий доход** → строка «по N из M встреч».
6. **Встречи → Мастерство** → визуально совпадает с Календарь.
   - Если НЕ совпадает → пришли скрин Календарь vs Мастерство с подсвеченным корневым div (DevTools → Elements → клик на корне), сделаю прицельный фикс.

## Что было сделано в этой сессии

- 3 UX-фикса по брифу [_49](2026-05-16_49_strategist_ux_batch.md) + архитектурные замечания связного.
- 1 миграция phase33 (бэкфилл, идемпотентная, применена на прод).
- 1 коммит `b8c2ab4` (4 кода + 1 миграция + 4 _session/-доки = 9 файлов, +802/-10).
- 0 нарушений правил: diff-on-review ✅, _session коммитим ✅, не трогал чужие deleted/untracked из других сессий ✅.

Сессия закрыта на моей стороне до результатов smoke. Если фикс ширины не сработает — отдельным заходом по скринам.
