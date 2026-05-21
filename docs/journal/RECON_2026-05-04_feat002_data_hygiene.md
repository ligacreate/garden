---
title: FEAT-002 — гигиена данных перед миграцией phase 22 (VK-контакт)
date: 2026-05-04
type: recon
related:
  - plans/BACKLOG.md (FEAT-002)
  - migrations/10_add_profile_telegram.sql
audience: стратег (claude.ai) для построчного решения по чистке
---

# Гигиена данных FEAT-002 — что лежит в `profiles.telegram` и `meetings.payment_link`

Read-only выборки на проде (2026-05-04). Никаких UPDATE/INSERT/DELETE.
Колонка «наблюдение» — лишь подсказки для решения, не предложения
действий. Итоговую чистку (UPDATE по строкам) делает стратег после
этого отчёта.

## TL;DR

| Выборка | Размер | Кратко |
|---|---|---|
| **A** — `telegram` нестандарт («other») | **10** | 6 = email подставили вместо TG; 1 = только имя; 1 = TG-ссылка с ведущим пробелом; 1 = `t.me/...` без протокола; **1 = VK-ссылка в TG-поле** (Светлана Исламова) |
| **B** — `@username` + голый username | **7** | Все валидные, резолвятся в браузере. **1 composite** — Инна Кулиш `@Inna_Kulish      https://vk.me/...` (TG+VK в одном поле) |
| **C** — пустой `telegram` | **17** | 7 leaders + 3 mentor + 1 intern + 6 applicants + 1 suspended |
| **D** — `payment_link`, не равный `telegram` владельца и не TG-ссылка | **17** | 4 VK (Инна Кулиш ×2, Светлана Колотилова, Юлия Громова) + 13 «other» |

Также подсвечены побочные находки в данных, не связанные с FEAT-002 напрямую (см. конец документа).

---

## A. 10 «other»-значений `profiles.telegram`

Фильтр: `telegram` не пустой, не `^https?://(t\.me|telegram\.me|web\.telegram\.org)/`, не `^@…`, не голый идентификатор.

| profile_id | name | email | role | len | raw `telegram` | visible (·=пробел, ⇥=tab) | наблюдение |
|---|---|---|---|---|---|---|---|
| `a2356b84…d01d` | Александра Титова | sasha-adv@yandex.ru | applicant | 19 | `sasha-adv@yandex.ru` | `sasha-adv@yandex.ru` | **email в TG-поле** (= собственный email профиля) |
| `6cf385c3…bac7` | Василина Лузина | vasilina_luzina@mail.ru | mentor | 23 | `vasilina_luzina@mail.ru` | `vasilina_luzina@mail.ru` | **email в TG-поле** (= собственный email) |
| `1924217f…f2c8` | Елена Кокорина | helen.kokorina@yandex.ru | leader | 28 | ` https://t.me/helen_kokorina` | `·https://t.me/helen_kokorina` | **TG-ссылка с ведущим пробелом** |
| `d302b93d…fa15` | Лилия Мaлонг | malaglilia@gmail.com | applicant | 20 | `malaglilia@gmail.com` | `malaglilia@gmail.com` | **email в TG-поле** (= собственный email) |
| `d128a7a3…9837` | Марина Шульга | marinazibina29@yandex.ru | applicant | 19 | `t.me/MarinaShulga87` | `t.me/MarinaShulga87` | **TG-ссылка без протокола** (`t.me/...`) |
| `1b10d2ef…8751` | Настин фиксик | zobyshka@gmail.com | mentor | 18 | `zobyshka@gmail.com` | `zobyshka@gmail.com` | **email в TG-поле** (= собственный email) |
| `1085e06d…c43f` | Настина фея | viktorovna7286@gmail.com | applicant | 18 | `olga@skrebeyko.com` | `olga@skrebeyko.com` | **email в TG-поле, причём НЕ свой** (стоит олин email) |
| `746c80bc…11f` | Ольга Садовникова | olgasadovnik@list.ru | applicant | 5 | `Ольга` | `Ольга` | Просто имя, не контакт |
| `63f48d80…9228` | Светлана Исламова | zakirovas2008@rambler.ru | intern | 31 | `https://vk.com/psigraf_swetlana` | `https://vk.com/psigraf_swetlana` | **VK-ссылка в TG-поле** → кандидат на перенос в новое поле `vk` |
| `4a661537…c9d2` | Шилова Мария | maria.shilova@inbox.ru | leader | 22 | `maria.shilova@inbox.ru` | `maria.shilova@inbox.ru` | **email в TG-поле** (= собственный email) |

---

## B. `@username` (6) + голый username (1)

