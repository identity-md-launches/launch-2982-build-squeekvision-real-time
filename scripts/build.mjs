// Builds the static export: copies the dependency-free source in src/ to dist/
// and checks that every local reference in index.html is relative and present.
//
//   node scripts/build.mjs          rebuild dist/
//   node scripts/build.mjs --check  verify dist/ matches src/ without writing
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');
const checkOnly = process.argv.includes('--check');

const files = (await readdir(src)).filter((f) => !f.startsWith('.')).sort();
const problems = [];

const html = await readFile(join(src, 'index.html'), 'utf8');
const refs = [...html.matchAll(/\b(?:href|src|content)="([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (/^(https?:|mailto:|#)/.test(ref) || !/\.(css|js|svg|png|ico|webmanifest)$/.test(ref)) continue;
  if (!ref.startsWith('./')) problems.push(`index.html references ${ref}; use a ./ relative URL`);
  else if (!files.includes(ref.slice(2))) problems.push(`index.html references missing file ${ref}`);
}
for (const tag of ['<title>', 'name="description"', 'property="og:title"', 'property="og:image"', 'rel="icon"']) {
  if (!html.includes(tag)) problems.push(`index.html is missing ${tag}`);
}

if (checkOnly) {
  for (const f of files) {
    const a = await readFile(join(src, f));
    const target = join(dist, f);
    if (!existsSync(target)) { problems.push(`dist/${f} is missing`); continue; }
    const b = await readFile(target);
    if (!a.equals(b)) problems.push(`dist/${f} differs from src/${f}; run npm run build`);
  }
  if (existsSync(dist)) {
    for (const f of await readdir(dist)) if (!files.includes(f)) problems.push(`dist/${f} has no source in src/`);
  }
} else if (problems.length === 0) {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  for (const f of files) await writeFile(join(dist, f), await readFile(join(src, f)));
}

if (problems.length) {
  for (const p of problems) console.error('error: ' + p);
  process.exit(1);
}
console.log(checkOnly ? `dist/ matches src/ (${files.length} files)` : `built dist/ (${files.join(', ')})`);
