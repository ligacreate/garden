# Recon: Ирина Петруня — нет edit-окошка после ответа Юли (P1) + TG silent submit (P2)

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-26
**Жалобы:**
- P1, 2026-05-26 ~20:33 MSK: «после моего ответа у неё нет окошка для редактуры» (Юля)
- P2, 2026-05-25 17:54 MSK: «отправила домашку, но отбивка в боте не пришла»

**Режим:** read-only. psql под `gen_user` через ssh root@5.129.251.56 → /opt/garden-auth/.env. Никаких write, commit, migrations.

---

## TL;DR

- 🎯 **Root cause P1:** ДЗ менти в статусе `accepted` в БД. **Юля сама** переключила `revision → accepted` в 2026-05-25 20:46 MSK, отправляя сообщение «Вопросы от Ирины: …». Frontend [PvlTaskDetailView.jsx:1188-1195](../../views/PvlTaskDetailView.jsx#L1188-L1195) корректно блокирует edit-окошко для accepted — это не баг логики whitelist, это **симптом** UX-trap'а в [MentorTaskSlim:1031-1046](../../views/PvlTaskDetailView.jsx#L1031-L1046).
- 🎯 **Корень UX-trap'а P1:** mentor-форма на проде = **`MentorTaskSlim`** (две кнопки рядом: amber «Отправить на доработку» и emerald «Принять»), а не полная `renderMentorResponseForm` с `<select>`. Юля набрала текст ответа и кликнула «Принять» вместо «На доработку». Никакой confirm-модалки/disable-условий нет.
- 📭 **P2 в логах TG-queue:** нотификация Юле о submit от Ирины **УШЛА УСПЕШНО** в 2026-05-25 17:38:18+03 (sent_at = scheduled_for, `hw_submitted_revision`, recipient = Юля). Если жалоба от ментора — это TG-клиент / push на стороне Юли. Если жалоба от ученицы — by-design триггер `tg_enqueue_homework_event` НЕ шлёт студентке подтверждение собственной отправки.
- 🪲 **Latent bug TG (не корень P2, но рядом):** ответ Юли 25.05 18:48 содержал HTML (`<p>...</p>`) — две записи в queue для Ирины упали в `dead_letter_at` с ошибкой `bad_request: can't parse entities: Unsupported start tag "p"`. Одна из четырёх дублей-записей ушла OK со старым обрезанным comment'ом «Ответочка на проверку». См. блок 4.4.
- 🔁 **Связан ли P1 и P2:** независимые. P1 — UX-trap в форме ментора. P2 — либо by-design, либо клиентский push у Юли.

---

## 1. Идентификация

### 1.1. Ирина Петруня

```sql
SELECT id, name, email, role, status, access_status FROM profiles WHERE id = '35019374-d7de-4900-aa9d-1797bcca9769';
```

| поле | значение |
|---|---|
| profiles.id | `35019374-d7de-4900-aa9d-1797bcca9769` |
| profiles.name | Ирина Петруня |
| profiles.email | panda399@rambler.ru |
| profiles.role | **applicant** ⚠️ (см. § 5.1 ниже — не критично к багу) |
| profiles.status | active |
| profiles.access_status | active |
| profiles.telegram_user_id | 1886607302 (TG привязан, enabled=true) |

### 1.2. pvl_students

| поле | значение |
|---|---|
| pvl_students.id | `35019374-d7de-4900-aa9d-1797bcca9769` (FK = profiles.id) |
| pvl_students.full_name | Ирина Петруня |
| pvl_students.cohort_id | `11111111-1111-1111-1111-111111111101` = **«ПВЛ 2026 Поток 1»**, start_date 2026-04-15 ✓ |
| pvl_students.mentor_id | **NULL** ⚠️ (legacy-колонка не заполнена; используется pvl_garden_mentor_links — см. ниже) |
| pvl_students.status | active |

### 1.3. Связка с ментором

```sql
SELECT * FROM pvl_garden_mentor_links WHERE student_id = '35019374-d7de-4900-aa9d-1797bcca9769';
```

| student_id | mentor_id | updated_at |
|---|---|---|
| `35019374-…` | `492e5d3d-81c7-41d8-8cef-5a603e1389e6` | 2026-04-21 19:42 |

`492e5d3d-…` → **Юлия Габрух** (profiles.name = «Юлия Габрух», email = lyulya777@inbox.ru, role = mentor, status = active, TG привязан = 240614513, enabled=true). ✓ Связка подтверждена.

Замечание: `pvl_mentors` — пусто для этого id (legacy-табличка, активная связка идёт через `pvl_garden_mentor_links` + `profiles`).

---

## 2. Все ДЗ Ирины — `pvl_student_homework_submissions`

⚠️ **Расхождение в брифе:** в задаче упоминается `pvl_homework_items` для статусов ДЗ. Это таблица **определений** (catalog of tasks). Реальные submissions менти живут в `pvl_student_homework_submissions`. Все выводы ниже — по submissions.

DB enum статусов submissions (check constraint):
`draft | submitted | in_review | revision | accepted | rejected | overdue`.

```sql
SELECT sub.id, hi.title, sub.status, sub.submitted_at, sub.checked_at, sub.accepted_at, sub.revision_cycles, sub.updated_at
FROM pvl_student_homework_submissions sub JOIN pvl_homework_items hi ON hi.id = sub.homework_item_id
WHERE sub.student_id = '35019374-d7de-4900-aa9d-1797bcca9769' ORDER BY sub.updated_at DESC;
```

Все 7 submissions Ирины:

| # | id | hw title | status | updated_at | rev_cycles |
|---|---|---|---|---|---|
| 1 | `437c513b…` | **«Как создать безопасное пространство на встрече»** | **`accepted`** ← фокус инцидента | 2026-05-25 20:46 | 2 |
| 2 | `6952c669…` | «Дизайн и архитектура встречи» | accepted | 2026-05-21 21:48 | 1 |
| 3 | `aa6f9273…` | «Рефлексия по модулю» (is_module_feedback=t) | accepted | 2026-05-09 19:10 | 0 |
| 4 | `9f3a8f09…` | «Из чего состоит практика» | accepted | 2026-04-28 21:54 | 0 |
| 5 | `38093371…` | «Научные основы письменных практик» | accepted | 2026-04-22 12:24 | 0 |
| 6 | `3478cddc…` | «Чек-лист ДЗ к уроку „Научные основы…"» | accepted | 2026-04-22 11:30 | 0 |
| 7 | `c42eb9ad…` | «Ведущая: роль, границы, этика» | accepted | 2026-04-20 17:07 | 1 |

**Все 7 в статусе `accepted`.** Нет ни одной submission в статусе из whitelist'а edit-окошка (`revision | draft | in_progress | not_started`).

**Submission #1 — единственный кандидат на оба инцидента** (P1 и P2):
- updated_at = **2026-05-25 20:46** — точно когда Юля сделала последнее действие
- revision_cycles = 2 — уже было 2 итерации
- submitted_at/checked_at/accepted_at = 03:00 MSK — это **seed-артефакт** (00:00 UTC = 03:00 MSK), реальные даты — в payload thread (см. § 3)

---

## 3. История ДЗ #1 «Безопасное пространство»

### 3.1. payload.thread (хронология, UTC)

| createdAt (UTC) | MSK | role | messageType | text (head) |
|---|---|---|---|---|
| 2026-05-18 18:02 | 21:02 | student | version_submitted | «Отправлена работа» (v1 «Проверка связи!») |
| 2026-05-18 18:02 | 21:02 | system | status | «Статус: отправлено» |
| 2026-05-18 18:18 | 21:18 | mentor (Юля) | mentor_review | «Ответочка на проверку» |
| 2026-05-18 18:18 | 21:18 | system | status | «Статус изменен на на доработке» |
| **2026-05-25 14:38** | **17:38** | student (Ирина) | version_submitted | «Отправлена работа» (v2 — большой текст про шеринг/РО/жесты) |
| 2026-05-25 14:38 | 17:38 | system | status | «Статус: отправлено» |
| **2026-05-25 15:48** | **18:48** | mentor (Юля) | mentor_review | «`<p>`Финальное фото с жестами — огонь!`</p><p>`А вот эту часть у тебя видно, Ирина?`</p>` „Отправьте ментору вопросы…"» |
| 2026-05-25 15:48 | 18:48 | system | status | «Статус изменен на на доработке» |
| **2026-05-25 17:46** | **20:46** | mentor (Юля) | mentor_review | «Вопросы от Ирины: 1. С каким ощущением…» — **без system status-message после!** |

### 3.2. `pvl_homework_status_history` для этой submission

```sql
SELECT id, from_status, to_status, comment, changed_by, changed_at
FROM pvl_homework_status_history WHERE submission_id = '437c513b-3b27-426f-9c75-d08da045a324'
ORDER BY changed_at;
```

| # | changed_at (MSK) | from→to | changed_by | comment (head) |
|---|---|---|---|---|
| 1 | 2026-05-18 21:18 | in_review → revision | Юля | «Ответочка на проверку» |
| 2 | 2026-05-18 21:18 | in_review → revision | Юля (дубль) | «Ответочка на проверку» |
| 3 | 2026-05-18 21:18 | in_review → revision | **Ирина** (sic — actor спутан) | «Ответочка на проверку» |
| 4 | 2026-05-25 17:38 | revision → in_review | Ирина | «Отправлено на проверку» |
| 5 | 2026-05-25 17:38 | revision → in_review | Юля (sic) | «Отправлено на проверку» |
| 6 | 2026-05-25 17:38 | revision → in_review | Юля (дубль) | «Отправлено на проверку» |
| 7 | 2026-05-25 18:48 | in_review → revision | Юля | «`<p>`Финальное фото…» |
| 8 | 2026-05-25 18:48 | in_review → revision | Юля (дубль) | «`<p>`Финальное фото…» |
| **9** | **2026-05-25 20:46** | **revision → accepted** | **Юля** | «**Вопросы от Ирины:** …» |

🎯 **Запись #9 — это и есть root cause P1.**
- Юля сменила status `revision → accepted` в 20:46 MSK 25 мая
- Comment-текст — её сообщение «Вопросы от Ирины: …» (просьба к Ирине ответить на вопросы для сбора feedback после встречи). По смыслу это **не «принять»**, это **продолжение разговора**.
- Тем не менее в БД зафиксировано `to_status = accepted` от лица Юли.

🔁 **Дублирование status_history записей** (на одно событие 2-3 строки с разными `id`, разный actor) — это **известная регрессия из 2026-05-24 (sessions 124-126 actorsSyncReady)**. Сейчас в текущем баге она не первопричина, но создаёт нелогичные дубль-нотификации (см. § 4).

### 3.3. Сверка с handleSaveMentorForm

[views/PvlTaskDetailView.jsx:1224-1250](../../views/PvlTaskDetailView.jsx#L1224-L1250):
```js
const handleSaveMentorForm = () => {
    const decision = mentorForm.statusDecision || 'на доработке'; // default
    onMentorReview({ statusDecision: decision, … });
};
```

И [services/pvlMockApi.js:3342](../../services/pvlMockApi.js#L3342):
```js
state.status = mapRuDecisionToTaskStatus(payload?.statusDecision) || TASK_STATUS.REVISION_REQUESTED;
```

[pvlMockApi.js:1780-1786](../../services/pvlMockApi.js#L1780):
```js
function mapRuDecisionToTaskStatus(ru) {
  if (r === 'принято') return TASK_STATUS.ACCEPTED;
  if (r === 'на доработке') return TASK_STATUS.REVISION_REQUESTED;
  …
}
```

Значит: чтобы DB записался `accepted`, фронт должен был отправить `statusDecision: 'принято'`. У Юли нет `<select>` — у неё `MentorTaskSlim`.

### 3.4. ⚠️ UX-trap: `MentorTaskSlim` (это и есть UI у Юли)

[views/PvlTaskDetailView.jsx:1267-1289](../../views/PvlTaskDetailView.jsx#L1267-L1289):
```jsx
if (role === 'mentor') {
    return <MentorTaskSlim … />;  // полная renderMentorResponseForm НЕ показывается
}
```

[views/PvlTaskDetailView.jsx:980-989](../../views/PvlTaskDetailView.jsx#L980-L989):
```js
const sendAccept = () => {
    onMentorReview?.({
        statusDecision: 'принято',     // ← вот тут «accepted» жёстко зашит в кнопке
        generalComment: reply.trim() || 'Принято.',
        ...
    });
};
```

[views/PvlTaskDetailView.jsx:1031-1046](../../views/PvlTaskDetailView.jsx#L1031-L1046) — UI:
```jsx
<RichEditor value={reply} onChange={setReply} … />
<button onClick={sendRevision}>Отправить на доработку</button>  // amber
<button onClick={sendAccept}>Принять</button>                    // emerald
```

**Что увидела Юля:**
1. Одно поле ввода (RichEditor).
2. Две кнопки **одного размера** рядом, обе активные, обе допускают любой текст.
3. Никаких confirm-модалок, disable-условий, разделения на «отправлено / в процессе».
4. Юля написала «Вопросы от Ирины: …» (long-text с вариантами вопросов для feedback после встречи) — это явное **«доработай и пришли мне эти ответы»**. Но кликнула **«Принять»** (emerald, справа). 

Это **UX-trap первого порядка**: button label `«Принять»` рядом с textarea, заполненной revision-style текстом, без подтверждения = легко промахнуться.

---

## 4. TG-нотификации (P2)

### 4.1. Архитектура

- Триггер `trg_tg_enqueue_homework_event AFTER INSERT ON pvl_homework_status_history` — функция [`tg_enqueue_homework_event()`](dump в текст выше § 4.2) кладёт строку в `tg_notifications_queue`.
- Worker — `processTgQueueBatch()` в [/opt/garden-auth/server.js:765-855](https://5.129.251.56) (на бэкэнде, не в репо!), запускается `setInterval(15s)` внутри garden-auth.service. SKIP LOCKED, backoff 1/2/4/8/16 мин, max 5 attempts, потом dead_letter.
- Sender — `sendTgNotification` ([garden-auth/server.js:264-289](https://5.129.251.56)) шлёт `POST https://api.telegram.org/bot{TG_NOTIF_BOT_TOKEN}/sendMessage` с `parse_mode: 'HTML'`. IPv4-only через httpsPostJson. Бот = @garden_notifications_bot.
- Quiet hours: 23:00-08:00 MSK откладывается до 08:00 (`tg_compute_scheduled_for`). 25.05 17:38 — рабочее время, отправка немедленная.

### 4.2. Когда триггерятся события

Согласно `tg_enqueue_homework_event()`:
| from→to | event_type | recipient |
|---|---|---|
| `revision → in_review` | `hw_submitted_revision` | **mentor** (resolved via `pvl_garden_mentor_links`) |
| `* → in_review` (откуда угодно, обычно draft) | `hw_submitted_new` | **mentor** |
| `* → accepted` | `hw_accepted` | **student** |
| `* → revision` | `hw_revision_requested` | **student** |
| `* → rejected/overdue` | — (MVP: не шлём) | — |

`IF NEW.changed_by = v_recipient_profile_id THEN RETURN NEW;` — не уведомляем сам-себя.

⚠️ **Студенту НЕ уведомляется собственный submit (in_review)** — by design.

### 4.3. Что в queue для submission #1 (`437c513b-…`)

```sql
SELECT created_at, sent_at, event_type, recipient_profile_id, dead_letter_at, last_error
FROM tg_notifications_queue WHERE event_source_id IN (
  SELECT id FROM pvl_homework_status_history WHERE submission_id = '437c513b-…'
) ORDER BY created_at;
```

| # | created_at (MSK) | event_type | recipient | sent_at | dead_letter_at | last_error |
|---|---|---|---|---|---|---|
| Q1 | 2026-05-18 21:18:03 | `hw_revision_requested` | Ирина | 21:18:12 ✓ | — | — |
| **Q2** | **2026-05-25 17:38:18** | **`hw_submitted_revision`** | **Юля** | **17:38:18 ✓** | — | — |
| Q3 | 2026-05-25 18:48:23 | `hw_revision_requested` | Ирина | 18:48:34 ✓ | — | — (но comment = старый «Ответочка на проверку» из дубль-history-записи) |
| Q4 | 2026-05-25 18:48:23 | `hw_revision_requested` | Ирина | — | **18:48:34** ☠ | `bad_request: can't parse entities: Unsupported start tag "p"` |
| Q5 | 2026-05-25 20:46:35 | `hw_revision_requested` | Ирина | — | **20:46:35** ☠ | `bad_request: can't parse entities: Unsupported start tag "p"` (тот же `<p>`-комм. что Q4) |
| Q6 | 2026-05-25 20:46:35 | `hw_accepted` | Ирина | 20:46:35 ✓ | — | — |

### 4.4. P2 жалоба 17:54 MSK 25.05 — что реально случилось

В окне `2026-05-25 17:00 — 18:00 MSK` в queue **ровно одна** новая запись — **Q2**, которая ушла Юле успешно через 0.2 сек после создания (sent_at = 17:38:18.945). Никаких failures, retry, dead_letter в эту минуту нет.

Если жалоба = **от Ирины** («я отправила, бот мне ничего не написал»):
- ROOT CAUSE: by design триггер не делает hw_submitted_confirmation студентке. Архитектурный пробел / UX-проблема, не баг.

Если жалоба = **от Юли** («Ирина отправила, я не получила бот-уведомление»):
- В queue запись Q2 (Юлин TG = 240614513) sent_at = 17:38:18+03 — **бот вернул ok=true**.
- Возможные причины silent на её стороне: TG-mute/DND, бот не был ещё активирован для этого user_id (но `telegram_linked_at = 2026-05-16` — давно), задержка push на устройстве Юли, сообщение прилетело в архив.
- Bittern outbound к api.telegram.org работает через IPv4-only обход (см. `lessons/2026-05-10-happy-eyeballs.md`), ENETUNREACH не было.

Влияние Timeweb grants wipe 16:08 MSK: триггер сработал в 17:38 (через 1.5 ч после wipe). gen_user grants должны быть восстановлены `recover_grants.sh`. Очередь принимает inserts через PostgREST под `web_anon → authenticated`, не gen_user — не affected. Если бы grants были сломаны, INSERT в status_history не прошёл бы вообще. Q2 ВСТАВЛЕНА и ОТПРАВЛЕНА → grants OK.

### 4.5. Latent bug HTML-parse в TG (не P2, но рядом)

`sendTgNotification` использует `parse_mode: 'HTML'`. Telegram Bot API **не разрешает** теги `<p>`, `<div>`, `<br>` — только узкий whitelist (`<b>`, `<i>`, `<u>`, `<s>`, `<a>`, `<code>`, `<pre>` и пр).

Триггер строит сообщение для `hw_revision_requested`:
```sql
'🔄 Просьба доработать ДЗ\n«' || homework_title || '»' ||
  '\n\n<i>' || substring(comment, 1, 200) || '</i>'
```

Если Юля пишет ответ в RichEditor — текст приходит как HTML с `<p>...</p>`. `<i><p>...</p></i>` → TG возвращает 400 → terminal → dead_letter моментально (без retry).

Это случилось **дважды** для Ирины 25.05 (Q4 в 18:48, Q5 в 20:46). Только дубль-Q3 (с обрезанным comment'ом «Ответочка на проверку» от старой записи) прошла. То есть в реальности Ирина 25 мая всё-таки получила нотификацию о доработке, но с **неправильным/устаревшим текстом** комментария ментора. Это, возможно, и сбило Ольгу/Юлю с толку при выяснении.

Это **отдельный системный bug TG-flow** — нужно либо чистить HTML до отправки, либо менять `parse_mode` на `MarkdownV2`/plain, либо стрипать теги в триггере.

---

## 5. Гипотезы и предложения по фиксу

### 5.1. Минорное замечание (не корень)

- `profiles.role = applicant` у Ирины. По логике flow «абитуриент → стажёр → ведущая» (CLAUDE.md) — это первая роль до старта обучения. Но в `pvl_students` она active, в Поток 1, выполняет ДЗ. Возможно legacy / процесс обновления роли не догнал. Не влияет на bug (RLS check is_mentor_for и student_id-based).

### 5.2. P1 — комбинация фактов

1. UI = `MentorTaskSlim`. Юля заполняла RichEditor с текстом «Вопросы от Ирины…», промахнулась мимо кнопки.
2. ИЛИ `MentorTaskSlim` не отображает текущий статус и нет инлайн-индикатора, что «принять» = terminal. Юля интуитивно понимает «Принять» как «принять текущий ответ участницы», но кнопка фактически закрывает task.
3. БД корректно записала accepted (что и попросил frontend).
4. Frontend canEditStudentSubmission whitelist логически корректен — accepted не должен иметь edit. Это **не баг**.

**Симптом и корень разные слои:**
- симптом — edit заблокирован на стороне menti.
- корень — UX-trap в форме ментора.

### 5.3. P2 — комбинация фактов

A) Если жалобщик — Ирина: триггер не уведомляет студента о собственной отправке. By design. Требуется новый event-тип `hw_submitted_confirmation` для студента (или web-push, или in-app toast).

B) Если жалобщик — Юля: технически отправлено в 17:38:18, на сервере всё OK. Источник тишины на стороне TG-клиента Юли.

### 5.4. Предлагаемый fix — варианты

#### Fix P1 (по убыванию приоритета и по возрастанию сложности)

**A. Hotfix-точечный — Confirm-модалка перед `sendAccept` в MentorTaskSlim.** (~10 строк JSX)
- pros: микро-патч, низкий риск, моментально предотвращает ошибку
- cons: не решает плохой UX-дизайн в принципе, не помогает другим менторам
- скоп: 1 файл (views/PvlTaskDetailView.jsx), +~15 LOC

**B. Hotfix-точечный — disable «Принять» пока в RichEditor длинный текст / список нумерации.** (~20 строк, эвристика)
- pros: не блокирует флоу «коротко сказала „Принято" + кликнула»
- cons: эвристика хрупкая, легко обойти
- скоп: 1 файл

**C. UX-redesign MentorTaskSlim — раздельные карточки «Принять» и «На доработку», каждая со своим editor'ом, и явный preview-стейт.** (~80-120 LOC)
- pros: системно решает trap, ментор всегда явно выбирает контекст ответа
- cons: больше изменений, нужен дизайн
- скоп: 1 файл (PvlTaskDetailView.jsx) + дизайн-альт `impeccable`

**D. Корневой архитектурный — выровнять MentorTaskSlim с canEditStudentSubmission whitelist'ом наоборот (status mapping владелец на одном слое — `services/pvlMockApi`).** (~150 LOC, scope review)
- pros: уберёт пересечения хардкода `'принято'` / `'на доработке'` в JSX
- cons: больше, чем нужно для жалобы

**E. Ручная корректировка Ирины — write-операция** (вне scope этой recon):
- Откатить submission #1 `accepted → revision` через UPDATE, ОЧИЩЕНИЕ `accepted_at`. Это **разово** для Ирины, чтобы у неё открылся edit. Делать **только под ручным контролем Ольги**, не в этой задаче.
- Скоп: 1 UPDATE-запрос, ~3 LOC

**Рекомендация:** В + (потом) C, плюс ручная E если Ольга хочет немедленно разблокировать Ирину.

**Whitelist в `canEditStudentSubmission` расширять НЕ надо** — он корректен. Если расширить (добавить, скажем, accepted) — это сломает семантику «принято = terminal», и менти сможет переписать ДЗ после accepted, что неконсистентно с `acceptedAt`, `score`, `state.reviewSeenByStudentAt = null` и пр.

`handleSaveMentorForm` тоже **корректен** — он отправляет тот `statusDecision`, который ему дали из UI. Менять его не надо.

#### Fix P2

**A. Архитектурный, если жалоба от Ирины — добавить student-side hw_submitted_confirmation.** (~50 LOC SQL trigger + 1 row in queue check constraint)
- pros: закрывает UX-пробел
- cons: больше TG-сообщений менти, может раздражать

**B. Тactical (recommended) — пофиксить HTML-parse в триггере / sender'е** (это latent bug § 4.5, но **закроет реальные неотправленные revision-нотификации**):
- Вариант B1 (SQL): в триггере `tg_enqueue_homework_event` стрипать HTML до plain (`regexp_replace(comment, '<[^>]+>', '', 'g')`) перед формированием `v_msg`. ~5 строк SQL
- Вариант B2 (JS): в `sendTgNotification` менять `parse_mode: 'HTML'` на не-parse_mode для message_text из triggers — но тогда другие HTML-теги (`<b>`, `<i>`) тоже не сработают
- Скоп: B1 — 1 миграция, B2 — push-server / garden-auth изменение
- Рекомендация: B1, потому что push-server уже не в репо garden, плюс SQL миграция атомарна

**C. Если жалоба от Юли — на стороне ментора:** уведомления-fallback через web-push в браузере (push-server уже есть). Можно дублировать TG → web-push для критичных событий.

---

## Корневая причина

### P1 — нет edit-окошка у Ирины
**Где:** `pvl_student_homework_submissions.status` = `accepted` для submission `437c513b-3b27-426f-9c75-d08da045a324`.
**Почему так получилось:** Юля Габрух в `MentorTaskSlim` (views/PvlTaskDetailView.jsx:948-1060) 2026-05-25 20:46 MSK нажала кнопку «Принять» (`sendAccept` строки 980-989), отправляя сообщение «Вопросы от Ирины: …» (revision-style текст). UI имеет UX-trap: две одинаково активные кнопки с разной семантикой, без confirm.
**На каком слое корень:** UI / mentor-form (`views/PvlTaskDetailView.jsx:1031-1046`).
**Whitelist `canEditStudentSubmission` (1188-1195) работает корректно — не корень.**

### P2 — отбивка не пришла
**В логах:** нотификация Юле о submit Ирины **была отправлена успешно** в 17:38:18+03 (queue id `4ed24815-…`, `hw_submitted_revision`, sent_at filled, no error). Перерыв «1738 → 1754» в очереди отсутствует — больше событий не было.
**Гипотеза A (если жалоба — Ирины):** by-design триггер `tg_enqueue_homework_event` не уведомляет студента о собственной in_review. Архитектурный пробел.
**Гипотеза B (если жалоба — Юли):** TG-клиент Юли / DND / отсроченный push. Серверной ошибки нет.
**Связанный latent bug (не корень P2, но реально ломает revision-flow):** HTML `<p>` в комментах ментора рушит TG sendMessage (`bad_request: Unsupported start tag "p"`). Уже сожрал 2 нотификации Ирине 25.05 (Q4, Q5 в § 4.4).

---

## Что НЕ делалось в этой разведке

- Никаких write / UPDATE / INSERT / migrations / commits — read-only psql.
- Не правились ни код, ни схема, ни данные.
- Никаких ручных исправлений статуса submission #1 — только под ручным разрешением Ольги в отдельной задаче.

## Что готов уточнить по запросу

- Свериться с тем, кто именно жалобщик в P2 (Ирина или Юля) — если есть оригинал TG-сообщения, root cause резко сужается.
- Снять выборку у других менти Юли — нет ли той же UX-trap'ы у кого-то ещё за последнюю неделю (можно сделать read-only).
- Подготовить мини-diff для confirm-модалки в `MentorTaskSlim` (variant A fix P1) — если Ольга согласует, в новой задаче с diff-on-review.
