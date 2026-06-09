# DIFF INFRA-005 v3 — lftp auth через --env-password (фикс 530 Login incorrect)

**Дата:** 2026-06-09
**Тип:** diff-on-review, НЕ применён — жду 🟢
**Основание:** [v2 185](2026-06-09_185_codeexec_infra005_v2_prefetch_diff.md) задеплоен, префетч упал на auth
**Затронуто:** `.github/workflows/deploy.yml` — только тело шага «Prefetch live assets/»

---

## Что показал первый деплой v2 (run 27227149200)

Сайт цел, инцидента НЕТ:
- новый entry `index-BO95iFNd.js` → 200, `<title>Сад ведущих</title>`, favicon 200, goroscop/trees → 301 (норм).

Но INFRA-005 НЕ закрыт — лог шага префетча:
```
mirror: Login failed: 530 Login incorrect.
deploy/assets файлов после мержа: 28
```
lftp подключился (1.4s), но **логин отклонён (530)** → `live_assets` пуст → мерж
добавил 0 файлов (28 = только свежий билд) → clean-slate снёс старые чанки →
старый `index-Rc6EyKjt.js` → **404**.

**Причина 530:** те же FTP-секреты у SamKirkland работают, значит дело в способе
передачи креды. В v2 пароль шёл как `user "$FTP_USERNAME" "$FTP_PASSWORD"` внутри
двойно-кавыченной строки `lftp -e "..."`. При наличии в пароле спецсимвола
(`"`, `\`, пробел и т.п.) подстановка bash→lftp ломает значение → сервер видит
неверный пароль.

---

## Фикс: auth через `--env-password` (пароль из env, не из строки команды)

`lftp --env-password -u "$USER"` читает пароль из переменной окружения
`LFTP_PASSWORD` — он вообще не попадает в строку lftp-скрипта, поэтому устойчив
к ЛЮБЫМ спецсимволам. Имя пользователя через `-u "$USER"` (без запятой → нет
проблемы `-u user,pass`).

### Было (тело шага, v2):
```bash
          mkdir -p live_assets
          lftp -e "
            set ftp:ssl-allow false;
            set ftp:passive-mode true;
            set net:max-retries 2;
            set net:timeout 15;
            open ftp://$FTP_SERVER:$FTP_PORT;
            user \"$FTP_USERNAME\" \"$FTP_PASSWORD\";
            mirror --parallel=4 assets/ live_assets/;
            bye;
          "
```

### Стало (v3):
```bash
          mkdir -p live_assets
          export LFTP_PASSWORD="$FTP_PASSWORD"   # пароль не в строке команды → устойчив к спецсимволам
          lftp --env-password -u "$FTP_USERNAME" -p "$FTP_PORT" "$FTP_SERVER" -e "
            set ftp:ssl-allow false;
            set ftp:passive-mode true;
            set net:max-retries 2;
            set net:timeout 15;
            mirror --parallel=4 assets/ live_assets/;
            bye;
          "
```

Остальное тело шага (apt-get, `set +e`, `cp -rn`, echo count) и все прочие шаги —
**без изменений**. `continue-on-error: true` остаётся → даже если v3-auth снова
не зайдёт, деплой пройдёт как сейчас (не хуже).

---

## Диагностический сигнал для следующего деплоя

В логе шага префетча искать:
- **успех:** строки `mirror: ... Transferring` / `files transferred` и
  `deploy/assets файлов после мержа: N`, где **N заметно > 28** (28 = чистый
  свежий билд; больше → старые чанки подмёрджены).
- **снова 530 / иное:** auth всё ещё не та — разбираем (возможно, username
  тоже спецсимвол, или сервер требует FTPS — тогда `set ftp:ssl-allow true` +
  `set ftp:ssl-force/ssl-protect-data`).

## ⚠️ Чек первого деплоя после apply

- [ ] Workflow зелёный; шаг префетча в логе показывает мерж **> 28** файлов.
- [ ] **Старый чанк, существующий ДО этой выкладки (`index-BO95iFNd.js`), всё ещё
      200 ПОСЛЕ неё** ← главная проверка (после v3 «старым» станет текущий
      BO95iFNd, его и проверяем).
- [ ] Новый entry этого билда → 200; goroscop/trees/favicon ОК; сайт грузится.

---

## Статус

Подготовлено, **не применено**. Жду 🟢. Прод сейчас рабочий (новый билд
консистентен), INFRA-005 ещё открыт — старые чанки снова снесены, как до фикса.
