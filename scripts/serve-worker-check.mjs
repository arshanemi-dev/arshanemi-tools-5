// Local, synthetic smoke test for the actual production worker and its lazy chunks.
// Run after npm run build, then open http://127.0.0.1:3106.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { liveTemplates } from '../tests/dashboardFixture.mjs';

const root = path.resolve(import.meta.dirname, '..');
const staticRoot = path.join(root, '.next/static');
const chunks = await readdir(path.join(staticRoot, 'chunks'));
let workerPath;
for (const name of chunks.filter((file) => file.endsWith('.js'))) {
  const code = await readFile(path.join(staticRoot, 'chunks', name), 'utf8');
  if (code.includes('self.onmessage=') && code.includes('Calculation failed')) {
    workerPath = '/_next/static/chunks/' + name;
    break;
  }
}
if (!workerPath) throw new Error('Build the app first: no compiled calculation worker found');
const page = (await readFile(path.join(root, 'tests/worker-check.html'), 'utf8')).replace('__WORKER_URL__', workerPath);
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(page); return; }
    // Optional real-UI smoke test: run next start on 3105, visit /profit-loss.
    // Every API is intercepted locally; no account data or writes reach a hub.
    if (pathname.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json');
      if (request.method !== 'GET') { response.writeHead(405).end('{}'); return; }
      if (pathname === '/api/marketplace-templates/live') {
        response.setHeader('ETag', '"test-fixture"');
        response.end(JSON.stringify(liveTemplates));
      } else response.end('{}');
      return;
    }
    if (!pathname.startsWith('/_next/static/')) {
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      const upstream = await fetch('http://127.0.0.1:3105' + request.url, { signal: AbortSignal.timeout(5000) });
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'text/plain' });
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    const file = path.resolve(staticRoot, decodeURIComponent(pathname.slice('/_next/static/'.length)));
    const relative = path.relative(staticRoot, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403).end(); return; }
    const contentType = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.js': 'text/javascript', '.map': 'application/json' }[path.extname(file)] || 'application/octet-stream';
    response.setHeader('Content-Type', contentType);
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
}).listen(3106, '127.0.0.1', () => console.log('Worker check: http://127.0.0.1:3106'));
