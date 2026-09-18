import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from '../scripts/build.mjs';
import { renderSite, validateSiteData, validateUrl } from '../scripts/render.mjs';
import { createSiteServer } from '../scripts/serve.mjs';

const site = {
  profile: {
    name: 'サンプル (Sample / sample)', displayName: 'サンプル', englishName: 'Sample', handle: 'sample',
    tagline: 'エンジニア', bio: '札幌で開発しています。', avatar: '/assets/avatar.svg', location: '札幌', birthday: '1994/06/03',
  },
  links: [{ label: 'GitHub', url: 'https://github.com/example' }],
  projects: [{ title: 'Project', description: 'プロジェクト', url: 'https://example.com/', links: [{ label: 'Repo', url: 'https://github.com/example/project' }] }],
  experience: [{ role: 'Engineer', org: 'Example', orgUrl: 'https://example.com/', start: '2021-06', end: null, summary: '開発' }],
  activities: [{ title: '大会', note: '参加', url: 'https://example.com/event' }],
  education: [{ school: '学校', note: '情報工学', url: 'https://example.com/school' }],
  residences: [{ place: '札幌', note: '現在' }],
  skills: ['Go'],
  contact: { email: 'sample@example.com' },
};
const allContent = '{{displayName}}{{englishName}}{{handle}}{{tagline}}{{bio}}{{location}}{{birthday}}{{socialLinks}}{{projectList}}{{experienceList}}{{activityList}}{{educationList}}{{residenceList}}{{skillList}}{{email}}';

test('editable text and URL attributes cannot introduce executable HTML', () => {
  const data = structuredClone(site);
  const hostileText = '<img src=x onerror="alert(1)"> & \'quoted\'';
  data.profile.displayName = hostileText;
  data.profile.bio = hostileText;
  data.links[0] = { label: hostileText, url: 'https://example.com/?q="onclick=alert(1)' };
  data.projects[0].title = hostileText;
  data.activities[0].note = hostileText;
  data.education[0].school = hostileText;
  data.skills = [hostileText];
  const html = renderSite('<meta content="{{metaDescription}}">' + allContent, data);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;'));
  assert.ok(html.includes('href="https://example.com/?q=&quot;onclick=alert(1)"'));
  assert.ok(!html.includes('href="https://example.com/?q="onclick'));
  assert.match(html, /target="_blank" rel="noopener noreferrer"/u);
});

test('URLs reject executable schemes, browser normalization tricks, and unsafe local paths', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,test', '//evil.example',
    ' https://example.com', 'https://example.com\n', 'java\tscript:alert(1)',
    'https:\\example.com', 'https:example.com', 'https://user:pass@example.com',
    'https://example.com/%0aheader', '/assets/../data/site.json',
    '/assets/%2e%2e/package.json', '/assets/%5c..%5csecret', '/assets/%00image.svg',
  ]) assert.throws(() => validateUrl(url, 'url', { allowAssetPath: true }), TypeError, url);
  assert.equal(validateUrl('https://example.com/?one=1&two=2'), 'https://example.com/?one=1&two=2');
  assert.equal(validateUrl('/assets/avatar.svg', 'url', { allowAssetPath: true }), '/assets/avatar.svg');
  assert.throws(() => validateUrl('/assets/avatar.svg'), TypeError);
});

