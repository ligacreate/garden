# Evening close — стратег session 2026-05-19 (вечер)

**От:** стратега (claude.ai, вечерняя короткая сессия после handover `_79`)
**Кому:** утренний стратег 2026-05-20 / codeexec
**Дата:** 2026-05-19 поздний вечер (~19:00 МСК)
**Длительность:** короткая (~1 час, после _79 handover'a)

---

## Что произошло за этот короткий вечерний кусок

### 1. BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS — **CLOSED**

Из handover `_79` приоритет P1 с тремя гипотезами. Резолвинг:

- **Шаг 1 (paste-ready Маше в TG):** попросила ввести `LigaTemp2026!`
  **вручную** (не из автозаполнения), с явным `!` на конце.
- **Шаг 1 результат:** «Мария вошла» — значит bcrypt-hash в БД
  правильный, login flow в норме. Утренняя гипотеза «JWT staleness»
  получает первое подтверждение (старый JWT мог в чём-то спорить;
  новый login → новый JWT).
- **Шаг 2 (paste-ready Маше в TG):** попросила повторить public-save
  с галочкой «в общее расписание» — то, что не получалось вчера.
- **Шаг 2 результат:** «получилось» — значит на свежем JWT всё
  работает. **Root cause:** JWT staleness после admin-password-reset.
  Гипотезы (b) RLS regression и (c) UX-MEETINGS-PUBLIC-FORM-AUTOFILL
  отброшены.

Никакого кода не меняли. Lesson написан:
`docs/lessons/2026-05-19-jwt-staleness-after-admin-password-reset.md`.

### 2. Алерт ChunkLoadError 18:55 — **NOISE, mitigation работает**

В `@garden_grants_monitor_bot` прилетел:
```
🚨 Garden client error
ChunkLoadError → auto-reload
source: ErrorBoundary.chunkLoad
user: anon
bundle: assets/index-D7kQs_32.js
url: https://liga.skrebeyko.ru/reset/
TypeError: Failed to fetch dynamically imported module:
https://liga.skrebeyko.ru/assets/CourseLibraryView-DL_fNtmW.js
```

**Первая (неправильная) интерпретация моя:** «bundle hash в алерте
(`D7kQs_32`) ≠ зафиксированный в handover как финальный
(`Dgwl91od`) → был второй deploy после 12:55 МСК → нарушение
`feedback-batch-deploys-no-race`».

**Поправка после git log:** `git log --oneline --since="2026-05-19
12:55"` пуст. Последний commit `9aeb55b` 12:55 МСК — единственный
deploy дня. Значит:
- `D7kQs_32.js` — **старый** bundle, который сидел в браузере
  анонимного юзера ДО deploy'a 12:55 МСК
- `Dgwl91od.js` — **новый** bundle, появился на сервере в 12:55 МСК
- Юзер открыл `/reset/` с открытой вкладкой на старом bundle,
  фронт попытался lazy-load chunk `CourseLibraryView-DL_fNtmW.js`
  (из старого билда) → его уже нет на сервере (новый deploy заменил)
  → 404 → ErrorBoundary → auto-reload → подтянул новый bundle

**Это expected side-effect** lazy code-splitting + immutable assets.
ErrorBoundary auto-reload — feature, не bug. Один анонимный юзер,
без потерь.

Связанные lessons:
- `2026-05-10-vite-immutable-cache-trap.md` — про collision contenthash
  (новый код получил то же имя). **Противоположный** кейс, не наш.
- `2026-05-15-vite-crossorigin-script-error-mask.md` — про CORS-маску
  `Script error.`. Не наш случай, у нас полный stack виден.

Прямого lesson на этот pattern (lazy-chunk gone after deploy →
auto-reload) не пишем — это известный side-effect, связан с тикетом
[[VITE-CHUNK-HASH-FLAPPING]] (P3) и достаточно описан в backlog.

### 3. Решение про вечерний deploy — **не пушим**

Ольга спросила «надо ли codeexec'у что-то завершать сегодня?». Ответ:
**нет**.
- Один deploy уже сегодня (12:55 МСК `9aeb55b`) → второй вечером =
  повторная chunk-hash rotation у клиентов, ещё один виток
  ErrorBoundary auto-reload (`feedback-batch-deploys-no-race`)
- Большие задачи (FEAT-022 3-5h, BUG-PVL-ONBOARDING 1-2h) — в свежие
  силы с утра, не вечером
- Документация (этот lesson + backlog update + этот evening-close) —
  лежит в локальном репо, codeexec возьмёт завтра одним batch'ем
  вместе с первыми утренними фиксами

---

## Файлы, добавленные/изменённые в этой вечерней сессии (без commit/push)

| Файл | Действие |
|---|---|
| `docs/lessons/2026-05-19-jwt-staleness-after-admin-password-reset.md` | created |
| `docs/_session/2026-05-19_80_strategist_evening_close.md` | created (этот файл) |
| `plans/BACKLOG.md` | added FEAT-022 в P1 + closed-секция «2026-05-19 поздний вечер» в History |

---

## Что осталось открытым (для утра 2026-05-20)

### Те же P1 что в handover `_79`, минус один:

- ~~BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS~~ ✅ CLOSED (JWT staleness)
- **FEAT-022 magic link login** — теперь формально в BACKLOG как P1
  (с scope), не только в handover
- **BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD** — architectural fix
  (trigger AFTER INSERT ON profiles), ~1-2 часа codeexec

### Новые рекомендации (требуют решения Ольги, не самовольный bump):

- **UX-MEETINGS-FORM-NATIVE-ALERT** — текущий P3 → recommend bump в P1.
  Аргумент: за 18-19 мая **вторая** пользовательница (Бардина → Романова)
  застряла на одном и том же generic «Неверные данные...» из-за
  **разных** backend причин. Каждый раз ~час диагностики. Single file
  fix `views/MeetingsView.jsx:894`, ~1-2 часа codeexec.
- **SEC-PWD-RESET-INVALIDATE-JWTS** (новый тикет, ещё не в BACKLOG
  формально) — admin-password-reset должен invalidate существующие
  JWT. Варианты в lesson. Effort 2-4 часа.

### Не делать утром

- **Не пушить два коммита подряд.** Завтрашний день должен начинаться
  с одного запланированного batch'a (то что я сегодня вечером положила
  в файлы + утренние фиксы), а не двух отдельных push'ей.

