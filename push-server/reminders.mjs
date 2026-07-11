// ────────────────────────────────────────────────────────────────────────────
// Движок напоминаний (общий). Спека = данные: каждая запись REMINDER_SPECS
// описывает КАК получить популяцию + дату цикла + пороги + тексты. Одно ядро
// runReminders() обслуживает все спеки. Сейчас — T-5 абитуриенты; 1f-биллинг
// (T-7/3/1/0) подключается той же формой спекой, ничего в ядре не меняя.
//
// Каналы: EMAIL (primary) — в email_notifications_queue (доставляет garden-auth).
//         TG (bonus, только привязанные) — в tg_notifications_queue (phase32-воркер).
// Идемпотентность: reminders_sent (kind, profile, threshold, cycle) — claim ПЕРЕД
// постановкой в очередь. Число прогонов за ночь неважно.
//
// Дизайн: docs/_session/2026-07-11_263 (финал, verbatim-текст T-5).
// ────────────────────────────────────────────────────────────────────────────

const ODINTSOVA_TG_URL = 'https://t.me/odintsova_ii';
const T5_CTA_LABEL = 'Чтобы сдать сертификационный завтрак, напишите Ирине Одинцовой';

const REMINDER_SPECS = [
  {
    kind: 'applicant_access',
    // Популяция + дата истечения (access_until = end_date + 3мес) + days_left. Одним запросом.
    // JOIN (не LEFT): без когорты access_until нет → в скан не попадает → не истекает/не шлём.
    scanSql: `
      select p.id,
             p.email,
             p.telegram_user_id,
             p.telegram_notifications_enabled,
             (c.end_date + interval '3 months')::date               as cycle_date,
             ((c.end_date + interval '3 months')::date - current_date) as days_left
        from public.profiles p
        join public.pvl_students s on s.id = p.id
        join public.pvl_cohorts  c on c.id = s.cohort_id
       where p.role = 'applicant'
         and p.access_status = 'active'
         and c.end_date is not null`,
    thresholds: [5],                              // T-5 (данные, не код)
    // Три представления: subject / plaintext (TG+фолбэк) / html (письмо, CTA — текст-ссылка).
    text: () => {
      const subject = 'Через 5 дней закроется доступ к платформе';
      const intro =
        'Напоминаем: можно присоединиться к потоку курса, сдать сертификационный завтрак '
        + 'и перейти в Лигу. Мы всегда ждем!';
      const bodyText = `${intro}\n\n${T5_CTA_LABEL}:\n${ODINTSOVA_TG_URL}`;
      const bodyHtml =
        `<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#334155;">${intro}</p>`
        + `<p style="margin:0;font-size:16px;line-height:1.5;">`
        + `<a href="${ODINTSOVA_TG_URL}" target="_blank" rel="noopener" `
        + `style="color:#2f6f54;font-weight:600;text-decoration:underline;">`
        + `${T5_CTA_LABEL}</a></p>`;
      return { subject, bodyText, bodyHtml };
    }
  }
  // 1f биллинг подключается сюда же: { kind:'billing', scanSql по paid_until,
  // thresholds:[7,3,1,0], text по порогам }. Ядро не трогаем.
];

// EMAIL → очередь (доставляет garden-auth). dedup_key на всякий случай, но главный
// гард идемпотентности — reminders_sent (claim выше по стеку).
async function enqueueEmail(pool, { profileId, email, subject, bodyText, bodyHtml, dedupKey }) {
  await pool.query(
    `insert into public.email_notifications_queue
       (recipient_profile_id, recipient_email, subject, body_text, body_html, dedup_key, scheduled_for)
     values ($1, $2, $3, $4, $5, $6, now())`,
    [profileId, email, subject, bodyText, bodyHtml, dedupKey]
  );
}

// TG → очередь phase32 (NN-контракт из recon 223). event_source_table/id — для аудита.
async function enqueueTg(pool, { profileId, tgUserId, eventType, messageText, dedupKey }) {
  await pool.query(
    `insert into public.tg_notifications_queue
       (recipient_profile_id, recipient_tg_user_id, event_type, event_source_table,
        event_source_id, event_payload, message_text, dedup_key, scheduled_for, attempt_count)
     values ($1, $2, $3, 'profiles', $1, '{}'::jsonb, $4, $5, now(), 0)`,
    [profileId, tgUserId, eventType, messageText, dedupKey]
  );
}

export async function runReminders(pool) {
  for (const spec of REMINDER_SPECS) {
    let rows;
    try {
      ({ rows } = await pool.query(spec.scanSql));
    } catch (e) {
      console.error(`[reminders:${spec.kind}] scan failed`, e);
      continue;
    }
    for (const r of rows) {
      try {
        // Самый срочный ещё не отправленный порог: min T, для которого 0 <= days_left <= T.
        const due = spec.thresholds
          .filter((t) => r.days_left <= t && r.days_left >= 0)
          .sort((a, b) => a - b)[0];
        if (due === undefined) continue;

        // Каналы, которые реально поставим (email всегда есть; TG — только привязанным).
        const channels = [];
        if (r.email) channels.push('email');
        const tgEligible = r.telegram_user_id && r.telegram_notifications_enabled;
        if (tgEligible) channels.push('tg');
        if (channels.length === 0) continue;

        // Идемпотентность: claim ПЕРЕД постановкой в очередь. Переживает рестарты/двойные тики.
        const claim = await pool.query(
          `insert into public.reminders_sent (kind, profile_id, threshold, cycle_date, channels)
           values ($1, $2, $3, $4, $5)
           on conflict (kind, profile_id, threshold, cycle_date) do nothing
           returning 1`,
          [spec.kind, r.id, String(due), r.cycle_date, channels]
        );
        if (claim.rowCount === 0) continue; // уже слали этот (порог, цикл) — молча дальше

        const msg = spec.text(r.days_left, r);
        const dedupKey = `${spec.kind}:${r.id}:${r.cycle_date}:${due}`;

        if (r.email) {
          await enqueueEmail(pool, {
            profileId: r.id, email: r.email,
            subject: msg.subject, bodyText: msg.bodyText, bodyHtml: msg.bodyHtml,
            dedupKey
          });
        }
        if (tgEligible) {
          await enqueueTg(pool, {
            profileId: r.id, tgUserId: r.telegram_user_id,
            eventType: 'access_reminder', messageText: msg.bodyText, dedupKey
          });
        }
      } catch (e) {
        // Один сбойный профиль не рушит тик; claim уже сделан → следующей ночью не задвоит.
        console.error(`[reminders:${spec.kind}] profile ${r.id} failed`, e);
      }
    }
  }
}
