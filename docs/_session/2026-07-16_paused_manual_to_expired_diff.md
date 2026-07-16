# Diff на ревью — paused_manual → paused_expired (даём путь самопродления)

**Дата:** 2026-07-16
**Повод:** Одета (и др.) заперты в `paused_manual` — админ-тупик без экрана
продления. Оля: паузила вручную тех, кто выходил из канала/чата Лиги;
предложила «всем поменять статус на paused_expired», чтобы появился
self-serve checkout (выкачен сегодня, #270/0458092).

## Почему это чинит проблему
`_assertActive` (dataService.js:1254): `paused_manual` → `ACCESS_PAUSED_MANUAL`
(«приостановлен администратором») + авто-логаут, БЕЗ продления. А
`paused_expired` → `SUBSCRIPTION_EXPIRED` → встроенный экран checkout. Флип
переводит людей из тупика в самопродление.

## Recon (read-only, прод)
- Всего `paused_manual`: **12**.
- `telegram_user_id` привязан: **0 из 12** → авто-кик (включён сегодня) их
  НЕ видит. **kick_risk_after_flip = 0.** Флип безопасен для TG-доступа.
- Bridge-trigger `trg_sync_status_from_access_status`: paused_expired И
  paused_manual → `status='suspended'`. Флип НЕ меняет status, рассинхрона нет.
- Все 12: `auto_pause_exempt=false` (барт-исключений нет).

## Затрагиваемые (12)
| роль | кто | paid_until |
|---|---|---|
| leader | Odeta Suldiakova, Анна Минаева, Елена Колкова, Колотилова Светлана, Юлия Абдурахманова | NULL |
| leader | Елена Мельникова | 2026-05-14 |
| leader | Ольга Бородина | 2026-04-10 |
| leader | Ольга Пограницкая | 2026-06-12 |
| intern | Анастасия Ван | 2026-05-20 |
| mentor | Настин фиксик | NULL |
| applicant | Марина Шульга, Ольга Коняхина | NULL |

**Флаги для сознательного решения:**
- 2 **applicant** (Марина Шульга, Ольга Коняхина) — по дизайну nightly-reconcile
  applicant'ы вообще НЕ подлежат expiry-паузе. Флип безвреден (увидят
  продление), но семантически это не «истёкшая подписка». Включать?
- **Настин фиксик** (mentor) — похоже тестовый/служебный аккаунт. Включать?

## Изменение (прод DB, в транзакции)
```sql
begin;
update public.profiles
   set access_status='paused_expired'
 where access_status='paused_manual'          -- при исключениях добавить: and role not in ('applicant') / and name<>'Настин фиксик'
 returning name, role, access_status, status; -- ждём 12 (или меньше при исключениях), status='suspended'
-- сверка count → commit;
commit;
```

## После 🟢
1. Транзакция с RETURNING, проверка что status='suspended' у всех, commit.
2. Верификация: 0 строк в paused_manual (или ровно исключённые), N в paused_expired.
3. users_auth не трогаем — логин у них и так работает (у Одеты статус active).
4. Текст для пересылки Одете: зайти на liga.skrebeyko.ru тем же email
   `odeta.post@gmail.com` + новый пароль → увидит экран продления → оплатит.

## ПРИМЕНЕНО 2026-07-16 (🟢 «всех давай»)
- Транзакция: **UPDATE 12**, commit. Все 12 → `access_status='paused_expired'`,
  `status='suspended'` (триггер отработал, рассинхрона нет).
- Скоуп: все 12, включая 2 applicant и «Настин фиксик» (по решению Оли).
- Верификация: `paused_manual` осталось **0**; Одета = paused_expired/suspended.
- Эффект: эти 12 при следующем логине попадут на встроенный экран
  продления (checkout), а не в админ-тупик. Авто-уведомления им не шлём.
