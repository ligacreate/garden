# FEAT-023 Phase 1 — apply BLOCKED by pre-check assertion

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Ответ на:** [2026-05-16_33_strategist_phase31_v2_green.md](2026-05-16_33_strategist_phase31_v2_green.md)
**Дата:** 2026-05-16
**Статус:** **APPLY ROLLED BACK by design.** Pre-check assertion нашёл 2 paused_manual профиля → BEGIN→ERROR→ROLLBACK. На проде ничего не изменилось. Нужно твоё решение перед re-apply.

---

## TL;DR

1. Apply прошёл атомарно до шага 1 (pre-check) — там `RAISE EXCEPTION`, транзакция откатилась. На проде ни CHECK, ни bridge, ни helper, ни guards, ни RPC **не созданы**. Файл миграции на проде остался в `/tmp/`.
2. Pre-check нашёл **2 non-admin профиля с `access_status='paused_manual'`** — это не баг данных, это валидное бизнес-состояние (кого-то админ намеренно поставил на паузу). updated_at у обоих NULL (туч-триггера нет), в pvl_audit_log следов нет — историю поставить не могу.
3. Текущее распределение: `active=54, paused_manual=2`. Всё чисто, никаких сюрпризов вроде `pending_approval`.
4. **Парадокс assertion:** именно для этих 2 юзеров guards и нужны. Сейчас они через PostgREST имеют read-доступ ко всему (т.к. phase21 не применилась), хотя по бизнес-логике пауза = доступ закрыт. Apply phase31 устранит эту утечку. Моё «защитное» assertion парадоксально мешает закрыть существующую дыру.
5. **Самостоятельно НЕ меняю миграцию** (правило diff-on-review). Нужно твоё решение по одному из 3 путей в §3.

---

## 1. Что произошло

### 1.1 Команды

```
scp migrations/2026-05-16_phase31_pending_approval_access.sql root@5.129.251.56:/tmp/  → OK (16496 байт)
ssh root@5.129.251.56 'psql -v ON_ERROR_STOP=1 -f /tmp/...sql'
```

### 1.2 Вывод

```
BEGIN
psql:/tmp/2026-05-16_phase31_pending_approval_access.sql:77: ERROR:
  phase31 pre-check FAIL: 2 non-admin profiles have access_status != active.
  RESTRICTIVE guards would lock them out. Investigate before apply.
CONTEXT:  PL/pgSQL function inline_code_block line 10 at RAISE
```

`ON_ERROR_STOP=1` + `BEGIN`-блок в файле → транзакция откачена, COMMIT не достигнут. VERIFY (V1–V13) **не выполнен** — он идёт после COMMIT, миграция до него не дошла.

### 1.3 Состояние прода СЕЙЧАС (подтверждено отдельным запросом)

```
 access_status | count
---------------+-------
 active        |    54
 paused_manual |     2
```

Pending_approval отсутствует. CHECK-constraint остался старым (без pending_approval). Guards не созданы. Helper не создан. RPC не создана.

### 1.4 Кто эти 2 юзера

```
                  id                  |      email      |       name       |   role    | access_status |  status   | paid_until | subscription_status | auto_pause_exempt
--------------------------------------+-----------------+------------------+-----------+---------------+-----------+------------+---------------------+-------------------
 2234ead5-93e9-43cb-b988-c98fc97db8b7 | tatrusi@mail.ru | Таня Волошанина  | applicant | paused_manual | suspended |            | active              | f
 0b2c96cc-9b2a-496a-b5b9-0c7ef87b151f | mb1@bk.ru       | Мария Бардина    | leader    | paused_manual | suspended |            | active              | f
```

- `paused_manual` — ручная админская пауза (не подписочная expired).
- `status='suspended'` — bridge уже сработал когда-то при выставлении access_status.
- `subscription_status='active'` — формально подписка не отозвана, но access закрыт вручную.
- `paid_until=NULL`, `auto_pause_exempt=false` — обычные платящие юзеры на ручной паузе.
- В `pvl_audit_log` следов нет, `profiles.updated_at` NULL — кто и когда поставил, неизвестно (возможно вручную через psql или старым кодом до аудита).

---

## 2. Анализ

### 2.1 Это **не аномалия**

`paused_manual` — валидное значение из CHECK-констрейнта phase29. Кто-то намеренно решил отозвать у этих юзеров доступ. Состояние корректное.

### 2.2 Но прямо сейчас на проде **активная утечка**

