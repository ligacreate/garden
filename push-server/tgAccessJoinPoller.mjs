// Фаза 3 (live) — long-poll заявок на вступление (approve-on-request).
// Слушает chat_join_request, авто-одобряет ИЗВЕСТНОГО ОПЛАЧЕННОГО (или бартер).
// Незнакомца / истёкшего / paused_manual — НЕ трогает (заявка висит, в лог).
// Запускается ТОЛЬКО при mode∈{admit,live} и наличии токена (из server.mjs).
// Не конфликтует с TargetHunter: одобряет только заявки (кто пришёл по join-request-ссылке);
// прямые TH-ссылки идут мимо, TH продолжает добавлять сам во время admit-фазы.

import { TG_CHANNEL_ID, TG_CHAT_ID } from './tgAccessConst.mjs';
import { dedupKey } from './tgAccessActions.mjs';

const RES_BY_ID = { [String(TG_CHANNEL_ID)]: 'channel', [String(TG_CHAT_ID)]: 'chat' };

const PROFILE_COLS = `id, role, paid_until, access_status, coalesce(auto_pause_exempt,false) as exempt, telegram_user_id`;

// Нормализация profiles.telegram → голый handle (снять https://t.me/ , @ , хвостовой /). Для username-матча.
const TG_NORM = `lower(regexp_replace(regexp_replace(telegram, '^(https?://)?(www\\.)?(t\\.me/|telegram\\.me/)?@?', '', 'i'), '/+$', ''))`;

async function findProfile(pool, uid, username) {
  // 1) по числовому id (привязанные)
  let r = await pool.query(`select ${PROFILE_COLS} from public.profiles where telegram_user_id = $1 limit 1`, [uid]);
  if (r.rows[0]) return { p: r.rows[0], matchedBy: 'telegram_user_id' };
  // 2) по @username (непривязанные): точное case-insensitive совпадение telegram-хендла
  if (username) {
    r = await pool.query(
      `select ${PROFILE_COLS} from public.profiles
        where telegram <> '' and ${TG_NORM} = lower($1) limit 1`, [username]);
    if (r.rows[0]) return { p: r.rows[0], matchedBy: 'username' };
  }
  return { p: null, matchedBy: null };
}

async function shouldAdmit(pool, uid, username) {
  const { p, matchedBy } = await findProfile(pool, uid, username);
  if (!p) return { ok: false, why: 'unknown', profile: null, matchedBy: null };
  if (p.access_status === 'paused_manual') return { ok: false, why: 'paused_manual', profile: p, matchedBy };
  const paid = p.paid_until && new Date(p.paid_until) >= new Date();
  if (p.exempt || paid) return { ok: true, why: p.exempt ? 'exempt' : 'paid', profile: p, matchedBy };
  return { ok: false, why: 'expired_or_unpaid', profile: p, matchedBy };
}

// Бэкфилл telegram_user_id из from.id при username-матче (если был пуст и uid никем не занят).
async function backfillUid(pool, profileId, uid) {
  const taken = await pool.query(`select 1 from public.profiles where telegram_user_id=$1 and id<>$2 limit 1`, [uid, profileId]);
  if (taken.rowCount) return false; // коллизия — не трогаем
  const r = await pool.query(`update public.profiles set telegram_user_id=$1 where id=$2 and telegram_user_id is null`, [uid, profileId]);
  return r.rowCount > 0;
}

// Тег-триггер. Unicode-aware: ловим #новость и #новости (ед. и мн. число),
// но НЕ падежи внутри слова (#новостью/#новостей/#новостям/#новостями/#новостях).
const NEWS_TAG_RE = /#новост[ьи](?![\p{L}\p{N}_])/iu;

// Текст поста канала с #новость → { title, body }. Тег вырезаем (служебный).
// title = первая непустая строка остатка, body = остальное. Картинки не переносим,
// но текст подписи медиа-поста берём (вызов передаёт text || caption).
function parseChannelNews(text) {
  const raw = String(text || '');
  if (!NEWS_TAG_RE.test(raw)) return null;                 // нет тега → не новость
  const stripped = raw.replace(NEWS_TAG_RE, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!stripped) return null;                              // пост состоял только из тега
  const lines = stripped.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;        // пропустить пустые строки до заголовка
  const title = (lines[i] || '').trim();
  if (!title) return null;
  const body = lines.slice(i + 1).join('\n').trim();       // может быть пустым (пост в одну строку)
  return { title, body };
}

