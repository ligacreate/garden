# Recon доп-1.1 — Аудит 29 строк `pvl_students` Потока 1

**Адресат:** стратег (claude.ai) через Ольгу.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-26.
**Режим:** read-only psql под `gen_user` + чтение исходников. Никаких изменений.
**Источник задачи:** расхождение в [_129](2026-05-25_129_codeexec_recon_pvl_student_page.md) §7.1 — Ольга
знает 14 реальных менти Поток 1, БД отдаёт 29.

---

## TL;DR

- **29 = 14 реальных + 1 real-новая + 1 only-approved + 13 orphan-interns.**
- Расхождение **полностью объясняется миграцией phase37** от 2026-05-23
  ([`migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql`](../../migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql)),
  которая в Section 7 **bulk-backfill'нула 13 уже одобренных interns** в
  `pvl_students` ради формирования FK-контракта (см.
  [_118](2026-05-22_118_codeexec_pvl_onboarding_smoke_surovatskaya.md):
  «29 = 28 после phase37 backfill + 1 Суроватская через trigger»).
- **«Hidden»-механизма на уровне БД НЕТ.** `garden_hidden_user_ids` —
  это **localStorage**-флаг в браузере админа ([App.jsx:14, 28, 39](../../App.jsx)),
  не серверная видимость. Не помогает отсеять интернов из выборки на проде.
- Для §5 ТЗ Этапа 1 (peer-список «моя когорта») критично **выбрать
  фильтр**: одного `cohort_id='Поток 1'` мало — нужна доп-условие
  `EXISTS submissions` или whitelist по списку, иначе peer увидит 28
  «коллег по потоку», 13 из которых на самом деле Garden-стажёрки и
  даже не открывали курс.

---

## Полная таблица 29 строк (классификация)

Отсортировано по `created_at`. UUID сокращён до 8 символов.

| # | id | ФИО | email | role | profile_status | pvl_status | mentor | submissions | created_at | **вывод** |
|---|----|-----|-------|------|---------------|------------|--------|-------------|------------|-----------|
| 1 | `1085e06d…` | Настина фея | viktorovna7286@gmail.com | applicant | active | active | ✅ | 5 | 2026-04-17 01:37 | **real** |
| 2 | `746c80bc…` | Ольга Садовникова | olgasadovnik@list.ru | applicant | active | active | ✅ | 4 | 2026-04-17 16:20 | **real** |
| 3 | `0e978b3b…` | Диана Зернова | di_mbox@yahoo.com | applicant | active | active | ✅ | 8 | 2026-04-17 16:20 | **real** |
| 4 | `a2356b84…` | Александра Титова | sasha-adv@yandex.ru | applicant | active | active | ✅ | 7 | 2026-04-17 16:20 | **real** |
| 5 | `d128a7a3…` | Марина Шульга | marinazibina29@yandex.ru | applicant | active | active | ✅ | 2 | 2026-04-17 16:20 | **real** |
| 6 | `5aa62776…` | Елена Курдюкова | курдюкова | applicant | active | active | ✅ | 7 | 2026-04-17 16:20 | **real** ⚠ email невалиден |
| 7 | `2f7abb9c…` | Наталья Махнёва | ptashik@yandex.ru | applicant | active | active | ✅ | 4 | 2026-04-17 16:20 | **real** |
| 8 | `35019374…` | Ирина Петруня | panda399@rambler.ru | applicant | active | active | ✅ | 7 | 2026-04-17 16:20 | **real** |
| 9 | `d302b93d…` | Лилия Мaлонг | malaglilia@gmail.com | applicant | active | active | ✅ | 6 | 2026-04-17 16:20 | **real** |
| 10 | `9fb65c2a…` | Анжелика Тарасова | an_tar@mail.ru | applicant | active | active | ✅ | 7 | 2026-04-17 16:20 | **real** |
| 11 | `8ed14494…` | Дарья Зотова | dashazotova92@gmail.com | applicant | active | active | ✅ | 5 | 2026-04-17 16:20 | **real** |
| 12 | `629ffb8c…` | Ольга Коняхина | okoniakhina@gmail.com | applicant | active | active | ✅ | 5 | 2026-04-17 16:20 | **real** |
| 13 | `147aea39…` | Дарья Старостина | darystarosta@gmail.com | applicant | active | active | ✅ | 7 | 2026-04-17 19:37 | **real** |
| 14 | `b90d5f86…` | Вероника Лютова | vg.kuznec@yandex.ru | applicant | active | active | ✅ | 3 | 2026-04-22 18:47 | **real** |
| 15 | `90c9b7c7…` | Ольга Разжигаева | razzhigvzhik@mail.ru | applicant | active | **applicant** | ✅ | 5 | 2026-05-19 10:41 | **real-new** ⚠ status не обновлён |
| 16 | `27d87d8b…` | Яна Соболева | soboleva.yanna@yandex.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 17 | `0acb4b95…` | Елена Бондаренко | bondarenko.lightlin@gmail.com | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 18 | `6d260793…` | Баженова Наталья | nbazhenova@mail.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 19 | `d427f212…` | Юлия Громова | muza_skorpi@mail.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 20 | `dbbdb716…` | Татьяна Рогова | ru.traibl@gmail.com | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 21 | `789b6955…` | Ярослава Шайтанова | I.am.yaroslava@mail.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 22 | `3ae56fd2…` | Ольга Ивашова | ivashova.0@yandex.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 23 | `4250ffac…` | Анастасия Ван | anastskoro@gmail.com | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 24 | `f8799e7a…` | Инна Кулиш | kulish-inn@yandex.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 25 | `b34b18bf…` | Наталья Ильиных | natali228@ya.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 26 | `f1233488…` | Екатерина Ярощук | e.yaroschuk@gmail.com | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 27 | `401ad7f9…` | Рухшана | ruxshana_89@mail.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 28 | `63f48d80…` | Светлана Исламова | zakirovas2008@rambler.ru | intern | active | active | ❌ | 0 | 2026-05-23 18:59 | **orphan** (phase37 backfill) |
| 29 | `e5343d9d…` | Александа | asurovatskaya26@gmail.com | applicant | active | active | ❌ | 0 | 2026-05-23 19:14 | **stale** (only-approved) ⚠ имя обрезано |

