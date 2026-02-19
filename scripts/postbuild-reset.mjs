import { mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const distIndex = resolve('dist', 'index.html');
const resetIndex = resolve('dist', 'reset', 'index.html');

await mkdir(dirname(resetIndex), { recursive: true });
await copyFile(distIndex, resetIndex);
console.log('[postbuild] ensured dist/reset/index.html');
