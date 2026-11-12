/** Dependency-free Worker bundle: inline static assets plus the same API relay as dev. */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist');
const output = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'worker-dist/server/index.js');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const assets = {};
function collect(directory, prefix = '') {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.') || item.name === 'server') continue;
    const relative = `${prefix}/${item.name}`, filename = path.join(directory, item.name);
    if (item.isDirectory()) collect(filename, relative);
    else assets[relative] = { type: types[path.extname(item.name)] || 'application/octet-stream', body: readFileSync(filename).toString('base64') };
  }
}
collect(source);
if (!assets['/index.html'] || !assets['/planner/index.html']) throw new Error('Build the static workspace before building the Worker.');
const relay = readFileSync(path.join(root, 'server/llm-proxy.mjs'), 'utf8');
const worker = `${relay}\nconst STATIC_ASSETS = ${JSON.stringify(assets)};\nexport default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/llm/chat') return handleLLMRequest(request);
  if (url.pathname === '/api/health') return new Response(JSON.stringify({ok:true,provider:'deepseek',keyStorage:'request-only'}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  let pathname; try { pathname=decodeURIComponent(url.pathname); } catch { return new Response('Bad request',{status:400}); }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const asset = STATIC_ASSETS[pathname] || STATIC_ASSETS[pathname+'/index.html'];
  if (!asset) return new Response('Not found',{status:404});
  const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff'}});
}};\n`;
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, worker);
console.log(`Built Worker with ${Object.keys(assets).length} local assets (${Buffer.byteLength(worker)} bytes).`);
