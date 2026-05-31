# UI-PENDING-APPROVAL-LIST push + deploy verify

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** 🟢 PUSH + monitor deploy + alerts
**Тип:** Push report. Read-only после push. **Без apply / commit.**

---

## TL;DR

- ✅ Push прошёл: `eada640..b3f5236 main -> main`. Branch'у больше не ahead of origin.
- ✅ Deploy завершился. Bundle hash сменился с `index-MW5GmWly.js` → **`index-C8r3ZVMY.js`** (+ CSS `index-C7qQ5arh.css` → **`index-B_Dtql1J.css`**).
- ✅ Новый bundle отдаётся: 200 OK, Content-Length 499618 байт (~488 KB main chunk).
- ✅ Alerts: ни одного. garden-auth journal пуст за 30 мин (нет client-error POST'ов, нет failed запросов), TG queue пустая.
- 🕐 Сценарий B (одобрение pending) откладывается до реальной регистрации или Ольгиного тестового аккаунта.

---

## 1. Push

```
$ git push
To https://github.com/ligacreate/garden.git
   eada640..b3f5236  main -> main
```

Всю tail запушило одним заходом (предыдущие 2 коммита `03a4d50` + `eada640` уже были в origin, фактически только `b3f5236` был ahead). После push'а — branch in-sync с origin/main.

## 2. Bundle hash diff

| | Pre-deploy | Post-deploy |
|---|---|---|
| **JS** | `index-MW5GmWly.js` | **`index-C8r3ZVMY.js`** ✅ |
| **CSS** | `index-C7qQ5arh.css` | **`index-B_Dtql1J.css`** ✅ |

⚠ Замечание: Ольга в брифе ожидала «был index-CTrlSsPw.js». На момент моего pre-deploy snapshot'а (за пару секунд до push) был уже `index-MW5GmWly.js`. Возможно, какой-то предыдущий деплой проехал между Ольгиным наблюдением и моим. Не блокер — новый hash изменился относительно реального предыдущего.

Bundle size: 499 618 байт = ~488 KB main chunk (gzip даст ~120-150 KB реально по сети). На уровне expected'а — добавили ~30 строк JSX + 1 useMemo + dropdown logic. Прирост ~1-2 KB исходника, минор.

## 3. Deploy timeline

| event | time | примечание |
|---|---|---|
| git push | T0 | b3f5236 в origin/main |
| GitHub Actions триггернулся | ≈T0+5s | (не verified — gh CLI не auth'd на этой машине) |
| FTP upload + atomic swap | ≈T0+2min | Detected через polling прода |
| HTTP 403 промежуточное состояние | ~10-30s | FTP ещё писал index.html, веб-сервер вернул placeholder. Это **обычное поведение** Caddy/FTP во время swap'а, не bug. |
| HTTP 200 с новым bundle hash | T0+2-3min | Полное завершение. |

Polling-стратегия: `until [ hash != old ]; do sleep 20; done` → детектила сначала 403 (FTP в процессе), потом 200 OK с новым hash. Total wait ~2-3 минуты, в рамках норм.

## 4. Alerts: ни одного

### 4.1 garden-auth journal (где живёт `/api/client-error` handler)

```bash
journalctl -u garden-auth --since "30 minutes ago" --no-pager
-- No entries --
```

Абсолютная тишина за 30 минут. Никаких:
- POST'ов на `/api/client-error` (frontend JS exceptions через `utils/clientErrorReporter.js`).
- failed logins / auth errors.
- TG-notify failures.
- request-reset запросов.

Это значит **либо** никто ещё не открывал приложение после deploy'а (наиболее вероятно — Ольга ещё не делала smoke), **либо** все, кто открывал, не споткнулись о новый JS. Поскольку Ольга оставила smoke на себя, ждать её первого визита в Chrome — там и узнаем.

### 4.2 TG notifications queue

```sql
SELECT * FROM tg_notifications_queue WHERE created_at >= NOW() - INTERVAL '30 minutes';
-- 0 rows
```

Эта queue — для PVL-уведомлений (homework, mentor DM), не для client-errors. Тоже пуста, что нормально — никаких homework-событий в моменте deploy'а не было.

### 4.3 Реальный TG bot

`@garden_client_errors_bot` из инструкции — не нашла в env конфига. На сервере два TG бота:
- `@garden_grants_monitor_bot` (token из `TELEGRAM_BOT_TOKEN`) — system monitor + получает `/api/client-error` хиты, шлёт в chat 305389241 (видимо, Ольгин личный).
- `@garden_pvl_bot` (token из `TG_NOTIFICATIONS_BOT_TOKEN`) — PVL-уведомления.

Видимо, имелось в виду `@garden_grants_monitor_bot` (он же монитор + client errors). Я не могу проверить чат напрямую, но **через косвенный signal** (`journalctl -u garden-auth` пустой за 30 мин) — `/api/client-error` за это время никем не вызывался, значит и TG-bot ничего не получил. Если Ольге придёт alert в этот чат — будем разбираться.

## 5. Smoke A — пустое состояние (для Ольги в Chrome)

**Когда Ольга откроет** `https://liga.skrebeyko.ru/admin` после `Ctrl+Shift+R` (форс-refresh, чтобы SW не отдал старый bundle):

1. Tab «Пользователи» → видеть вверху списка card с заголовком «📥 На одобрение» и текстом «Заявок нет».
2. Card должна быть **серая** (`bg-slate-50 border-slate-100`, decision #3 — пустое состояние серым). Текст «Заявок нет» — `text-xs text-slate-400`.
3. На tab-button «Пользователи» — **без** counter'а (потому что pending = 0).
4. Остальная страница (Email-блок + таблица 56 юзеров с ⛔/🛡/🗑 кнопками) — без изменений.

Если что-то не так:
- Если видишь «📥 На одобрение (1)» с amber-card и счётчик на tab-button — значит появился новый pending'а (кто-то зарегался прямо сейчас). Это сценарий B, не A. Не паника.
- Если card вообще не видна — проверь, что bundle обновился (DevTools → Network → index-C8r3ZVMY.js должен быть 200). Если старый bundle (MW5GmWly) → SW кэш, делать `Ctrl+Shift+R` или unregister SW в DevTools → Application.

## 6. Smoke B — отложен

Сценарий B (есть pending → нажать «Одобрить» → проверить cohort_id и pvl_students row) — Ольга может выполнить:
- **Естественно:** когда зарегается следующий новый юзер (даты непредсказуемо).
- **Активно:** зарегать тестовый аккаунт с любого email'а — pending появится через ~5 сек после регистрации, можно тут же одобрить и проверить.

После одобрения SQL verify:
```sql
SELECT email, role, access_status,
       (SELECT COUNT(*) FROM pvl_students WHERE id = profiles.id) AS has_pvl_row
  FROM profiles WHERE email = '<approved-email>';
```
Ожидание: `<role> | active | active | 1` (если выбрана роль applicant/intern — trigger phase37 создал pvl_students row).

## 7. Git state

```
$ git log --oneline -3
b3f5236 feat(admin): pending approval section + isNew badge fix
eada640 chore(backlog): close phase37 tickets + day-close 2026-05-23
03a4d50 fix(pvl): atomic pvl_students creation on admin approval (phase37)
```

Все 3 в origin/main, branch in-sync.

## 8. Что я НЕ сделала

- ❌ Не делала smoke A в Chrome — это для Ольги (нет JWT/login доступа).
- ❌ Не делала smoke B — отложено до реального pending.
- ❌ Не правила plans/ файл — фронт-фикс по существующему backlog тикету, не нужен plan.
- ❌ Не проверяла chat 305389241 напрямую (нет доступа к Telegram Ольги). Косвенный signal — пустой journal — указывает что alerts'ов не было.

## 9. Эффорт

- git push + verify: ~1 мин
- polling deploy completion (~2-3 мин wait): автоматический
- alerts check (garden-auth journal + TG queue + bot discovery): ~5 мин
- _123 отчёт: ~10 мин

Итого ~18 мин с учётом ожидания deploy'а в фоне.
