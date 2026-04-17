-- Ручная загрузка сабмишна: после INSERT клиент подхватит строку при syncPvlRuntimeFromDb / повторном входе в AL Camp.
-- 1) Убедитесь, что pvl_homework_items.id совпадает с заданием урока:
--    SELECT id, title, external_key FROM pvl_homework_items WHERE title ILIKE '%Ведущая%' OR external_key IS NOT NULL;
-- 2) Строка в pvl_students обязательна (FK).
-- 3) status для «у ментора на проверке»: in_review
-- 4) payload — JSONB: versions[].textContent, currentVersionId, draftVersionId (как в приложении).

-- Пример: ученица Ирина Петруня (подставьте свои UUID и текст в $HW$...$HW$)
/*
INSERT INTO public.pvl_students (id, full_name, cohort_id, mentor_id, status, created_at, updated_at)
VALUES (
  '35019374-d7de-4900-aa9d-1797bcca9769',
  'Ирина Петруня',
  NULL,
  NULL,
  'applicant',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = NOW();

INSERT INTO public.pvl_student_homework_submissions (
  id,
  student_id,
  homework_item_id,
  status,
  score,
  mentor_bonus_score,
  submitted_at,
  checked_at,
  accepted_at,
  revision_cycles,
  created_at,
  updated_at,
  payload
) VALUES (
  gen_random_uuid(),
  '35019374-d7de-4900-aa9d-1797bcca9769',
  '22a9a62c-1684-4a60-b54d-fcaba9f5bbf3',
  'in_review',
  0,
  0,
  NOW(),
  NULL,
  NULL,
  0,
  NOW(),
  NOW(),
  $HW$
  {
    "draftVersionId": null,
    "currentVersionId": "v1_manual",
    "versions": [
      {
        "id": "v1_manual",
        "versionNumber": 1,
        "isDraft": false,
        "isCurrent": true,
        "textContent": "Текст ответа по заданию — вставьте полностью, без обрыва."
      }
    ],
    "thread": []
  }
  $HW$::jsonb
);
*/