---

## Что произошло: история 29 строк

### Слой 1: 14 реальных менти (April 17–22)

Строки 1–14. **Seed-импорт когорты Поток 1.** Группа из 11 человек создана
в один тик `2026-04-17 16:20:38.245909+03` + ещё 3 рядом (Настина фея 01:37,
Дарья Старостина 19:37, Вероника Лютова 22.04).

- Все 14 имеют `role='applicant'` (так и должно быть по дизайн-решению
  phase37: applicant'ки во время курса; leader получают после финала).
- Все 14 имеют ментора в `pvl_garden_mentor_links` (5 менторов × 1–4 менти,
  см. _129 §7.2).
- Все 14 имеют 2–8 submissions — активные участницы.
- `updated_at = 2026-05-07 17:46:32.761478+03` у первых 13 — это след
  миграции [`data/2026-05-07_pvl_students_cohort_backfill.sql`](../../migrations/data/2026-05-07_pvl_students_cohort_backfill.sql)
  (бэкфилл `cohort_id`). У 14-й (Лютова) тот же штамп.

**Это и есть «14 менти Поток 1» по знанию Ольги.** ✅

### Слой 2: +1 real-new (May 19)

Строка 15 — **Ольга Разжигаева** (`90c9b7c7…`, applicant role).

- Создана 2026-05-19 — отдельно от seed.
- ✅ Есть ментор, ✅ 5 submissions — **реально проходит курс**.
- ⚠ `pvl_status='applicant'` (не `'active'`) — единственная такая строка
  во всей выборке. Это означает, что её включили после первичного
  seed'а, а статус никто не нормализовал. На UI «active» vs «applicant»
  означает «в потоке vs приглашённый»; здесь pvl_status расходится с
  реальностью.

**Вывод:** настоящая участница, **status расходится с фактом**.
Возможный fix-вопрос для админа: проверить, нужен ли UPDATE `pvl_status='active'`.

### Слой 3: 13 orphan-interns (May 23 18:59)

Строки 16–28. **Bulk-backfill phase37 в Section 7 миграции
[`2026-05-23_phase37_pvl_onboarding_atomic.sql`](../../migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql).**

Из заголовка миграции:
> Backfill: ровно 14 уже одобренных interns. Applicant Суроватская
> (1, pending_approval) — НЕ backfill'им, ждёт явного одобрения от
> Ольги → trigger её подхватит.

(Реально интернов было 13 — см. v3-комментарий миграции и
[_113 audit](2026-05-22_113_codeexec_pvl_onboarding_applied.md).)

**Что это:** Garden-интерны (вторая ступень роли в Саду, между
applicant и leader). Они **проходили предыдущие курсы ПВЛ** и сейчас
ведут собственные практикумы/завтраки в Саду. К Потоку 1 текущего курса
**отношения не имеют** — это были чужие, но миграция phase37 им
по-новому открыла `pvl_students` row, чтобы ON INSERT trigger на
`pvl_homework_submissions` не падал FK violation, **если** кто-то из них
вдруг что-то отправит.

Проверка через breakfast-расписание Garden (`pvl_calendar_events`,
`event_type='breakfast'`): **6 из 13** имеют свои breakfast-слоты как
ведущие («Яна Соболева — Ближе к себе», «Елена Бондаренко — Моя
невероятная жизнь», «Инна Кулиш — Мой год / Не идеальна», «Юлия Громова
— Яркая, как свет», «Рухшана — …»). Это **точно действующие Garden-leader'ки,
не Поток-1-менти**.

**Почему cohort_id = Поток 1, если они не Поток-1-менти:** trigger
phase37 резолвит cohort по `CURRENT_DATE` через `pvl_cohorts.start_date /
end_date`. На 2026-05-23 активная когорта = Поток 1 (15.04–01.07.2026),
поэтому всех 13 попавших в backfill свезло именно туда.

**Вывод:** **Это side-effect миграции, не намерение продукта**. Они
не должны попадать в peer-список Поток 1. В §5 ТЗ Этапа 1 фильтр
должен их отсекать.

### Слой 4: +1 stale only-approved (May 23 19:14)

Строка 29 — **Александа** = Александра Сурова́тская (`e5343d9d…`,
`asurovatskaya26@gmail.com`).

- Создана через **AFTER-INSERT trigger phase37**, когда Ольга одобрила
  её через админ-UI 2026-05-23 19:14 ([_118](2026-05-22_118_codeexec_pvl_onboarding_smoke_surovatskaya.md)
  — smoke trigger'а зафиксирован: «trigger сработал на одобрении Суроватской»).
- ✅ pvl_students row создан, ❌ ментор не назначен, ❌ submissions = 0.
- ⚠ Имя в `profiles.name = 'Александа'` (без «р») — typo при регистрации,
  не исправлено. Реальное имя — Александра Сурова́тская (см. email).

**Вывод:** **реальная участница**, только что одобренная админом, ещё
не привязана к ментору и не начала ДЗ. По §5 «peer-список» она формально
real-Поток-1, но **bootstrap не завершён** — без ментора. UI должен это
переварить (см. _129 §7.3, «13–14 менти без ментора»).

---

## Сводка по классификации

| Класс | Кол-во | Описание | Что делать в ТЗ Этапа 1 |
|-------|--------|----------|--------------------------|
| **real** | 14 | Seed Поток 1 (April), активные участницы, mentor+submissions | основная аудитория peer-фичи |
| **real-new** | 1 | Разжигаева, активная, добавлена позже, `pvl_status` ≠ active | включать; уточнить нужен ли UPDATE статуса |
| **stale** | 1 | Суроватская, только что одобрена, ещё без ментора и submissions | включать, но UI обрабатывает «нет ментора» |
| **orphan** | 13 | phase37 backfill: Garden-leader'ки, не Поток-1-менти | **исключать** из peer-выборки |
| **итого** | **29** | | |

Ольгины 14 = слой 1 (real). Если расширять до «всех кто реально учится
на Потоке 1 сейчас» = слой 1+2+4 = **16**.

---

## Hidden / soft-hide в БД — есть?

### Краткий ответ: **нет, на уровне БД нет**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('profiles','pvl_students')
  AND (column_name LIKE '%hidden%' OR column_name LIKE '%hide%'
    OR column_name LIKE '%test%' OR column_name LIKE '%deleted%'
    OR column_name LIKE '%archived%');
-- → 0 rows
```

Ни `profiles`, ни `pvl_students` не имеют колонок `hidden / is_test /
is_deleted / archived`. Soft-delete на стороне БД не реализован.

### Где живёт «глазик» (скрытие в Саду)

[`App.jsx:14, 28–47, 470–473, 521`](../../App.jsx):

```js
const HIDDEN_GARDEN_USERS_KEY = 'garden_hidden_user_ids';
const [hiddenGardenUserIds, setHiddenGardenUserIds] = useState(() => {
    try {
        const raw = JSON.parse(localStorage.getItem(HIDDEN_GARDEN_USERS_KEY) || '[]');
        ...
    }
});
const isHiddenInGarden = (userId) => hiddenGardenUserIds.includes(String(userId));
```

- Это **localStorage** (не БД, не серверный синк).
- Per-browser, per-admin (другой админ в другом браузере увидит всех).
- Применяется только к фильтрации `MapView` (карта Сада ведущих) —
  `App.jsx:473: return !isHiddenInGarden(u.id);` в `mergedUsers`.
- Не применяется к PVL, к админскому списку «Ученицы», к BFF, к
  payloads PostgREST.
- **Для peer-фичи бесполезен:** другой менти, открывая страницу «коллег
  по потоку», hidden-флаги Ольги не увидит.

### Близкий смысл — `profiles.access_status`

Из CHECK constraint: `IN ('active', 'paused_expired', 'paused_manual', 'pending_approval')`.

- `pending_approval` — режим «зарегистрировалась, ждёт одобрения админом»,
  используется до момента approve-trigger phase37.
- `paused_*` — приостановленный доступ (закончилась подписка / админ
  снял вручную). Не «скрыта», но «не может зайти».

Для отсева orphan'ов на ТЗ Этапа 1 это **не помогает** — у всех 29
`access_status='active'`.

### Что предложить вместо hidden-флага

В _129 я предлагал peer-фильтр на основе `cohort_id`. На фактических
данных этого мало. Варианты для §5 ТЗ Этапа 1:

1. **Whitelist по `EXISTS submissions`** — peer видит только тех, кто
   уже сдавал ДЗ. Простой, отсеивает все 13 orphan'ов автоматически.
   Минусы: Суроватская и Разжигаева увидят друг друга только когда обе
   что-то сдадут; новые менти «невидимы» до первого ДЗ.
2. **Whitelist по `p.role`** — peer видит только `applicant`'ов с
   `cohort_id=мой`. На текущих данных = 16 (real + new + stale). Отсекает
   13 интернов чисто. Минусы: на будущих когортах если у кого-то
   изменится role (например, applicant→leader после фи́ни́ша), peer
   автоматически выпадет — обычно это и нужно.
3. **Явный whitelist через новый флаг** `pvl_students.is_active_in_cohort
   boolean DEFAULT true` + бэкфилл всех текущих 29 в `false`/`true`
   руками. Самый явный, но требует ручной работы для каждой когорты.
4. **Filter в `is_pvl_cohort_peer(uuid)`** (см. _129 §2.2):

   ```sql
   SELECT EXISTS (
     SELECT 1
     FROM pvl_students me
     JOIN pvl_students them ON me.cohort_id = them.cohort_id
     WHERE me.id = auth.uid()
       AND them.id = target_student
       AND me.cohort_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM profiles p
                   WHERE p.id = me.id AND p.role = 'applicant')
       AND EXISTS (SELECT 1 FROM profiles p
                   WHERE p.id = them.id AND p.role = 'applicant')
   );
   ```

   Комбинирует подход (2) и кладёт фильтр в один SECURITY DEFINER —
   peer'ы через RLS никогда не получат orphan'ов.

**Рекомендую вариант 4** (`role='applicant'` в helper'е) — это естественно
ложится в архитектуру и переживёт все будущие phase-миграции.

---

## Side-обнаружения (не критично, но в копилку)

1. **`Елена Курдюкова`** (#6) — `profiles.email = 'курдюкова'`. Не валиден,
   на момент регистрации поле email не было защищено по формату. Не блокирует
   логин (auth ходит по `users_auth`, не по profiles.email), но в выгрузке
   FEAT-016 эта строка выглядит странно.
2. **`Александа`** (#29) — `profiles.name = 'Александа'`, потеря буквы «р».
   Из [_118:78](2026-05-22_118_codeexec_pvl_onboarding_smoke_surovatskaya.md):
   «Поправить через админ-UI: открыть профиль → перезаписать name».
   До сих пор не поправлено (3 дня).
3. **`pvl_students.full_name`** заполнен у всех 29 и **совпадает** с
   `profiles.name`. Денормализация: при rename `profiles.name`
   `pvl_students.full_name` не обновится (триггер phase37 только AFTER
   INSERT, не AFTER UPDATE). Не блокер для Этапа 1, но иметь в виду в
   ТЗ — UI peer-страницы должен брать `name` из `profiles`, не из
   `pvl_students` (single source of truth).
4. **`pvl_status='applicant'`** только у одной строки (Разжигаева).
   Все остальные 28 имеют `pvl_status='active'`. Это значит после phase37
   trigger ставит `'active'` сразу — Разжигаева создавалась до phase37
   (May 19), отдельным манипуляция; никто не подравнял.

---

## Что я НЕ делал (read-only)

- Не апдейтил `pvl_status` Разжигаевой.
- Не правил `profiles.name` Суроватской.
- Не удалял 13 orphan-interns (это решение продуктовое; phase37 specifically
  оставила их в БД для FK-контракта).
- Не коммитил ничего.

---

**Готово к ревью.** Ключевое для ТЗ Этапа 1:
- Peer-выборка должна фильтровать по `p.role='applicant'` (вариант 4 выше),
  иначе peer Поток-1 увидит 28 «коллег», 13 из которых — Garden-leader'ки.
- Hidden-механизма на сервере нет; полагаться на localStorage Ольги нельзя.
