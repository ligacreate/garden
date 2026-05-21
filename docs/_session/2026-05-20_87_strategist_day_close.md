# Day close 2026-05-20 — handover для утреннего стратега

**От:** стратега (claude.ai, дневная + вечерняя сессии 2026-05-20)
**Кому:** утренний стратег 2026-05-21 / codeexec
**Дата:** 2026-05-20 вечер
**Связано:** вчерашний evening-close `_80`, сегодняшние `_81..87`

---

## TL;DR

День получился productive и аккуратный: FEAT-025 закрыт verify-only
(не строили ни строчки кода), 5 новых тикетов задокументированы и
приоритизированы, прод git-remote вычищен, один backend security
полировочный fix применён. **Никаких deploy'ев frontend, никаких TG
алертов.**

3 локальных commit'а накопились без push'a (paths-ignore в
`deploy.yml` ещё не настроен — push сегодня = chunk-hash flap).
**Первое утреннее действие — настроить paths-ignore, затем один
большой push всего накопленного.**

---

## Что закрыто за день 2026-05-20

| Тикет | Статус | Где |
|---|---|---|
| **FEAT-025 password reset** | ✅ DONE (verify-only) | Smoke Ольги в incognito прошёл |
| **INFRA-AUTH-PROD-GIT-REMOTE** | ✅ DONE | Прод `/opt/garden-auth/.git` → ligacreate |
| **FEAT-025-INFO-DISCLOSURE-FIX** | ✅ DONE | `server.js:697` 404→200 + scp + restart |
| **BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS** | ✅ DONE вчера, lesson написана | JWT staleness, lesson 2026-05-19-jwt-staleness |
| **Bump UX-MEETINGS-FORM-NATIVE-ALERT P3→P2** | ✅ DONE | Decision Ольги, объединено в эпик AuthForms-UX-Refresh |

## Новые тикеты, заведённые сегодня

| Тикет | Приоритет | Effort |
|---|---|---|
| **SEC-PWD-RESET-INVALIDATE-JWTS** | P2 | 2-4h (закрывает root-cause Maria Romanova) |
| **UX-AUTH-FORM-FEEDBACK** | P2 (эпик AuthForms-UX-Refresh) | 3-4h вместе с UX-MEETINGS-FORM-NATIVE-ALERT |
| **FEAT-025-EMAIL-HTML** | P3 | 1-2h + DKIM/SPF DNS |

## Pipeline на утро — 3 локальных commit'а без push

| Repo | SHA | Содержимое |
|---|---|---|
| `ligacreate/garden` | `8d2cf5d` | AM housekeeping batch (FEAT-025 done, 5 new tickets, history block, carry-forward вчерашних docs `_80` + lesson) |
| `ligacreate/garden` | `722572e` | Evening tails (bump UX-MEETINGS to P2, FEAT-025-INFO-DISCLOSURE-FIX done, history block, `_85`+`_86`) |
| `ligacreate/garden-auth` | `c00765a` | Backend single-line `server.js:697` (404→200) |

---

## 🎯 Первое утреннее действие — paths-ignore в deploy.yml

**Why:** Сейчас любой push в `main` triggernet frontend FTP deploy (нет
`paths-ignore` в `.github/workflows/deploy.yml`). Push накопленных
3 коммитов сегодня вечером = chunk-hash flap + TG алерты в ночь. Утром
с вниманием на регрессии — лучшее окно.

**Шаги:**

1. **Сначала** — отдельный commit в garden-репо с `.github/workflows/deploy.yml`:
   добавить
   ```yaml
   on:
     push:
       branches: ["main"]
       paths-ignore:
         - 'docs/**'
         - 'plans/**'
         - '.business/**'
         - '**/*.md'
   ```
   Этот commit сам triggernet deploy (он меняет workflow yml, не в
   paths-ignore) — **один** chunk-hash flap, expected. ErrorBoundary
   auto-reload справится у активных юзеров.

2. **Push** в порядке (важно):
   - `c00765a` (garden-auth) — отдельный repo, не triggerит frontend deploy
   - garden batch: `8d2cf5d` + `722572e` + paths-ignore commit одним
     push'ем. **После** paths-ignore commit'а push считается «есть
     workflow file change» → deploy triggers всё равно. Один chunk-flap
     при этом push'e.

3. **Verify** через GH Actions UI: deploy зелёный, bundle обновился.

4. **Следующие** docs/plans/lessons коммиты в течение дня — push
   когда хочется, deploy НЕ triggerится. `feedback-batch-deploys-no-race`
   перестаёт быть narrow constraint для docs.

