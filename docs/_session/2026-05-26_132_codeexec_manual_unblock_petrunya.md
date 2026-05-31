# Manual unblock Ирины Петруни: accepted → revision

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега → Ольга
**Дата:** 2026-05-26
**Тип:** WRITE-операция. Согласована 🟢 Ольгой перед COMMIT.
**Связано:** [_130](2026-05-26_130_codeexec_recon_petrunya_edit_window_and_tg_silent.md), [_131](2026-05-26_131_codeexec_recon_petrunya_edit_window_at_revision.md).

---

## Зачем

Submission Ирины Петруни `437c513b-3b27-426f-9c75-d08da045a324` («Как создать безопасное пространство на встрече», Поток 1) находилась в статусе `accepted` после того, как Юля Габрух 25.05 20:46 MSK кликнула «Принять» в `MentorTaskSlim` как workaround (ментор-UI не открывал edit для menti при revision из-за бага _131 H3).

Ментор в `MentorTaskSlim` НЕ имеет UI-кнопки для отката `accepted → revision` (UX-gap, отдельный тикет **UX-MENTOR-CANNOT-UNDO-ACCEPTED**). Юля 26.05 в TG-чате с Ольгой: «У меня нет там окошка. Я же его приняла вчера в 20.46».

Единственный путь разблокировки сейчас — admin manual SQL под `gen_user`. Это разовое действие для одной menti; системный фикс — в backlog'е.

---

## Что сделано

### Pre-commit dry-run

BEGIN → UPDATE → INSERT → verify-SELECT → **ROLLBACK**. Проверено что:
- UPDATE затрагивает ровно 1 строку
- INSERT в `pvl_homework_status_history` проходит RLS (под gen_user owner-bypass)
- Trigger `trg_tg_enqueue_homework_event` ставит в очередь `hw_revision_requested` для Ирины
- Comment чистый (без HTML-тегов) → НЕ упадёт в dead_letter с `bad_request: can't parse entities`

### Apply (post-🟢)

Применён в 2026-05-26 14:23:36+03.

```sql
BEGIN;

UPDATE pvl_student_homework_submissions
   SET status = 'revision',
       accepted_at = NULL,
       updated_at = now()
 WHERE id = '437c513b-3b27-426f-9c75-d08da045a324';

INSERT INTO pvl_homework_status_history
  (submission_id, from_status, to_status, comment, changed_by, changed_at, payload)
VALUES (
  '437c513b-3b27-426f-9c75-d08da045a324',
  'accepted',
  'revision',
  'ДЗ возвращено на доработку. Окошко для редактирования снова открыто — допиши и отправь.',
  '85dbefda-ba8f-4c60-9f22-b3a7acd45b21',  -- Ольга Скребейко (admin)
  now(),
  jsonb_build_object(
    'source', 'manual_admin_action',
    'reason', 'mentor_ui_no_undo_after_accepted',
    'related_recon', '_131'
  )
);

COMMIT;
```

Разделение `comment` vs `payload`:
- **`comment`** — user-friendly, прилетит Ирине в TG: «ДЗ возвращено на доработку. Окошко для редактирования снова открыто — допиши и отправь.»
- **`payload`** — technical metadata для аудита (source/reason/related_recon).

### Post-commit verify

**`pvl_student_homework_submissions`:**

| поле | до | после |
|---|---|---|
| status | `accepted` | **`revision`** |
| accepted_at | 2026-05-25 03:00:00+03 | **NULL** |
| updated_at | 2026-05-25 20:46:34.963256+03 | **2026-05-26 14:23:36.000603+03** |
| revision_cycles | 2 | 2 (без изменений) |
| submitted_at | 2026-05-25 03:00:00+03 | без изменений |
| checked_at | 2026-05-25 03:00:00+03 | без изменений |

**Новая запись `pvl_homework_status_history`:**