| profile_id | name | email | role | raw | формат | suggested canonical |
|---|---|---|---|---|---|---|
| `9fb65c2a…b881` | Анжелика Тарасова | an_tar@mail.ru | applicant | `@AngelikaTara` | at_username | `https://t.me/AngelikaTara` |
| `6d260793…1231` | Баженова Наталья | nbazhenova@mail.ru | intern | `@Nataly300570` | at_username | `https://t.me/Nataly300570` |
| `147aea39…e84be` | Дарья Старостина | darystarosta@gmail.com | applicant | `@dasha_starosta` | at_username | `https://t.me/dasha_starosta` |
| `5aa62776…35c6` | Елена Курдюкова | курдюкова | applicant | `@ElenaKurdyukova` | at_username | `https://t.me/ElenaKurdyukova` |
| `f8799e7a…1cf0` | **Инна Кулиш** | kulish-inn@yandex.ru | intern | `@Inna_Kulish      https://vk.me/psiholog_kulish` | at_username | `https://t.me/Inna_Kulish      https://vk.me/psiholog_kulish` ⚠ **composite TG+VK** |
| `3ae56fd2…0bf6` | Ольга Ивашова | ivashova.0@yandex.ru | intern | `@Olga_Ivashova` | at_username | `https://t.me/Olga_Ivashova` |
| `35019374…9769` | Ирина Петруня | panda399@rambler.ru | applicant | `irinavitt_p` | bare_username | `https://t.me/irinavitt_p` |

Наблюдение: все 6 `@xxx` форматов резолвятся в браузере как `t.me/xxx` — сами по себе работают. Решение «нормализовать или нет» — UX/консистентность, не функциональность. Особый кейс — Инна Кулиш: TG-handle и VK-ссылка слились в одно поле через несколько пробелов; при FEAT-002 это **композит**, который придётся расцепить.

---

## C. 17 ведущих с пустым `profiles.telegram`

| profile_id | name | email | role | status | join_date |
|---|---|---|---|---|---|
| `1431f70e…c759` | LIlia MALONG | `malaglilia@gmail,com` ⚠ | applicant | active | – |
| `b90d5f86…c401` | Вероника Лютова | vg.kuznec@yandex.ru | applicant | active | – |
| `0e978b3b…bb65` | Диана Зернова | di_mbox@yahoo.com | applicant | active | – |
| `037603f7…32fa` | Лена Ф | `https://t.me/fedotova_elen` ⚠ (это в поле email) | applicant | active | – |
| `2f7abb9c…d5b78` | Наталья Махнёва | ptashik@yandex.ru | applicant | active | – |
| `3746da91…3dae6` | Рита | gatikoeva.rv@gmail.com | applicant | active | – |
| `f1233488…4718` | Екатерина Ярощук | e.yaroschuk@gmail.com | intern | active | – |
| `4d774d19…ee2a1` | Валерия Трошнева | klishevich-lera@mail.ru | leader | active | – |
| `011fc1cc…57e7` | Елена Колкова | vek129@rambler.ru | leader | active | – |
| `fd3a3ab0…55b8f3` | Елена Соковнина | sokov2004@mail.ru | leader | active | – |
| `d27cd649…6492` | Мария Дегожская | manna17@mail.ru | leader | active | – |
| `58b74756…1f79` | Мария Романова | masha152@yahoo.com | leader | active | 2024-10-25 |
| `308b6130…001f` | Оксана Витовская | ksanagermany@yandex.ru | leader | active | 2023-12-26 |
| `ffc69734…a93f` | Ольга Бородина | nazarushkin@mail.ru | leader | active | 2021-01-06 |
| `96e8052b…327cd` | Анна Минаева | happy7anny@gmail.com | mentor | **suspended** | – |
| `df6d3afc…1c5b…b6c5d9` | Колотилова Светлана Николаевна | kolotilovasvetlana@gmail.com | mentor | active | 2023-03-17 |
| `628585ef…5c839` | Наталья Гулякова | natalisuro2014@gmail.com | mentor | active | 2019-10-01 |

Наблюдение: 1 suspended (Анна Минаева) — про неё писать не надо, всё равно на паузе. Остальные 16 — кандидаты на «попроси заполнить TG через UI».

---

## D. 17 `meetings.payment_link`, не равных `telegram` владельца и не TG-ссылка

Разбивка по эвристикам: **4 VK** + **13 other** (`prodamus`/`yookassa`/`boosty`/`patreon`/`google.com/forms`/`instagram` в выборке **не нашлись** — 0 строк в этих группах).

### D.1. VK-ссылки в `payment_link` (4)

