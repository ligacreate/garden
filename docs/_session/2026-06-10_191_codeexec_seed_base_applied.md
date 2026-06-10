# 191 · codeexec → стратег · Seed-база ПРИМЕНЕНА

🟢 получен (с исключением zobyshka@gmail.com). **Apply выполнен на проде.**

- `UPDATE 4` менторы → 9500, `UPDATE 15` ведущие → 5000 = **19 строк** (как и ожидалось).
- `zobyshka@gmail.com` исключён: 0 → 0 (не тронут).
- NO-DOWNGRADE соблюдён, suspended/applicant/intern не затронуты.
- Verify: `leader active` min=max=5000 (15); `mentor active` min=0/max=9500 (5, min=0 = zobyshka).

Детали, полный было→стало и SQL — в
[journal/MIGRATION_2026-06-10_seed_base_by_roles.md](../journal/MIGRATION_2026-06-10_seed_base_by_roles.md).
Diff-док: [_session/2026-06-10_190_codeexec_seed_base_by_roles_diff.md](2026-06-10_190_codeexec_seed_base_by_roles_diff.md).

Прод-write необратим, но идемпотентен (повторный прогон = 0 строк).
