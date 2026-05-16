# BUG-001 — edge case найден на smoke, не закрыт полностью

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Контекст:** Claude in Chrome прогнал smoke по 3 сценариям, нашёл расхождение.

---

## Что показал smoke

Сценарии 2 и 3 — ✅ работают идеально (per-student partial + recovery).

**Сценарий 1 — `pvl_faq_items` blocked — расхождение:**

| Методика блокировки | Учительская | Console | TG alert |
|---|---|---|---|
| `fetch` override → `Promise.resolve(new Response('[]', {status: 200}))` (empty array) | ✅ Студенты видны | ✅ `[PVL loadRuntimeSnapshot] pvl_faq_items failed` | ✅ partial alert |
| `fetch` override → `Promise.reject(new Error('blocked'))` (network error) | ❌ **Зависает на «Загрузка учениц…»** 15+ сек | ✅ `[PVL loadRuntimeSnapshot] pvl_faq_items failed` | ✅ partial alert |

**Console и TG alert одинаковые** в обоих случаях. То есть `loadRuntimeSnapshot` + `syncPvlRuntimeFromDb` корректно классифицируют partial degradation. Разница где-то **downstream** — после возврата из `syncPvlRuntimeFromDb`.

## Гипотезы

1. **Downstream-код в `PvlPrototypeApp` или `pvlMockApi`** читает кэш и где-то делает `.something()` на undefined, который при `200 []` инициализируется пустым массивом (нормально), а при rejected — остаётся undefined (и крашит цепочку).
2. **Promise chain в init-sequence** — после `syncPvlRuntimeFromDb` идёт следующий шаг (например, гидратация студентов / ментор-линков), который ждёт какого-то поля из snapshot. Если поле undefined из-за rejected — следующий шаг ждёт forever.
3. **React state setter** — компонент UI делает `setLoading(false)` в `.then()`, а не в `.finally()`. Если что-то throw'нуло в chain — setLoading(false) не вызывается.

## Что нужно проверить

1. Найди где именно зовётся `syncPvlRuntimeFromDb` (в `views/PvlPrototypeApp.jsx` или `services/pvlMockApi.js`). Покажи как обрабатывается её результат.
2. После `syncPvlRuntimeFromDb` идёт следующий шаг — `syncPvlActorsFromGarden`? `syncTrackerAndHomeworkFromDb`? Покажи цепочку.
3. Где компонент устанавливает `loading=false` для «Загрузка учениц…» — в `.then()`, `.finally()`, или через отдельный механизм?
4. Что возвращает `loadRuntimeSnapshot` при rejected vs при 200 []? Может в одном случае поле = `[]`, в другом — `undefined`?

## Вероятный фикс

Скорее всего нужно **обеспечить дефолтное значение** при rejected — чтобы любой downstream код видел `[]` вместо `undefined`. Например:

```javascript
const results = await Promise.allSettled([...]);
const data = {
  faq_items: results[0].status === 'fulfilled' ? results[0].value : [],
  // ... остальное
};
```

Если уже так — копаем дальше в downstream.

Также проверь `loading=false` в `finally()` для каждой загрузочной операции.

## Что не нужно

Не закрывай BUG-001 как DONE — пока не пофиксим. Также не пиши урок — он будет ложный «закрыли всё», а мы не закрыли.

## Дополнительный сигнал

В TG alert значится `user: anon`. Хотя Ольга залогинена как admin. Возможно это тот же `BUG-PVL-SYNC-FAILED-TO-FETCH` (JWT silent fallback) — Claude in Chrome через `fetch` override + logout/login мог затоптать JWT. Уточнить — стоит ли «anon» относить к этому багу или к новому. Не блокирует анализ.

## Ответ

Положи recon в `docs/_session/2026-05-16_23_codeexec_bug001_edge_recon.md`.
