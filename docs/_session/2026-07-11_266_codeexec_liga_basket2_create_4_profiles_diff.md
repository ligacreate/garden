# DIFF-ON-REVIEW — Завод 4 профилей (Корзина 2: платят Лигу, профиля нет)

**Дата:** 2026-07-11
**Автор:** codeexec (VS Code)
**Статус:** DIFF-ON-REVIEW — **НЕ применено.** Ждём 🟢.
**Роль всем:** `intern`. Все 4 живьём в канале И чате Лиги (roster 2026-07-11), tg_id валидны.
**PII внутри** (email/tg_id).

---

## Кого заводим (4)

| # | Имя (profiles.name) | email (логин) | tg_user_id | paid_until (устанавливаем) |
|---|---|---|---|---|
| 1 | Елена Сулименко | lena17@bk.ru | 799244185 | 2026-08-01 23:59:59+03 |
| 2 | Мария Павлиш | leslie-maria@yandex.ru | 639837207 | 2026-07-21 23:59:59+03 |
| 3 | Евгения Антипина | evantipina@ya.ru | 1385160877 | 2026-07-21 23:59:59+03 |
| 4 | Ксения Белоус | ksu.shik@mail.ru | 447290795 | 2026-07-30 23:59:59+03 |

Общее для всех: `role='intern'`, `access_status='active'`, `subscription_status='active'`, `city=NULL`.
Даты — последнее списание (≤07-02) + 30; grace-cushion движка напоминаний покрывает возможный свежий платёж, свежий paylist не требуется (подтверждено стратегом).

---

## ⚠️ Отклонение от заявленного флоу: approve = owner-UPDATE, не RPC

`admin_approve_registration()` содержит `IF NOT public.is_admin() THEN RAISE 'forbidden'`
([phase31:214-216](../../migrations/2026-05-16_phase31_pending_approval_access.sql)). Из psql под `gen_user`
`auth.uid()` = NULL → RPC откажет. Admin-JWT у codeexec нет.

**Замена:** owner-UPDATE под `gen_user` (RLS-bypass). Эффект в БД идентичен RPC:
- `access_status='active'` + `role='intern'` — как в RPC.
- BEFORE-триггер `sync_status_from_access_status` → `status='active'` (bridge).
- AFTER-триггер phase37 `trg_profiles_pvl_student_on_approval` — `WHEN (NEW.role IN ('applicant','intern')
  AND OLD.access_status='pending_approval' AND NEW.access_status='active')` → создаёт `pvl_students` row.
  Обычный UPDATE удовлетворяет WHEN — стажёрская строка ПВЛ создастся, как при штатном approve.
- **Отличие одно:** RPC пишет `pvl_audit_log('approve_registration')`. Owner-UPDATE — нет.
  → Добавлю ручную audit-строку (см. §Шаг 2, опционально) для сохранности следа. Если стратег хочет
  строго через RPC — дай admin-JWT (логин Оли-админа), перепишу approve на `POST rpc/admin_approve_registration`.

---

## Пред-полётные гейты (read-only, до любой записи)

- **G1. SMTP-тест.** `POST /auth/request-reset {email: <почта Оли>}` → Оля подтверждает, что письмо
  «Восстановление пароля» дошло. Ключи `SMTP_HOST/USER/FROM/PUBLIC_URL` на проде есть, но живой тест
  обязателен — иначе рассылка доступа 4 людям молча провалится (`if (!transporter) → 500`).
- **G2. Уникальность tg_id (повторно).** `SELECT ... WHERE telegram_user_id IN (799244185,639837207,1385160877,447290795)`
  → ожидаем 0 строк (уже проверено; `uq_profiles_telegram_user_id` защитит от гонки).
- **G3. Нет коллизии email.** register вернёт 409, если `users_auth.email` занят — ожидаем «User created» на всех 4.

---

## Апплай — по одному человеку (пример на Сулименко; остальные 3 идентичны, меняются email/name/tg/дата)

### Шаг 1 — register-on-behalf (HTTP, публичный эндпоинт)
Throwaway-пароль генерируется в момент апплая (`openssl rand -hex 24`), **нигде не логируется и не
отправляется** — человек задаст свой через reset-письмо.
```
PW=$(openssl rand -hex 24)
curl -sS -X POST https://auth.skrebeyko.ru/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"lena17@bk.ru","password":"'"$PW"'","name":"Елена Сулименко"}'
# → {"token":"…","user":{"id":"<UUID>","access_status":"pending_approval",…}}
# Захватываем user.id → :UID. Побочка: 1 TG-пинг админу «новая регистрация» (безвредно, ×4 суммарно).
```

