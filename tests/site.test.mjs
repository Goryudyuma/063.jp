import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const siteOrigin = 'https://063.jp';
const root = new URL('../', import.meta.url);
const documentPaths = ['src/index.html', 'index.html', '404.html'];
const documents = await Promise.all(documentPaths.map(async (path) => ({
  path,
  html: await readFile(new URL(path, root), 'utf8'),
})));
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
const data = JSON.parse(await readFile(new URL('data/site.json', root), 'utf8'));

// This deliberately handles this repository's quoted, static HTML, not arbitrary HTML.
function decode(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/giu, (entity) => {
    const names = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const hex = entity.slice(2, 3).toLowerCase() === 'x';
    return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10));
  });
}

function attributes(source) {
  const result = new Map();
  for (const match of source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
    result.set(match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return result;
}

function tags(html) {
  return [...html.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/giu)].map((match) => ({
    name: match[1].toLowerCase(),
    attrs: attributes(match[2]),
  }));
}

function baseUrl(path) {
  return new URL(path === 'src/index.html' ? '/index.html' : `/${path}`, siteOrigin);
}

async function existingLocalReference(reference, owner) {
  if (reference.includes('{{')) return;
  const url = new URL(reference, baseUrl(owner));
  if (url.origin !== siteOrigin) return;
  const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = new URL(`.${path}`, root);
  assert.ok(file.href.startsWith(root.href), `${owner}: local URL escapes the site: ${reference}`);
  const info = await stat(file).catch(() => null);
  assert.ok(info?.isFile(), `${owner}: local file is missing: ${reference}`);
}

test('HTML, CSS, and manifest local asset references resolve to real files', async () => {
  for (const document of documents) {
    for (const tag of tags(document.html)) {
      const resourceAttributes = ['src', 'poster'];
      if (tag.name === 'link') resourceAttributes.push('href');
      for (const attribute of resourceAttributes) {
        const reference = tag.attrs.get(attribute);
        if (reference) await existingLocalReference(reference, document.path);
      }
      if (tag.name === 'link' && tag.attrs.get('rel') === 'stylesheet') {
        const href = tag.attrs.get('href');
        const css = await readFile(new URL(`.${new URL(href, baseUrl(document.path)).pathname}`, root), 'utf8');
        for (const match of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/giu)) {
          await existingLocalReference(match[1] ?? match[2] ?? match[3], href.replace(/^\//u, ''));
        }
      }
    }
  }
  assert.ok(manifest.icons.length > 0, 'The manifest must provide an icon.');
  for (const icon of manifest.icons) await existingLocalReference(icon.src, 'manifest.webmanifest');
  await existingLocalReference(manifest.start_url, 'manifest.webmanifest');
});

test('documents have unique IDs and valid local anchor and accessibility references', () => {
  for (const document of documents) {
    const elements = tags(document.html);
    const ids = elements.map((tag) => tag.attrs.get('id')).filter((value) => value !== undefined);
    assert.equal(new Set(ids).size, ids.length, `${document.path}: duplicate ID`);
    assert.ok(ids.every((id) => id.length > 0 && !/\s/u.test(id)), `${document.path}: IDs must be non-empty single values`);
    const available = new Set(ids);
    for (const tag of elements) {
      const href = tag.attrs.get('href');
      if (href?.startsWith('#') && href.length > 1) {
        assert.ok(available.has(decodeURIComponent(href.slice(1))), `${document.path}: missing anchor ${href}`);
      }
      for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        for (const id of (tag.attrs.get(attribute) || '').split(/\s/u).filter(Boolean)) {
          assert.ok(available.has(id), `${document.path}: ${attribute} refers to missing #${id}`);
        }
      }
    }
  }
});

function singleTag(elements, name, attribute, value, owner) {
  const matches = elements.filter((tag) => tag.name === name && tag.attrs.get(attribute) === value);
  assert.equal(matches.length, 1, `${owner}: expected one ${name}[${attribute}="${value}"]`);
  return matches[0].attrs;
}

test('published metadata, social sharing, manifest, and 404 indexing settings agree', () => {
  for (const document of documents.filter(({ path }) => path !== 'src/index.html')) {
    const elements = tags(document.html);
    singleTag(elements, 'html', 'lang', 'ja', document.path);
    singleTag(elements, 'meta', 'charset', 'utf-8', document.path);
    assert.match(singleTag(elements, 'meta', 'name', 'viewport', document.path).get('content'), /width=device-width/u);
    assert.equal([...document.html.matchAll(/<title\b[^>]*>([^<]+)<\/title>/giu)].length, 1, `${document.path}: one non-empty title is required`);
  }
  const home = documents.find(({ path }) => path === 'index.html');
  const elements = tags(home.html);
  const description = singleTag(elements, 'meta', 'name', 'description', home.path).get('content');
  const canonical = singleTag(elements, 'link', 'rel', 'canonical', home.path).get('href');
  const title = decode(home.html.match(/<title\b[^>]*>([^<]+)<\/title>/iu)[1]);
  const og = (property) => singleTag(elements, 'meta', 'property', `og:${property}`, home.path).get('content');
  assert.equal(description, data.profile.bio);
  assert.equal(canonical, `${siteOrigin}/`);
  assert.equal(og('url'), canonical);
  assert.equal(og('type'), 'website');
  assert.equal(og('title'), title);
  assert.equal(og('description'), description);
  assert.equal(og('image'), new URL(data.profile.avatar, `${siteOrigin}/`).href);
  assert.equal(new URL(og('image')).protocol, 'https:');
  assert.ok(['summary', 'summary_large_image'].includes(singleTag(elements, 'meta', 'name', 'twitter:card', home.path).get('content')));
  assert.equal(manifest.lang, 'ja');
  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.theme_color, singleTag(elements, 'meta', 'name', 'theme-color', home.path).get('content'));
  const notFound = documents.find(({ path }) => path === '404.html');
  assert.ok(singleTag(tags(notFound.html), 'meta', 'name', 'robots', notFound.path).get('content').split(/[,\s]+/u).includes('noindex'));
});

