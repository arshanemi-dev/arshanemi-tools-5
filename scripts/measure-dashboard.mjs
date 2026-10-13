import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, '.next/server/app/profit-loss.html'), 'utf8');
const files = [...new Set([...html.matchAll(/<script[^>]+src="([^"?]+\.js)(?:\?[^"\s]*)?"/g)].map((match) => match[1]))];
let bytes = 0;
let gzipBytes = 0;
for (const url of files) {
  const file = path.join(root, '.next', url.replace(/^\/_next\//, ''));
  bytes += statSync(file).size;
  gzipBytes += gzipSync(readFileSync(file)).length;
}
console.log(JSON.stringify({ route: '/profit-loss', initialScriptCount: files.length, bytes, gzipBytes }, null, 2));
