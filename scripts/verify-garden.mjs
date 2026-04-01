/**
 * Проверка: оболочка «Сада» не тянет ПВЛ напрямую; сборка проходит.
 * Запуск: npm run verify:garden
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const checks = [
  {
    file: 'views/UserApp.jsx',
    forbid: [
      /import\s+.*\bPvlPrototypeApp\b/,
      /from\s+['"].*\/Pvl/,
      /['"]pvl-student['"]/,
      /['"]pvl-prototype['"]/,
      /['"]mentor-dashboard['"]/,
      /\bMentorDashboardView\b/,
    ],
    note: 'ПВЛ только через Библиотеку → CourseLibraryView (без прямого Pvl в UserApp)',
  },
  {
    file: 'App.jsx',
    forbid: [/\bPvlPrototypeApp\b/, /from\s+['"].*\/Pvl/],
    note: 'App.jsx без ПВЛ',
  },
  {
    file: 'views/StatsDashboardView.jsx',
    forbid: [/\bPvl/, /pvl-/i],
    note: 'Дашборд сада без ПВЛ',
  },
];

let failed = false;
for (const { file, forbid, note } of checks) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) {
    console.error(`[verify-garden] нет файла: ${file}`);
    failed = true;
    continue;
  }
  const src = read(file);
  for (const re of forbid) {
    if (re.test(src)) {
      console.error(`[verify-garden] FAIL ${file}: ${note}`);
      console.error(`  запрещённый паттерн: ${re}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('[verify-garden] статические проверки ок, запуск npm run build...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });
console.log('[verify-garden] готово.');