test('bad data fails before publishing with a useful field path', () => {
  const cases = [
    [(data) => { delete data.education; }, /site\.education/u],
    [(data) => { data.profile.displayName = ''; }, /profile\.displayName/u],
    [(data) => { data.profile.birthday = '2023/02/29'; }, /profile\.birthday/u],
    [(data) => { data.profile.avatar = 'https://example.com/avatar.png'; }, /profile\.avatar/u],
    [(data) => { data.experience[0].start = '2021-13'; }, /experience\[0\]\.start/u],
    [(data) => { data.experience[0].end = '2020'; }, /experience\[0\]\.end/u],
    [(data) => { data.projects[0].url = 'javascript:alert(1)'; }, /projects\[0\]\.url/u],
    [(data) => { data.education[0].url = null; }, /education\[0\]\.url/u],
    [(data) => { data.skills = 'Go'; }, /skills/u],
    [(data) => { data.contact.email = 'me@example.com?subject=hello'; }, /contact\.email/u],
    [(data) => { data.contact.email = 'me%0d%0abcc=other@example.com'; }, /contact\.email/u],
    [(data) => { data.activities[0].titel = 'Typo'; }, /activities\[0\]\.titel/u],
  ];
  for (const [mutate, message] of cases) {
    const data = structuredClone(site);
    mutate(data);
    assert.throws(() => validateSiteData(data), message);
  }
  assert.throws(() => renderSite('{{nonexistent}}', site), /Unknown template token/u);
  assert.equal(renderSite('{{ogImage}}', site), 'https://063.jp/assets/avatar.svg');
});

test('biographical records stay ordered and readable without browser JavaScript', () => {
  const data = structuredClone(site);
  data.experience.push({ role: 'Past', org: 'Earlier employer', start: '2018', end: '2021-05', summary: '過去の仕事' });
  data.education.push({ school: '次の学校', note: '中退' });
  data.activities.push({ title: '次の大会' });
  data.residences.push({ place: '松本', note: '以前' });
  const before = structuredClone(data);
  const html = renderSite(allContent, data);
  assert.ok(html.indexOf('学校</a>') < html.indexOf('次の学校'));
  assert.ok(html.indexOf('大会</a>') < html.indexOf('次の大会'));
  assert.ok(html.includes('中退'));
  assert.ok(html.includes('松本'));
  assert.match(html, /datetime="2021-06">2021\.06/u);
  assert.match(html, /datetime="2018">2018/u);
  assert.match(html, /datetime="2021-05">2021\.05/u);
  assert.ok(html.includes('現在'));
  assert.ok(html.includes('1994.06.03'));
  assert.ok(!html.includes('<script'));
  assert.deepEqual(data, before);
});