Этим закрываем 70% сценариев [[VITE-CHUNK-HASH-FLAPPING]] (P3).
Остаётся code-change часть chunk-hash flapping (Vite contenthash
collision) — отдельная тема.

---

## 🔴 Открытое на 2026-05-21

### P1
- **BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD** — DB trigger AFTER
  INSERT ON profiles WHERE role IN ('applicant','intern','leader')
  → auto-create pvl_students row. **Architectural fix**, recovery
  лечит симптом ровно одного пользователя. Effort 1-2h. **Это
  основная работа дня после paths-ignore.**

### P2 (эпиками, не разрозненно)
- **AuthForms-UX-Refresh эпик** = UX-AUTH-FORM-FEEDBACK +
  UX-MEETINGS-FORM-NATIVE-ALERT. 3-4h одним батчем. Закрывает класс
  «генерик ошибки маскируют root causes» (3 кейса за 3 дня).
- **SEC-PWD-RESET-INVALIDATE-JWTS** — admin/user reset bumps
  jwt_min_iat. 2-4h. Не emergency (closed community), но закрывает
  Maria-class кейсы навсегда.
- **FEAT-015 Prodamus auto-pause** (95% сделано из handover `_79`) —
  enable env flag + register webhook URL в Prodamus + smoke. 30-60
  мин. Требует Ольгиного входа в Prodamus dashboard.

### P3
- **FEAT-025-EMAIL-HTML** — HTML + DKIM/SPF + branding
- **FEAT-024 Phase 5** — TG-анонс студенткам
- **FEAT-018** TZ + новые города
- **FEAT-019** Сокровищница + маркетплейс

---

## Что НЕ делать утром

- ❌ Не пушить сразу `c00765a` + `8d2cf5d` + `722572e` без paths-ignore
  — это **2 deploy**a получится (или один большой с двумя chunk-rotation)
- ❌ Не лезть в paths-ignore через `**/*.md` без `docs/**` отдельно —
  README в корне может быть legitimate trigger; перечисление
  директорий точечнее
- ❌ Не нагружать BUG-PVL-ONBOARDING без recon — нужен запрос codeexec'у
  «покажи где сейчас в коде/garden-auth создаются profiles, есть ли
  DB-trigger на profiles вообще, где живёт onboarding-flow»
- ❌ Не задавать Ольге технические вопросы про схему БД — иди через
  codeexec / curl prod API сама (memory правило)
- ❌ Не запускать FEAT-022 magic link как замену пароля — он ПАРК'нут,
  возможно как опция в будущем (см. `_80` evening close)

---

## Контекст про Ольгу на сегодняшний вечер

- День начинала с переосмысления FEAT-022: согласилась что magic link
  как замена — не приоритет, выбрала классический password reset
  (FEAT-025). Это правильное решение оказалось — flow был полностью
  готов, осталось verify.
- Сделала live smoke сама в incognito. Подтвердила что письмо
  дошло до inbox (не spam).
- Не проверила «что со старой сессией» — спросила после, JWT не
  инвалидируется. SEC-PWD-RESET-INVALIDATE-JWTS она поставила P2,
  не P1 («вряд ли кто-то будет красть пароли»).
- Закрыла день с хвостами: backend fix + bump UX. Дальше не пошла
  (BUG-PVL-ONBOARDING на завтра).

---

## Сводка состояния платформы

| Что | Статус |
|---|---|
| Платформа | стабильна, bundle `index-Dgwl91od.js` (с утра 19.05) |
| Frontend deploy за день | 0 ✅ |
| Backend deploy (garden-auth restart) | 1 (FEAT-025-INFO-DISCLOSURE-FIX) ✅ |
| TG client-error алерты | 0 за день после 18:55 19.05 (тот ChunkLoadError) ✅ |
| Daily ACL wipe | mitigation cron каждую минуту, ожидаем 13:08 UTC = 16:08 МСК recovery |
| Maria Romanova | login + public save работают ✅ (свежий JWT) |
| Maria Бардина | активна с 18.05 ✅ |
| Razzhigaeva | submission работает, ментор получает push ✅ |
| TG bot @garden_pvl_bot | работает через polling ✅ |
| Password reset flow | live verified ✅ |
| Прод garden-auth git-remote | ligacreate ✅ |

---

## Первое сообщение утреннему стратегу

> Привет. День 2026-05-20 закрыт чисто. Прочитай `_87` — там pipeline
> на утро и приоритеты. Первое действие: paths-ignore в `deploy.yml`,
> потом push 3 накопленных коммитов одним заходом. После — основная
> работа на дне это BUG-PVL-ONBOARDING trigger (P1, 1-2h). Пакет
> рекомендаций по приоритетам в _87 «Открытое». Удачи 🌱
