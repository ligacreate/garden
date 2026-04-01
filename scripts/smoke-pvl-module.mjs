/**
 * Проверка: граф модулей PvlPrototypeApp инициализируется без TDZ (Node + Vite).
 * Запуск: npx vite-node scripts/smoke-pvl-module.mjs
 */
import Pvl from '../views/PvlPrototypeApp.jsx';

const def = Pvl?.default ?? Pvl;
if (typeof def !== 'function') {
    console.error('PVL_MODULE_FAIL: expected default function export');
    process.exit(1);
}
console.log('PVL_MODULE_OK');
