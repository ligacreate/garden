# FEAT-025 password reset — live UI recon от Claude in Chrome

**От:** Claude in Chrome (smoke-runner, через расширение)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-20
**В ответ на:** [`_81b_strategist_pwd_reset_cinc_brief.md`](2026-05-20_81b_strategist_pwd_reset_cinc_brief.md)
**Сохранён стратегом** (CinC не имеет file system access, отчёт передан через TG-chain → claude.ai → Write)

---

## ⚠️ Strategist annotation: одна неверная атрибуция

Перед чтением — пометка от стратега. CinC в разделах 2-6 ошибочно
утверждает что Garden использует **Firebase Auth** (`Xb.resetPassword`
как «обёртка над `sendPasswordResetEmail`», ошибка `auth/user-not-found`).
**Это фабрикация** — CinC увидел минифицированное имя в bundle +
английский текст error message и домыслил Firebase pattern.

**Реальная картина (из `_82_codeexec_pwd_reset_recon.md`):**
- `Xb.resetPassword` в минифицированном bundle — это
  `services/dataService.js:1340 resetPassword(email)`, который шлёт
  `POST https://auth.skrebeyko.ru/auth/request-reset`
- Endpoint — **наш Express garden-auth** на VPS Bittern
  (`/opt/garden-auth/server.js:691`), **никакого Firebase нет**
- Ошибка `Error: Email not found` — наш response из
  `server.js:151` (`if (!rows.length) return res.status(404).json({ error: 'Email not found' })`)
- Firebase в проекте никогда не было — auth самописный с дня 1

**Что валидно в отчёте CinC** (независимо от ошибочной атрибуции) —
наблюдения за UI:
- (A) Пустой email + click → silent no-op, никакой ошибки/блокировки
- (B) Несуществующий email → silent no-op в UI, error только в console

Оба заведены как новый тикет **UX-AUTH-FORM-FEEDBACK** (P2) — тот же
класс что UX-MEETINGS-FORM-NATIVE-ALERT.

---

## Оригинальный отчёт CinC (как был передан)

### Путь навигации

```
/ (WelcomeScreen)
  └─ Войти → /login (LoginScreen)
      └─ «Забыли пароль?» → ResetPasswordScreen
          Заголовок: «Восстановление»
          Поле: Email (placeholder)
          Кнопка: «Сбросить пароль»
```

### Сценарий A — Клик «Сбросить пароль» с пустым полем email

| Параметр | Значение |
|---|---|
| Email в поле | `""` (пустое, только placeholder) |
| Сетевой запрос | **НЕТ** (нет HTTP-вызова к API/Firebase) |
| URL | — |
| Method | — |
| Status | — |
| UI-реакция | Форма осталась без изменений. Ни ошибки валидации, ни toast-уведомления не показано. Поле не подсвечивается красным. Кнопка остаётся активной. |
| Console | `[EXCEPTION] Object` (нет stack trace) |

**Вывод CinC:** Клиентская валидация **не работает должным образом** —
кнопка не блокируется, inline-ошибка не отображается. Исключение в
консоли брошено без сообщения (`Object`). Никакой обратной связи
пользователю не предоставляется. **Баг UX/валидации.**

### Сценарий B — Клик «Сбросить пароль» с несуществующим email

| Параметр | Значение |
|---|---|
| Email в поле | `nonexistent_test_xyzabc@example.com` |
| Сетевой запрос (браузерный трекер) | Не захвачен через fetch/XHR (SDK вызов) |
| Вызов в коде | `Xb.resetPassword(...)` в `index-Dgwl91od.js` |
| SDK | ⚠ CinC утверждает «Firebase Auth» — **неверно, см. annotation сверху** |
| Console ERROR | `Error: Email not found` |
| Полный стек | `cn (…:32:4309) → Xb.resetPassword (…:32:12586) → L (…:36:32165) → B (…:10:61035)` |
| UI-реакция | **Форма осталась без изменений.** Никакого toast, никакой inline-ошибки пользователю показано НЕ было. Поле email содержит введённый адрес. |

**Вывод CinC:**
- Запрос к ~~Firebase Auth~~ **garden-auth `/auth/request-reset`** отправляется
- ~~Firebase~~ **garden-auth** возвращает `Error: Email not found` (HTTP 404)
- **Ошибка НЕ обрабатывается на UI** — пользователь не получает никакого фидбека
- Это **двойной баг**: 1) отсутствие UX-обратной связи; 2) раскрытие
  факта существования email (через консоль — `Email not found`, хотя
  в UI это не показывается)

### Итоговая матрица находок

| Сценарий | Сетевой запрос | UI фидбек | Консоль | Severity |
|---|---|---|---|---|
| A: пустой email | Нет | Нет | Exception (без текста) | **Medium** — нет валидации |
| B: несуществующий email | Есть (~~Firebase SDK~~ garden-auth) | **Нет** | `Error: Email not found` | **High** — нет UX фидбека + silent fail |

### Выводы CinC для команды

1. **Нет клиентской валидации** на пустое поле email — форма принимает клик вхолостую
2. **Нет UI-обработки ошибок** ~~Firebase~~ garden-auth — ни в сценарии A, ни в B пользователь не видит сообщения об ошибке
3. **Enum раскрытие (user enumeration)** на уровне консоли — `Email not found` явно указывает, что пользователь не найден; в продакшене при открытых DevTools это видно, в UI — нет (это частично нивелирует проблему, но не полностью)
4. **Best practice нарушена**: при несуществующем email рекомендуется показывать нейтральное сообщение «Если email зарегистрирован, ссылка отправлена» независимо от результата

### Технические детали (с поправкой)

- **App bundle:** `liga.skrebeyko.ru/assets/index-Dgwl91od.js`
- ~~**Auth SDK:** Firebase Auth~~ → **Auth: самописный garden-auth (Express + pg-pool)**
- ~~**Метод сброса:** `Xb.resetPassword` (обёртка над `sendPasswordResetEmail`)~~ →
  **Метод сброса:** `Xb.resetPassword` (минифицированное имя `dataService.resetPassword`),
  обёртка над `POST https://auth.skrebeyko.ru/auth/request-reset`
- ~~**Ошибка Firebase:** `auth/user-not-found` → локализована как `Email not found`~~ →
  **Ошибка garden-auth:** HTTP 404 с JSON `{ "error": "Email not found" }` из server.js:151

---

## Strategist follow-ups

Из отчёта CinC заведены тикеты (см. `_83_strategist_housekeeping_batch_brief.md`):
- **UX-AUTH-FORM-FEEDBACK** (P2) — оба UI бага (no validation + no error UX)
- **FEAT-025-INFO-DISCLOSURE-FIX** (P3) — 404 → 200 для unknown email

FEAT-025 core flow закрыт как ✅ DONE по результатам smoke'а Ольги (письмо
пришло, ссылка работает, новый пароль работает) — см. полный итог в
`_83`.

---

## Урок про CinC reports — для будущих сессий

CinC отчёты могут содержать **домыслы об архитектуре** на основе
pattern-matching минифицированных имён. Стратег должен:
1. **Никогда не принимать атрибуции архитектуры от CinC на веру** —
   всегда сверять с реальностью через codeexec recon или знание memory
2. CinC сильный в **UI наблюдениях** (что видит пользователь, что в
   Network, что в console) — это его core competency
3. CinC слабый в **архитектурных выводах** (какой framework, какая
   library) — это его hallucination zone
4. **Сохранять CinC отчёт с моими аннотациями** (как этот файл) —
   чтобы будущие сессии не унаследовали ошибочную модель «у нас
   Firebase»
