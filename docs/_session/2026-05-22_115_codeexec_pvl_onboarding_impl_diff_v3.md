# phase37 v3 — diff на ревью + verify A

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** «verify post-delete tatrusi + diff v3»
**Тип:** Verify-результаты + diff v3. **Без apply.** Жду 🟢.

---

## TL;DR

- ✅ tatrusi удалена чисто: `profiles=0, users_auth=0`. Audit-log запись от `admin_delete_user_full` создана (actor = Ольга).
- ⚠ **Ожидание брифа «orphans_now = 1» расходится с реальностью**: фактически **14** (= 13 interns + 1 applicant Суроватская). Скорее всего бриф имел в виду **post-apply V3** (после backfill 13 → останется только Суроватская = 1). До apply 14 — это правильно.
- ✅ Diff v3 готов: ровно одна цифра в Section 7 (`<> 14 → <> 13`) + блок «v3» в шапке + sync RAISE NOTICE текста. Больше ничего не менялось.
- ⚠ Одно замечание для ревью: V2 \echo сейчас говорит «ожидание: 29 = 15 + 14», после v3 будет 28 = 15 + 13. Не правила — нужен ли micro-edit или оставить так?

---

## 1. Verify A (post-delete tatrusi)

### 1.1 Цифры

```sql
SELECT count(*) AS profiles_count FROM profiles WHERE email='tatrusi@mail.ru';
-- 0  ✅ (ожидание 0)

SELECT count(*) AS users_auth_count FROM users_auth WHERE id='2234ead5-93e9-43cb-b988-c98fc97db8b7';
-- 0  ✅ (ожидание 0)

SELECT count(*) AS orphans_now
  FROM profiles p LEFT JOIN pvl_students ps ON ps.id = p.id
 WHERE p.role IN ('applicant','intern') AND ps.id IS NULL;
-- 14  ⚠ (бриф ожидал 1 — см. § 1.3)
```

### 1.2 Audit-log от UI delete

```
id        | d881b845-35fc-4835-a7af-0caa4bb164ac
actor     | 85dbefda-ba8f-4c60-9f22-b3a7acd45b21   ← Ольга
action    | admin_delete_user_full
entity    | profile / 2234ead5-93e9-43cb-b988-c98fc97db8b7
summary   | Admin hard-deleted user profile
created   | 2026-05-23 18:50:52.645708+03
```

RPC отработала штатно через UI-кнопку. Audit-trail сохранён.

### 1.3 Про расхождение «orphans_now = 14 vs ожидание 1»

В брифе: `SELECT … WHERE role IN ('applicant','intern') … Ожидание: 0, 0, 1`.

Реально orphans_now = 14, и это **корректно**:
- 13 интернов без pvl_students row (которых ещё не было — backfill их подхватит в Section 7).
- 1 applicant — Суроватская (pending_approval, ждёт явного одобрения от Ольги; trigger её подхватит после approve).
- tatrusi из этих 14 исключена (удалена).

Скорее всего «1» в брифе имелось в виду для **V3 после миграции apply'нем**: backfill вставит 13 → останется только Суроватская. Это совпадает с тем, что V3 в верифай-блоке всегда писало: «ожидание: 1 — Суроватская, pending_approval».

Полный список 14 текущих orphan'ов:

| email | role | access_status | в backfill? |
|-------|------|---------------|-------------|
| asurovatskaya26@gmail.com | applicant | pending_approval | НЕТ (ждёт одобрения, trigger создаст потом) |
| anastskoro@gmail.com | intern | active | да |
| bondarenko.lightlin@gmail.com | intern | active | да |
| e.yaroschuk@gmail.com | intern | active | да |
| I.am.yaroslava@mail.ru | intern | active | да |
| ivashova.0@yandex.ru | intern | active | да |
| kulish-inn@yandex.ru | intern | active | да |
| muza_skorpi@mail.ru | intern | active | да |
| natali228@ya.ru | intern | active | да |
| nbazhenova@mail.ru | intern | active | да |
| ru.traibl@gmail.com | intern | active | да |
| ruxshana_89@mail.ru | intern | active | да |
| soboleva.yanna@yandex.ru | intern | active | да |
| zakirovas2008@rambler.ru | intern | active | да |

13 интернов в backfill scope ✓ — assertion `<> 13` пройдёт.

**Если бриф действительно ожидал orphans = 1 ДО apply — это означает, что я что-то не так понимаю про скоп интернов.** Тогда STOP, спроси меня. Иначе — apply.

---

## 2. Diff v3 (что изменилось в [migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql](../../migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql))

### 2.1 Шапка — добавлен блок «v3»

После блока «v2» добавлено:

