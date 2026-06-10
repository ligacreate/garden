# MIGRATION 2026-06-10 · Seed-база по ролям (менторы 9500 / ведущие 5000)

**Тип:** разовый data-write на проде (не схема). Применено напрямую через psql.
**Кто:** codeexec, по 🟢 Ольги (сессии _189 recon → _190 diff → apply).
**Откат:** значения «до» — см. таблицу ниже (для ручного восстановления при надобности).

## Что сделано
Разовая выдача seed-базы действующим участницам по ролям:
- `role='mentor'` + `status='active'` → **9500** (кроме `zobyshka@gmail.com` — тестовый, исключён).
- `role='leader'` + `status='active'` → **5000**.
- **NO-DOWNGRADE:** только тем, у кого `seeds < целевого` (повторный прогон идемпотентен).
- НЕ затронуты: `suspended`, `applicant` (16), `intern` (14), `admin` (3).

## SQL (применённый, COMMIT)
```sql
UPDATE public.profiles SET seeds = 9500
WHERE role='mentor' AND status='active' AND email <> 'zobyshka@gmail.com' AND COALESCE(seeds,0) < 9500;  -- 4 rows
UPDATE public.profiles SET seeds = 5000
WHERE role='leader' AND status='active' AND COALESCE(seeds,0) < 5000;  -- 15 rows
```

## Результат: UPDATE 4 + UPDATE 15 = 19 строк

### Менторы → 9500 (4)
| Имя | Email | было → стало |
|---|---|---|
| Василина Лузина | vasilina_luzina@mail.ru | 75 → 9500 |
| Елена Федотова | tolstokulakova77@mail.ru | 290 → 9500 |
| Наталья Гулякова | natalisuro2014@gmail.com | 315 → 9500 |
| Юлия Габрух | lyulya777@inbox.ru | 80 → 9500 |
| _Настин фиксик_ | zobyshka@gmail.com | 0 → 0 (исключён) |

### Ведущие → 5000 (15)
| Имя | Email | было → стало |
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

## Verify (post-apply)
`mentor active`: cnt=5, min=0, max=9500 (min=0 — zobyshka).
`leader active`: cnt=15, min=5000, max=9500 → факт min=max=5000.

## Заметки
- Идемпотентно: повторный прогон даст 0 строк (все active уже = target).
- suspended ведущие с высоким seeds (Мельникова 680) не понижены — они вне выборки.
