# _174 — phase42 PUSH + deploy + пост-деплой smoke

**Дата:** 2026-05-31. **Роль:** codeexec. **Связано:** `_171` (TZ тумблер), `_172` (backend dry-run), `_173` (diff + разделы 7–8).

## 1. PUSH + deploy (✅ выполнено)
- **Код:** `git push origin main` → `9b441d4..fb12e8f`. origin/main = `fb12e8f`. `dist/` НЕ коммитили (CI билдит сам).
- **CI:** `Deploy to FTP` run **`26706588113`** (event=push, sha=fb12e8f) → **success, 1m31s**. Build → bundle → FTP → CI-smoke зелёные.
- **Docs-батч:** `chore(docs)` `fe7ad9f` (`docs/_session/*` + 3 тикета P3 в `plans/BACKLOG.md`) → запушен. Деплой НЕ триггернул (paths-ignore) — последний run остался `26706588113`. ✓
- Аннотации (НЕ фейл): Node 20 deprecation (дедлайн 16.06.2026); `git exit 128` в Post Checkout — безобидный cleanup FTP-экшена.

## 2. Headless smoke на live (✅ что подтверждено машинно)
- `https://liga.skrebeyko.ru/` → 200, `<title>Сад ведущих</title>`. Свежий entry-бандл `assets/index-CTj4964N.js` (200, 499887 б).
- **phase42-код доехал** — деплоенный чанк `pvlPostgrestApi-yk1NF1wM.js` содержит методы: `getStudentCertificationOpen` (gating LockedCard), `setCohortCertificationOpen` (админ-тумблер), `certification_open` ×6, `getCertificationCompare`.
- Cert-UI-строки в entry не грепаются — нормально: cert-код в ленивом чанке (`PvlPrototypeApp`), entry содержит только первый уровень lazy-import.

## 3. Поведенческий smoke — ❗ТРЕБУЕТ браузера Ольги (залогиненная сессия)
Headless не покрывает: реальный вход, рендер LockedCard, админ-тумблер, localStorage. Чеклист:

- [ ] **Общий логин** (id-фикс `garden_currentUser` затронул общий вход, не только cert): залогиниться (Ольгой / любым) → НЕ выкидывает, кабинет грузится.
- [ ] **Менти Потока 1 (или фея)** → «Моя страница» → блок «Сертификационный завтрак» показывает **LockedCard «…откроется позже»**, бланка/визарда нет (приём закрыт, флаг=false).
- [ ] **Ольга (admin)** → `/admin/pvl` → виден **тумблер «Сертификационные завтраки»** (в положении «закрыто»); на странице ученицы admin видит **превью бланка** (не LockedCard — admin минует gating).
- [ ] **verdict-A:** DevTools → Console → `localStorage.getItem('garden_currentUser')` у живого залогиненного юзера:
  - значение есть → ключ реален, прежний баг был артефактом стенда;
  - раньше пусто, теперь есть → id-фикс заодно закрыл латентный баг (зафиксировать как side-win).

## Итог
PUSH + deploy + docs — выполнены и подтверждены. Фича на проде в состоянии **ГОТОВА-ЗАКРЫТА** (флаг когорты = false). Открытие — тумблером Ольги после её браузерного smoke (раздел 3).
