-- database/pvl/migrations/2026-06-03_phase44_pvl_training_feedback_mentor_insert.sql
--
-- phase44 — менторский отзыв на ТРЕНИРОВОЧНОМ завтраке.
--
-- Контекст: recon по жалобе Юли Габрух (ментор) — менторского отзыва на
-- тренировочный завтрак не было ни в модели, ни в UI (фича peer↔peer из ТЗ _134
-- §2 #10: ментор только ЧИТАЕТ). Продуктовое решение Ольги: ментор может
-- оставлять свой отзыв на тренировочные завтраки СВОИХ менти.
--
-- Что делает:
--   + одна новая PERMISSIVE INSERT-политика pvl_training_feedback_insert_mentor,
--     зеркало peer-политики, но через is_mentor_for(s.student_id) вместо
--     is_pvl_cohort_peer(). PERMISSIVE-политики OR'ятся → peer ИЛИ ментор.
--
-- Что НЕ трогаем (и почему):
--   - UNIQUE (session_id, author_id) — уже есть; менторская строка сосуществует
--     с peer-строками (разные author_id). Не трогаем.
--   - UPDATE-политика pvl_training_feedback_update_own_or_admin — уже
--     author-generic (author_id = auth.uid() OR is_admin()) → ментор правит свой
--     отзыв «бесплатно» после INSERT. Зеркало НЕ нужно.
--   - SELECT — ментор уже видит отзывы своих менти через is_mentor_for
--     (pvl_training_feedback_select, phase38). Владелец-менти увидит менторский
--     отзыв (owner-sees-all); чужие peer — нет (peer видит только свой). Не трогаем.
--   - RESTRICTIVE guard *_active_access_guard_write (has_platform_access) —
--     AND'ится поверх; ментор обязан иметь platform access (проверено в dryrun).
--   - ensure_garden_grants() / recover_grants.sh — таблиц/грантов не добавляем,
--     новых GRANT не нужно. ensure_garden_grants() вызываем лишь как конвенция
--     (NOTIFY pgrst 'reload schema').
--
-- Apply (после 🟢 от стратега):
--   scp database/pvl/migrations/2026-06-03_phase44_pvl_training_feedback_mentor_insert.sql \
--     root@5.129.251.56:/tmp/
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-06-03_phase44_pvl_training_feedback_mentor_insert.sql'
--
-- ТЗ/recon: docs/_session/2026-05-26_134_strategist_tz_etap1_training_feedback.md
--           docs/_session/2026-06-03_180_codeexec_recon_mentor_training_feedback.md (recon)
--           docs/_session/2026-06-03_181_codeexec_phase44_backend_mentor_feedback_dryrun.md (dryrun)
--           phase38 (2026-05-26_phase38_pvl_training_breakfasts.sql) — базовые таблицы/RLS

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- PERMISSIVE INSERT для ментора (зеркало pvl_training_feedback_insert_peer)
-- ============================================================================
DROP POLICY IF EXISTS pvl_training_feedback_insert_mentor ON pvl_training_feedback;

CREATE POLICY pvl_training_feedback_insert_mentor
  ON pvl_training_feedback FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM pvl_training_sessions s
      WHERE s.id = pvl_training_feedback.session_id
        AND is_mentor_for(s.student_id)
    )
  );

-- Конвенция: NOTIFY pgrst 'reload schema' + защитный re-grant.
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: INSERT-политики на pvl_training_feedback (ожидание: insert_peer + insert_mentor) ===
SELECT polname,
       CASE polpermissive WHEN true THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS kind,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.pvl_training_feedback'::regclass
  AND polcmd = 'a'           -- 'a' = INSERT
ORDER BY polname;