// Идемпотентная запись канальной новости. ON CONFLICT по частичному uidx (см. миграцию).
// Вернёт id новой строки либо null, если такой message_id уже был (дубль).
async function insertChannelNews(pool, { messageId, title, body }) {
  const r = await pool.query(
    `insert into public.news (title, body, type, tg_message_id, image_url, author_id)
     values ($1, $2, 'channel', $3, null, null)
     on conflict (tg_message_id) where tg_message_id is not null do nothing
     returning id`,
    [title, body || '', messageId]
  );
  return r.rows[0]?.id || null;
}

export function startJoinPoller({ pool, tg, mode, logger = console }) {
  if (!['admit', 'live'].includes(mode)) { logger.info?.(`[join-poller] mode=${mode} → не стартуем`); return { stop() {} }; }
  let offset = 0;
  let running = true;
  logger.info?.('[join-poller] старт (allowed_updates=chat_join_request,channel_post)');

  (async function loop() {
    while (running) {
      try {
        const upd = await tg.getUpdates({ offset, timeout: 30, allowed_updates: ['chat_join_request', 'channel_post'] });
        if (!upd?.ok) { await sleep(3000); continue; }
        for (const u of upd.result) {
          offset = u.update_id + 1;
          // ── Канальный пост из канала Лиги с #новость → новость на платформе ──
          // Изолировано в свой try/catch: сбой разбора поста НЕ должен мешать впуску заявок.
          const post = u.channel_post;
          if (post) {
            try {
              if (String(post.chat?.id) === String(TG_CHANNEL_ID)) {
                const parsed = parseChannelNews(post.text || post.caption); // текст поста или подпись медиа; картинку не переносим
                if (parsed) {
                  const newsId = await insertChannelNews(pool, { messageId: post.message_id, ...parsed });
                  logger.info?.(newsId
                    ? `[join-poller] news+ msg=${post.message_id} → news#${newsId} "${parsed.title.slice(0, 40)}"`
                    : `[join-poller] news dup msg=${post.message_id} — пропуск (уже был)`);
                }
              }
            } catch (e) {
              logger.error?.('[join-poller] channel_post error', e?.message);
            }
            continue; // channel_post — не заявка, дальше не идём
          }
          const req = u.chat_join_request;
          if (!req) continue;
          const uid = req.from?.id;
          const username = req.from?.username || null;
          const resource = RES_BY_ID[String(req.chat?.id)];
          if (!uid || !resource) continue;
          const verdict = await shouldAdmit(pool, uid, username);
          if (verdict.ok) {
            const res = await tg.approveChatJoinRequest(req.chat.id, uid);
            let backfilled = false;
            // при username-матче и пустом telegram_user_id — привяжем числовой id из заявки
            if (res.ok && verdict.matchedBy === 'username' && !verdict.profile.telegram_user_id) {
              backfilled = await backfillUid(pool, verdict.profile.id, uid);
            }
            await logApprove(pool, { profile: verdict.profile, uid, resource, ok: res.ok, res });
            logger.info?.(`[join-poller] approve ${uid}@${resource} (${verdict.why}, by=${verdict.matchedBy}${backfilled ? ',uid-backfilled' : ''}) ok=${res.ok}`);
          } else {
            logger.info?.(`[join-poller] SKIP ${uid}(@${username || '—'})@${resource} (${verdict.why}) — заявка висит`);
          }
        }
      } catch (e) {
        logger.error?.('[join-poller] loop error', e?.message);
        await sleep(5000);
      }
    }
  })();

  return { stop() { running = false; } };
}

async function logApprove(pool, { profile, uid, resource, ok, res }) {
  const key = dedupKey('admit_approve', uid, resource, profile?.paid_until);
  await pool.query(
    `insert into public.tg_access_actions
       (profile_id, telegram_user_id, resource, action, reason, paid_until_snap, status, dedup_key, tg_response, executed_at)
     select $1,$2,$3,'admit_approve','join_request',$4,$5,$6,$7::jsonb, now()
      where not exists (select 1 from public.tg_access_actions where dedup_key=$6 and status='executed')`,
    [profile?.id || null, uid, resource, profile?.paid_until || null,
     ok ? 'executed' : 'failed', key, JSON.stringify(res || {})]
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