test('HTML resources comply with CSP and need no inline script, handlers, or styles', async () => {
  const headers = await readFile(new URL('_headers', root), 'utf8');
  const csp = headers.match(/^\s+Content-Security-Policy:\s*(.+)$/imu)?.[1];
  assert.ok(csp, 'A Content-Security-Policy header is required.');
  const directives = new Map(csp.split(';').filter((part) => part.trim()).map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/u);
    return [name, sources];
  }));
  assert.ok(!csp.includes("'unsafe-inline'") && !csp.includes("'unsafe-eval'"));
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  function allowed(reference, directive, owner) {
    if (reference.includes('{{')) return;
    const url = new URL(reference, baseUrl(owner));
    const sources = directives.get(directive) || directives.get('default-src') || [];
    assert.ok(sources.some((source) => source === "'self'" ? url.origin === siteOrigin : source === url.origin), `${owner}: ${reference} is blocked by ${directive}`);
  }
  for (const document of documents) {
    const elements = tags(document.html);
    assert.ok(!elements.some((tag) => tag.name === 'style'), `${document.path}: inline style block`);
    for (const tag of elements) {
      assert.ok(!tag.attrs.has('style'), `${document.path}: inline style attribute`);
      assert.ok(![...tag.attrs.keys()].some((key) => /^on/iu.test(key)), `${document.path}: inline event handler`);
      if (tag.name === 'script') {
        assert.ok(tag.attrs.get('src'), `${document.path}: inline script`);
        allowed(tag.attrs.get('src'), 'script-src', document.path);
      }
      if (tag.name === 'link' && tag.attrs.get('rel') === 'stylesheet') allowed(tag.attrs.get('href'), 'style-src', document.path);
      if (tag.name === 'img') allowed(tag.attrs.get('src'), 'img-src', document.path);
    }
    for (const match of document.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/giu)) {
      assert.equal(match[1].trim(), '', `${document.path}: script element contains inline code`);
    }
  }
});