### Шаг 2 — approve + set-fields (psql под gen_user, ОДИН UPDATE = approve+бизнес-поля атомарно)
```sql
UPDATE public.profiles
   SET access_status      = 'active',
       role               = 'intern',
       subscription_status= 'active',
       paid_until         = TIMESTAMPTZ '2026-08-01 23:59:59+03',
       telegram_user_id   = 799244185
 WHERE id = :UID
   AND access_status = 'pending_approval';   -- guard: трогаем только что созданный pending
-- Ожидаем UPDATE 1. Триггеры: bridge→status=active, phase37→pvl_students row.

-- (опционально, для паритета с RPC — audit-след)
INSERT INTO public.pvl_audit_log (id, actor_user_id, action, entity_type, entity_id, payload, created_at)
VALUES (gen_random_uuid()::text, NULL, 'approve_registration', 'profile', :UID::text,
        jsonb_build_object('summary','codeexec basket2: owner-UPDATE approve (no admin-JWT)',
                           'role','intern','source','paylist_2mo'), now());
```

### Шаг 3 — request-reset (HTTP) → письмо «задай пароль»
```
curl -sS -X POST https://auth.skrebeyko.ru/auth/request-reset \
  -H 'Content-Type: application/json' -d '{"email":"lena17@bk.ru"}'
# → {"ok":true}. Токен живёт 30 мин; можно перевыпустить в любой момент.
```

**Значения для остальных 3:**
| email | name | tg | paid_until |
|---|---|---|---|
| leslie-maria@yandex.ru | Мария Павлиш | 639837207 | 2026-07-21 23:59:59+03 |
| evantipina@ya.ru | Евгения Антипина | 1385160877 | 2026-07-21 23:59:59+03 |
| ksu.shik@mail.ru | Ксения Белоус | 447290795 | 2026-07-30 23:59:59+03 |

---

## Пост-проверка (read-only, после апплая)
```sql
SELECT name, email, role, access_status, status, subscription_status, paid_until, telegram_user_id
  FROM public.profiles
 WHERE email IN ('lena17@bk.ru','leslie-maria@yandex.ru','evantipina@ya.ru','ksu.shik@mail.ru')
 ORDER BY name;
-- Ждём: 4 строки, role=intern, access_status=active, status=active, sub=active, paid_until стоит, tg_user_id стоит.
SELECT count(*) FROM public.pvl_students WHERE id IN (:UID1,:UID2,:UID3,:UID4);  -- ждём 4
```

## Порядок и сообщения Оли
1. Апплай всех 4 (Шаг 1→2), пост-проверка.
2. **Оля шлёт welcome** (текст ниже) — прайминг «придёт письмо со ссылкой».
3. **Затем** Шаг 3 (request-reset) на все 4 — чтобы 30-мин токен стартовал, когда человек уже предупреждён.
4. Оля вне платформы: **отключает старое автосписание в Prodamus** по этим 4 (вне scope codeexec).

## Rollback
Если апплай пошёл не так на человеке X (до рассылки reset): человек ещё не знает пароля, вреда нет.
Полное снятие: `DELETE FROM public.users_auth WHERE email='…'` (FK/каскад снесёт profiles+pvl_students),
либо мягко `access_status='paused_manual'`. Обсудить перед выполнением.

## Welcome-письмо (шлёт Оля лично, {имя} = Елена / Мария / Евгения / Ксения)
```
Привет, {имя}!

Мы переехали: Лига теперь живёт на новой платформе — встречи, практики и оплата
собраны в одном личном кабинете. Я уже завела тебе там аккаунт.

Два шага, чтобы войти:
1. Тебе придёт письмо со ссылкой — по ней задашь свой пароль.
2. Продлевать Лигу теперь будешь в кабинете: https://liga.skrebeyko.ru

Старое автосписание я отключаю — чтобы не списалось дважды. Доступ не прервётся, всё на месте.

Будут вопросы — сразу пиши мне, помогу.
Оля
```

---

## ✅ ПРИМЕНЕНО 2026-07-11 — 4/4 approved

- **G1** SMTP-тест:
  - ⚠ Первый прогон на `skrebeyko@proton.me` дал HTTP 200, но письмо **не ушло** — этот email не в
    `users_auth`, `request-reset` отдал silent-ok (анти-энумерация). 200 тут ≠ «отправлено».
  - Аккаунт Оли на платформе — **olga@skrebeyko.com**. Повторный `request-reset` на него: HTTP 200,
    в логе **нет** `unknown email` (дошёл до `sendMail`), **письмо доставлено — Оля подтвердила получение.**
  - Вывод: SMTP жив end-to-end (`mail.skrebeyko.ru:465`, FROM `ilove@skrebeyko.ru`). G1 закрыт.
