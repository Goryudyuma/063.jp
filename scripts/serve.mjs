import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, projectRoot } from './build.mjs';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function parseHeaders(source) {
  const rules = [];
  let rule;
  for (const line of source.split(/\r?\n/u)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/u.test(line)) {
      const pattern = line.trim().split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('.*');
      rule = { matches: new RegExp(`^${pattern}$`, 'u'), headers: {} };
      rules.push(rule);
    } else if (rule) {
      const colon = line.indexOf(':');
      if (colon > 0) rule.headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }
  return rules;
}

function requestPath(url) {
  try {
    const path = decodeURIComponent(url.split(/[?#]/u, 1)[0]);
    if (!path.startsWith('/') || /[\u0000-\u001f\u007f\\]/u.test(path)) return null;
    if (path.split('/').some((part) => part.startsWith('.'))) return null;
    if (['/', '/index.html', '/404.html', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml'].includes(path)) return path;
    if (path.startsWith('/assets/') && !path.endsWith('/')) return path;
  } catch {
    // Malformed URL encoding is handled as a missing resource.
  }
  return null;
}

export async function createSiteServer({ root = projectRoot } = {}) {
  const resolvedRoot = await realpath(root);
  const rules = parseHeaders(await readFile(resolve(root, '_headers'), 'utf8'));
  async function publicFile(path) {
    const file = await realpath(resolve(resolvedRoot, `.${path}`));
    const fromRoot = relative(resolvedRoot, file);
    if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || !requestPath(`/${fromRoot.split(sep).join('/')}`)) return null;
    if (!(await stat(file)).isFile()) return null;
    return { content: await readFile(file), type: contentTypes[extname(file)] || 'application/octet-stream' };
  }

  return createServer(async (request, response) => {
    const requestedPath = requestPath(request.url || '/');
    const headers = { 'cache-control': 'no-cache' };
    for (const rule of rules) {
      if (rule.matches.test(requestedPath || '/')) Object.assign(headers, rule.headers);
    }
    const send = (status, content, type) => {
      if (status !== 200) headers['cache-control'] = 'no-store';
      response.writeHead(status, { ...headers, 'content-type': type, 'content-length': Buffer.byteLength(content) });
      response.end(request.method === 'HEAD' ? undefined : content);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      headers.allow = 'GET, HEAD';
      send(405, 'Method not allowed\n', 'text/plain; charset=utf-8');
      return;
    }
    try {
      const file = requestedPath ? await publicFile(requestedPath === '/' ? '/index.html' : requestedPath).catch((error) => {
        if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) return null;
        throw error;
      }) : null;
      if (file) {
        send(requestedPath === '/404.html' ? 404 : 200, file.content, file.type);
        return;
      }
      const fallback = await publicFile('/404.html');
      send(404, fallback?.content || 'Not found\n', fallback?.type || 'text/plain; charset=utf-8');
    } catch (error) {
      console.error('Unable to serve request:', error.message);
      send(500, 'Internal server error\n', 'text/plain; charset=utf-8');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const port = Number(process.env.PORT || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
    await build();
    const server = await createSiteServer();
    server.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
