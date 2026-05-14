import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = ['.env.local', '.env']
  .map((name) => path.join(root, name))
  .find((file) => fs.existsSync(file));

if (!source) {
  console.warn('[link-env] No hay .env.local ni .env en la raíz; copia .env.example.');
  process.exit(0);
}

for (const app of ['apps/web', 'apps/landing']) {
  const target = path.join(root, app, '.env.local');
  const relative = path.relative(path.dirname(target), source);

  if (fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink()) {
    console.warn(`[link-env] ${target} existe y no es symlink; no se toca.`);
    continue;
  }

  fs.rmSync(target, { force: true });
  fs.symlinkSync(relative, target);
  console.log(`[link-env] ${target} -> ${relative}`);
}
