# DIFF INFRA-005 вариант №2 — prefetch live assets/ + merge в bundle (clean-slate остаётся)

**Дата:** 2026-06-09
**Тип:** diff-on-review, НЕ применён — жду 🟢 (был прод-инцидент на попытке №1)
**Основание:** [recon 182](2026-06-08_182_codeexec_recon_infra005_chunk_flap.md) · [diff v1 184](2026-06-09_184_codeexec_infra005_deploy_fix_diff.md) (откатан) · поправка стратега
**Затронуто:** `.github/workflows/deploy.yml` (только новый шаг). `ErrorBoundary.jsx` уже с self-reset guard — НЕ трогаем.

---

## 1. Причина падения попытки №1 (из лога run 27221472358)

```
mirror: unrecognized option '--no-delete'
##[error]Process completed with exit code 1.
```

**1-2 строки:** упал НЕ на auth/ssl/`set -e`, а на несуществующем флаге — в
lftp 4.9.2 у `mirror` нет `--no-delete`. (Удаление у `mirror -R` и так opt-in
через `--delete`, т.е. он additive по умолчанию.) Auth даже не дошёл до
проверки — провал на парсинге команды. Вывод для v2: lftp как инструмент рабочий,
auth-форму берём надёжную (`open`+`user`, а не `-u user,pass`).

---

## 2. Подход варианта №2

Не аплоадим assets отдельным lftp и не трогаем clean-slate/exclude. Вместо этого
ПЕРЕД выкладкой **скачиваем текущие серверные `assets/`** и **мержим в
`deploy/assets/`** (старые чанки + свежесобранные, свежие не перезатираем).
Тогда `dangerous-clean-slate` сносит сервер и заливает bundle, в котором уже
лежат и новые, и все старые чанки → старое переживает деплой, 404-класс закрыт.

Главное преимущество: clean-slate + SamKirkland остаются ровно как сейчас
(проверенно рабочие). Шаг префетча — **не-фатальный**: упал → деплой идёт как
сегодня (только свежий билд), не хуже.

---

## 3. Изменение в `deploy.yml` — ОДИН новый шаг между «Prepare deploy bundle» и «Deploy via FTP»

**Вставить** после шага `Prepare deploy bundle` (после строки `cp favicon.png deploy/ || true`), перед `Deploy via FTP`:

```yaml
      - name: Prefetch live assets/ (ретенция старых чанков, non-fatal)
        continue-on-error: true
        env:
          FTP_SERVER: ${{ secrets.FTP_SERVER }}
          FTP_USERNAME: ${{ secrets.FTP_USERNAME }}
          FTP_PASSWORD: ${{ secrets.FTP_PASSWORD }}
          FTP_PORT: ${{ secrets.FTP_PORT }}
        run: |
          set +e   # шаг не должен валить деплой; при частичной загрузке всё равно мержим
          sudo apt-get update -qq
          sudo apt-get install -y -qq lftp
          mkdir -p live_assets
          # Скачиваем текущие серверные assets/ (download = mirror без -R).
          # Auth через open+user — надёжно к спецсимволам в пароле (в отличие от
          # -u user,pass с запятой). Прошлый провал был в несуществующем флаге
          # --no-delete, а НЕ в auth.
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
          # Мерж старых чанков в bundle БЕЗ перезатирания свежих (cp -n).
          # Свежий билд приоритетнее; совпавший хеш = идентичный контент.
          cp -rn live_assets/. deploy/assets/ 2>/dev/null || true
          echo "deploy/assets файлов после мержа: $(ls deploy/assets 2>/dev/null | wc -l)"
```

Шаги `Deploy via FTP` (с `dangerous-clean-slate: true`) и `Smoke check` —
**без изменений**.

---

## 4. Почему это безопаснее попытки №1

- Не снимаем clean-slate, не вводим exclude, не добавляем второй upload-инструмент
  → ни state-file-нюансов, ни рассинхрона index.html↔chunks.
- Префетч `continue-on-error` + `set +e`: любой сбой (apt, auth, таймаут) →
  шаг жёлтый, деплой продолжается со свежим билдом = текущее поведение, не хуже.
- Инцидент попытки №1 (новый index без новых чанков) тут невозможен: index и
  все чанки уезжают одним clean-slate-bundle'ом.

## 5. Известный трейд-офф

`assets/` на сервере растёт без границы: каждый деплой качает все старые + грузит
все старые+новые. Файлы мелкие (JS/CSS), но со временем деплой замедлится.
**Ретенция** (чистка чанков старше ~30 д или N последних сборок) — отдельной
задачей, как договаривались. Сейчас не блокирует.

---

## 6. ⚠️ Чек первого деплоя после apply

- [ ] Workflow зелёный (новый шаг префетча жёлтым допустим — он non-fatal; важно,
      что Deploy + Smoke зелёные).
- [ ] **Старый чанк `index-Rc6EyKjt.js` (текущий entry до этой выкладки) всё ещё
      отдаёт 200 ПОСЛЕ новой выкладки** ← главная проверка: префетч+мерж сохранил
      старое сквозь clean-slate.
- [ ] Новый entry-чанк этого билда → 200.
- [ ] `goroscop/` + `trees/` + favicon → 200, сайт грузится (`<title>Сад ведущих</title>`).
- [ ] В логе шага префетча — ненулевой «deploy/assets файлов после мержа» (больше,
      чем в свежем билде → значит старые подмешались).

---

## Статус

Подготовлено, **не применено**. Жду 🟢 на вставку шага в `deploy.yml` + commit/push.
Прод сейчас цел (откат _184→clean-slate): index/entry/css 200.