| meeting_id | host_name | host_email | meeting_date | meeting_title | payment_link | наблюдение |
|---|---|---|---|---|---|---|
| 211 | Инна Кулиш | kulish-inn@yandex.ru | 2026-04-04 | Мне поздно быть идеальной | `https://vk.me/psiholog_kulish` | VK-личка → кандидат на новое поле `host_vk` (или подцепить из `profiles.vk` после миграции) |
| 212 | Инна Кулиш | kulish-inn@yandex.ru | 2026-04-05 | Мне поздно быть идеальной | `https://vk.me/psiholog_kulish` | то же самое |
| 49 | Колотилова Светлана Николаевна | kolotilovasvetlana@gmail.com | 2026-01-17 | Ой, чувствую я загуляю в 2026 | `https://vk.com/kolotilovasvetann` | VK-профиль (не личка); **пустой `profiles.telegram`** (см. C) |
| 222 | Юлия Громова | muza_skorpi@mail.ru | 2026-04-19 | Лëгкая, как пëрышко | `https://vk.com/id42003360` | VK-профиль по id |

### D.2. Прочее (13)

| meeting_id | host_name | meeting_date | meeting_title | payment_link | наблюдение |
|---|---|---|---|---|---|
| 54 | Елена Мельникова | 2026-02-13 | Любовь, будем знакомы | `@AneleRay` | TG `@username` без `https://t.me/`. Хост **suspended** (FEAT-013) |
| 55 | Елена Мельникова | 2026-02-14 | Создаём свою формулу любви | `@AneleRay` | то же |
| 56 | Елена Мельникова | 2026-02-15 | Создаём свою формулу любви | `@AneleRay` | то же |
| 57 | Елена Мельникова | 2026-02-17 | Бульварные встречи | `@AneleRay` | то же |
| 58 | Елена Мельникова | 2026-02-19 | О спорт - ты жизнь! | `@AneleRay` | то же |
| 59 | Елена Мельникова | 2026-02-28 | Любовь, будем знакомы | `@AneleRay` | то же |
| 111 | Елена Мельникова | 2026-03-03 | Бульварные встречи | `@AneleRay` | то же |
| 110 | Елена Мельникова | 2026-03-07 | Создаём свою формулу любви | `@AneleRay` | то же |
| 112 | Елена Мельникова | 2026-03-09 | Создаём свою формулу любви | `@AneleRay` | то же |
| 113 | Елена Мельникова | 2026-03-13 | Как я выбираю? От 14 до 22 лет. | `@AneleRay` | то же |
| 102 | Инна Кулиш | 2026-02-28 | Мой год - мои правила | `https://my.mts-link.ru/j/58108505/14513694209` | вебинарная платформа MTS-link |
| 204 | Мария Романова | 2026-03-29 | Расцветая внутри | ` https://t.me/mari_rroma` | **TG-ссылка с ведущим пробелом** — формально попала в «не TG», по факту валидный TG. **Пустой `profiles.telegram`** (см. C) |
| 103 | Ольга Скребейко | 2026-03-07 | День больших планов | `https://izdatelstvo.skrebeyko.ru/big_paper_day` | свой лендинг (издательство) — реальный landing, не контакт |

Наблюдение: 9 строк `@AneleRay` — это TG-handle Елены Мельниковой в неканоническом формате; учитывая, что она **suspended** (FEAT-013), её 12 событий уже не зеркалятся в `events` (по recon FEAT-013), но `meetings.payment_link` остаётся как есть.

---

## Побочные находки (не FEAT-002, для отдельных тасков)

1. **Сломанные `profiles.email`:**
   - `LIlia MALONG`: `malaglilia@gmail,com` (запятая вместо точки).
   - `Лена Ф`: в поле email лежит `https://t.me/fedotova_elen` (TG-ссылка вместо email, при этом `telegram` пустой — поля переломаны местами).
   - `Елена Курдюкова`: email = `курдюкова` (просто фамилия).
2. **`profiles.telegram` подменили на чужой email** (`Настина фея`: telegram = `olga@skrebeyko.com`, при том что собственный email `viktorovna7286@gmail.com`). Stale/случайный артефакт регистрации?
3. **Ведущий пробел в TG-ссылке** встречается дважды: в `profiles.telegram` (Елена Кокорина) и в `meetings.payment_link` (Мария Романова) — вероятно, из общего источника копипаста.

Для FEAT-002 эти наблюдения не блокеры, но Ольге может быть удобно вынести отдельной задачей в backlog (`CLEAN-XX: data hygiene profiles.email + telegram leading whitespace`).

---

## Метаданные

- SQL: `/tmp/feat002_hygiene_recon.sql` (локально + на сервере)
- Прогон: `psql -f` под `gen_user`, 2026-05-04
- Никаких изменений в БД не вносилось.

_stop. жду стратега._