- **register ×4** (throwaway pw, не логировался) → UID:
  - Елена Сулименко `25aea53f-7729-45f9-af85-f88808556668`
  - Мария Павлиш `4e4239ea-db7d-4eef-98ab-308904b9767a`
  - Евгения Антипина `22d7477e-8b20-43ac-a598-ba3628dfb3b3`
  - Ксения Белоус `3fc0fa9f-2df5-4adc-9371-c2ccb1f6de31`
- **owner-UPDATE ×4** (guard `pending_approval`, каждый `UPDATE 1`) + **audit-INSERT ×4** → COMMIT.
- **Пост-проверка: 4/4 полное approved-состояние** — `role=intern`, `access_status=active`, `status=active`,
  `subscription_status=active`, `paid_until` стоит, `telegram_user_id` стоит, `users_auth.status=active`,
  `pvl_students` row есть (phase37-триггер), `pvl_audit_log` = 1 строка на каждого.

## ⏸ ДЕРЖУ ДО СИГНАЛА «шли» — welcome + reset на автомате (Оля руками не шлёт)

Старт — **после того как Оля погасит автосписания Prodamus** по этим 4.

**Инфра-подтверждения:**
- Email-очередь `email_notifications_queue` — консюмер `processEmailQueueBatch` **жив на проде** (garden-auth HEAD
  `eceffd1`, крутится по интервалу; 1f-письмо сегодня доставлено через него). Enqueue → авто-отправка.
- **Self-serve «Забыли пароль?» есть** ([AuthScreen.jsx:246](../../views/AuthScreen.jsx#L246) → форма → `request-reset`).
  Если 30-мин токен протухнет — человек сам запросит новую ссылку на liga.skrebeyko.ru. Тупика нет.

**Шаг A — welcome в очередь (4 INSERT под gen_user).** `{имя}` = Елена / Мария / Евгения / Ксения.
`dedup_key='welcome_migration_basket2:<UID>'` (uniq-индекс не даст дубль-отправку).
```sql
INSERT INTO public.email_notifications_queue
  (recipient_profile_id, recipient_email, subject, body_text, dedup_key, scheduled_for)
VALUES
 ('25aea53f-7729-45f9-af85-f88808556668','lena17@bk.ru',
  'Лига переехала — вход в твой кабинет', <welcome-текст с «Елена»>,
  'welcome_migration_basket2:25aea53f-7729-45f9-af85-f88808556668', now()),
 -- + Павлиш (Мария), Антипина (Евгения), Белоус (Ксения) аналогично.
;
```
Тело = welcome-текст из блока выше, первое слово-обращение подставлено. `body_html` — опционально
(ссылка liga кликабельной); text-версии достаточно.

**Шаг B — reset (set-password) следом, 4× HTTP.** Запускать **после** шага A (welcome готовит — reset даёт ссылку):
```
curl -sS -X POST https://auth.skrebeyko.ru/auth/request-reset -H 'Content-Type: application/json' -d '{"email":"lena17@bk.ru"}'
# + leslie-maria@yandex.ru, evantipina@ya.ru, ksu.shik@mail.ru
```

**Порядок на «шли»:** (0) Оля подтвердила автосписания погашены → (A) enqueue 4 welcome → (B) request-reset ×4 →
проверка `sent_at` в очереди + 200 на reset → отчёт.

**Профили заведены. Рассылка (A+B) НА ПАУЗЕ до «шли».**

---

## ✅ ОТПРАВЛЕНО 2026-07-11 (по сигналу «шли», автосписания погашены)

- **A — welcome ×4** в `email_notifications_queue` (`INSERT 0 4`). Консюмер отработал:
  все 4 `sent_at=22:57:10`, `attempt_count=1`, `dead_letter=null`, `last_error=null`. Доставлено системой.
- **B — request-reset ×4** (lena17@bk.ru, leslie-maria@yandex.ru, evantipina@ya.ru, ksu.shik@mail.ru):
  все **HTTP 200**, в логе нет `unknown email` / `request-reset error` → set-password ссылка ушла каждому.
- Оля руками ничего не слала. Self-serve «Забыли пароль?» на месте — если 30-мин токен протухнет,
  человек запросит новую ссылку сам.

**Задача закрыта: 4 профиля заведены (4/4 approved) + welcome + set-password разосланы автоматом.**
