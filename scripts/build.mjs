import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escapeHtml, renderSite } from './render.mjs';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function versionAssets(html, root, hashes) {
  const references = /(\s(?:href|src)\s*=\s*)(["'])(\/assets\/[^"'<>]+)\2/giu;
  const replacements = await Promise.all([...html.matchAll(references)].map(async (match) => {
    const url = new URL(match[3].replaceAll('&amp;', '&'), 'https://063.jp/');
    if (!url.pathname.startsWith('/assets/') || !/\.(?:css|js)$/iu.test(url.pathname)) return match[0];
    const file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!hashes.has(file)) {
      hashes.set(file, readFile(file).then((content) => createHash('sha256').update(content).digest('hex').slice(0, 12)));
    }
    url.searchParams.set('v', await hashes.get(file));
    return `${match[1]}${match[2]}${escapeHtml(`${url.pathname}${url.search}${url.hash}`)}${match[2]}`;
  }));
  let index = 0;
  return html.replace(references, () => replacements[index++]);
}

export async function build({ check = false, root = projectRoot } = {}) {
  const [template, notFoundTemplate, source] = await Promise.all([
    readFile(resolve(root, 'src/index.html'), 'utf8'),
    readFile(resolve(root, 'src/404.html'), 'utf8'),
    readFile(resolve(root, 'data/site.json'), 'utf8'),
  ]);
  const data = JSON.parse(source);
  const hashes = new Map();
  const pages = await Promise.all([
    ['index.html', template],
    ['404.html', notFoundTemplate],
  ].map(async ([name, pageTemplate]) => ({
    name,
    html: await versionAssets(renderSite(pageTemplate, data), root, hashes),
  })));
  if (check) {
    const stale = [];
    for (const page of pages) {
      const existing = await readFile(resolve(root, page.name), 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (existing !== page.html) stale.push(page.name);
    }
    if (stale.length) throw new Error(`${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} out of date. Run npm run build and include the generated files.`);
  } else {
    await Promise.all(pages.map((page) => writeFile(resolve(root, page.name), page.html)));
  }
  return pages[0].html;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some((argument) => argument !== '--check')) throw new Error('Usage: node scripts/build.mjs [--check]');
    const check = process.argv.includes('--check');
    await build({ check });
    console.log(check ? 'Generated HTML is up to date.' : 'Generated index.html and 404.html.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
