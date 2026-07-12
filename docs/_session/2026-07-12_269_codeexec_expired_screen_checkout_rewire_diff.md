# DIFF-ON-REVIEW — экран продления: bot_renew_url → встроенный checkout (re-entry rewire под hardlock)

**Дата:** 2026-07-12 · **Автор:** codeexec · **Статус:** ✅ ПРИМЕНЕНО в рабочее дерево + `npm run build` зелёный. НЕ задеплоено (ждёт слова Оли + браузер-проверки).
**Одобрено:** дизайн 🟢 Оля; текст экрана 🟢 Оля (заголовок + текст 1f + footer).
**Связано:** [`_session/268`](2026-07-12_268_codeexec_liga_hardlock_diff.md), recon этой сессии.

## Проблема
Истёкшие дольше grace → `paused_expired` → `_assertActive` кидает `SUBSCRIPTION_EXPIRED` → экран accessBlock, CTA = `bot_renew_url` (ссылка старого TG-бота, умирает вместе с TargetHunter). Нужна рабочая оплата на самом экране.

## Решение
На экране `SUBSCRIPTION_EXPIRED` вместо `bot_renew_url` — тот же checkout, что в «Моей подписке» (планы + «Продлить» → `createCheckout` → Prodamus). Общая логика вынесена в `components/SubscriptionCheckout.jsx` (используется и в ProfileView, и на экране — без дублирования). Реактивация — штатный webhook (`paid_until` + `access_status='active'`). Скоуп строго `SUBSCRIPTION_EXPIRED`; `ACCESS_PAUSED_MANUAL` не тронут.

**Обязательный сопутствующий фикс:** для `SUBSCRIPTION_EXPIRED` в interval-пути больше НЕ вызываем `api.logout()` — иначе стирался JWT и checkout на экране падал. JWT сохраняется; данные всё равно режет серверный RLS.

## Изменённые файлы
1. **NEW** `components/SubscriptionCheckout.jsx` — планы (`getBillingPlans`) + выбор + «Оплатить» (`createCheckout` → редирект). Пропсы: `heading`, `ctaLabel`, `onNotify`, `footer`.
2. `views/SubscriptionExpiredScreen.jsx` — убрана `renewUrl`-кнопка; добавлен `<SubscriptionCheckout heading="Выберите план" ctaLabel="Продлить подписку" onNotify/>`; текст обновлён; «Я уже оплатил» (`onRetry`) сохранён; проп `onNotify`.
3. `App.jsx` — interval-хендлер: `logout()` только для `ACCESS_PAUSED_MANUAL` (для expired JWT сохраняем); в рендер `<SubscriptionExpiredScreen>` убран `renewUrl`, добавлен `onNotify={showNotification}`.
4. `views/ProfileView.jsx` — импорт компонента; удалены дублирующие `subPlans/subSelected/subCheckoutLoading` + effect `getBillingPlans` + `handleCheckout`; инлайн-блок заменён на `<SubscriptionCheckout/>` (лейблы через пропсы, ручной refresh через `footer`). Поллинг (`subPolling`, `paidReturn`-effect, `handleRefreshSubStatus`) остался в ProfileView.

## Одобренный текст экрана
- Заголовок: **Подписка завершена**
- Текст: **Подписка на Лигу завершена. Выбери план и продли — доступ откроется сразу после оплаты. Ждём тебя.**
- Footer (в компоненте): **Оплата через Prodamus — на форме доступны СБП, карты РФ и зарубежные. Без автопродления.**

## 4 проверки перед apply — все зелёные
1. **RLS airtight (критично, live read-only):** импертонировал `paused_expired`-JWT (`SET LOCAL ROLE authenticated` + `request.jwt.claim.sub`) vs active-контроль. Результат:
   `billing_plans` EXP=3 / ACT=3; `profiles` **0**/64; `billing_webhook_logs` **permission denied**; `birthday_templates` **0**/2; `course_progress` **0**/2; `events` **0**/189; `goals` **0**/1.
   `has_platform_access = role='admin' OR access_status='active'` → у expired false. Гейтит 40 таблиц. **Замкнутый с валидным JWT видит ноль чувствительного; доступны только billing_plans + checkout → keep-JWT безопасен.** ✅
2. **ProfileView 1:1 (static):** все ссылки на удалённый state — только внутри выносимого блока (grep чист); компонент воспроизводит разметку/лейблы/`disabled`/footer 1:1. ✅ (runtime-1:1 подтвердить в браузере)
3. **interval-токен (static):** для expired `logout()` не зовётся → токен жив → checkout работает; `setCurrentUser(null)` гасит interval. ✅
4. **billing_plans RLS (live):** `billing_plans_select_active` = SELECT `{authenticated}`, qual `(active=true OR is_admin())` — чистый authenticated, без has_platform_access. ✅

## Верификация
- `npm run build` — ✅ (единственное предупреждение — пред-существующий размер чанков).
- Линт затронутых/новых файлов — чисто (baseline репо шумный: линтит dist + пред-существующий `notificationId` на App.jsx:385).

## Пост-verify фикс (Вариант 1 — одобрен Олей)
`/verify` вскрыл: `App.jsx` передавал `message={accessBlock.message}` (= `_assertActive` «Доступ к Лиге приостановлен…») → одобренный текст экрана не показывался. **Фикс:** убран `message` из вызова `<SubscriptionExpiredScreen>` (экран рендерится только для `SUBSCRIPTION_EXPIRED`) → компонент показывает одобренный дефолт. Перепроверено Playwright: тело = «Подписка на Лигу завершена. Выбери план и продли — доступ откроется сразу после оплаты. Ждём тебя.» ✅ `npm run build` зелёный.

## Runtime-verify (Playwright, реальный dev + HTTP-мок на границе)
- (a) экран продления: заголовок/планы/«Продлить»/«Я уже оплатил» + токен сохранён ✅; клик «Продлить» → `createCheckout` → редирект на Prodamus ✅
- (a-return) `?paid=1` при active → кабинет открывается ✅
- (b) «Моя подписка» 1:1 (планы, «Продлить», join-кнопки, ручной refresh при paidReturn) ✅
- (c) 60-сек interval → paused_expired: экран продления, **токен НЕ стёрт**, checkout жив ✅
- Побочно: `Card` игнорит проп `title` → «Моя подписка» не выводится (пред-существующее, косметика).

## Осталось (до деплоя)
- Браузер-проверка: (а) экран продления показывает планы и «Продлить» → Prodamus; после оплаты возврат → кабинет открывается; (б) «Моя подписка» работает 1:1; (в) interval-истечение → checkout на экране жив.
- Деплой фронта — CI (`npm run build` в deploy.yml). Порядок: **этот фикс → потом гасим TH.**