```
-- v3 (2026-05-23) — tatrusi exclusion + assertion поправка (см. _113, _114):
--   Apply v2 упал в Section 7 на backfill assertion: ожидалось 14
--   intern-orphans, найдено 13. Расследование (_113) показало — это
--   была моя ошибка в _108 recon (написала «1 applicant + 14 intern
--   + 18 leader = 33», на самом деле было «2 applicant + 13 intern +
--   18 leader = 33»; sum сошёлся, разбивка нет). Реально интернов
--   всегда было 13.
--   Параллельно Ольга решила удалить второго applicant'а tatrusi@mail.ru
--   (Таня Волошанина, applicant/paused_manual — случайный залёт, не
--   из ПВЛ потока). Удалена через UI → RPC admin_delete_user_full
--   до этого apply (verified _115: profiles/users_auth = 0,
--   audit-log entry создан). Tatrusi не входила в backfill scope
--   (role='applicant', не intern), на цифру 13 не влияет.
--   v3 правка: ровно одна цифра в Section 7 assertion: <> 14 → <> 13
--   + RAISE NOTICE message актуален.
--   V3 после COMMIT ожидает 1 orphan (только Суроватская — applicant
--   pending_approval, ждёт явного одобрения; backfill её не цепляет).
```

### 2.2 Section 7 — assertion + NOTICE

```sql
-- было:
IF v_inserted <> 14 THEN
    RAISE EXCEPTION 'phase37 backfill abort: ожидалось 14 intern-orphan строк, найдено %. _108 audit рассинхронизировался с проднутым состоянием — пере-проверить руками перед apply.', ...
RAISE NOTICE 'phase37 backfill: вставлено % rows для interns', v_inserted;

-- стало:
IF v_inserted <> 13 THEN
    RAISE EXCEPTION 'phase37 backfill abort: ожидалось 13 intern-orphan строк, найдено %. Состояние проднутой БД рассинхронизировалось с _113/_115 verify — пере-проверить руками перед apply.', ...
RAISE NOTICE 'phase37 backfill: вставлено % rows для interns (ожидалось 13)', v_inserted;
```

Цифра 14 → 13. Сообщение про источник правды обновлено (`_108` → `_113/_115`).

### 2.3 Что НЕ менялось

- Sections 1a, 1b, 2, 3, 4, 5, 6, 8 — без изменений.
- VERIFY V0, V1, V3, V4, V5, V6, V7, V8 — без изменений.
- **V2 \echo (см. § 3 ниже) — НЕ тронула** по инструкции «больше ничего не менять».
- 8 `IF NOT EXISTS` / `DROP IF EXISTS` гарды — без изменений.

---

## 3. ⚠ Замечание для ревью: V2 \echo сейчас врёт

Строка 346 миграции:
```
\echo === V2: pvl_students count (ожидание: 29 = 15 + 14) ===
```

После apply v3 реально будет `pvl_students count = 28 = 15 + 13`. Echo-комментарий говорит 29 — несоответствие. SELECT под echo'м показывает реальное число (28), но текст комментария фиктивный.

**Не правила** строго по инструкции «больше ничего не менять». На ревью реши:
- **A:** оставить как есть. Несоответствие в \echo, но SELECT прав → читающий вывод увидит 28 и поймёт «echo врёт, факт 28».
- **B:** разрешить micro-edit `29 → 28` и `+ 14 → + 13`. Один doc-fix, не меняющий логику. Cleaner вывод.

Я бы рекомендовала **B** — это арифметика следствия из assertion change, не product decision. Но решаешь ты.

(V3 \echo «ожидание: 1 — Суроватская» — **остаётся правильным** в обоих случаях, не менялось.)

---

## 4. Что я НЕ сделала

- ❌ Не apply.
- ❌ Не commit / push.
- ❌ Не тронула V2 \echo (по инструкции).
- ❌ Не тронула никаких других файлов.

---

## 5. Шаг apply (после твоего 🟢)

То же что в `_109` workflow:
1. scp /tmp/, psql -v ON_ERROR_STOP=1 -f
2. Verify V0..V8 идёт автоматически в выводе того же psql
3. Ожидания:
   - V0: 3 строки, has_updated_at = t
   - V2: 28 (= 15 + 13, не 29 — см. § 3)
   - V3: 1 строка (Суроватская)
   - V4..V8: как в `_109` (FK / trigger / cohort / grants)
4. Если pre-check / backfill assertion / V0 / любая другая ассерт-абоминация — STOP без retry, отчёт.

---

## 6. Эффорт

- Verify A SQL + парсинг + audit-log проверка: ~3 мин
- Edit миграции (header + assertion + NOTICE): ~5 мин
- _115 отчёт: ~12 мин

Итого ~20 мин.
