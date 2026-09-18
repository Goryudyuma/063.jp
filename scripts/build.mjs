import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderSite } from './render.mjs';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function build({ check = false, root = projectRoot } = {}) {
  const [template, source] = await Promise.all([
    readFile(resolve(root, 'src/index.html'), 'utf8'),
    readFile(resolve(root, 'data/site.json'), 'utf8'),
  ]);
  const html = renderSite(template, JSON.parse(source));
  const output = resolve(root, 'index.html');
  if (check) {
    const existing = await readFile(output, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing !== html) throw new Error('index.html is out of date. Run npm run build and include the generated file.');
  } else {
    await writeFile(output, html);
  }
  return html;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some((argument) => argument !== '--check')) throw new Error('Usage: node scripts/build.mjs [--check]');
    const check = process.argv.includes('--check');
    await build({ check });
    console.log(check ? 'Generated HTML is up to date.' : 'Generated index.html.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
