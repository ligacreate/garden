---
title: actorsSyncReady fix — push + deploy отчёт
date: 2026-05-24
author: codeexec (VS Code)
commit: ba057b6
status: pushed, deployed, waiting Ольга smoke
related: _124 recon, _125 diff
---

# actorsSyncReady fix — push + deploy

## Push

```
git push origin main
   1abaa9a..ba057b6  main -> main
```

Один commit `ba057b6 fix(pvl): pass actorsSyncReady prop to AdminPage + useMemo dep`.

## GH Actions

`gh` CLI не auth'нут в этом окружении (`gh auth login` / `GH_TOKEN`
не настроены) — статус job'а напрямую не вижу. Подтверждение через
косвенные сигналы prod'а ниже.

## Deploy (по косвенным сигналам)

Polling `curl https://liga.skrebeyko.ru/` каждые 20 секунд после push'а:

- **t=+22s от старта polling'а:** HTTP 200 (т.е. deploy завершён;
  workflow `paths-ignore` не сматчился — у нас `.jsx` файл, не
  docs/plans).
- До этого момента prod кратко был в режиме `dangerous-clean-slate`
  (FTP сначала чистит, потом заливает), но я начал polling после
  фазы upload, так что 404'ы не словил.

Точное время GH Actions run'а не вижу, но deploy суммарно уложился
в норму (~2-3 мин от push до prod, как обычно).

## Bundle hash diff

```
Было:  assets/index-C8r3ZVMY.js
Стало: assets/index-XTevhYBM.js
```

Hash изменился → bundle переcбилcя → fix внутри. Lazy chunk
`PvlPrototypeApp-*.js` подгружается из main bundle при роутинге на
PVL — его hash увидим в Network tab после Ольгиного hard reload'а.

## Алерты @garden_grants_monitor_bot

У меня нет прямого доступа к Telegram bot'у. **Просьба к Ольге**
посмотреть в @garden_grants_monitor_bot за последние ~10 минут —
любой red flag (5xx, push-server crash, postgres errors) после push'а
говорит о косвенных проблемах. Тихий канал = OK.

## Smoke (на Ольге)

После hard reload (Cmd+Shift+R) `liga.skrebeyko.ru/admin/library`:

- **Ожидание:** сначала loader «Загружается предпросмотр курса…»,
  потом курс с amber banner «Вы видите курс как ученица: …»
- **НЕ должно быть:** ErrorBoundary catch с
  `ReferenceError: actorsSyncReady is not defined`
- **Доп. routes для проверки** (для уверенности что починены все 8):
  `/admin/tracker`, `/admin/practicums`. Должны работать так же.

## Если smoke ✅

- Закрываем инцидент
- Записываю lesson в `docs/lessons/2026-05-24-actorsSyncReady-scope-mismatch.md`
- Открытый параллельный thread: viktorovna7286@gmail.com login-hang —
  Ольга повторяет login, если висит → отдельный recon
  `BUG-LOGIN-VIKTOROVNA-HANG`

## Если smoke ❌

- Срочно `git revert ba057b6` НЕ поможет — он только добавил prop,
  откат снова откроет ReferenceError. Истинный путь revert'а —
  `git revert cb24ad5`, но это большой rollback (134 lines, 3 файла).
- Сначала смотрим что именно сломалось, console и Network tab.
- Скорее всего, в случае проблемы — она в другой зоне, не в этом
  fix'е (он минимальный и точечный).
