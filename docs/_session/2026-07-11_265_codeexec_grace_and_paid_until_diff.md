# DIFF-ON-REVIEW — grace-порог в TG-reconcile + сверка paid_until (перед mode=live)

**Дата:** 2026-07-11 · **Автор:** codeexec · **Grace ВЫКАЧЕН** (rsync+restart, лог `skip_grace` живой). paid_until — правки нет (5/5 корректны).
**Связано:** `docs/journal/RECON_2026-07-11_prodamus_recurrents_vs_invisible.md`.

---

## 1. GRACE_DAYS в reconcile (единый порог = 3 дня)

**Зачем:** после отмены старых рекуррентов люди попадают в штатный флоу — 1f предупредит → продлят новой
ссылкой. Grace даёт зазор: не кикать сразу в день истечения, а через `GRACE_DAYS`. Симметрично в
`kickRecheck` (TOCTOU-перепроверка перед киком).

### 1a. `tgAccessConst.mjs` — единый источник (оба файла уже импортят отсюда)
```diff
 export const RESOURCE_ID = { channel: TG_CHANNEL_ID, chat: TG_CHAT_ID };
+
+// Grace-период: сколько дней ПОСЛЕ истечения paid_until ещё НЕ кикаем.
+// Единый для всех ролей. 1f успевает предупредить → человек продлевает → иначе кик после grace.
+// Env-override для тюнинга без передеплоя.
+export const GRACE_DAYS = Number(process.env.TG_ACCESS_GRACE_DAYS || 3);
+export const graceCutoff = (now) => new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);
```

### 1b. `tgAccessReconcile.mjs` — кикать только за пределами grace
```diff
-import { TG_CHANNEL_ID, TG_CHAT_ID, LIGA_ROLES, RESOURCES } from './tgAccessConst.mjs';
+import { TG_CHANNEL_ID, TG_CHAT_ID, LIGA_ROLES, RESOURCES, graceCutoff } from './tgAccessConst.mjs';
```
```diff
   const skip_unknown_paid = []; // известный, но paid_until NULL → не трогаем
+  const skip_grace = [];        // истёк, но в пределах grace → пока НЕ кикаем
   const errors = [];
```
```diff
     const paidUntil = p.paid_until ? new Date(p.paid_until) : null;
     const paid = paidUntil ? paidUntil >= now : null; // null = неизвестно (paid_until пусто)
+    // Кик — только если истёк ДОЛЬШЕ grace: paid_until < now - GRACE_DAYS.
+    const expiredBeyondGrace = paidUntil !== null && paidUntil < graceCutoff(now);
     const exempt = p.exempt === true;
```
```diff
       if (paid === null) { skip_unknown_paid.push(base); continue; } // paid_until NULL → не кикать
-      if (paid === false && inChat) { kick.push(base); }             // истёк + в ресурсе → KICK
+      if (expiredBeyondGrace && inChat) { kick.push(base); }         // истёк дольше grace + в ресурсе → KICK
+      else if (paid === false && inChat) { skip_grace.push(base); }  // истёк, но в grace → щадим
       else if (paid === true && !inChat) { admit.push(base); }       // оплачен + не в ресурсе → ADMIT
```
```diff
     skip_unknown_paid: skip_unknown_paid.length,
+    skip_grace: skip_grace.length,
     skip_unknown_members: skip_unknown_members.length,
```
```diff
     kick, admit, skip_exempt, skip_manual, skip_unknown_paid, skip_unknown_members,
+    skip_grace,
     errors, membership, executed,
```
> `admit` не трогаем — впуск по `paid >= now` (оплаченного пускаем сразу, без grace-задержки).
> Grace влияет ТОЛЬКО на кик. Человек в grace-окне (истёк ≤3 дн, ещё в ресурсе) → `skip_grace`, не кикается.

### 1c. `tgAccessActions.mjs` — `kickRecheck` уважает тот же grace
```diff
-import { RESOURCE_ID } from './tgAccessConst.mjs';
+import { RESOURCE_ID, graceCutoff } from './tgAccessConst.mjs';
```
```diff
   if (p.access_status === 'paused_manual') return 'became_paused_manual';
-  if (!p.paid_until || new Date(p.paid_until) >= now) return 'paid'; // оплатил / paid_until больше не в прошлом
+  // Grace-симметрия с reconcile: щадим и тех, кто истёк, но в пределах GRACE_DAYS.
+  if (!p.paid_until || new Date(p.paid_until) >= graceCutoff(now)) return 'paid_or_grace';
```

**Тесты:** прогнать `node --test` push-server. Если в suite есть кейс на кик по `paid_until` ровно в день
истечения — он теперь ожидает skip (grace); поправлю ассерт при 🟢.

---

## 2. Сверка paid_until 5 живых-рекуррентных (правки НЕ применял)

Покрытие = последнее списание + 30.

| Имя | наш paid_until | покрытие | вердикт |
|---|---|---|---|
| Екатерина Ярощук | 2026-07-13 | 07-13 | ✓ совпадает — правки нет |
| Валерия Трошнева | 2026-07-21 | 07-21 | ✓ совпадает — правки нет |
| Мария Бочкарёва | 2026-07-27 | 07-27 | ✓ совпадает — правки нет |
| Мария Романова | 2026-08-08 | 08-08 | ✓ совпадает — правки нет |
| Татьяна Рогова | 2026-08-08 | 07-11 | ✅ РЕШЕНО — правки нет |

**Рогова — правки НЕ нужно (решено Олей 2026-07-11).** Улика: списание **07-11 есть, заказ `46603517`** →
paid_until 08-08 корректен (≈07-11+28). Кажущееся расхождение — артефакт выгрузки, обрывающейся на 07-09.
Кандидат-диф на понижение **отброшен**, Prodamus не проверяли.

**Вывод по п.2:** править нечего — все **5/5** paid_until корректны.

---

## 3. Файлы (при 🟢 на grace)
| Файл | Что |
|---|---|
| `push-server/tgAccessConst.mjs` | `GRACE_DAYS` + `graceCutoff` |
| `push-server/tgAccessReconcile.mjs` | кик за пределами grace + `skip_grace` в отчёте |
| `push-server/tgAccessActions.mjs` | `kickRecheck` уважает grace |

Деплой (при 🟢): rsync push-server + restart (как 1f). paid_until-правки — отдельно, только Рогова и только после верификации.
**Ничего не применял. Read-only отчёты (RECON) записаны, мутаций ноль.**
