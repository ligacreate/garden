---
title: FEAT-024 Phase 2b — applied локально, build OK, push → CI деплоит
date: 2026-05-16
from: VS Code Claude Code (codeexec)
to: стратег (claude.ai) + Ольга
reply_to: 2026-05-16_47_codeexec_feat024_phase2b_diff.md (🟢)
type: post-apply отчёт (этап push). Финальный smoke на проде — дополню разделом §3 после CI green.
status: 🟡 code committed + push'нут, ожидает GH Actions FTP deploy и smoke на проде
---

# Phase 2b — applied + push'нут, ожидает CI деплой

## 1. Что сделано

4 файла правки по `_47 §3`:

| Файл | Что |
|---|---|
| `services/dataService.js` | +2 метода в `RemoteApiService`: `generateTelegramLinkCode()`, `unlinkTelegram()` (через `authFetch`, body `{}`) |
| `App.jsx` | + `handleProfileRefresh(fresh)` (БЕЗ `api.updateUser` PATCH'а), проброс `onProfileRefresh={handleProfileRefresh}` в `<UserApp>` |
| `views/UserApp.jsx` | +`onProfileRefresh` в сигнатуре + проброс в `<ProfileView>` |
| `views/ProfileView.jsx` | импорты (`Send`, `Copy`, `CheckCircle2`, `ModalShell`) + `onProfileRefresh` в сигнатуре + 5 state hooks + 3 handlers + `useEffect` polling 5с + новая Card-секция «Telegram-уведомления» между «Профессиональный профиль» и «Страница ведущей» + `<ModalShell>` для linking flow + `<ConfirmationModal>` для unlink |

## 2. Локальная sanity

- `npm run build` → exit 0, 3.19s, новый main bundle `dist/assets/index-jb4-KCc7.js` (499 kB, 155 kB gzip). Warning о chunk size — pre-existing, не от моей правки.
- ProfileView не вынесен в lazy-chunk — секция запекается в основной bundle, что и ожидается.
- В отдельный момент во время apply забыл добавить `<ModalShell>` + `<ConfirmationModal>` в JSX (`_47 §3.4.5`) — поправил вторым проходом, build после этого зелёный.

## 3. Smoke на проде — заполню после CI

CI workflow `.github/workflows/deploy.yml`:
1. `npm ci && npm run build` на ubuntu-latest
2. `cp -R dist/. deploy/ && cp -R goroscop trees assets favicon.png deploy/`
3. FTP deploy на `liga.skrebeyko.ru`
4. Smoke check после deploy (видно в workflow yaml).

После CI green:
1. Открыть `https://liga.skrebeyko.ru` → Профиль → проверить рендер секции «Telegram-уведомления» в состоянии «не привязан».
2. Кликнуть «Привязать Telegram» → modal с кодом + deep-link.
3. Через TG бот `@garden_pvl_bot` нажать deep-link OR ввести `/start LINK-XXXXXX` руками.
4. Polling: в течение 5 секунд modal закроется автоматически, появится тост «Привязано! Теперь будем слать уведомления в TG», секция перерисуется в «Привязан к Telegram c <дата>».
5. Тест unlink: кнопка «Отвязать» → confirm → тост «Telegram отвязан».
6. Дополнить этот файл §3 финальным `smoke OK / smoke FAIL + причина`.

## 4. Что НЕ закоммичено

- `dist/` — CI пересобирает сам, локальные изменения не нужны.
- Чужие изменения в `.claude/settings.json`, `CLAUDE.md`, удалённые `docs/HANDOVER_*` — не моя зона, не трогаю.

## 5. Commit + push

Один commit на 6 файлов (4 кода + `_47` diff + `_48` отчёт). Сообщение — feat(tg) Phase 2b.

Push в `ligacreate/garden` main → запускает GH Actions deploy.yml.
