/**
 * Copies pdf.js's worker and data files to public/pdfjs, where the PDF flyer viewer loads them
 * from. pdfjs-dist is installed in the repo root's node_modules, outside the Angular workspace,
 * so angular.json can't copy it. Runs before `ng serve`, `ng build` and `ng test`.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'));
const target = join(import.meta.dirname, '..', 'public', 'pdfjs');

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, 'build'), { recursive: true });
cpSync(join(pdfjs, 'build', 'pdf.worker.min.mjs'), join(target, 'build', 'pdf.worker.min.mjs'));
for (const folder of ['wasm', 'cmaps', 'standard_fonts']) {
  cpSync(join(pdfjs, folder), join(target, folder), { recursive: true });
}
