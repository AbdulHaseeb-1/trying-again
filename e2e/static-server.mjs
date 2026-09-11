/**
 * Serves the exported web build.
 *
 * Expo Router's static export writes one HTML file per route, so a plain file
 * server is enough — no SPA rewrite is needed for a direct navigation to
 * `/settings/ai`. A missing file still falls back to the route's index, which
 * covers the dynamic segments (`/asset/[symbol]`) that export as templates.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const PORT = Number(process.env.E2E_WEB_PORT ?? 4022);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function resolve(pathname) {
  // `normalize` plus the prefix check is what keeps `..` from escaping `dist`.
  const target = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!target.startsWith(ROOT)) return null;

  const candidates = [target, `${target}.html`, join(target, 'index.html')];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Try the next spelling.
    }
  }
  return null;
}

createServer(async (request, response) => {
  const pathname = (request.url ?? '/').split('?')[0];
  const file = (await resolve(pathname === '/' ? '/index.html' : pathname)) ?? join(ROOT, 'index.html');
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`e2e web listening on ${PORT}\n`);
});