---

## Контекст про Ольгу (на этот вечер)

- Maria Romanova сама вышла из своей загадки за два простых шага
  (logout → re-login → save). Подтвердила «получилось».
- Ольга решила закругляться на сегодня. Не нагружала codeexec
  вечером.
- День в целом был очень плотный (handover `_79` зафиксировал 7
  закрытых тикетов + 4 recovery + 4 verified smoke). Эта вечерняя
  сессия — короткий cleanup, не новая фаза.

---

## Финальная сводка состояния

| Что | Статус |
|---|---|
| Платформа | стабильна, bundle `index-Dgwl91od.js` 12:55 МСК |
| Maria Romanova | вошла + public save работает ✅ |
| BUG-PUBLIC-MEETING-SAVE | CLOSED (JWT staleness) ✅ |
| ChunkLoadError 18:55 | noise, auto-reload отработал ✅ |
| FEAT-022 magic link | формально в BACKLOG P1 |
| BUG-PVL-ONBOARDING trigger | по-прежнему P1 TODO |
| Lessons + backlog updates | в файлах локально, **не пушены** |
| TG bot @garden_pvl_bot | работает (polling) |
| Daily ACL wipe | mitigation cron каждую минуту, 16:08 МСК recovery в логе |

---

## Первое сообщение утреннему стратегу

> Привет. Вечерний cleanup `_80` прочитан. Из handover `_79`:
> BUG-PUBLIC-MEETING-SAVE → CLOSED (JWT staleness), FEAT-022 теперь
> в BACKLOG. Открыто на сегодня: FEAT-022 magic link, BUG-PVL-ONBOARDING
> trigger, плюс две recommend-to-bump (UX-NATIVE-ALERT, SEC-PWD-RESET).
> Локальные изменения в lesson + backlog ждут утреннего commit'a
> одним batch'ем с твоими фиксами. С чего начнём?

Спасибо за продолжение. 🌱
