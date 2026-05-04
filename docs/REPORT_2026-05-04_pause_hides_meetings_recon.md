---
title: Разведка — «пауза ведущей скрывает её встречи в Meetings»
date: 2026-05-04
status: read-only recon, не реализовано
audience: Ольга + стратег-чат
---

# Разведка: пауза → скрытие встреч в публичном Meetings

Только наблюдения. Решение не выбрано — Ольга и стратег-чат синтезируют его поверх.

## TL;DR (одна минута чтения)

1. Пауза хранится в **двух полях** `profiles`: `status='suspended'` (UI-маркер) и `access_status='paused_manual'` (RLS-гард). Их меняет один метод [services/dataService.js:1571-1579](services/dataService.js#L1571-L1579), вызываемый из [views/AdminPanel.jsx:1216-1235](views/AdminPanel.jsx#L1216-L1235).
2. Публичное приложение **Meetings — отдельный фронт** на `meetings.skrebeyko.ru`, исходников в этом репо **нет**. Оно читает таблицу `events` **анонимно через web_anon** (см. шапку [migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql:5-23](migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql#L5-L23)).
3. Таблица `events` — **зеркало** `meetings`, заполняется триггером `sync_meeting_to_event` ([migrations/14_schedule_city_contract.sql:42-162](migrations/14_schedule_city_contract.sql#L42-L162)). Триггер **не смотрит** на `access_status` ведущей → встречи паузной ведущей остаются в `events` и видны публично.
4. **Острая асимметрия с требованием.** Требование: «остаются у самой ведущей в её профиле». Текущая RESTRICTIVE-политика `meetings_active_access_guard_select` ([migrations/21_billing_subscription_access.sql:148-152](migrations/21_billing_subscription_access.sql#L148-L152)) **уже блокирует** саму ведущую от чтения её же встреч, когда она на паузе. То есть текущее поведение **противоположно** одной части требования и **сходится** с другой по неверной причине (блокирует и публику, и хозяйку, но через RLS на `meetings`, а публичный Meetings всё равно их видит, потому что читает зеркало `events`, а не `meetings`).
5. Регистраций/участников встреч **в БД нет** — оплата и запись идут по внешним ссылкам (`payment_link`/`registration_link`). Скрытие из `events` ничего «не ломает» в нашей БД, но внешние ссылки продолжат работать.

---

## БЛОК 1. Статус «пауза»

### 1.1. Хранилище

Миграция [21_billing_subscription_access.sql:1-41](migrations/21_billing_subscription_access.sql#L1-L41) добавила в `profiles` два поля:

```sql
alter table public.profiles
  add column if not exists access_status text default 'active',
  add column if not exists subscription_status text default 'active',
  ...

alter table public.profiles
  add constraint profiles_access_status_check
  check (access_status in ('active', 'paused_expired', 'paused_manual'));
```

То есть возможные значения `access_status`: `active` / `paused_expired` (автопауза при истёкшей подписке) / `paused_manual` (ручная пауза от админа).

В коде те же значения зашиты как enum [services/dataService.js:389-393](services/dataService.js#L389-L393):

```javascript
const ACCESS_STATUS = {
    ACTIVE: 'active',
    PAUSED_EXPIRED: 'paused_expired',
    PAUSED_MANUAL: 'paused_manual'
};
```

Параллельно есть **второе поле** `profiles.status` (старое, UI-маркер) — оно меняется одновременно, и значения там другие: `'active'` / `'suspended'`. Таблица соответствия:

| `status` (UI-маркер)  | `access_status` (RLS-гард) | Поведение                          |
|-----------------------|----------------------------|------------------------------------|
| `'active'`            | `'active'`                 | обычный пользователь               |
| `'suspended'`         | `'paused_manual'`          | ручная пауза, нажата админкой      |
| (через биллинг)       | `'paused_expired'`         | автопауза при истёкшей подписке    |

Двойной источник истины — потенциальный риск: если кто-то когда-нибудь обновит только одно поле, два смысла разъедутся.

### 1.2. Как админ ставит на паузу

UI: [views/AdminPanel.jsx:1216-1235](views/AdminPanel.jsx#L1216-L1235), кнопка ⏸ (или ⛔️ для возврата) рядом с кнопкой удаления:

```jsx
const isSuspended = u.status === 'suspended';
confirmAction(
    isSuspended ? "Вернуть доступ?" : "Приостановить доступ?",
    isSuspended ? `Вы хотите вернуть доступ пользователю ${u.name}?`
                : `Пользователь ${u.name} не сможет войти в приложение.`,
    async () => {
        await api.toggleUserStatus(u.id, isSuspended ? 'active' : 'suspended');
        onNotify("Статус обновлен (обновите страницу)");
    },
    'primary'
);
```

API-метод [services/dataService.js:1571-1579](services/dataService.js#L1571-L1579):

```javascript
async toggleUserStatus(userId, newStatus) {
    const accessStatus = newStatus === 'suspended'
        ? ACCESS_STATUS.PAUSED_MANUAL
        : ACCESS_STATUS.ACTIVE;
    await postgrestFetch('profiles', { id: `eq.${userId}` }, {
        method: 'PATCH',
        body: { status: newStatus, access_status: accessStatus },
        returnRepresentation: true
    });
    return true;
}
```

То есть один PATCH на `profiles`, два поля. На таблицу `meetings`/`events` админ напрямую не ходит — пауза сейчас работает только через RLS-побочку (см. блок 3.2).

### 1.3. RLS-функция-гвардиан

Из [migrations/21_billing_subscription_access.sql:83-99](migrations/21_billing_subscription_access.sql#L83-L99):

```sql
create or replace function public.has_platform_access(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user
      and (
        p.role = 'admin'
        or coalesce(p.access_status, 'active') = 'active'
      )
  );
$$;
```

`admin` — всегда проходит. Все остальные — только если `access_status = 'active'`.

Эта функция вешается RESTRICTIVE-политикой на 13 таблиц, включая `meetings` и `events` ([21_billing_subscription_access.sql:122-169](migrations/21_billing_subscription_access.sql#L122-L169)):

```sql
foreach t in array array['profiles','meetings','events','goals',...]
loop
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (public.has_platform_access(auth.uid()))',
      t || '_active_access_guard_select', t
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.has_platform_access(auth.uid())) with check (public.has_platform_access(auth.uid()))',
      t || '_active_access_guard_write', t
    );
end loop;
```

⚠ Важно: политика — `TO authenticated`. На анонимные запросы (`web_anon`, через который ходит публичное Meetings) она не действует.

---

## БЛОК 2. Приложение MEETINGS

### 2.1. Где код

В этом репо **только админский редактор/личный кабинет** (`views/MeetingsView.jsx`). Само публичное приложение Meetings — **отдельный фронт на `meetings.skrebeyko.ru`**, в репо его нет. Прямая цитата из шапки последней миграции [migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql:5-23](migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql#L5-L23):

> Diagnostic 2026-05-04 показал: приложение Meetings (meetings.skrebeyko.ru) ходит к api.skrebeyko.ru анонимно для 4 public-read таблиц [...] curl https://api.skrebeyko.ru/events?select=id,title&limit=1 → HTTP 200 + JSON

То есть Meetings — отдельный SPA, который грантованно для роли `web_anon` читает четыре таблицы: `events`, `cities`, `notebooks`, `questions`. См. [migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql:67-71](migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql#L67-L71):

```sql
GRANT SELECT ON public.events    TO web_anon;
GRANT SELECT ON public.cities    TO web_anon;
GRANT SELECT ON public.notebooks TO web_anon;
GRANT SELECT ON public.questions TO web_anon;
```

### 2.2. Откуда берутся встречи

Публичное Meetings, по содержанию шапки phase18, читает таблицу **`events`**, а не `meetings`. `events` — зеркало `meetings`, заполняемое триггером.

В этом репо «зеркало для админки» читается так — [services/dataService.js:1917-1928](services/dataService.js#L1917-L1928):

```javascript
async getAllEvents() {
    try {
        const { data } = await postgrestFetch('events', {
            select: 'id,garden_id,title,description,date,city,city_key,time,location,category,image_url,image_focus_x,image_focus_y,price,registration_link,meeting_format,online_visibility,starts_at,day_date',
            order: 'date.desc'
        });
        return data;
    } catch (error) {
        console.warn("Events fetch failed", error);
        return [];
    }
}
```

Никакого JOIN с `profiles`, никакой фильтрации по статусу ведущей. Поле `garden_id` (FK на `meetings.id`) есть, но к `profiles` через `meetings.user_id` явно не идёт.

> Note: на 705-755 в `dataService.js` есть «дубликаты» `getMeetings`/`getAllEvents` на localStorage — это **legacy-моки**, перекрытые реальными PostgREST-версиями ниже (1736/1904/1917). Считать актуальными нужно те, что под классом ниже.

### 2.3. Триггер `meetings → events` (источник проблемы)

[migrations/14_schedule_city_contract.sql:42-162](migrations/14_schedule_city_contract.sql#L42-L162). Ключевой фрагмент:

```sql
CREATE OR REPLACE FUNCTION public.sync_meeting_to_event()
RETURNS trigger AS $$
DECLARE
    user_city TEXT;
    user_name TEXT;
    user_role TEXT;
    ...
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.events WHERE garden_id = OLD.id;
        RETURN OLD;
    END IF;

    SELECT city, name, role INTO user_city, user_name, user_role
    FROM public.profiles
    WHERE id = NEW.user_id;

    -- ... вычисление final_format, final_city, speaker_label ...

    IF (NEW.is_public = true) THEN
        IF EXISTS (SELECT 1 FROM public.events WHERE garden_id = NEW.id) THEN
            UPDATE public.events SET ... WHERE garden_id = NEW.id;
        ELSE
            INSERT INTO public.events (...) VALUES (...);
        END IF;
    ELSE
        DELETE FROM public.events WHERE garden_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Триггер берёт из `profiles` только `city`, `name`, `role`. **`access_status` он не читает и в условии не использует.** Решение «есть ли строка в `events`» определяется **только** флагом `meetings.is_public`. Поэтому встреча паузной ведущей сохраняется в `events` ровно до тех пор, пока кто-нибудь не дёрнет `UPDATE` или `is_public=false` — то есть фактически навсегда.

Триггер срабатывает только при изменении самой `meetings`. Когда меняется `profiles.access_status`, никакой синхронизации не происходит.

### 2.4. RLS на `events`

До phase18 было хорошо: events открыта `USING(true)` для всех — широкая дыра, но Meetings работал. После phase18:

- web_anon — `GRANT SELECT` ([phase18:68](migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql#L68))
- authenticated — `SELECT`, без `INSERT/UPDATE/DELETE` ([phase18:74](migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql#L74))

Записи в `events` идут только через триггер под owner-ролью.

Дополнительно к существующим PERMISSIVE-политикам, миграция 21 повесила RESTRICTIVE-политику `events_active_access_guard_select` (через цикл по 13 таблицам). **Но она `TO authenticated`**, на `web_anon` не действует. То есть для публичного Meetings (который аноним) этот RESTRICTIVE — пустое место.

---

## БЛОК 3. Личный кабинет ведущей

### 3.1. Где она видит свои встречи

Компонент: [views/MeetingsView.jsx:621](views/MeetingsView.jsx#L621), монтируется из [views/UserApp.jsx:941](views/UserApp.jsx#L941). Данные приходят prop'ом `meetings`, загружены в [views/UserApp.jsx:159-166](views/UserApp.jsx#L159-L166):

```javascript
const [meetingsData, practicesData, scenariosData, goalsData, clientsData] = await Promise.all([
    api.getMeetings(user.id),
    ...
]);
setMeetings(meetingsData || []);
```

Под капотом [services/dataService.js:1736-1743](services/dataService.js#L1736-L1743):

```javascript
async getMeetings(userId) {
    const { data } = await postgrestFetch('meetings', {
        select: '*',
        user_id: `eq.${userId}`,
        order: 'date.desc'
    });
    return data;
}
```

**Это другая таблица** (`meetings`) и **другой запрос**, чем у публичного Meetings (`events`). Это хорошо: разводить нечего, они уже разведены физически.

### 3.2. Текущая RLS-блокировка у самой ведущей

PERMISSIVE-политики на `meetings` ([migrations/08_meetings_rls.sql:11-15](migrations/08_meetings_rls.sql#L11-L15)):

```sql
create policy meetings_select_own
  on public.meetings
  for select
  to authenticated
  using (auth.uid() = user_id);
```

Плюс `meetings_select_admin` через `is_admin()`.

И поверх — RESTRICTIVE из миграции 21:

```sql
create policy meetings_active_access_guard_select
  on public.meetings
  as restrictive
  for select
  to authenticated
  using (public.has_platform_access(auth.uid()));
```

PostgreSQL требует, чтобы прошли **все** RESTRICTIVE и **хотя бы одна** PERMISSIVE. Когда ведущая на паузе:

- PERMISSIVE `meetings_select_own`: `auth.uid() = user_id` → TRUE
- RESTRICTIVE `meetings_active_access_guard_select`: `has_platform_access(auth.uid())` → FALSE (потому что `access_status = 'paused_manual'`)
- → итог: **0 строк**.

То есть **сейчас, как только админ нажал паузу, ведущая полностью теряет доступ ко всему**: при первом же запросе фронта она получит `SubscriptionExpiredScreen.jsx` (или эквивалент) — её просто выкинет. Логика этого экрана уже есть в коде (`views/SubscriptionExpiredScreen.jsx`).

⚠ **Это не сходится с требованием** «остаются у самой ведущей в её профиле, она их видит, может управлять». Сейчас она вообще в приложение не входит.

---

## БЛОК 4. Участники / регистрации

Поиск по миграциям: таблиц `registrations`, `attendees`, `meeting_participants`, `event_participants`, `bookings` — **нет**.

Регистрации идут целиком через внешний `payment_link` (Продамус и т.п.), который в `meetings.payment_link` и зеркалится в `events.registration_link` ([migrations/14_schedule_city_contract.sql:117](migrations/14_schedule_city_contract.sql#L117)).

Следствие: скрытие встречи из `events` **ничего не ломает в нашей БД** (нечего ломать), но пользователи, у которых уже сохранена прямая ссылка регистрации, продолжат попадать на форму оплаты. Это не баг, это просто факт о границе системы.

---

## БЛОК 5. Карта изменений (наблюдения, не решение)

### 5.1. Что нужно по требованию

| Условие                                            | Сейчас                                                           | Должно быть             |
|----------------------------------------------------|------------------------------------------------------------------|--------------------------|
| Публичное Meetings показывает встречи паузной ведущей | **да** (через зеркало `events`, web_anon, никакой фильтрации)    | нет                      |
| Ведущая видит свои встречи в личном кабинете        | **нет** (RESTRICTIVE-гард блокирует ей всё, не только встречи)   | да                       |
| Ведущая может управлять своими встречами            | **нет** (тот же гард на write)                                  | да                       |

То есть обе части задачи требуют доработки. Фича на уровне «один раз поправить триггер» — невозможна, не поломав авторизацию вокруг.

### 5.2. Точки минимального вмешательства (кандидаты)

#### A. Фильтр на уровне `events` (скрыть от публики)

**A.1. Доработать триггер** [migrations/14_schedule_city_contract.sql:42-162](migrations/14_schedule_city_contract.sql#L42-L162). Добавить чтение `access_status` из `profiles` и условие:

```sql
SELECT city, name, role, access_status INTO user_city, user_name, user_role, user_access_status
FROM public.profiles
WHERE id = NEW.user_id;

IF (NEW.is_public = true AND coalesce(user_access_status, 'active') = 'active') THEN
    -- INSERT/UPDATE events
ELSE
    DELETE FROM public.events WHERE garden_id = NEW.id;
END IF;
```

Плюсы: один источник истины, мгновенный эффект при следующем UPDATE на `meetings`.

Минусы: **сам по себе не сработает в момент паузы** — пауза меняет `profiles`, а не `meetings`, триггер не сработает. Нужен либо отдельный триггер на `profiles.access_status`, который пройдётся по всем `meetings` ведущей и переинсертит/удалит из `events`, либо явный SQL-вызов из `toggleUserStatus`.

**A.2. Фильтр на уровне SELECT в `events`.** Можно построить view `events_public` поверх `events` с JOIN на `meetings` → `profiles` и фильтром `WHERE p.access_status = 'active'`, и переключить публичный Meetings на этот view. Минусы: web_anon должен иметь доступ к view, и view не должна тащить за собой PII профилей; нужен `security_invoker = false` (определяется владельцем).

**A.3. RLS на `events`.** Создать на `events` RESTRICTIVE-политику для `web_anon` (а не для `authenticated`!) с подзапросом к `meetings`+`profiles`. Минусы: `web_anon` через RLS работает медленнее, плюс политика на анонимной роли непривычна и плохо отлаживается.

#### B. Снять блокировку с ведущей (она должна видеть свои встречи)

**B.1. Сузить RESTRICTIVE на `meetings`.** Сейчас `meetings_active_access_guard_select` запрещает всё. Можно либо удалить её, либо переписать с явным исключением:

```sql
using (
  public.has_platform_access(auth.uid())
  OR auth.uid() = user_id   -- хозяин видит свои всегда
)
```

Аналогично — `_write`-вариант. Это позволит ведущей читать/менять свои встречи, оставив RESTRICTIVE на чужие данные.

**B.2. Аналогично пересмотреть гард на остальные 12 таблиц** — по принципу «пауза не должна выкидывать из приложения, только ограничивать публичность». Здесь нужно отдельное стратегическое решение: пауза = «лишение доступа к платформе» (как сейчас) или «лишение публичности» (как требует фича)?

### 5.3. Связка A+B

Фича требует обеих правок одновременно: A (фильтр публики) + B (разблокировать ведущую). Приложить только одну — получится либо «нет, всё равно видно публично» (только B), либо «выкинуло ведущую» (только A, потому что и так выкидывает).

Это не «маленькая фича» — это смена смысла «паузы»: с «вышел из подписки → потерял доступ» на «вышел из подписки → ушёл из публичного индекса, но в саду остаёшься».

### 5.4. Что стоит уточнить у Ольги до синтеза

- **Что именно значит «пауза»?**
  - Вариант 1: «не платит подписку → не публикуется, но видит свой кабинет, чтобы вернуться» → нужна связка A+B.
  - Вариант 2: «не платит → полный лок» (как сейчас), плюс отдельно «снять с публикации» (новое отдельное действие). Тогда не надо трогать `access_status`, надо вводить новое поле `profiles.is_public_listing` (или флаг на `meetings` массово), и фича превращается в маленькую.
- Должен ли админ видеть встречи паузной ведущей в админских отчётах? (Текущий гвардиан пропускает админа — да, но это стоит подтвердить.)
- Нужно ли **массово** снимать публичность встреч в момент паузы (триггер на `profiles`) или достаточно только новых?

---

## БЛОК 6. Риски

1. **Потеря доступа ведущей к её собственным данным** уже происходит сейчас на любую паузу (см. 3.2). Если стратегия паузы изменится в сторону «остаётся в саду», это **изменение контракта** RESTRICTIVE-гарда на 13 таблиц, не одной.
2. **Внешние ссылки регистрации продолжают работать** (БД участников нет). Это не баг, но имеет смысл проговорить с Ольгой: что делать с уже зарегистрированными — оставлять, отменять, давать ведущей знать?
3. **Админская статистика и `MapView`/`StatsDashboardView`.** Если фильтровать на уровне триггера — статистика, которая считает по `events`, будет недосчитывать паузные встречи. Если фильтровать только на view/RLS публичного контура — админский фронт продолжит видеть всё. Проверить, на какой источник смотрят `views/StatsDashboardView.jsx`, `views/MapView.jsx`, прежде чем выбирать точку.
4. **Двойной источник истины `status` ↔ `access_status`.** Любая будущая правка должна синхронно обновлять оба, иначе разъедется (сейчас это инкапсулировано в `toggleUserStatus`, но прямой PATCH на одно поле обходит инвариант).
5. **Phase18 и далее RLS на events.** События пишутся ТОЛЬКО триггером, прямого write нет. Любая правка триггера — единственный путь, и она должна оставаться идемпотентной.
6. **Если выберется путь «триггер на `profiles.access_status`»**, он должен пройти по всем `meetings` ведущей и переинсертить/удалить — на десятках встреч это может быть тяжёлым. Нужно ограничить его условием `WHEN NEW.access_status IS DISTINCT FROM OLD.access_status`.

---

## Прямые ссылки на исходники (сводка)

| Что                                          | Где                                                                                                            |
|----------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Поля `access_status` / `status` в `profiles` | [migrations/21_billing_subscription_access.sql:1-41](migrations/21_billing_subscription_access.sql#L1-L41)     |
| RLS-функция `has_platform_access`            | [migrations/21_billing_subscription_access.sql:83-99](migrations/21_billing_subscription_access.sql#L83-L99)   |
| RESTRICTIVE-гарды на 13 таблиц               | [migrations/21_billing_subscription_access.sql:122-169](migrations/21_billing_subscription_access.sql#L122-L169) |
| Триггер `sync_meeting_to_event`              | [migrations/14_schedule_city_contract.sql:42-162](migrations/14_schedule_city_contract.sql#L42-L162)            |
| RLS-политики на `meetings` (PERMISSIVE)      | [migrations/08_meetings_rls.sql:11-85](migrations/08_meetings_rls.sql#L11-L85)                                  |
| Гранты web_anon на events                    | [migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql:67-74](migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql#L67-L74) |
| `ACCESS_STATUS` enum во фронте               | [services/dataService.js:389-393](services/dataService.js#L389-L393)                                            |
| `toggleUserStatus` (паузный API)             | [services/dataService.js:1571-1579](services/dataService.js#L1571-L1579)                                        |
| `getMeetings` (личный кабинет)               | [services/dataService.js:1736-1743](services/dataService.js#L1736-L1743)                                        |
| `getAllEvents` (зеркало для админки)         | [services/dataService.js:1917-1928](services/dataService.js#L1917-L1928)                                        |
| Кнопка ⏸ в админке                           | [views/AdminPanel.jsx:1216-1235](views/AdminPanel.jsx#L1216-L1235)                                              |
| Личный кабинет встреч                        | [views/MeetingsView.jsx:621](views/MeetingsView.jsx#L621), [views/UserApp.jsx:159-166](views/UserApp.jsx#L159-L166) |

---

_Подготовлено: 2026-05-04, read-only разведка. Никаких файлов кроме этого отчёта не редактировалось._
