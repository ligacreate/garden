# DIFF на ревью — Фаза 1d: UI «Моя подписка» (ProfileView)

**Дата:** 2026-07-09 · **Автор:** codeexec · **Статус:** DIFF — не задеплоено. `npm run build` ✓, `node --check` ✓.

## Подтверждение выполнимости (по твоим вопросам)
1. **Программная смена view → да.** UserApp держит `const [view, setView]`. Добавил `paidReturn` проп + `useEffect(()=>{ if(paidReturn) setView('profile') },[paidReturn])` → возврат приземляет на ProfileView.
2. **Авто-poll → да.** Паттерн `api.getCurrentUser() → onProfileRefresh(fresh)` уже используется (TG-линк FEAT-024). Реализовал: на возврате опрос каждые 3с (первый через 1.5с), до 5 попыток или пока `paid_until` не **вырастет** относительно замороженного baseline. Ручная «Обновить статус» — fallback.
   - **Детект по РОСТУ (правка по ревью):** `paidBaselineRef` = `user.paid_until` заморожен на маунте (`useRef`). Успех = `new Date(fresh.paid_until) > baseline`. Новая оплата: baseline=0 (null/прошлое) → любая будущая дата проходит. Продление: baseline уже будущий → ждём УВЕЛИЧЕНИЯ (иначе poll остановился бы мгновенно, т.к. дата и так в будущем).
3. **Уже-оплаченный:** «Подписка активна · Оплачено до DD.MM.YYYY» + кнопка «Продлить» (докидывает стопкой через 1c months-режим на след. платеже). Дата явная.

## Изменения

### Backend (rsync, окна 403 НЕТ — деплоить отдельно)
- `push-server/server.mjs`: `YOOKASSA_RETURN_URL` default → **`https://liga.skrebeyko.ru/?paid=1`** (было `#/subscription?status=ok`; hash-роутинга у app нет). Prodamus `urlReturn`/`urlSuccess` берут это же значение.

### Frontend (бандлится с 1e-фронтом → ОДНО окно 403)
- `services/dataService.js`: **`createCheckout(planCode)`** → POST `/api/billing/checkout {plan_code, provider:'prodamus'}` (JWT авто) → `{url}`.
- `views/ProfileView.jsx`:
  - Карточка **«Моя подписка»** (первой в гриде): статус из одного `user.paid_until` (derive-on-read) — «активна до DD.MM» / «истекла» / «не оплачена»; список планов 1/3/6 из `getBillingPlans` с ценами; кнопка «Оплатить»/«Продлить» → `createCheckout` → `window.location.href = url`.
  - `paidReturn` проп → баннер «Обрабатываем оплату…» + авто-poll + fallback-кнопка.
  - Показывается всем ролям (в т.ч. admin — для теста).
- `App.jsx`: на маунте читает `?paid=1` → `setPaidReturn(true)` + **чистит URL** (`history.replaceState`, чтобы refresh не ретриггерил) → проп в `UserApp`.
- `views/UserApp.jsx`: `paidReturn` проп → `setView('profile')` + проброс в ProfileView.

## Флоу (полный)
Юзер в «Моя подписка» → выбрал план → «Оплатить» → `createCheckout` → редирект на Prodamus (СБП/РФ/зарубеж на форме) → оплата → `urlReturn` = `liga.skrebeyko.ru/?paid=1` → App ловит `?paid=1` → UserApp → view='profile' → ProfileView баннер «обрабатываем» + poll → вебхук (1c) проставил `paid_until` → poll поймал → «Активна до DD.MM».

## Идемпотентность/безопасность
- Сумма/user_id — на сервере (1b anti-tamper), фронт шлёт только `plan_code`.
- Двойной клик «Оплатить» — `subCheckoutLoading` дизейблит кнопку.
- URL чистится от `?paid=1` → повторный refresh не крутит poll заново.

## Деплой по 🟢 (порядок)
1. **Backend** (return_url): rsync push-server + restart. Окна 403 нет. Можно сразу.
2. **Frontend** (1d карточка + App/UserApp + 1e AdminPanel-кнопка): `git push` → CI/FTP = **одно окно 403** в спокойное время. Выкатывает 1d+1e разом.
3. **Smoke после фронт-выкатки:** зайти в Профиль → «Моя подписка» → план → Оплатить → demo/реальная оплата → возврат `?paid=1` → приземление на карточку + poll → статус «активна». (Можно на твоём admin-профиле — он сейчас «не оплачено».)

Коммит 1d — с 1e вместе (оба ждут одного push-окна), или отдельным коммитом сейчас — как скажешь.
