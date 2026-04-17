-- ДЗ2 · Ирина Петруня → pvl_student_homework_submissions
-- student_id = profiles.id; homework_item_id = урок «Ведущая: роль, границы, этика»
-- Выполнить в Adminer/psql под ролью с INSERT на таблицу.

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
)
VALUES (
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
  jsonb_build_object(
    'draftVersionId', NULL,
    'currentVersionId', 'v1_manual',
    'versions', jsonb_build_array(
      jsonb_build_object(
        'id', 'v1_manual',
        'versionNumber', 1,
        'isDraft', false,
        'isCurrent', true,
        'textContent', $IRINA_HW$
Дз2 Ирина Петруня
1. Моя группа компетенций: 
Интеллектуальная, адаптивная, социальная - эти группы компетенций мне знакомы и в навыке (педагогика и бизнес- тренинги, лидерство в команде). По некоторым моментам, я думаю, в контексте письменных практик, нужно будет притормаживать. Переработать мой бизнес опыт в опыт - безопасно Человеку. Человек - это волшебство, а не бизнес-задача. 
Функциональная - есть опыт методичек к урокам, опыт презентаций и раздаток для тренингов. Тут, скорее, будут ответы, как только я поучаствую в Завтраках. Тоже важна специфика. 
Первые шаги - посмотреть завтрак, поменять оптику и подобрать нужную.

2. Осьминожка:
Коммуникативные - 1
Организационные - 7
Методички и творчество - 8
Маркетинг (только потому, что личный бренд) - 1
Психология, коуч - Коуч - 8, психология - 1
Фасилитатор - 8
Самоздоровье - 2
Саморазвитие - 9
$IRINA_HW$
      )
    ),
    'thread', '[]'::jsonb
  )
);
