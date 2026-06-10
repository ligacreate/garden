# 190 · codeexec → стратег · Seed-база по ролям (менторы 9500 / ведущие 5000)

## 1. TL;DR
Разовая выдача seed-базы на проде по ролям:
- `role='mentor'` + `status='active'` → **9500**
- `role='leader'` + `status='active'` → **5000**
- **NO-DOWNGRADE:** ставим только тем, у кого `seeds < целевого` (никому не понижаем).
- **suspended НЕ трогаем**, `applicant`/`intern` (участницы курса + стажёры) НЕ трогаем.

Параметры подтверждены Ольгой (9500/5000, пропустить suspended, only-if-less).
**Dry-run (BEGIN…ROLLBACK) прогнан** — `UPDATE 5` + `UPDATE 15` = **20 строк**, откат, прод не менялся.
Статус: **готово к apply, жду 🟢.** Это prod-write → без 🟢 не применяю.

## 2. Кого затрагивает (точный список из dry-run)

### Менторы → 9500 (5 active, все < 9500)
| Имя | Email | было → станет |
|---|---|---|
| Василина Лузина | vasilina_luzina@mail.ru | 75 → 9500 |
| Елена Федотова | tolstokulakova77@mail.ru | 290 → 9500 |
| Настин фиксик ⚠️ | zobyshka@gmail.com | 0 → 9500 |
| Наталья Гулякова | natalisuro2014@gmail.com | 315 → 9500 |
| Юлия Габрух | lyulya777@inbox.ru | 80 → 9500 |

### Ведущие → 5000 (15 active, все < 5000)
| Имя | Email | было → станет |
|---|---|---|
| Валерия Трошнева | klishevich-lera@mail.ru | 0 → 5000 |
| Екатерина Куропятникова | ekaterinakonst@gmail.com | 255 → 5000 |
| Елена Аксенова | little.veine@gmail.com | 0 → 5000 |
| Елена Кокорина | helen.kokorina@yandex.ru | 175 → 5000 |
| Елена Соковнина | sokov2004@mail.ru | 0 → 5000 |
| Ирина Чиненова | ichinenova2013@gmail.com | 0 → 5000 |
| Марина Ладыженская | marina.ladyzhenskaya@yandex.ru | 300 → 5000 |
| Мария Бардина | mb1@bk.ru | 425 → 5000 |
| Мария Дегожская | manna17@mail.ru | 0 → 5000 |
| Мария Романова | masha152@yahoo.com | 35 → 5000 |
| Оксана Витовская | ksanagermany@yandex.ru | 50 → 5000 |
| Ольга Бородина | nazarushkin@mail.ru | 120 → 5000 |
| Ольга Пограницкая | olyala2006@gmail.com | 150 → 5000 |
| Ольга Пономарева | olya.ponomareva27@mail.ru | 485 → 5000 |
| Шилова Мария | maria.shilova@inbox.ru | 135 → 5000 |

## 3. Что НЕ трогаем
- **suspended:** 2 ментора (Анна Минаева, Колотилова Светлана) + 4 ведущие
  (Odeta Suldiakova 275, Елена Колкова, Елена Мельникова 680, Юлия Абдурахманова 80) — пропущены.
  ⚠️ У Мельниковой 680 > 5000 не будет (она suspended → вообще не в выборке; даже была бы active —
  no-downgrade оставил бы 680).
- **applicant (16)** + **intern (14)** — участницы курса и стажёры, не трогаем.
- **admin (3)** — не в задаче.

## 4. SQL (apply-версия — `/tmp/apply_seed_base_189.sql`, на реальном прогоне COMMIT вместо ROLLBACK)
```sql
BEGIN;
UPDATE public.profiles SET seeds = 9500
WHERE role = 'mentor' AND status = 'active' AND COALESCE(seeds,0) < 9500;   -- 5 rows
UPDATE public.profiles SET seeds = 5000
WHERE role = 'leader' AND status = 'active' AND COALESCE(seeds,0) < 5000;   -- 15 rows
COMMIT;
```

## 5. Флаги на подтверждение
1. **⚠️ «Настин фиксик» (zobyshka@gmail.com)** — active mentor, имя похоже на тестовый аккаунт.
   По текущим параметрам ему ставится **9500**. Если это тест — назови, исключу
   (`AND email <> 'zobyshka@gmail.com'`). По умолчанию включён.
2. Подтверждаю: «действующие ведущие» = `leader`. `intern` (стажёры) не входят.

## 6. Edge / безопасность
- Транзакция BEGIN/COMMIT — атомарно, при ошибке откат.
- NO-DOWNGRADE через `COALESCE(seeds,0) < target` — повторный прогон идемпотентен
  (второй раз 0 строк, т.к. уже = target).
- Dry-run уже доказал ровно 20 затронутых строк, никаких лишних ролей/статусов.

## 7. Apply-порядок (после 🟢)
1. Заменить в `/tmp/apply_seed_base_189.sql` финальный `ROLLBACK;` на `COMMIT;`
   (и раскомментировать COMMIT) — либо прогнать чистый apply-SQL из §4.
2. Один SSH-коннект (fail2ban): `ssh root@5.129.251.56 ... psql -f - < apply.sql`.
3. Verify: `SELECT role,status,count(*),min(seeds),max(seeds) FROM profiles WHERE role IN ('mentor','leader') AND status='active' GROUP BY 1,2;`
   ожидаем mentor active min=max=9500 (5), leader active min=max=5000 (15).
4. Записать `docs/journal/MIGRATION_2026-06-10_seed_base_by_roles.md` (что/кому/значения).
5. Отчёт в `_session/NN_codeexec_*_applied.md`.

## 8. ВАЖНО
Это **необратимый prod-write** (хоть и идемпотентный). Применяю **только после явного 🟢**
от стратега. Сейчас прод НЕ изменён (был только dry-run с ROLLBACK).