test('build check catches stale output without replacing it', async (context) => {
  const root = await mkdtemp(join(tmpdir(), '063-build-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([mkdir(join(root, 'src')), mkdir(join(root, 'data'))]);
  await Promise.all([
    writeFile(join(root, 'src/index.html'), '<h1>{{displayName}}</h1>\n'),
    writeFile(join(root, 'src/404.html'), '<h1>Not found</h1>\n'),
    writeFile(join(root, 'data/site.json'), JSON.stringify(site)),
  ]);
  await build({ root });
  await build({ root, check: true });
  await writeFile(join(root, 'index.html'), 'stale');
  await assert.rejects(build({ root, check: true }), /out of date/u);
  assert.equal(await readFile(join(root, 'index.html'), 'utf8'), 'stale');
  await build({ root });
  await writeFile(join(root, '404.html'), 'stale 404');
  await assert.rejects(build({ root, check: true }), /404\.html is out of date/u);
  assert.equal(await readFile(join(root, '404.html'), 'utf8'), 'stale 404');
});

test('asset versions stay stable until content changes, then invalidate both pages', async (context) => {
  const root = await mkdtemp(join(tmpdir(), '063-assets-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(['src', 'data', 'assets'].map((directory) => mkdir(join(root, directory))));
  const template = '<link rel="stylesheet" href="/assets/style.css?mode=screen&amp;v=old#styles">\n<script src="/assets/app.js"></script>\n<link rel="icon" href="/assets/icon.svg">\n<script src="https://example.com/external.js"></script>\n';
  await Promise.all([
    writeFile(join(root, 'src/index.html'), template + '<h1>{{displayName}}</h1>'),
    writeFile(join(root, 'src/404.html'), template + '<h1>Not found</h1>'),
    writeFile(join(root, 'data/site.json'), JSON.stringify(site)),
    writeFile(join(root, 'assets/style.css'), 'body { color: black; }'),
    writeFile(join(root, 'assets/app.js'), 'console.log("ready");'),
  ]);
  const page = (name) => readFile(join(root, name), 'utf8');
  const assetUrl = (html, name) => new URL(html.match(new RegExp(`(?:href|src)="(/assets/${name}[^\"]*)"`, 'u'))[1].replaceAll('&amp;', '&'), 'https://063.jp');
  await build({ root });
  const first = await page('index.html');
  const firstNotFound = await page('404.html');
  const originalStyle = assetUrl(first, 'style.css');
  assert.match(originalStyle.searchParams.get('v'), /^[0-9a-f]{12}$/u);
  assert.equal(originalStyle.searchParams.getAll('v').length, 1);
  assert.equal(originalStyle.searchParams.get('mode'), 'screen');
  assert.equal(originalStyle.hash, '#styles');
  assert.equal(assetUrl(firstNotFound, 'style.css').href, originalStyle.href);
  assert.ok(first.includes('href="/assets/icon.svg"'));
  assert.ok(first.includes('src="https://example.com/external.js"'));
  await build({ root });
  assert.equal(await page('index.html'), first);
  assert.equal(await page('404.html'), firstNotFound);
  await build({ root, check: true });

  await writeFile(join(root, 'assets/style.css'), 'body { color: blue; }');
  await assert.rejects(build({ root, check: true }), /index\.html, 404\.html are out of date/u);
  assert.equal(await page('index.html'), first);
  assert.equal(await page('404.html'), firstNotFound);
  await build({ root });
  const updated = await page('index.html');
  assert.notEqual(assetUrl(updated, 'style.css').href, originalStyle.href);
  assert.equal(assetUrl(await page('404.html'), 'style.css').href, assetUrl(updated, 'style.css').href);
  assert.equal(assetUrl(updated, 'app.js').href, assetUrl(first, 'app.js').href);

  await writeFile(join(root, 'assets/app.js'), 'console.log("updated");');
  await assert.rejects(build({ root, check: true }), /out of date/u);
  await build({ root });
  assert.notEqual(assetUrl(await page('index.html'), 'app.js').href, assetUrl(first, 'app.js').href);
  await build({ root, check: true });
});

function fetchPath(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('preview returns real 404s and protects repository and parent files', async (context) => {
  const root = await mkdtemp(join(tmpdir(), '063-server-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await Promise.all([
    writeFile(join(root, 'index.html'), '<h1>Portfolio</h1>'),
    writeFile(join(root, '404.html'), '<h1>Not found</h1>'),
    writeFile(join(root, 'package.json'), 'private repository data'),
    writeFile(join(root, 'assets/style.css'), 'body { color: black; }'),
    writeFile(join(root, '_headers'), "/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'self'\n/assets/*\n  Cache-Control: public, max-age=3600\n/assets/style.css\n  Cache-Control: no-cache\n"),
    symlink(join(root, 'package.json'), join(root, 'assets/alias.txt')),
  ]);
  const server = await createSiteServer({ root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const { port } = server.address();
  const home = await fetchPath(port, '/');
  assert.equal(home.status, 200);
  assert.equal(home.headers['content-security-policy'], "default-src 'self'");
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.match(home.headers['content-type'], /text\/html/u);
  const css = await fetchPath(port, '/assets/style.css?v=1');
  assert.equal(css.status, 200);
  assert.equal(css.headers['cache-control'], 'no-cache');
  for (const path of ['/missing', '/404.html', '/package.json', '/data/site.json', '/.git/config', '/assets/../package.json', '/assets/%2e%2e/package.json', '/assets/alias.txt', '/assets/%ZZ', '/assets/%00', '/assets/']) {
    const response = await fetchPath(port, path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body, '<h1>Not found</h1>', path);
    assert.equal(response.headers['cache-control'], 'no-store', path);
  }
  const head = await fetchPath(port, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], home.headers['content-length']);
  const post = await fetchPath(port, '/', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});