| поле | значение |
|---|---|
| id | `8cd74c86-8914-4040-b449-68cf84672efb` |
| submission_id | `437c513b-3b27-426f-9c75-d08da045a324` |
| from_status | `accepted` |
| to_status | `revision` |
| changed_by | `85dbefda-ba8f-4c60-9f22-b3a7acd45b21` (Ольга Скребейко) |
| changed_at | 2026-05-26 14:23:36.000603+03 |
| comment | «ДЗ возвращено на доработку. Окошко для редактирования снова открыто — допиши и отправь.» |
| payload | `{"reason": "mentor_ui_no_undo_after_accepted", "source": "manual_admin_action", "related_recon": "_131"}` |

**Поставленное в TG-queue событие:**

| поле | значение |
|---|---|
| id | `52f7f5b4-93a9-49c5-b085-52ad2be6b49b` |
| event_type | `hw_revision_requested` |
| recipient_profile_id | `35019374-d7de-4900-aa9d-1797bcca9769` (Ирина) |
| recipient_tg_user_id | 1886607302 |
| scheduled_for | 2026-05-26 14:23:36+03 |
| message_text | `🔄 Просьба доработать ДЗ «Задание к уроку «Как создать безопасное пространство на встрече»»\n\n<i>ДЗ возвращено на доработку. Окошко для редактирования снова открыто — допиши и отправь.</i>` |

Worker `processTgQueueBatch()` в `/opt/garden-auth` (setInterval 15s) забирает в течение ≤15 секунд. parse_mode=HTML, теги только `<i>` → не должно падать с HTML parse error.

---

## Что Ирина увидит

1. **TG-нотификация** от @garden_notifications_bot (если её клиент не в quiet hours — сейчас 14:23 MSK, в активном окне):

   > 🔄 Просьба доработать ДЗ
   > «Задание к уроку «Как создать безопасное пространство на встрече»»
   >
   > _ДЗ возвращено на доработку. Окошко для редактирования снова открыто — допиши и отправь._

2. **После Cmd+Shift+R** (hard reload) в браузере / web app:
   - `state.taskDetail.status` → «на доработке»
   - `canEditStudentSubmission` → **true**
   - На странице задания вместо плейсхолдера «Ответ уже отправлен и ожидает решения ментора» появится RichEditor + кнопки «Сохранить черновик» / «Отправить на проверку».

---

## Paste-ready для TG Ирине

```
Ирина, привет! Мы вручную вернули твоё ДЗ на доработку — окошко
для редактирования снова открыто. Обнови страницу с Cmd+Shift+R
(на Windows — Ctrl+Shift+R), и кнопка «Отправить» появится. ✨
```

---

## Известный побочный эффект (acceptable)

Регрессия STATUS-HISTORY-DUP (см. _131 § 5.2): при следующем `persistSubmissionToDb` (когда Ирина или Юля что-то сделают на странице) `slice(-3)` локальной history отправит в БД 3 последних записи, включая нашу новую `8cd74c86-…`. БД создаст дубль с **другим** actor'ом (Ирина или Юля вместо Ольги) и тем же `changed_at` → trigger выстрелит ещё раз → Ирина получит ещё 1-2 дубль-push'а «Просьба доработать».

Не критично. Решение архитектурно — в тикете STATUS-HISTORY-DUP-REGRESSION.

---

## Что НЕ сделано (по инструкции)

- Не трогали другие submissions.
- Не меняли схему / триггеры / RLS.
- Не делали code-fixes (это отдельные тикеты).
- Не отправляли TG напрямую — всё через штатный flow (trigger → queue → worker → bot).

---

## Actor / время

- **Actor:** `85dbefda-ba8f-4c60-9f22-b3a7acd45b21` = Ольга Скребейко (admin, status=active).
- **Время COMMIT:** 2026-05-26 14:23:36.000603+03 (MSK).
- **Approval:** 🟢 от стратега в этом же чате перед COMMIT (с правкой comment'а на user-friendly).
- **Connection:** ssh root@5.129.251.56 → PGPASSWORD=… psql -h 337a9e20fbb7b82646fd9413.twc1.net -U gen_user -d default_db -f /tmp/q_apply.sql.