Эти 2 юзера, имея валидный JWT (от своего account'а), могут идти в PostgREST и читать всё, что им разрешают permissive policies. Никакая phase21-restrictive проверка их не блокирует — потому что guards не существуют. То есть `paused_manual` сейчас де-факто = `paused_but_still_has_data_access`. Это та же утечка, что для pending'ов — оба сидят без бизнес-доступа, но имеют тех-доступ.

### 2.3 Моё assertion слишком консервативно

Я закладывал защиту от ошибки типа «случайно админ запустил phase31 в момент когда 100 active юзеров internalно были в bad state». Но **`paused_*` — не bad state**, это **именно то, для чего guards и были задизайнены**. Pre-check должен ловить **аномалии** (например, профиль с `access_status='broken_string'` — но CHECK не пустит такое), а не легитимные `paused`.

Правильная логика pre-check (если оставлять её вообще):
- Заваливать миграцию только при значениях, которые **никогда не должны были существовать до миграции** (например, ровно `pending_approval` уже в БД — это значит кто-то побежал впереди миграции).
- Не заваливать на `paused_expired/paused_manual` — это и есть design intent.

---

## 3. Три пути вперёд — выбирай

### Путь A: ослабить pre-check, re-apply (рекомендую)

Поменять §1 миграции — fail'ить только на значениях вне ожидаемого набора. Версия assertion:

```sql
DO $$
DECLARE
    v_unexpected int;
BEGIN
    SELECT count(*) INTO v_unexpected
    FROM public.profiles
    WHERE access_status IS NOT NULL
      AND access_status NOT IN ('active', 'paused_expired', 'paused_manual');
    IF v_unexpected <> 0 THEN
        RAISE EXCEPTION
          'phase31 pre-check FAIL: % profiles have unexpected access_status (not in active|paused_expired|paused_manual). Investigate before apply.',
          v_unexpected USING ERRCODE = '22023';
    END IF;
    RAISE NOTICE 'phase31 pre-check OK. paused_manual=% paused_expired=%',
      (SELECT count(*) FROM public.profiles WHERE access_status='paused_manual'),
      (SELECT count(*) FROM public.profiles WHERE access_status='paused_expired');
END $$;
```

**Эффект на 2 paused_manual:** после apply guards оба юзера потеряют PostgREST-доступ (то, что и должно было быть с FEAT-015 Path C). Их push-server-логика не меняется (`isManualPaused` уже учитывается там), фронт у них при попытке логина уйдёт в `SubscriptionExpiredScreen` или подобный. **Это business-correct поведение, и фактически устраняет существующую (но незамеченную) утечку**.

**Рекомендация:** Путь A.

### Путь B: вручную поднять 2 юзеров в active перед apply

Если ты считаешь, что эти 2 юзера должны иметь доступ (т.е. их paused_manual был ошибочный) — UPDATE их обратно в active отдельной командой, потом re-apply без правки assertion. Решение бизнесовое, ты ближе к контексту.

```sql
-- ТОЛЬКО ЕСЛИ Ольга подтвердит что pause был ошибкой:
UPDATE public.profiles SET access_status='active'
 WHERE id IN ('2234ead5-93e9-43cb-b988-c98fc97db8b7',
              '0b2c96cc-9b2a-496a-b5b9-0c7ef87b151f');
```

После этого assertion пройдёт. Но я не рекомендую — paused_manual это явное решение, и снимать его «чтобы миграция прошла» = ломать чужое решение.

### Путь C: оставить assertion как есть, отложить FEAT-023

Если ты вообще не хочешь сейчас закрывать guard'ом 2 paused_manual юзеров (например, «они должны видеть свои meetings и архив») — Phase 1 откладывается до отдельной дискуссии «что делает paused_manual». FEAT-023 в этом случае требует переходить на Вариант A (новая роль `pending`), который не зависит от access_status. Большая переделка.

Не рекомендую — это саботаж security-цели FEAT-023, и существующая утечка остаётся открытой.

---

## 4. Что от тебя нужно

1. **Решение A/B/C** по §3.
2. Если A — 🟢 на новую версию assertion (показана в §3 Путь A). Я создаю v3 миграции (только §1 шаг отличается от утверждённой v2), повторно apply.
3. Если B — конкретное «да, подними этих 2 юзеров в active», я делаю UPDATE и re-apply v2 без правки.
4. Если C — обсуждение, переход на Вариант A.

---

## 5. Сопутствующее

### 5.1 Локальный файл миграции

`migrations/2026-05-16_phase31_pending_approval_access.sql` создан (та v2-версия, которую ты утвердила). При Пути A — перепишу `§1` (pre-check assertion). При B — оставляю как есть.

### 5.2 На проде

- `/tmp/2026-05-16_phase31_pending_approval_access.sql` — лежит, можно затереть при re-apply. Сейчас никакой нагрузки не создаёт.
- БД — без изменений.
- garden-auth/push-server — не трогал.

### 5.3 По уроку

После того как Phase 1 закроется (через A или B), запишу `docs/lessons/2026-05-XX-phase31-pre-check-too-strict.md` с этой ситуацией: «pre-check assertion должен ловить аномалии (значения вне домена), а не легитимные deferred-состояния».

### 5.4 Lesson на будущее по profiles.updated_at

У `profiles` нет `touch_updated_at`-триггера (либо есть и не работает на этих 2 записях). Сейчас невозможно ответить «когда юзеру отменили доступ». Это отдельный наблюдательный долг — можно завести BACKLOG-item на `trg_touch_profiles_updated_at`. Не для FEAT-023 — отдельно.

---

## 6. Что НЕ сделано (потому что миграция rollback)

- V1–V13 не выполнены (нет COMMIT'а проверять).
- Post-deploy smoke (test user + admin JWT) не запускался.
- garden-auth/push-server не правились.
- Файл миграции из локального репо НЕ закоммичен (стандартно по правилу: коммитим после успешного apply).

После твоего решения по §3 — продолжаю.
